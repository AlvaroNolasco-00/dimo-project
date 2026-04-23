# 0026. Herramienta Crop en Studio Shell

**Status**: accepted

**Scope**: frontend

**Fecha**: 2026-04-23

## Contexto

Studio Shell es interfaz nueva de edición. Incluye 7 herramientas: remove-bg, remove-objects, enhance, upscale, halftone, contour-clip, watermark. Faltaba **Recorte (Crop)**. Editor legado (`/utilidades/crop`) usa CropperJS, pero no está integrado en Studio. Necesidad: portar Crop a Studio siguiendo patrones existentes (Signals, history, client-side processing).

## Decisión

Se implementó Crop 100% client-side usando **CropperJS** (ya en `package.json` + `angular.json`):

1. **Nueva tool ID**: `'crop'` en `ToolId` union y `TOOLS[]`
2. **CropToolComponent**: nuevo componente con UI presets (Libre, 1:1, 4:3, 3:4, 16:9, 9:16) + botón Apply
3. **CanvasViewportComponent**: extendido con:
   - Inputs `cropMode` y `cropAspect`
   - `effect()` para lifecycle: init Cropper en `cropMode=true`, destroy al cambiar
   - Método público `getCroppedBlob(): Promise<Blob | null>`
4. **StudioShellComponent**: orquesta crop:
   - `cropMode` computed, `cropAspect` signal
   - Handlers `onCropAspect()` y `async onCropApply()`
   - Llama `viewport.getCroppedBlob()` → `state.applyResult(blob, 'crop', 'Recorte')`
5. **Template**: inputs pasados a viewport + `@case('crop')` en switch

## Alternativas Consideradas

- **Backend endpoint**: innecesario para Crop; client-side es más rápido y offline-capable
- **Componente separado con canvas clonado**: más complicado; reusar viewport es limpio
- **Evitar Cropper.js**: reinventar wheels; lib madura + CSS ya en build

## Consecuencias

- **Positivo**: Crop integrado en Studio sin backend; reutiliza `history`, `state`, e imagen actual
- **Positivo**: CropperJS lifecycle (init/destroy) automático via `effect()`
- **Positivo**: Aspect presets dinámicos, drag/resize/zoom incluidos
- **Negativo**: Cropper requiere DOM `<img>` real; no funciona con canvas personalizados (no aplica acá)

## Referencias

- `frontend/src/app/studio/tools/crop-tool/crop-tool.component.ts` — nuevo
- `frontend/src/app/studio/models/tool.types.ts` — `'crop'` ToolId + entry
- `frontend/src/app/studio/components/canvas-viewport/canvas-viewport.component.ts` — `cropMode`, `cropAspect`, lifecycle Cropper, `getCroppedBlob()`
- `frontend/src/app/studio/studio-shell/studio-shell.component.ts` — handlers, wiring
- `frontend/src/app/studio/studio-shell/studio-shell.component.html` — template case
- Package: `cropperjs@^1.6.2` (ya instalado)
- CSS global: `node_modules/cropperjs/dist/cropper.css` (ya en `angular.json`)
