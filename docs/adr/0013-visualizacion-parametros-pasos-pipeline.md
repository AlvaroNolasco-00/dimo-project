# ADR-0013: Visualización de parámetros de pasos en pipeline

## Metadata
- **Status**: accepted
- **Date**: 2026-04-16
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

En el editor, cuando el usuario construye un pipeline agregando múltiples pasos (enhance, upscale, remove-bg, etc.), solo veía el nombre del paso y su posición en la cola. No había forma de ver qué configuraciones específicas se aplicaban a cada paso (ej: factor de upscale, contraste de enhance, modo de remove-bg).

Esto causaba fricción: usuarios tenían que recordar la configuración que usaron, o no podían revisar los parámetros sin editar el paso nuevamente.

## Decisión

Añadir visualización de parámetros directamente en cada `operation-item` del pipeline:
- Crear método `getParamsSummary(op: Operation): string[]` que convierte `operation.params` en etiquetas humano-legibles
- Mostrar chips debajo del nombre del paso con los parámetros más relevantes
- Cada operación tiene su propio formato de resumen (ej: upscale muestra `4x · Detalle: 1.5`)

**Cambios:**
- `editor.component.ts`: método `getParamsSummary()` formatea params por tipo de operación
- `editor.component.html`: agregado `operation-meta` div con `operation-header` (nombre + badge) + `operation-params` (chips)
- `editor.component.scss`: nuevos estilos para `.operation-meta`, `.operation-header`, `.operation-params`, `.param-chip`

## Alternativas Consideradas

### Alt 1: Expandible/collapsible info
- **Pros**: no ocupa espacio visual por defecto; más detalles si se expande
- **Contras**: requiere clicks adicionales; menos inmediato; params importante debería estar visible siempre

### Alt 2: Tooltip al hover
- **Pros**: sin ocupar espacio
- **Contras**: no funciona bien en mobile; fácil pasar desapercibido; inconsistente con ToolHelp modal

### Alt 3: No mostrar parámetros
- **Pros**: UI más limpia
- **Contras**: **user friction**: no saber qué parámetros lleva cada paso sin editarlo; decisión rechazada

## Consecuencias

### Positivas
- Transparencia: usuario ve exactamente qué parámetros lleva cada paso sin necesidad de editarlo
- Mejor trazabilidad: auditar pipeline es más fácil (útil para reproducibilidad)
- Confianza en multi-paso: usuario sabe exactamente qué está pasando en la cola
- Formato consistente: cada tipo de operación muestra solo sus parámetros relevantes

### Negativas
- `operation-item` ahora ocupa más espacio vertical (2-3 líneas en lugar de 1)
- En pipelines con muchos pasos, scrolling puede ser más necesario
- Require mantenimiento: si se agregan nuevos parámetros a una operación, hay que actualizar `getParamsSummary()`

### Riesgos
- CSS grid/flex en `operation-meta` podría comportarse diferente en navegadores antiguos → mitigado: solo flex, soporte amplio
- Tipografía pequeña (0.7rem) podría ser ilegible en pantallas muy pequeñas → aceptable, chips son secundarios

## Referencias
- [Operation interface](../frontend/src/app/services/pipeline.service.ts#L5)
- [getCurrentParams() en editor.component.ts](../frontend/src/app/editor/editor.component.ts#L535)
- [HTML operación queue](../frontend/src/app/editor/editor.component.html#L44)
