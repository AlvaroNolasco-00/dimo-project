# ADR-0014: Nombre sugerido para descargas con timestamp automático

## Metadata
- **Status**: accepted
- **Date**: 2026-04-16
- **Superseded by**: —
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

Al descargar imágenes procesadas en el editor, el usuario debe especificar un nombre. Anteriormente, el fallback era genérico (`resultado`), lo que causaba:
- Confusión sobre qué tipo de procesamiento se aplicó
- Pérdida de contexto temporal (cuándo se procesó)
- Necesidad de renombrar manualmente para diferencias entre ediciones

Se requería un nombre sugerido automático que fuera:
- Informativo (indicar modo de edición aplicado)
- Temporal (timestamp de ejecución)
- No intrusivo (editable por el usuario)

## Decisión

Implementar nombre sugerido con patrón: `[modoSlug]-[YYYYMMDD]-[HHMMSS].png`

**Detalles:**
- `modoSlug`: versión acortada del modo en español
  - `remove-bg` → `sin-fondo`
  - `remove-objects` → `sin-objetos`
  - `enhance` → `mejorado`
  - `upscale` → `upscale` (término técnico conservado)
  - `halftone` → `semitonos`
  - `contour-clip` → `recorte`
  - `crop` → `recortado`
- Timestamp: fecha corta (YYYYMMDD) + hora-minuto-segundo (HHMMSS)
- Se selecciona el momento de finalización del procesamiento (single-step o pipeline)

**Implementación:**
- Signal `processedAt: signal<Date | null>` — captura momento de procesamiento
- Computed `suggestedFilename()` — genera nombre basado en modo + timestamp
- Placeholder del input muestra el nombre sugerido
- Fallback en download utiliza el nombre sugerido si el usuario no edita

## Alternativas Consideradas

### Alternativa 1: Solo slug del modo
- **Pros**: Más corto, fácil recordar
- **Contras**: Sin contexto temporal, difícil diferenciar múltiples descargas del mismo modo

### Alternativa 2: UUID aleatorio
- **Pros**: Garantiza unicidad
- **Contras**: Poco legible, no comunica qué se procesó ni cuándo

### Alternativa 3: Timestamp absoluto (Unix timestamp)
- **Pros**: Compacto, único
- **Contras**: Menos legible que fecha/hora estándar

## Consecuencias

### Positivas
- **Contexto automático**: Archivo comunica modo de edición sin necesidad de notas externas
- **Trazabilidad**: Timestamp permite rastrear orden y fecha de procesamiento
- **Editable**: Usuario puede reemplazar si desea nombre personalizado
- **Sin fricción**: Sugerencia aparece como placeholder, no es obligatoria
- **Multilingüe**: Nombres en español, legibles para equipo local

### Negativas
- Nombres más largos (impacto visual mínimo)
- Si timezone local cambia, timestamp puede parecer incorrecto en otro contexto

### Riesgos
- La fecha/hora capturada es la del cliente (browser), no del servidor
  - *Mitigación*: Suficiente para uso local; si se requiere coordinación con servidor, considerar ADR futuro

## Referencias
- Implementación: `frontend/src/app/editor/editor.component.ts` (signals `processedAt`, `suggestedFilename`)
- Template: `frontend/src/app/editor/editor.component.html` (lines 122, 150)
- Relacionado: ADR-0003 (Angular Signals), ADR-0007 (Pipeline no-destructivo)
