# 0027. Filtros, Color y Transformación en Studio Shell

**Status**: accepted

**Scope**: fullstack

**Fecha**: 2026-04-23

## Contexto

Studio Shell necesitaba herramientas adicionales de edición client-side y server-side. Se identificaron 3 herramientas complementaries: **Filtros** (presets de color), **Color** (ajuste HSL manual), y **Transformar** (rotación y volteo). Cada una tiene diferentes casos de uso: filtros para aplicación rápida de estilos predefinidos, color para ajuste fino, y transformación para corrección de orientación.

## Decisión

Se implementaron 3 nuevas herramientas con endpoints backend correspondientes:

### Backend

**Endpoints nuevos** en `backend/routers/processing.py`:
- `POST /apply-filter` — aplica filtro predefinido con intensidad opcional
- `POST /color-correct` — ajuste HSL (hue, saturation, lightness)
- `POST /transform` — rotación y volteo (flip horizontal/vertical)

**Funciones en** `backend/services/processing.py`:
- `FILTERS` dict con 10 filtros: `grayscale`, `sepia`, `vintage`, `cinematic`, `vivid`, `cool`, `warm`, `fade`, `noir`, `dramatic`
- `apply_filter(image_bytes, filter_name, intensity)` — aplica filtro con blend opcional para intensidad parcial
- `color_correct(image_bytes, hue, saturation, lightness)` — ajuste HSL pixel a pixel usando `colorsys`
- `transform_image(image_bytes, rotation, flip_h, flip_v)` — rotación y volteo con `Image.rotate()` y `Image.transpose()`

### Frontend

**Tool IDs** agregados a `ToolId` union y `TOOLS[]`:
- `'filters'` — `ph-palette`, Filtros y presets
- `'color'` — `ph-paint-brush`, Ajuste HSL
- `'transform'` — `ph-arrows-clockwise`, Rotar y voltear

**Componentes** nuevos en `frontend/src/app/studio/tools/`:
- `filters-tool/` — grid de presets con preview y slider de intensidad
- `color-tool/` — sliders HSL con preview en vivo
- `transform-tool/` — dial de rotación y botones de volteo

**Servicio** `StudioProcessingService` extendido con:
- `applyFilter(image, filterName, intensity): Promise<Blob>`
- `colorCorrect(image, hue, saturation, lightness): Promise<Blob>`
- `transform(image, rotation, flipH, flipV): Promise<Blob>`

**StudioShellComponent** actualizado:
- Imports de los 3 nuevos tool components
- `@case ('filters')`, `@case ('color')`, `@case ('transform')` en template

## Alternativas Consideradas

- **Client-side only**: Canvas API para filtros es posible pero limitado; HSL en JS es lento sin WebGL
- **Un solo endpoint genérico**: Más flexible pero menos type-safe; cada herramienta tiene parámetros distintos
- **CSS filters**: Rápidos pero no destructivos y no exportables como imagen procesada

## Consecuencias

- **Positivo**: 3 herramientas nuevas expanden Studio Shell significativamente
- **Positivo**: Backend maneja procesamiento pesado, cliente solo envía parámetros
- **Positivo**: API RESTful consistente con herramientas existentes
- **Negativo**: 3 endpoints adicionales aumenta superficie de API
- **Negativo**: Filtros son CPU-bound en backend; considerar GPU en futuro para volumen alto

## Referencias

- `backend/routers/processing.py` — endpoints `/apply-filter`, `/color-correct`, `/transform`
- `backend/services/processing.py` — `FILTERS`, `apply_filter()`, `color_correct()`, `transform_image()`
- `frontend/src/app/studio/tools/filters-tool/` — FiltersToolComponent
- `frontend/src/app/studio/tools/color-tool/` — ColorToolComponent
- `frontend/src/app/studio/tools/transform-tool/` — TransformToolComponent
- `frontend/src/app/studio/services/studio-processing.service.ts` — métodos applyFilter, colorCorrect, transform
- `frontend/src/app/studio/studio-shell/studio-shell.component.ts` — wiring de herramientas
- `frontend/src/app/studio/models/tool.types.ts` — `'filters'`, `'color'`, `'transform'` en ToolId