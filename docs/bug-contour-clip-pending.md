# Bug: Contour Clip se queda en PENDING tras upscale

## Resumen del problema

Cuando el usuario hace un flujo de **upscale → contour clip**, el contour clip se queda eternamente en `PENDING` en la base de datos. Modal procesa correctamente, pero Koyeb nunca actualiza el estado.

---

## Timeline de eventos (logs de Koyeb)

### Intento 1 — Deploy original (10:08 UTC)

```
[10:10:53] Gunicorn arranca con -w 1 --timeout 120
[10:11:24] Usuario hace login
[10:11:51] POST /api/upscale → 200 (BackgroundTask creado)
[10:11:57] Polling task c690e3ad → COMPLETED ✅
[10:12:56] POST /api/contour-clip → 200 (BackgroundTask creado)
[10:13:31] CRITICAL WORKER TIMEOUT (pid:14) → SIGABRT
[10:13:31] Worker killed, nuevo worker (pid:19) arranca
[10:13:54] Polling task 7e532903 → PENDING ❌ (se quedó así)
```

**Diagnóstico:** `BackgroundTasks` de FastAPI corre en el **mismo worker** que atiende HTTP. Cuando el contour-clip tarda >120s, Gunicorn mata al worker y el task se pierde.

---

### Intento 2 — Fix 1: asyncio.create_task + timeout 300s (15:23 UTC)

**Cambios:**
- `BackgroundTasks` → `asyncio.create_task()` en ambos endpoints
- `--timeout 120` → `--timeout 300` en koyeb.yaml

```
[15:29:33] POST /api/upscale → 200
[15:29:38] Polling task 1b198550 → COMPLETED ✅ (upscale funciona)
[15:30:40] POST /api/upscale → 200 (segundo intento)
[15:30:45] Polling task 877828bd → COMPLETED ✅
[15:31:48] POST /api/contour-clip → 200
[15:32:12] CRITICAL WORKER TIMEOUT (pid:14) → SIGABRT
[15:32:12] Worker killed, nuevo worker arranca
[15:32:34] Polling task 4237af14 → PENDING ❌
```

**Diagnóstico:** `asyncio.create_task` corre en el **mismo event loop** que el HTTP server. Las operaciones CPU-bound (OpenCV, rembg, numpy) bloquean el event loop y Gunicorn sigue matando al worker.

---

### Intento 3 — Fix 2: threading.Thread + asyncio.run() (15:36 UTC)

**Cambios:**
- `asyncio.create_task()` → `threading.Thread(target=_run_async_in_thread, args=(coro,))`
- Cada tarea corre en su propio hilo con event loop dedicado

```
[15:40:29] POST /api/upscale → 200
[15:40:36] Polling task e870a27a → COMPLETED ✅ (upscale funciona)
[15:40:53] POST /api/contour-clip → 200
[15:40:56] ❌ remove-background error (attempt 1/4): Event loop is closed
[15:41:20] [ERROR] Worker (pid:14) was sent SIGKILL! Perhaps out of memory?
[15:41:20] Worker killed, nuevo worker arranca
[15:41:39] Polling task d8661251 → PENDING ❌
```

**Diagnóstico:** Dos problemas simultáneos:
1. **`Event loop is closed`** — El `httpx.AsyncClient` singleton está atado al event loop principal. No funciona desde hilos separados.
2. **`SIGKILL! Perhaps out of memory?`** — El free tier de Koyeb tiene ~512MB RAM. Una imagen upscaleada de 1.3MB en disco se expande a ~100-200MB como numpy array, más OpenCV, rembg, etc.

---

### Intento 4 — Fix 3: httpx client thread-safe (15:43 UTC)

**Cambios:**
- `httpx.AsyncClient` ahora usa `threading.local()` para crear un cliente por hilo
- Main thread usa singleton global, worker threads usan thread-local

```
[15:45:28] Gunicorn arranca (nuevo deploy)
[15:51:05] POST /api/upscale → 200
[15:51:10] Polling task f8b47940 → COMPLETED ✅ (76s)
[16:01:27] POST /api/contour-clip → 200
[16:01:32] Polling task 394e8183 → PENDING
[16:03:12] [ERROR] Worker (pid:14) was sent SIGKILL! Perhaps out of memory?
[16:03:12] Worker killed, nuevo worker arranca
[16:03:35] Polling task 394e8183 → PENDING ❌ (se quedó así)
```

**Diagnóstico:** El fix del httpx resolvió el `Event loop is closed`, pero el **OOM persiste**. El contour-clip tarda ~72s en procesamiento y durante ese tiempo consume tanta memoria que Koyeb mata el proceso con SIGKILL.

---

## Estado actual de la base de datos

### Tasks recientes

| Task ID | Operación | Status | Duración | Creado |
|---------|-----------|--------|----------|--------|
| `394e8183...` | CONTOUR_CLIP | **PENDING** | - | 16:01:26 |
| `f8b47940...` | UPSCALE | COMPLETED | 76s | 15:51:04 |
| `d8661251...` | CONTOUR_CLIP | FAILED | - | 15:40:52 |
| `e870a27a...` | UPSCALE | COMPLETED | 6s | 15:40:28 |
| `4237af14...` | CONTOUR_CLIP | FAILED | - | 15:31:47 |
| `877828bd...` | UPSCALE | COMPLETED | 4s | 15:30:39 |
| `1b198550...` | UPSCALE | COMPLETED | 7s | 15:29:32 |
| `7e532903...` | CONTOUR_CLIP | FAILED | - | 10:12:55 |
| `c690e3ad...` | UPSCALE | COMPLETED | 19s | 10:11:51 |
| `decd8223...` | CONTOUR_CLIP | FAILED | - | 09:55:28 |

**Patrón claro:** Todos los upscale ✅ completados. Todos los contour-clip ❌ fallidos.

### Audit log del último contour-clip fallido

```
id: 23
operation: CONTOUR_CLIP
status: PENDING
duration_ms: NULL
input_file_size: NULL
output_file_size: NULL
error_message: NULL
task_id: 394e8183-0401-46be-b9c1-90f894519c5e
created_at: 2026-04-23 16:01:26
```

El audit log no tiene `duration_ms` ni `error_message` → el task **nunca empezó a ejecutar**. Se perdió antes de que el código de procesamiento arrancara.

---

## Arquitectura actual

### Flujo de contour-clip

```
Frontend → POST /api/contour-clip
    ↓
Koyeb (Gunicorn + Uvicorn, -w 1)
    ↓
threading.Thread → run_contour_clip_task()
    ↓
    ├── Si mode='auto' y GPU configurado:
    │       contour_clip() → remove_background() → Cloud GPU (Modal)
    │       Post-proceso (chromakey, morphología, decontaminación) → CPU (Koyeb)
    │
    └── Si mode='manual' o GPU no configurado:
            contour_clip() → GrabCut → CPU (Koyeb)
    ↓
storage.upload_file() → Cloudinary
    ↓
UPDATE processing_tasks SET status='COMPLETED', result_url=...
```

### Configuración actual

| Componente | Valor |
|------------|-------|
| **Koyeb instance type** | `free` (~512MB RAM) |
| **Gunicorn workers** | `-w 1` |
| **Gunicorn timeout** | `300s` |
| **Worker class** | `uvicorn.workers.UvicornWorker` |
| **APP_ENV** | `production` |
| **GPU_UPSCALE_URL** | Modal ✅ |
| **GPU_REMOVER_URL** | Modal ✅ |
| **GPU_CONTOUR_URL** | No configurado (usa GPU_REMOVER_URL) |

### El contour-clip en modo 'auto'

1. **Neural inference** (rembg) → Cloud GPU (Modal T4) ✅
2. **Post-proceso** (chromakey, morphología, decontaminación, edge smoothing) → **CPU en Koyeb** ❌

El post-proceso usa OpenCV + numpy + numpy arrays de la imagen completa. Para una imagen upscaleada (ej: 4000x3000px = 12MP):

- numpy array RGBA: `4000 × 3000 × 4 bytes = 48MB`
- Múltiples copias durante procesamiento: `~200-400MB`
- rembg session cache: `~50-100MB`
- Python runtime + Gunicorn + dependencias: `~100MB`
- **Total estimado: 350-650MB** → **OOM en free tier (512MB)**

---

## Código relevante

### `backend/routers/processing.py` — contour-clip endpoint

```python
@router.post("/contour-clip", response_model=schemas.TaskResponse)
async def api_contour_clip(...):
    # ...
    threading.Thread(
        target=_run_async_in_thread,
        args=(processing.run_contour_clip_task(...),),
        daemon=True,
    ).start()
    return {"task_id": task_id}
```

### `backend/services/processing.py` — run_contour_clip_task

```python
async def run_contour_clip_task(task_id, audit_log_id, image_bytes, ...):
    db = SessionLocal()
    try:
        result_bytes = None

        # 1. Try GPU if enabled (auto mode only)
        if mode == 'auto' and _should_use_gpu("contour-clip"):
            try:
                result_bytes = await contour_clip(image_bytes, ...)
            except Exception as e:
                # GPU failed → FALLBACK_CPU
                task.status = "FALLBACK_CPU"
                db.commit()
                result_bytes = None

        # 2. CPU fallback (manual mode or GPU failure)
        if result_bytes is None:
            result_bytes = await contour_clip(image_bytes, ...)  # ← OOM aquí

        # 3. Save Success
        if result_bytes:
            filename = f"contour_clip_{task_id}.png"
            result_url = await storage.upload_file(result_bytes, "", filename)
            task.status = "COMPLETED"
            task.result_url = result_url
            db.commit()
    except Exception as e:
        task.status = "FAILED"
        task.error = str(e)
        db.commit()
    finally:
        db.close()
```

### `backend/services/processing.py` — contour_clip (post-proceso CPU)

```python
async def contour_clip(image_bytes, mask_bytes, mode, refine, colors, tolerance):
    if mode == 'auto':
        # 1. Neural inference → Cloud GPU
        rembg_res = await remove_background(image_bytes, model="u2net")
        rgba = np.array(Image.open(io.BytesIO(rembg_res)).convert("RGBA"))

        # 2. Chromakey inside ROI
        color_dist = np.linalg.norm(orig_int - bg_color, axis=2)  # array 12MP

        # 3. Morphology (dilate, erode)
        roi = cv2.dilate(birefnet_hint, roi_kernel, iterations=1)

        # 4. Alpha assembly
        final_alpha = np.zeros_like(soft_alpha)  # otra copia 12MP

        # 5. Edge-aware smoothing (joint bilateral)
        rgba = _smooth_alpha_edge_aware(rgba)

        # 6. Color decontamination
        rgba = _decontaminate_edges(rgba)

        return pil_to_bytes(Image.fromarray(rgba))
```

Cada paso crea copias del array en memoria. Para 12MP, cada copia RGBA = ~48MB.

---

## Posibles soluciones

### Opción A: Subir instance type de Koyeb (la más simple)

```bash
koyeb service update genuine-nertie/dimo-project --instance-type nano
```

| Tier | RAM | Costo |
|------|-----|-------|
| free | ~512MB | $0 |
| nano | 1GB | ~$4.50/mes |
| small | 2GB | ~$9/mes |

**Pros:** Fix inmediato, sin cambios de código.
**Contras:** Costo mensual adicional.

---

### Opción B: Mover el post-proceso a Modal

Crear un endpoint en Modal que haga todo el contour-clip (neural + post-proceso) y devolver el resultado ya procesado.

**Pros:** Koyeb solo recibe y guarda, consumo mínimo de RAM.
**Contras:** Requiere cambiar el código de Modal.

---

### Opción C: Optimizar el uso de memoria en Koyeb

- Liberar memoria explícitamente entre pasos (`del array`, `gc.collect()`)
- Procesar por chunks en vez de toda la imagen
- Bajar la resolución antes del post-proceso

**Pros:** Sin costo adicional.
**Contras:** Complejo, puede degradar calidad.

---

### Opción D: Usar un worker pool separado

- Celery/RQ con Redis como task queue
- Workers dedicados para procesamiento con más memoria

**Pros:** Escalable, separa concerns.
**Contras:** Agrega infraestructura (Redis), complejidad operativa.

---

## Qué NO es el problema

- ❌ **Modal no responde** → Modal responde correctamente (76s para upscale)
- ❌ **httpx client** → Fix thread-safe ya aplicado
- ❌ **Gunicorn timeout** → Subido a 300s, no es el problema
- ❌ **BackgroundTasks lifecycle** → Ya migrado a threading.Thread
- ❌ **DB connection** → Funciona correctamente
- ❌ **Cloudinary upload** → Funciona para upscale

## Qué SÍ es el problema

- ✅ **OOM en Koyeb free tier** → El post-proceso de contour-clip consume >512MB RAM
- ✅ **SIGKILL del kernel** → Koyeb mata el proceso, el task queda PENDING para siempre
- ✅ **Rescue worker** → Lo detecta después de 5 min, pero no lo previene
