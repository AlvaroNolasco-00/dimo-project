# Plan: Implementación Mejoras en `processing.py`

**Fecha:** 2026-04-19  
**Objetivo:** Mejorar funciones de procesamiento de imágenes en backend

---

## Parámetros Definidos

| Parámetro | Valor |
|----------|-------|
| Retry max_attempts | 3 |
| Retry initial_backoff | 3.0 segundos |
| MPS complexity | 60% (partial implementation) |
| Legacy fallback | Mantener función antigua |
| Test coverage | Extendida |

---

## Contexto ADR

| ADR | Decisión | Relevancia |
|-----|---------|-----------|
| ADR-0004 | Routing cloud GPU → local fallback | Retry debe respetar arquitectura dual |
| ADR-0015 | Pipeline chaining server-side | Funciones deben ser async |
| ADR-0019 | Pipeline híbrido contour_clip | NO eliminar CIELAB, chromakey, decontamination |

---

## Fase 1: Retry Logic para `remove_background()`

### Ubicación
`backend/services/processing.py`

### Implementación

**1.1 Agregar `_call_cloud_gpu_with_retry()`**

Nueva función helper después de línea 145:

```python
async def _call_cloud_gpu_with_retry(
    service_type: str,
    image_bytes: bytes,
    params: dict = None,
    data: dict = None,
    max_retries: int = 3,
    initial_backoff: float = 3.0,
) -> bytes:
    """
    Wrapper con retry exponencial para cloud GPU services.
    
    Args:
        service_type: 'upscale' o 'remove-background'
        image_bytes: imagen a procesar
        params: query params
        data: form data
        max_retries: reintentos máximos (default: 3)
        initial_backoff: segundos iniciales (default: 3.0)
    
    Raises:
        ValueError: Si URLs GPU no configuradas
        Exception: Si todos los reintentos fallan
    """
    import httpx
    
    last_exception = None
    backoff = initial_backoff
    
    for attempt in range(max_retries + 1):
        try:
            return await call_gpu_service(service_type, image_bytes, params, data)
        except httpx.TimeoutException as e:
            last_exception = e
            logger.warning(
                f"⏱️ Timeout {service_type} (attempt {attempt + 1}/{max_retries + 1}), "
                f"retrying in {backoff}s..."
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500:
                last_exception = e
                logger.warning(
                    f"⚠️ HTTP {e.response.status_code} {service_type} "
                    f"(attempt {attempt + 1}/{max_retries + 1}), retrying..."
                )
            else:
                raise
        except Exception as e:
            last_exception = e
            logger.warning(
                f"❌ {service_type} error (attempt {attempt + 1}/{max_retries + 1}): {e}"
            )
        
        if attempt < max_retries:
            await asyncio.sleep(backoff)
            backoff *= 2
        
    raise Exception(
        f"Cloud GPU {service_type} failed after {max_retries + 1} attempts: {last_exception}"
    )
```

**1.2 Modificar `remove_background()`**

Líneas 485-488:

```python
# ANTES:
if _should_use_cloud_gpu("remove-background"):
    try:
        logger.info("🎨 Removing background via Cloud GPU...")
        return await call_gpu_service("remove-background", image_bytes)
    except Exception as e:
        logger.error(f"❌ Cloud GPU BG Removal failed: {e}. Falling back to local engine.")

# DESPUÉS:
if _should_use_cloud_gpu("remove-background"):
    try:
        logger.info("🎨 Removing background via Cloud GPU (with retry)...")
        return await _call_cloud_gpu_with_retry("remove-background", image_bytes)
    except Exception as e:
        logger.error(f"❌ Cloud GPU BG Removal failed after retries: {e}. Falling back to local engine.")
```

**1.3 Modificar `upscale_image()`**

Líneas 630-633:

```python
# Añadir uso de retry para upscale
if _should_use_cloud_gpu("upscale"):
    logger.info(f"🔍 Upscaling image x{factor} via Cloud GPU...")
    form_data = {"scale": factor, "factor": factor, "detail_boost": detail_boost}
    return await _call_cloud_gpu_with_retry("upscale", image_bytes, data=form_data)
```

### Tests

```python
# tests/test_processing_retry.py

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

@pytest.mark.asyncio
async def test_retry_success_first_attempt():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        mock.return_value = b"fake_image_data"
        result = await _call_cloud_gpu_with_retry("remove-background", b"test")
        assert mock.call_count == 1
        assert result == b"fake_image_data"

@pytest.mark.asyncio
async def test_retry_timeout_all_attempts_fail():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        mock.side_effect = httpx.TimeoutException("timeout")
        with pytest.raises(Exception) as exc_info:
            await _call_cloud_gpu_with_retry("remove-background", b"test", max_retries=3)
        assert "failed after 4 attempts" in str(exc_info.value)

@pytest.mark.asyncio
async def test_retry_timeout_then_success_on_3rd():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        mock.side_effect = [
            httpx.TimeoutException("timeout"),
            httpx.TimeoutException("timeout"),
            b"success"
        ]
        result = await _call_cloud_gpu_with_retry("remove-background", b"test", max_retries=3)
        assert mock.call_count == 3

@pytest.mark.asyncio
async def test_retry_500_then_success():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        response = MagicMock(spec=httpx.Response)
        response.status_code = 500
        mock.side_effect = [
            httpx.HTTPStatusError("500", request=MagicMock(), response=response),
            b"success"
        ]
        result = await _call_cloud_gpu_with_retry("remove-background", b"test", max_retries=3)
        assert mock.call_count == 2

@pytest.mark.asyncio
async def test_retry_no_retry_on_400():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        response = MagicMock(spec=httpx.Response)
        response.status_code = 400
        mock.side_effect = httpx.HTTPStatusError("400", request=MagicMock(), response=response)
        with pytest.raises(httpx.HTTPStatusError):
            await _call_cloud_gpu_with_retry("remove-background", b"test")
        assert mock.call_count == 1

@pytest.mark.asyncio
async def test_retry_no_retry_on_404():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        response = MagicMock(spec=httpx.Response)
        response.status_code = 404
        mock.side_effect = httpx.HTTPStatusError("404", request=MagicMock(), response=response)
        with pytest.raises(httpx.HTTPStatusError):
            await _call_cloud_gpu_with_retry("remove-background", b"test")
        assert mock.call_count == 1

@pytest.mark.asyncio
async def test_retry_connection_error():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        mock.side_effect = [
            ConnectionError("conn failed"),
            b"success"
        ]
        result = await _call_cloud_gpu_with_retry("remove-background", b"test", max_retries=3)
        assert mock.call_count == 2

@pytest.mark.asyncio
async def test_retry_backoff_exponential():
    with patch('backend.services.processing.call_gpu_service', new_callable=AsyncMock) as mock:
        mock.side_effect = [
            httpx.TimeoutException("timeout"),
            httpx.TimeoutException("timeout"),
            httpx.TimeoutException("timeout"),
            b"success"
        ]
        with patch('backend.services.processing.asyncio.sleep', new_callable=AsyncMock) as sleep_mock:
            await _call_cloud_gpu_with_retry("remove-background", b"test", max_retries=3, initial_backoff=3.0)
            # Verificar backoff: 3s → 6s → 12s
            calls = sleep_mock.call_args_list
            assert calls[0][0][0] == 3.0
            assert calls[1][0][0] == 6.0
            assert calls[2][0][0] == 12.0
```

---

## Fase 2: Wrapper Async para `remove_objects()`

### Ubicación
`backend/services/processing.py`, líneas 304-370

### Implementación

**2.1 Reescribir como async con implementación parcial MPS**

```python
async def remove_objects(image_bytes: bytes, mask_bytes: bytes) -> bytes:
    """
    Removes objects using a high-precision approach.
    Async wrapper con soporte MPS parcial (Apple Silicon).
    
    Args:
        image_bytes: Imagen original
        mask_bytes: Máscara que define el área a remover
    
    Returns:
        bytes: Imagen con objetos removidos
    """
    accelerator = _get_local_accelerator()
    
    if accelerator == 'mps':
        try:
            return await asyncio.to_thread(_remove_objects_mps_partial, image_bytes, mask_bytes)
        except Exception as e:
            logger.warning(f"⚠️ MPS remove_objects failed: {e}, falling back to CPU")
    
    return await asyncio.to_thread(_remove_objects_impl, image_bytes, mask_bytes)


def _remove_objects_impl(image_bytes: bytes, mask_bytes: bytes) -> bytes:
    """
    Implementación original - mantener lógica intacta.
    """
    # ... código existente líneas 312-370 ...


def _remove_objects_mps_partial(image_bytes: bytes, mask_bytes: bytes) -> bytes:
    """
    Versión parcial con MPS para operaciones simples.
    Inpainting siempre cae a CPU (no disponible en MPS).
    """
    import torch
    import torch.nn.functional as F
    
    device = torch.device('mps')
    
    # Leer imágenes
    img_cv = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    mask_cv = cv2.imdecode(np.frombuffer(mask_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    
    if img_cv is None or mask_cv is None:
        raise ValueError("Could not decode image or mask")
    
    h, w = img_cv.shape[:2]
    
    # Adaptive dilation en MPS
    scale_factor = max(1, min(w, h) // 1000)
    kernel_size = 3 + (2 * scale_factor)
    
    # a tensor
    mask_t = torch.from_numpy(mask_cv).float().to(device)
    mask_t = mask_t.unsqueeze(0).unsqueeze(0)  # 1x1xHxW
    
    # Max pool para dilation
    kernel = torch.ones(1, 1, kernel_size, kernel_size, device=device)
    mask_dilated = F.max_pool2d(mask_t, kernel_size=kernel_size, stride=1, padding=kernel_size//2)
    mask_dilated = mask_dilated.squeeze().cpu().numpy()
    
    # Resto del procesamiento en CPU (inpainting no tiene equivalente MPS)
    # Reconstruir imagen para inpainting CPU
    mask_dilated_uint8 = mask_dilated.astype(np.uint8)
    _, mask_binary = cv2.threshold(mask_dilated_uint8, 50, 255, cv2.THRESH_BINARY)
    
    # Median color fill
    kernel_sample = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size + 10, kernel_size + 10))
    extended_mask = cv2.dilate(mask_binary, kernel_sample, iterations=1)
    boundary_mask = cv2.subtract(extended_mask, mask_binary)
    
    if boundary_mask is not None and boundary_mask.any() > 0:
        surrounding_pixels = img_cv[boundary_mask > 0]
        if len(surrounding_pixels) > 0:
            median_color = np.median(surrounding_pixels, axis=0).astype(np.uint8)
            clean_base = img_cv.copy()
            clean_base[mask_binary > 0] = median_color
        else:
            clean_base = img_cv
    else:
        clean_base = img_cv
    
    # Inpainting (CPU-only)
    inpaint_radius = int(5 * scale_factor)
    res_cv = cv2.inpaint(clean_base, mask_binary, inpaint_radius, cv2.INPAINT_NS)
    
    # Texture restoration
    noise = np.random.normal(0, 1.5, (h, w, 3)).astype(np.float32)
    res_float = res_cv.astype(np.float32)
    noise_mask = (mask_binary > 0)[:, :, np.newaxis]
    res_float = np.where(noise_mask, res_float + noise, res_float)
    res_cv = np.clip(res_float, 0, 255).astype(np.uint8)
    
    # Smooth blending
    mask_blurred = cv2.GaussianBlur(mask_binary, (kernel_size * 2 + 1, kernel_size * 2 + 1), 0)
    alpha = mask_blurred.astype(float) / 255.0
    alpha = cv2.merge([alpha, alpha, alpha])
    
    final_cv = (res_cv.astype(float) * alpha + img_cv.astype(float) * (1.0 - alpha))
    final_cv = np.clip(final_cv, 0, 255).astype(np.uint8)
    
    _, buf = cv2.imencode('.png', final_cv, [cv2.IMWRITE_PNG_COMPRESSION, 1])
    return buf.tobytes()
```

**2.2 Actualizar router**

En `backend/routers/processing.py`:

```python
# ANTES (usar run_in_threadpool):
result = await run_in_threadpool(processing.remove_objects, image_bytes, mask_bytes)

# DESPUÉS:
result = await processing.remove_objects(image_bytes, mask_bytes)
```

### Tests

```python
# tests/test_processing_remove_objects.py

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_remove_objects_is_awaitable():
    with patch('backend.services.processing._remove_objects_impl') as mock:
        mock.return_value = b"fake_png"
        result = await processing.remove_objects(b"test", b"mask")
        mock.assert_called_once()

@pytest.mark.asyncio
async def test_remove_objects_mps_fallback_to_cpu():
    with patch('backend.services.processing._get_local_accelerator', return_value='mps'):
        with patch('backend.services.processing._remove_objects_mps_partial') as mps_mock:
            mps_mock.side_effect = Exception("MPS error")
            with patch('backend.services.processing._remove_objects_impl') as cpu_mock:
                cpu_mock.return_value = b"result"
                result = await processing.remove_objects(b"test", b"mask")
                mps_mock.assert_called_once()
                cpu_mock.assert_called_once()

@pytest.mark.asyncio
async def test_remove_objects_invalid_mask():
    with patch('backend.services.processing._remove_objects_impl') as mock:
        mock.side_effect = ValueError("Could not decode mask")
        with pytest.raises(ValueError):
            await processing.remove_objects(b"test", b"invalid_mask")

@pytest.mark.asyncio
async def test_remove_objects_no_mask():
    with pytest.raises(Exception):
        await processing.remove_objects(b"test", b"")

@pytest.mark.asyncio
async def test_remove_objects_uses_mps_on_m1():
    with patch('backend.services.processing._get_local_accelerator', return_value='mps'):
        with patch('backend.services.processing._remove_objects_mps_partial') as mps_mock:
            mps_mock.return_value = b"result"
            result = await processing.remove_objects(b"test", b"mask")
            mps_mock.assert_called_once()
```

---

## Fase 3: Contour Clip v2 con Legacy

### Ubicación
`backend/services/processing.py`, líneas 937-1067

### Implementación

**3.1 Nueva función `contour_clip_v2()`**

```python
async def contour_clip_v2(
    image_bytes: bytes,
    mask_bytes: bytes = None,
    mode: str = 'auto',
    refine: bool = False,
    colors: list = None,
    tolerance: int = 30,
) -> bytes:
    """
    Contour Clip v2 - pipeline optimizado.
    
    Cambios vs v1:
    - Usa birefnet-general directamente
    - Elimina paso redundante de hint mask
    - Mantiene post-procesamiento completo
    
    Args:
        image_bytes: Imagen original
        mask_bytes: Máscara para modo manual
        mode: 'auto' o 'manual'
        refine: aplicar refinamiento
        colors: lista de colores [R,G,B] para chromakey
        tolerance: tolerancia para match
    
    Returns:
        bytes: Imagen con fondo removido
    """
    img_pil = read_image_file(image_bytes).convert("RGB")
    h, w = img_pil.size
    
    if mode == 'auto':
        logger.info("🔬 Auto contour clip v2 - birefnet-general + chromakey")
        
        # 1. birefnet-general directamente
        result = await remove_background(
            image_bytes,
            model="birefnet-general",
            alpha_matting=True,
            fg_threshold=240,
            bg_threshold=10,
        )
        rgba = read_image_file(result).convert("RGBA")
        
        if rgba.size != (w, h):
            rgba = rgba.resize((w, h), Image.LANCZOS)
        
        # 2. User colors en CIELAB
        if colors:
            rgba = _force_transparency_by_colors(rgba, colors, tolerance)
        
        # 3. Edge-aware smoothing
        rgba_np = np.array(rgba)
        rgba_np = _smooth_alpha_edge_aware(rgba_np)
        
        # 4. Decontamination
        rgba_np = _decontaminate_edges(rgba_np)
        
        logger.info("✅ Contour clip v2 complete")
        return pil_to_bytes(Image.fromarray(rgba_np))
    
    # Modo manual - usar función legacy
    return await contour_clip(image_bytes, mask_bytes, mode, refine, colors, tolerance)


def _force_transparency_by_colors(
    rgba: Image.Image,
    colors: list,
    tolerance: int = 30,
) -> Image.Image:
    """Fuerza pixels que coincidan con colores a ser transparentes."""
    rgba_np = np.array(rgba)
    rgb = rgba_np[:, :, :3]
    
    lab = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2LAB)
    
    for color in colors:
        target = np.array(color[:3])
        target_lab = cv2.cvtColor(
            np.array([[target]], dtype=np.uint8),
            cv2.COLOR_RGB2LAB
        )[0, 0]
        
        dist = np.linalg.norm(lab.astype(np.float32) - target_lab.astype(np.float32), axis=2)
        mask = dist <= tolerance
        rgba_np[mask, 3] = 0
    
    return Image.fromarray(rgba_np)
```

**3.2 Marcar función antigua como deprecated**

```python
async def contour_clip(...) -> bytes:
    """
    ⚠️ DEPRECATED: Use contour_clip_v2().
    
    Mantiene compatibilidad con código existente.
    """
    # ... código existente ...
```

**3.3 Actualizar router**

```python
@router.post("/contour-clip")
async def api_contour_clip(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    mode: str = Form("manual"),
    colors: Optional[str] = Form(None),
    tolerance: int = Form(30),
    user: models.User = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    # ...
    
    if mode == 'auto':
        result = await processing.contour_clip_v2(
            image_bytes,
            mask_bytes if mask else None,
            mode,
            refine,
            colors_list,
            tolerance
        )
    else:
        result = await processing.contour_clip(
            image_bytes,
            mask_bytes if mask else None,
            mode,
            refine,
            colors_list,
            tolerance
        )
```

### Tests

```python
# tests/test_processing_contour_clip.py

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import numpy as np

@pytest.mark.asyncio
async def test_contour_auto_uses_birefnet():
    with patch('backend.services.processing.remove_background') as mock_bg:
        mock_bg.return_value = b"fake_rgba"
        
        await processing.contour_clip_v2(b"test", mode='auto')
        
        call_kwargs = mock_bg.call_args.kwargs
        assert call_kwargs['model'] == 'birefnet-general'
        assert call_kwargs['alpha_matting'] == True

@pytest.mark.asyncio
async def test_contour_auto_alpha_matting():
    with patch('backend.services.processing.remove_background') as mock_bg:
        mock_bg.return_value = b"fake_rgba"
        
        await processing.contour_clip_v2(b"test", mode='auto')
        
        call_kwargs = mock_bg.call_args.kwargs
        assert call_kwargs['fg_threshold'] == 240
        assert call_kwargs['bg_threshold'] == 10

@pytest.mark.asyncio
async def test_contour_manual_grabcut():
    with patch('backend.services.processing.contour_clip') as mock_legacy:
        mock_legacy.return_value = b"result"
        
        result = await processing.contour_clip_v2(b"test", mode='manual', mask_bytes=b"mask")
        
        mock_legacy.assert_called_once()

@pytest.mark.asyncio
async def test_contour_user_colors():
    with patch('backend.services.processing.remove_background') as mock_bg:
        mock_bg.return_value = b"fake_rgba"
        
        with patch('backend.services.processing._force_transparency_by_colors') as mock_force:
            mock_force.return_value = MagicMock()
            
            await processing.contour_clip_v2(
                b"test",
                mode='auto',
                colors=[[255, 0, 0]],
                tolerance=30
            )
            
            mock_force.assert_called_once()

@pytest.mark.asyncio
async def test_contour_tolerance_threshold():
    with patch('backend.services.processing.remove_background') as mock_bg:
        mock_bg.return_value = b"fake_rgba"
        
        with patch('backend.services.processing._force_transparency_by_colors') as mock_force:
            mock_force.return_value = MagicMock()
            
            await processing.contour_clip_v2(
                b"test",
                mode='auto',
                colors=[[255, 0, 0]],
                tolerance=50
            )
            
            # Verificar que tolerance se pasa correctamente
            args, kwargs = mock_force.call_args
            assert kwargs.get('tolerance') == 50

@pytest.mark.asyncio
async def test_contour_resize_mismatch():
    with patch('backend.services.processing.remove_background') as mock_bg:
        # Simular que rembg devuelve tamaño diferente
        mock_result = Image.new('RGBA', (500, 500))
        mock_bg.return_value = pil_to_bytes(mock_result)
        
        with patch('backend.services.processing.read_image_file') as mock_read:
            mock_read.return_value = mock_result
            
            result = await processing.contour_clip_v2(b"test", mode='auto')

@pytest.mark.asyncio
async def test_contour_applies_smoothing():
    with patch('backend.services.processing.remove_background') as mock_bg:
        mock_bg.return_value = b"fake_rgba"
        
        with patch('backend.services.processing._smooth_alpha_edge_aware') as mock_smooth:
            mock_smooth.return_value = np.zeros((100, 100, 4), dtype=np.uint8)
            
            await processing.contour_clip_v2(b"test", mode='auto')
            
            mock_smooth.assert_called_once()

@pytest.mark.asyncio
async def test_contour_applies_decontamination():
    with patch('backend.services.processing.remove_background') as mock_bg:
        mock_bg.return_value = b"fake_rgba"
        
        with patch('backend.services.processing._decontaminate_edges') as mock_decontam:
            mock_decontam.return_value = np.zeros((100, 100, 4), dtype=np.uint8)
            
            await processing.contour_clip_v2(b"test", mode='auto')
            
            mock_decontam.assert_called_once()
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|--------|
| `backend/services/processing.py` | Retry helper, actualizar funciones, async wrappers, contour_clip_v2 |
| `backend/routers/processing.py` | Actualizar llamadas |
| `tests/test_processing_retry.py` | Nuevo |
| `tests/test_processing_remove_objects.py` | Nuevo |
| `tests/test_processing_contour_clip.py` | Nuevo |

---

## Resumen Timing

| Fase | Complejidad | Tiempo |
|------|-------------|--------|
| 1 (Retry) | Baja | 1-2h |
| 2 (Async Objects) | Media | 2-3h |
| 3 (Contour v2) | Media-Alta | 3-4h |
| **Total** | — | **6-9h** |

---

## Pending

- [ ] Confirmar proceder
- [ ] Iniciar implementación Fase 1
- [ ] Iniciar implementación Fase 2
- [ ] Iniciar implementación Fase 3
- [ ] Ejecutar tests