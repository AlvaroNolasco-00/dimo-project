# ADR-0009: Fix: Visualización acumulada de resultados en pipeline y recálculo de inputMode en reordenamiento

## Metadata
- **Status**: accepted
- **Date**: 2026-04-15
- **Superseded by**: N/A
- **Deciders**: Alvaro Alcides Guandique Nolasco
- **Scope**: frontend

## Contexto

Post-ADR-0007 (Pipeline no-destructivo con encadenamiento), usuarios reportaron que al ejecutar un pipeline encadenado, los pasos mostraban visualmente resultados **no acumulativos**:

- Paso 1 (ej: quitar fondo): mostraba resultado de op1
- Paso 2 (ej: enhance chained): mostraba resultado relativo al paso anterior (not cumulative vs original)
- El usuario esperaba que el último paso mostrara **todos los pasos aplicados acumulativamente** comparados contra la imagen original

**Causa raíz identificada:** La computed `pipelineCurrentSource()` retornaba `result.inputUrl` (el output del paso anterior), no la imagen original. Esto causaba que la comparación mostrara "paso N-1 vs paso N" en lugar de "original vs paso N acumulado".

**Bug secundario:** `moveOperation()` no recalculaba `inputMode` tras reordenar. Un paso con `inputMode='chained'` movido a posición 0 fallaba la condición `i > 0` en ejecución, cayendo al fallback (imagen original independiente).

## Decisión

Implementar dos fixes:

### 1. Fix `pipelineCurrentSource` — siempre comparar contra original
Cambiar la computed para retornar siempre `this.currentImageSource()` (imagen original), no `result.inputUrl`:

```typescript
pipelineCurrentSource = computed(() => {
  const results = this.pipelineResults();
  if (results.length === 0) return this.currentImageSource();
  return this.currentImageSource(); // Siempre original
});
```

Esto garantiza: cada paso muestra "original vs resultado acumulado hasta ese paso".

### 2. Fix `moveOperation` — recalcular `inputMode` tras reordenar
Al reordenar operaciones, el primer paso **siempre** debe ser `inputMode='original'` (sin dependencias previas):

```typescript
moveOperation(fromIndex: number, toIndex: number) {
  this.operationQueue.update(queue => {
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    // Recalcular: primer op siempre 'original'
    return newQueue.map((op, i) =>
      i === 0 ? { ...op, inputMode: 'original' as const } : op
    );
  });
}
```

## Alternativas Consideradas

### Alternativa 1: Mostrar el "before" relativo (paso anterior)
- **Pros**: Permite ver diff fino entre pasos consecutivos.
- **Contras**: Confunde al usuario; no ve el impacto acumulado desde el original. Contradice la mentalidad de encadenamiento.

### Alternativa 2: Per-step toggle para elegir "before" (original vs anterior)
- **Pros**: Flexibilidad máxima.
- **Contras**: UI más compleja; complejidad mental. Overkill para el caso de uso.

### Alternativa 3: No recalcular inputMode; restringir reordenamiento
- **Pros**: Lógica más simple.
- **Contras**: Limita UX; usuario no puede reorganizar libremente.

## Consecuencias

### Positivas
- Usuario ve claramente el impacto acumulado de cada paso: "original → paso 1+2+...+N".
- El último paso muestra explícitamente la "suma de todos los pasos" comparada contra el original.
- Reordenamiento de pasos funciona correctamente: primer paso siempre independiente, resto encadenado según su posición.
- UX es coherente con la filosofía de "pipeline encadenado".

### Negativas
- Pierde la capacidad de ver el diff fino entre pasos consecutivos (tradeoff menor; el usuario puede hacer click en el paso anterior).

### Riesgos
- Si un usuario esperaba ver diffs relativos, ahora verá diffs acumulativos. Cambio de UX, pero por razones correctas.

## Referencias
- `frontend/src/app/editor/editor.component.ts:75-83` — `pipelineCurrentSource` computed
- `frontend/src/app/services/pipeline.service.ts:70-77` — `moveOperation` method
- ADR-0007: Pipeline no-destructivo con encadenamiento de pasos
- Implementación: 2026-04-14
