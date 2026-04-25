# ADR-0029: Lienzo Multi-Imagen con Canvas2D y Signals

## Metadata
- **Status**: accepted
- **Date**: 2026-04-24
- **Deciders**: Álvaro Nolasco
- **Scope**: frontend

## Contexto

Necesidad de herramienta para posicionar, redimensionar y rotar múltiples imágenes sobre un lienzo con dimensiones físicas específicas (expresadas en centímetros). Requerimientos:
- Soporte para pan (Space+drag, botón central) y zoom (scroll)
- Manipulación interactiva: 4 handles de esquina para redimensionar (manteniendo aspecto), 1 handle superior para rotación
- Exportación a PNG con calidad de impresión (300 DPI)
- Gestión de estado centralizada y reactiva
- UI modular con panel de propiedades para edición numérica

## Decisión

Implementar Lienzo como módulo Frontend independiente en Studio con:

1. **Canvas2D renderizado puro** — HTML5 Canvas con render loop optimizado via `requestAnimationFrame`, sin librerías gráficas externas
2. **State Service basado en Angular Signals** — `LienzoStateService` con estado inmutable (signals) para imágenes, tamaño, selección y z-order
3. **Arquitectura de 4 componentes**:
   - `LienzoCanvasComponent` — renderizado, interacción (pan/zoom/drag), hit-testing
   - `LienzoToolbarComponent` — inputs dimensionales (cm), agregar imágenes, exportar, eliminar
   - `LienzoPropsComponent` — edición numérica (posición, tamaño, rotación), controles de z-order, bloqueo de aspecto
   - `LienzoShellComponent` — orquestador que une los 3 componentes
4. **Unidades duales**:
   - Lógica interna: píxeles a 96 DPI (pantalla)
   - UI usuario: centímetros
   - Exportación: escalado a 300 DPI para impresión
5. **Poda automática** — al reducir lienzo, imágenes completamente fuera de límites se eliminan automáticamente
6. **Z-order via índice de array** — último elemento = más frontal
7. **Fondo de edición configurable** — color sólido editable en modo edición (`LienzoStateService._editBgColor` signal), no se exporta al PNG. Utilidad: detectar píxeles que se confunden con fondo blanco (ej. blancos sobre blanco)

## Alternativas Consideradas

### Alternativa 1: SVG + library (Konva.js, Fabric.js)
- **Pros**: hit-testing automático, transformaciones matriz built-in, menos código manual
- **Contras**: tamaño bundle +150KB, aprendizaje curva, overhead para casos simples, control limitado sobre render loop

### Alternativa 2: Three.js para 3D canvas
- **Pros**: posibilidad expandir a efectos 3D futuros
- **Contras**: overkill para 2D puro, bundle muy pesado (~600KB), complejidad innecesaria

### Alternativa 3: Canvas renderizado con librería state (Redux/NgRx)
- **Pros**: historial de cambios, time-travel debugging
- **Contras**: boilerplate excesivo, Signals ya satisface reactividad, overhead en perf para canvas interactivo

**Elegida: Canvas2D puro + Signals** — balance óptimo entre control, simplicidad y performance.

## Consecuencias

### Positivas
- **Bajo overhead**: sin dependencias gráficas, bundle reducido (~5KB extra)
- **Control total**: render loop, hit-testing, transformaciones ajustables al 100%
- **Performance**: rAF scheduling automático, event listeners eficientes
- **Reactividad**: Signals detectan cambios de estado automáticamente
- **Escalabilidad**: fácil añadir nuevos tipos de objetos, handles, o comportamientos
- **Integración limpia**: modular, lazy-loadable via `/studio/lienzo`
- **Exportación transparent**: PNG sin fondo blanco (alpha preservado), permite uso en multitud de contextos

### Negativas
- **Hit-testing manual** — rotaciones requieren transformaciones trigonométricas, propenso a bugs si no se audita
- **Sin serialización automática** — guardar/cargar lienzo requiere custom JSON logic (no implementado aún)
- **Rendimiento limitado**: 100+ imágenes puede causar lag en rAF por transformaciones repetidas
- **Accesibilidad**: Canvas es opaco a screen readers, necesita ARIA labels o fallback

### Riesgos
- **Rendimiento en mobile**: pan/zoom sin GPU acceleration en algunos navegadores
- **Precisión de click**: hit-testing con rotación puede fallar en bordes bajo zoom extremo
- **Exportación DPI**: escalado 300 DPI requiere memory buffer grande (>20MB para lienzos grandes)

## Referencias
- [Lienzo Canvas Implementation Plan](../../plans/lienzo_canvas_implementation.md)
- [Angular Signals RFC](https://github.com/angular/angular/discussions/48522)
- [HTML5 Canvas Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- PR: Multi-image canvas editor feature
