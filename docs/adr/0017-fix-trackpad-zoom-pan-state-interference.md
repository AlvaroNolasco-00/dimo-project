# ADR-0017: Fix zoom controls state logic and trackpad gesture handling

## Metadata
- **Status**: accepted
- **Date**: 2026-04-17
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

Dos problemas independientes afectaban zoom controls:

1. **Trackpad gestures** (macOS): pinch-to-zoom genera `wheel` + `mousedown` sin `mouseup` → `isPanning` queda stuck `true` → posteriores `mousemove` acumulan `panOffset` → imagen fuera de pantalla.

2. **Mismatch template/logic** (regresión): `viewMode` default = `'comparison'`. Sin `processedImageSource`, template renderiza rama else (usa `zoomLevel`), pero `activeZoomIn/Out` actualizaban `compZoomLevel` → botones no tenían efecto visual.

## Decisión

Tres cambios en `editor-preview.component.ts`:

1. **Global mouseup listener** (ngOnInit/ngOnDestroy):
   ```ts
   private readonly boundStopPan = () => this.stopPan();
   ngOnInit() { window.addEventListener('mouseup', this.boundStopPan); }
   ngOnDestroy() { window.removeEventListener('mouseup', this.boundStopPan); }
   ```
   Captura mouseup fuera del elemento → `isPanning` nunca queda atrapado.

2. **Computed alignment** (nuevo):
   ```ts
   private isComparisonActive = computed(() => 
     this.viewMode() === 'comparison' && !!this.processedImageSource()
   );
   activeZoomIn() { this.isComparisonActive() ? this.compZoomIn() : this.zoomIn(); }
   activeZoomOut() { this.isComparisonActive() ? this.compZoomOut() : this.zoomOut(); }
   activeResetZoom() { this.isComparisonActive() ? this.resetCompZoom() : this.resetZoom(); }
   ```
   Alinea controles con template: comparison solo se renderiza si processed exists.

3. **PanOffset reset on zoom**:
   ```ts
   zoomIn() { this.zoomLevel.update(...); this.panOffset.set({ x: 0, y: 0 }); }
   zoomOut() { this.zoomLevel.update(...); this.panOffset.set({ x: 0, y: 0 }); }
   ```
   Recovery: botones siempre traen imagen a centro aunque panOffset corrupto.

## Alternativas Consideradas

### Alternativa 1: Reset isPanning en onWheel
- **Pros**: simple, evita stuck pan
- **Contras**: no alinea zoom button logic con template rendering (mismatch persiste)

### Alternativa 2: Pointer events + setPointerCapture
- **Pros**: robusto para gestures
- **Contras**: captura todos events del elemento → botones clickeables no reciben click (regresión)

### Alternativa 3: Timeout auto-reset
- **Pros**: fallback general
- **Contras**: broad, latency perceptible

### Seleccionada: Tres cambios independientes
- Global listener (robusto), computed alignment (correcto), panOffset reset (recovery)
- Cubre trackpad + mismatch + corrupción

## Consecuencias

### Positivas
- Pan state nunca stuck, zoom controls siempre funcionales
- Logic alineada con template (comparison activo solo si processed existe)
- Recovery automático: zoom buttons llevan imagen a centro
- Mínimo riesgo de regresión

### Negativas
- Window listener global (minor overhead)
- Computed adicional (negligible con Signals)

### Riesgos
- Ninguno identificado

## Referencias
- `frontend/src/app/editor/components/editor-preview/editor-preview.component.ts` (líneas 59, 146-147, 153, 512-516, 523-536)
- Problema: trackpad interference + zoom button unresponsiveness
- Fix: global mouseup capture + template alignment + recovery mechanism
