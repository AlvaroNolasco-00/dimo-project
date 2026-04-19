# ADR-0019: Pipeline Híbrido de Segmentación en Auto Contour Clip

## Metadata
- **Status**: accepted
- **Date**: 2026-04-19
- **Deciders**: Antigravity (AI), Usuario
- **Scope**: backend, machine-learning

## Contexto

La funcionalidad de `contour_clip` (Eliminación de fondo con recorte por contorno) dependía inicialmente de un modelo único (`u2net`) o de GrabCut tradicional. Sin embargo, presentaba deficiencias críticas:

1.  **Detección de bordes finos**: El modelo básico suele "cortar" puntas de cabello o pelaje.
2.  **Sensibilidad al color**: Las sugerencias de color del usuario comparaban distancias en RGB, lo cual no es representativo de cómo el ojo humano percibe la diferencia de color, causando fallos bajo diferentes iluminaciones.
3.  **Bordes Jaggy**: Los recortes se veían escalonados en lugar de suaves y naturales.

## Decisión

Se rediseñó el pipeline de "Auto Mode" para ser un sistema híbrido que combina IA con técnicas clásicas de visión computacional avanzada:

1.  **Espacio de Color CIELAB**: Se migró la comparación de colores de RGB a CIELAB para una detección de "hints" de fondo mucho más precisa y robusta a sombras y brillos.
2.  **Generación Dinámica de ROI**: Se usa la salida del modelo como una máscara inicial, la cual se dilata agresivamente para definir una "Zona de Interés" (ROI).
3.  **Chroma Keying Localizado**: Dentro de la ROI, se utiliza un estimador de color de fondo (usando las esquinas y anillos exteriores) para detectar detalles del sujeto que el modelo pudo haber ignorado.
4.  **Matting y Decontaminación**:
    *   Se aplica un filtro bilateral guiado (Edge-aware smoothing) para suavizar bordes basándose en la imagen original.
    *   Se implementó decontaminación de bordes para eliminar el "sangrado" (spill) del color de fondo en píxeles semi-transparentes.
5.  **Refactor de Dependencias**: Migración a `opencv-contrib-python-headless` y adición de `pymatting` para soportar estos algoritmos.

## Alternativas Consideradas

### Alternativa 1: Cambiar a un modelo más pesado (ej. BirefNet completo)
- **Pros**: Calidad out-of-the-box superior.
- **Contras**: Mucho más lento, consume demasiada VRAM para un worker GPU compartido y no permite ajustes granulares por parte del usuario.

### Alternativa 2: Solo GrabCut refinado
- **Pros**: Rápido y ligero.
- **Contras**: Requiere mucha interacción manual del usuario y falla catastróficamente sin un buen "seed".

## Consecuencias

### Positivas
- **Calidad Premium**: Resultados profesionales con suavidad en cabello y bordes finos.
- **Robustez**: El sistema ahora funciona mejor en imágenes con fondos similares al color del sujeto gracias a CIELAB.
- **Control**: Permite que los "hints" de color del usuario tengan un efecto real y preciso.

### Negativas
- **Complejidad**: El código de `processing.py` es ahora más complejo de mantener.
- **Latencia**: El procesamiento toma un 20-30% más de tiempo CPU/GPU debido a los pasos adicionales de filtrado y decontaminación.

## Referencias
- `backend/services/processing.py`
- `requirements.txt`
