# ADR-0018: Validación Estricta de Carga de Imágenes

## Metadata
- **Status**: accepted
- **Date**: 2026-04-19
- **Deciders**: Antigravity (AI), Usuario
- **Scope**: backend, gpu-worker

## Contexto

El sistema procesa imágenes enviadas por usuarios para tareas pesadas (upscaling, eliminación de fondo) que ocurren tanto en el backend principal como en workers de GPU remotos (Modal). Anteriormente, la validación de archivos era mínima, lo que abría los siguientes riesgos:

1.  **Denegación de Servicio (DoS)**: Carga de archivos extremadamente grandes que saturan el ancho de banda o la memoria.
2.  **Inestabilidad**: Archivos corruptos o malformados que hacían fallar los procesos de OpenCV o PIL.
3.  **Agotamiento de Recursos**: Imágenes con dimensiones masivas (ej. 20k x 20k) que causan errores de `OutOfMemory` (OOM) en GPU.
4.  **Seguridad**: Carga de archivos no permitidos (ej. scripts o archivos binarios disfrazados de imágenes).

## Decisión

Se implementó una utilidad de validación centralizada (`validate_upload`) que se ejecuta en el punto de entrada de cada servicio (Backend y GPU Worker). Los criterios son:

- **Tamaño Máximo**: 10MB (suficiente para la mayoría de fotos de usuarios, evita saturación).
- **Dimensiones Máximas**: 4096px en cualquier lado (límite razonable para VRAM y GPU).
- **Formatos Permitidos**: JPEG, JPG, PNG, WEBP (vía extensión y Content-Type).
- **Validación de Integridad**: Se utiliza `Image.verify()` y `Image.load()` de PIL para asegurar que el archivo es realmente una imagen legible antes de enviarlo a la GPU.
- **Mapeo de Errores HTTP**:
    - 413 (Payload Too Large) para tamaño.
    - 415 (Unsupported Media Type) para formato.
    - 400 (Bad Request) para dimensiones o integridad.

## Alternativas Consideradas

### Alternativa 1: Validar solo en el Frontend
- **Pros**: Feedback inmediato al usuario.
- **Contras**: Inexistente seguridad (se puede bypassear con curl/API) y no protege los recursos del servidor.

### Alternativa 2: Validar solo en el Backend principal
- **Pros**: Centralización inicial.
- **Contras**: El Worker GPU (Modal) sigue siendo vulnerable si el backend se ve comprometido o si se expone accidentalmente a internet.

## Consecuencias

### Positivas
- **Robustez**: Los servicios fallan "graciosamente" con códigos de error claros antes de desperdiciar tiempo de GPU.
- **Seguridad**: Reducción de la superficie de ataque para DoS y archivos maliciosos.
- **Ahorro de Costos**: Menos ejecuciones fallidas en Modal (que factura por tiempo).

### Negativas
- **Overhead**: Ligero retraso al procesar imágenes (doble lectura para verificar integridad).
- **Restricción**: Usuarios con imágenes de >10MB deberán reducirlas antes de cargarlas.

## Referencias
- `gpu-worker/modal_app.py`
- `backend/services/processing.py`
- `gpu-worker/core/validation.py`
