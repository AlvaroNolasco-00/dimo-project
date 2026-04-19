# Análisis de Upscaling - Backend & GPU Worker

**Fecha**: 2026-04-18

## Resumen Ejecutivo

El sistema tiene una **arquitectura sólida** pero hay **oportunidades significativas de mejora** en calidad de salida, especialmente para el procesamiento local.

---

## 1. GPU Worker (`gpu-worker/`)

### ✅ Fortalezas

| Aspecto | Implementación | Evaluación |
|---------|---------------|------------|
| **Modelo** | Real-ESRGAN x4plus | ✅ Estándar industria, muy bueno para fotos reales |
| **Tiling** | `tile=400` con padding | ✅ Evita OOM en GPUs con poca VRAM |
| **Precisión** | FP16 en CUDA (`half=True`) | ✅ ~2x más rápido, mínima pérdida de calidad |
| **Cold start** | Modelos precargados en startup | ✅ Reduce latencia de primer request |

### ⚠️ Áreas de Mejora

#### 1.1 Modelos Limitados
```python
@/Users/alvaronolasco/Documents/Projects/dimo-project/gpu-worker/core/upscaler.py:22
model_path='weights/RealESRGAN_x4plus.pth'
```

**Problema**: Solo un modelo para todo tipo de contenido.

**Mejora recomendada**:
```python
# Añadir soporte para modelos especializados
MODELS = {
    'photo': 'RealESRGAN_x4plus.pth',           # Fotos reales (actual)
    'anime': 'RealESRGAN_x4plus_anime_6B.pth',  # Ilustraciones/anime
    'fast': 'RealESRGAN_x2plus.pth',            # 2x más rápido, calidad ligeramente menor
    'ultra': 'RealESRGAN_x4plus_net.pth'        # Mejor preservación de detalles
}
```

#### 1.2 Pérdida de Canal Alpha
```python
@/Users/alvaronolasco/Documents/Projects/dimo-project/gpu-worker/core/upscaler.py:34
img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)  # Convierte a RGB, pierde alpha
```

**Problema**: Las imágenes con transparencia (PNG) pierden el canal alpha.

**Mejora**:
```python
img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)  # Preserva alpha si existe
if img.shape[2] == 4:
    # Procesar RGB y Alpha por separado, luego recombinar
```

#### 1.3 Tile Padding Insuficiente
```python
@/Users/alvaronolasco/Documents/Projects/dimo-project/gpu-worker/core/upscaler.py:25
tile_pad=10  # ← Bajo para imágenes con mucho detalle
```

**Problema**: Artefactos visibles en líneas diagonales/grids que cruzan bordes de tiles.

**Recomendación**: `tile_pad=20` o incluso `30` para imágenes de alta frecuencia.

#### 1.4 Sin Denoising Pre/Post
Real-ESRGAN mejora mucho si la imagen de entrada tiene algo de ruido, pero no tiene denoising explícito. Para imágenes muy comprimidas (JPEG con artefactos), esto amplifica los artefactos.

---

## 2. Backend Local (`backend/services/processing.py`)

### ❌ Problema Crítico: Upscaling Local es Subóptimo

```python
@/Users/alvaronolasco/Documents/Projects/dimo-project/backend/services/processing.py:644-665
def upscale_image_legacy(image_bytes: bytes, factor=2, detail_boost=1.5) -> bytes:
    """CPU upscaling using Lanczos — universal fallback."""
    res_pil = img_pil.resize((new_width, new_height), Image.Resampling.LANCZOS)
    if detail_boost > 0:
        res_pil = res_pil.filter(ImageFilter.UnsharpMask(...))
```

```python
@/Users/alvaronolasco/Documents/Projects/dimo-project/backend/services/processing.py:668-718
def upscale_image_mps(image_bytes: bytes, factor: float, detail_boost: float) -> bytes:
    # Usa bicúbica en GPU Apple, no es SR neuronal
    t = F.interpolate(t, size=(new_height, new_width), mode='bicubic', ...)
```

**Evaluación**:
- **Lanczos (CPU)**: Método tradicional, **sin recuperación de detalles reales**
- **Bicúbica MPS**: Más rápido que Lanczos, pero **misma calidad visual** (no es SR)

**Impacto**: Cuando el GPU worker falla o no está configurado, los usuarios reciben calidad significativamente inferior.

### Soluciones Recomendadas

#### Opción A: ONNX Runtime con modelos ligeros
Agregar modelos SR como ESRGAN/Real-ESRGAN convertidos a ONNX para ejecución local:
```python
# Usar onnxruntime con providers optimizados para MPS/CoreML
providers = ['CoreMLExecutionProvider', 'CPUExecutionProvider']
session = ort.InferenceSession("models/realesrgan_lite.onnx", providers=providers)
```

#### Opción B: Integrar rembg-style modelos
Ya usan `rembg` con ONNX, podrían usar la misma infraestructura para SR.

---

## 3. Arquitectura de Routing

### ⚠️ Comentarios Confusos
```python
@/Users/alvaronolasco/Documents/Projects/dimo-project/gpu-worker/main.py:64-75
# Real-ESRGAN native is x4. 
# If user wants x2, we process x4 then downscale (better quality)
# If user wants > x4, we process x4 (limit for now)
target_scale = 4
```

El código actual **ignora** el parámetro `scale` del usuario y siempre hace x4. Esto no es lo que el comentario describe.

**Comportamiento correcto debería ser**:
```python
if scale <= 2:
    out_scale = 2  # Usar modelo x2 si disponible
elif scale <= 4:
    out_scale = 4  # Usar modelo x4
else:
    out_scale = 4  # Limitado a x4, informar al usuario
```

---

## 4. Lista Priorizada de Mejoras

| Prioridad | Mejora | Impacto Calidad | Esfuerzo |
|-----------|--------|-----------------|----------|
| 🔴 **Alta** | Preservar canal alpha en GPU worker | Alto | Medio |
| 🔴 **Alta** | Mejorar upscaling local (ONNX/MPS) | Alto | Alto |
| 🟡 **Media** | Añadir modelos especializados (anime) | Medio | Medio |
| 🟡 **Media** | Aumentar tile_pad a 20-30 | Medio | Bajo |
| 🟢 **Baja** | WebP de salida con calidad configurable | Bajo | Bajo |
| 🟢 **Baja** | Post-procesamiento denoising | Medio | Medio |

---

## Conclusión

**Para máxima calidad**:
1. **GPU Worker** es adecuado pero necesita manejo de transparencia y modelos específicos por tipo de contenido
2. **Backend local** es el cuello de botella - las fallbacks actuales (Lanczos/bicúbica) no ofrecen super-resolución real

**Recomendación inmediata**: Implementar preservación de canal alpha y evaluar modelos ONNX para ejecución local en Apple Silicon.
