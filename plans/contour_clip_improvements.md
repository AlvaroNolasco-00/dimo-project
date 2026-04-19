# Mejoras para `contour_clip()` - Remove Background Automático

> Análisis de calidad del pipeline actual y recomendaciones de mejora.
> Fecha: Abril 2026

---

## Resumen del Pipeline Actual

La función `contour_clip()` en modo `auto` implementa un pipeline de 6 pasos:

1. **Segmentación inicial** con `birefnet-general` + alpha matting
2. **Aplicación de color hints** (si proporcionados)
3. **Filtrado de componentes** con `_keep_largest_components()`
4. **Relleno de agujeros** con `_fill_holes()`
5. **Suavizado edge-aware** con `_smooth_alpha_edge_aware()`
6. **Descontaminación de bordes** con `_decontaminate_edges()`

---

## Mejoras Recomendadas

### 1. Parámetros Alpha Matting Configurables ✅ COMPLETADO

**Ubicación:** `remove_background()` - líneas 496-498

**Problema:** Los parámetros de alpha matting están hardcodeados:

```python
alpha_matting_foreground_threshold=240  # Umbral muy alto
alpha_matting_background_threshold=10     # Umbral muy bajo
alpha_matting_erode_size=10              # Tamaño fijo
```

**Impacto:**
- `fg_threshold=240` corta detalles finos (pelos, plumas, fibras)
- `erode_size=10` puede degradar bordes en imágenes de baja resolución

**Recomendación:**
```python
async def remove_background(
    image_bytes: bytes,
    model: str = "u2net",
    alpha_matting: bool = False,
    # Nuevos parámetros opcionales
    fg_threshold: int = 220,  # Más conservador
    bg_threshold: int = 20,
    erode_size: int = None    # Auto-calcular basado en resolución
) -> bytes:
    ...
    if erode_size is None:
        # Escalar basado en dimensión más pequeña
        erode_size = max(2, min(10, min(h, w) // 200))
```

**Beneficio:** Preservación de detalles finos en pelo, pelaje, y objetos translúcidos.

---

### 2. Espacio de Color Perceptual (CIELAB) para Color Hints ✅ COMPLETADO

**Ubicación:** `contour_clip()` - línea 899

**Problema:** La distancia Euclidiana en RGB no es perceptualmente uniforme:

```python
# Código actual:
dist = np.linalg.norm(data_rgb - np.array(color[:3]), axis=2)
```

RGB tiene la misma distancia para cambios perceptuales pequeños (azules) vs grandes (verdes).

**Recomendación:**
```python
# Convertir a CIELAB para matching perceptual
data_lab = cv2.cvtColor(data_rgb.astype(np.uint8), cv2.COLOR_RGB2LAB)
target_lab = cv2.cvtColor(
    np.array([[color[:3]]], dtype=np.uint8),
    cv2.COLOR_RGB2LAB
)[0, 0]
dist = np.linalg.norm(data_lab - target_lab, axis=2)
```

**Beneficio:** Eliminación más precisa de colores de fondo específicos, especialmente para tonos azules/verdes donde RGB falla.

---

### 3. Umbral Adaptativo en Alpha 🟡 Media Prioridad

**Ubicación:** `contour_clip()` - línea 903

**Problema:** Umbral fijo de 127 no considera la distribución del alpha:

```python
alpha_bin = (rgba[:, :, 3] > 127).astype(np.uint8) * 255
```

**Problemas de casos:**
- Si la imagen tiene transparencia predominante (>50% píxeles transparentes), 127 puede ser agresivo
- Si el sujeto tiene muchas transparencias suaves (velo, vidrio), 127 descarta detalles

**Recomendación:** Otsu thresholding o percentil adaptativo:

```python
alpha_channel = rgba[:, :, 3]

# Método 1: Otsu automático
_, alpha_bin = cv2.threshold(alpha_channel, 0, 255, 
                             cv2.THRESH_BINARY + cv2.THRESH_OTSU)

# Método 2: Percentil adaptativo (más robusto)
foreground_pixels = alpha_channel[alpha_channel > 10]
if len(foreground_pixels) > 0:
    threshold = np.percentile(foreground_pixels, 25)  # Percentil 25 del foreground
    alpha_bin = (alpha_channel > threshold).astype(np.uint8) * 255
```

**Beneficio:** Mejor manejo de casos edge con iluminación irregular o transparencias naturales.

---

### 4. Fast Guided Filter para Suavizado 🟢 Alta Prioridad (Rendimiento)

**Ubicación:** `_smooth_alpha_edge_aware()` - líneas 865-867

**Problema:** `jointBilateralFilter` es computacionalmente costoso O(n²):

```python
cv2.ximgproc.jointBilateralFilter(
    joint=guide, src=alpha, d=5, sigmaColor=30, sigmaSpace=5
)
```

En imágenes 2048x2048, esto puede tomar 2-5 segundos.

**Recomendación:** Fast Guided Filter de `cv2.ximgproc`:

```python
def _smooth_alpha_edge_aware_fast(rgba: np.ndarray, radius: int = 8, eps: float = 0.01) -> np.ndarray:
    """
    Fast edge-aware smoothing using guided filter.
    10-100x faster than joint bilateral with similar quality.
    """
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    guide = rgba[:, :, :3].astype(np.float32) / 255.0
    
    try:
        # Fast guided filter - O(n) complexity
        smoothed = cv2.ximgproc.guidedFilter(
            guide=guide, src=alpha, radius=radius, eps=eps
        )
    except AttributeError:
        # Fallback: bilateral simple
        smoothed = cv2.bilateralFilter(
            (alpha * 255).astype(np.uint8), d=5, sigmaColor=30, sigmaSpace=5
        ).astype(np.float32) / 255.0
    
    result = rgba.copy()
    result[:, :, 3] = (np.clip(smoothed, 0, 1) * 255).astype(np.uint8)
    return result
```

**Parámetros recomendados:**
- `radius=8-16` para imágenes de alta resolución
- `eps=0.01-0.1` (menor = más smoothing)

**Beneficio:** Reducción de 50-90% en tiempo de procesamiento manteniendo calidad similar.

---

### 5. Validación de Resultado y Fallback 🟡 Media Prioridad

**Ubicación:** `contour_clip()` - después de línea 919

**Problema:** Si el modelo `birefnet-general` falla completamente (retorna imagen casi transparente), no hay detección.

**Recomendación:** Sanity check antes de retornar:

```python
# Después del pipeline auto (línea 919)
mean_alpha = np.mean(rgba[:, :, 3])
alpha_coverage = np.mean(rgba[:, :, 3] > 10)  # % píxeles con alpha > 10

# Detectar fallos
if mean_alpha < 15 or alpha_coverage < 0.05:  # >95% transparente
    logger.warning("⚠️ Modelo birefnet retornó resultado casi vacío. Intentando fallback...")
    # Fallback a modelo alternativo
    fallback_res = await remove_background(image_bytes, model="isnet-general-use", alpha_matting=True)
    rgba = np.array(Image.open(io.BytesIO(fallback_res)).convert("RGBA"))
    # Re-aplicar post-procesamiento...

if alpha_coverage > 0.95:  # Casi todo opaco (fondo no removido)
    logger.warning("⚠️ Posible fallo de segmentación - todo opaco")
```

**Beneficio:** Robustez ante fallos del modelo principal o casos difíciles (siluetas, bajo contraste).

---

### 6. Manejo Adaptativo de Resolución 🟡 Media Prioridad

**Ubicación:** `contour_clip()` - antes de línea 889

**Problema:** `birefnet-general` tiene tamaño de entrada máximo recomendado (~1024px). Imágenes muy grandes procesadas directamente pueden:
- Exceder memoria GPU
- Perder detalles finos por downsampling interno del modelo

**Recomendación:** Pipeline de multi-resolución:

```python
# Al inicio de modo 'auto'
max_input_size = 1024
if max(h, w) > max_input_size * 1.5:  # Imagen muy grande
    # Estrategia: procesar a resolución óptima, aplicar máscara en original
    scale = max_input_size / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    
    # Resize para procesamiento
    img_small = cv2.resize(img_cv, (new_w, new_h), interpolation=cv2.INTER_AREA)
    img_small_bytes = pil_to_bytes(Image.fromarray(cv2.cvtColor(img_small, cv2.COLOR_BGR2RGB)))
    
    # Procesar versión pequeña
    rembg_res = await remove_background(img_small_bytes, ...)
    mask_small = ... # Extraer alpha
    
    # Upsample máscara con interpolación de alta calidad
    mask_full = cv2.resize(mask_small, (w, h), interpolation=cv2.INTER_LANCZOS4)
    # Refinar bordes en imagen original con GrabCut rápido...
```

**Beneficio:** Mejor manejo de imágenes de alta resolución (>4K) sin perder detalles o saturar memoria.

---

### 7. Mejoras en `_fill_holes()` 🟢 Baja Prioridad

**Ubicación:** `_fill_holes()` - líneas 814-822

**Problema actual:** El flood fill puede ser lento en imágenes grandes y no maneja múltiples agujeros de forma aislada.

**Optimización:** Usar connectedComponents directamente:

```python
def _fill_holes_fast(mask: np.ndarray) -> np.ndarray:
    """Fill holes using contour analysis - faster for large images."""
    # Encontrar contornos externos e internos
    contours, hierarchy = cv2.findContours(
        255 - mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
    )
    
    result = mask.copy()
    if hierarchy is not None:
        hierarchy = hierarchy[0]
        for i, h in enumerate(hierarchy):
            # h[3] >= 0 significa que tiene padre (contorno interno = hueco)
            if h[3] >= 0:
                cv2.drawContours(result, [contours[i]], -1, 255, -1)
    
    return result
```

**Beneficio:** ~2-3x más rápido en imágenes grandes con múltiples agujeros.

---

## Tabla de Prioridades

| Mejora | Prioridad | Impacto | Esfuerzo | Archivo |
|--------|-----------|---------|----------|---------|
| Parámetros alpha matting configurables | ✅ Completado | Calidad | Bajo | `processing.py:469` |
| Color space CIELAB | ✅ Completado | Calidad | Bajo | `processing.py:899` |
| Fast Guided Filter | 🟢 Alta | Rendimiento | Medio | `processing.py:856` |
| Umbral adaptativo alpha | 🟡 Media | Robustez | Medio | `processing.py:903` |
| Validación + fallback | 🟡 Media | Robustez | Medio | `processing.py:919` |
| Manejo de resolución | 🟡 Media | Calidad/Rend | Alto | `processing.py:885` |
| Optimización fill_holes | 🟢 Baja | Rendimiento | Bajo | `processing.py:814` |

---

## Implementación Sugerida

Orden recomendado de implementación:

1. **Fase 1 (Quick wins):** Parámetros alpha matting + CIELAB
2. **Fase 2 (Rendimiento):** Fast Guided Filter
3. **Fase 3 (Robustez):** Validación + umbral adaptativo
4. **Fase 4 (Escala):** Manejo de resolución

---

## Referencias

- [rembg documentation](https://github.com/danielgatis/rembg)
- [pymatting alpha matting](https://github.com/pymatting/pymatting)
- [Guided Filter paper](https://arxiv.org/abs/1206.4613)
- [CIELAB color space](https://en.wikipedia.org/wiki/CIELAB_color_space)
