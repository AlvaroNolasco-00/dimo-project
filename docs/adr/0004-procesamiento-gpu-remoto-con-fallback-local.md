# ADR-0004: Procesamiento GPU remoto con fallback a CPU local

## Metadata
- **Status**: accepted
- **Date**: 2025-01-19
- **Deciders**: Equipo backend + DevOps
- **Scope**: infrastructure

## Contexto

Las tareas de procesamiento de imágenes (background removal via Rembg, upscaling, efectos con OpenCV) son computacionalmente intensivas. El proyecto necesitaba soportar:

- Procesamiento rápido en producción (GPU disponible)
- Fallback a CPU local si GPU no está disponible (desarrollo local, transición)
- Flexibilidad para escalar GPU services independientemente
- No bloquear la arquitectura a un proveedor de GPU

## Decisión

Se implementó un **sistema dual-mode configurable vía variables de entorno**:
- Si `GPU_UPSCALE_URL`, `GPU_REMOVER_URL` están configuradas → rutas HTTP async a servicios GPU remotos
- Si no configuradas → procesamiento local en CPU usando rembg, OpenCV, PIL
- Las tareas GPU remotas usan polling con `ProcessingTask` model para tracking de estado

## Alternativas Consideradas

### Alternativa 1: Solo GPU remoto (obligatorio)
- **Pros**: Siempre performante, offload de CPU
- **Contras**: Imposible desarrollar localmente sin GPU, infraestructura siempre necesaria, costo innecesario para features no-GPU

### Alternativa 2: Solo CPU local
- **Pros**: Simpleza, no dependencias externas, funciona en cualquier máquina
- **Contras**: Muy lento para upscaling, mala UX en producción

### Alternativa 3: Colas de trabajo asincrónicas (Celery, RQ)
- **Pros**: Mejor escalabilidad, desacoplamiento de procesos
- **Contras**: Complejidad operacional (Redis, workers), overkill para este escenario, más latencia

## Consecuencias

### Positivas
- Máxima flexibilidad — funciona en dev y prod sin cambios de código
- Fácil migración: agregar GPU es solo configurar env vars
- Transiciones suaves: dev sin GPU → prod con GPU
- Escalabilidad: GPU service puede tener múltiples workers independientes

### Negativas
- Lógica condicional en routers (if GPU_URL else local)
- Necesita mantener dos implementaciones (local + remoto)
- Polling introduce latencia comparado con callbacks/webhooks

### Riesgos
- Dependencia de servicio GPU en producción introduce punto de fallo
- Timeouts/latencia de red pueden afectar UX si GPU service es lento
- Sincronización de versiones: cambios en algoritmos locales deben reflejarse en GPU service

## Referencias
- `backend/routers/processing.py` — lógica dual-mode
- `backend/services/processing.py` — implementación de procesamiento local
- `backend/models.py` — modelo `ProcessingTask` para tracking
- `backend/main.py` — env vars `GPU_UPSCALE_URL`, `GPU_REMOVER_URL`, `GPU_SERVICE_SECRET`
- Deployment: `backend/.env` y variables Koyeb en producción
