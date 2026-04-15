# ADR-0007: Pipeline no-destructivo con encadenamiento de pasos

## Metadata
- **Status**: accepted
- **Date**: 2026-04-14
- **Superseded by**: N/A
- **Deciders**: Alvaro Alcides Guandique Nolasco
- **Scope**: frontend

## Contexto

El editor permite a usuarios crear pipelines de procesamiento de imágenes no-destructivos agregando múltiples operaciones (upscale, halftone, quitar fondo, etc.) sin modificar la imagen original.

El problema inicial: cada paso de la cola capturaba la imagen original al agregarse. Esto significa que si un usuario quería hacer upscale → halftone, ambas operaciones se ejecutaban sobre la imagen original, no en secuencia. El usuario no podía encadenar pasos para que el output de uno fuera el input del siguiente.

## Decisión

Implementar **encadenamiento de pasos** (chained pipeline) permitiendo que un paso use el output del paso anterior como input, con control explícito del usuario:

1. **`Operation.inputMode`**: campo `'original' | 'chained'` que define si el paso usa la imagen original o el output del paso anterior.

2. **Captura de blob**: cada operación captura el blob al agregarse (se mantiene el comportamiento existente para `inputMode: 'original'`).

3. **Ejecución encadenada**: en `executePipeline()`, si `inputMode === 'chained'`, el paso usa `newResults[i-1].outputBlob` como input (feedback del paso anterior).

4. **UX - Chain Toggle**: toggle visible solo cuando el usuario navega a **un modo diferente** al del último paso en la cola. Esto previene agregaciones accidentales del mismo paso dos veces.

5. **Indicadores visuales**: cada paso en la cola (excepto el primero) muestra un badge con icono de cadena (🔗 encadenado) o cadena rota (🔗‍💥 independiente).

## Alternativas Consideradas

### Alternativa 1: Encadenamiento automático siempre
- **Pros**: Todos los pasos automáticamente encadenados; usuario no necesita decidir.
- **Contras**: Pierde flexibilidad — no permite ramificar desde el original en pasos posteriores; UX confuso.

### Alternativa 2: Per-operation toggle (editar después de agregar)
- **Pros**: Control granular per-step; permite cambiar el modo después de agregar.
- **Contras**: UI más compleja; requiere interacción adicional después de agregar cada paso.

### Alternativa 3: Global pipeline mode (todos encadenados o todos independientes)
- **Pros**: Simplicidad; una decisión cubre toda la cola.
- **Contras**: Restricción severa; no permite mezclar estrategias dentro de un pipeline.

## Consecuencias

### Positivas
- Usuario obtiene flexibilidad total: puede mezclar pasos independientes y encadenados en el mismo pipeline.
- Workflows naturales: upscale → halftone → enhance (cada uno usa output anterior).
- `useStepAsSource()` ya soporta branching post-ejecución; encadenamiento amplía opciones pre-ejecución.
- UI clara: toggle aparece solo en contexto relevante (modo diferente); badges indican el tipo de cada paso.

### Negativas
- Complejidad adicional en el estado (`inputMode` por operación).
- Usuario debe entender la diferencia entre `original` y `chained`.

### Riesgos
- Confusión inicial sobre cuándo aparece el toggle (mitigado: solo aparece cuando el modo actual ≠ último paso).
- Performance: cada step chained debe acceder al blob anterior; no es un problema con blobs pequeños en memoria.

## Referencias
- `frontend/src/app/services/pipeline.service.ts` — `Operation.inputMode` field
- `frontend/src/app/editor/editor.component.ts` — `chainWithPrevious` signal, `addToPipeline()`, `executePipeline()`
- `frontend/src/app/editor/editor.component.html` — chain toggle, chain badges per operation
- Implementación: 2026-04-14, commit con cadena de encadenamiento de pasos
