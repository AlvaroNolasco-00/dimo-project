# ADR-0012: Modal en lugar de tooltip para ayuda de herramientas

## Metadata
- **Status**: accepted
- **Date**: 2026-04-16
- **Deciders**: Alvaro Alcides Guandique Nolasco
- **Scope**: frontend

## Contexto

Componente `ToolHelpComponent` mostraba ayuda contextual como tooltip (`position: absolute`) debajo del botón info. Problema: contenido largo causaba scroll excesivo en pantalla, especialmente en viewports medianos. Tooltip se posicionaba relativo al botón, moviendo contenido visible hacia abajo.

Restricción: editor canvas con múltiples transformaciones CSS; necesarios z-index altos para evitar oclusiones.

## Decisión

Convertir panel de ayuda de tooltip a modal centrado:
- Backdrop overlay `position: fixed; inset: 0` con z-index 9999
- Modal `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)` con z-index 10000
- Cerrar: click en backdrop, botón X, o tecla Escape (futuro)
- Animaciones: backdrop fade-in, modal scale-in (0.18s)

Componente TS simplificado: removido `ElementRef`, `HostListener`, `document:click` (reemplazado por click en backdrop).

## Alternativas Consideradas

### Alternativa 1: Mantener tooltip con máximo ancho/altura limitados
- **Pros**: cambio mínimo, comportamiento esperado de tooltip
- **Contras**: no resuelve scroll excesivo; contenido cortado; UX pobre en mobile

### Alternativa 2: Tooltip deslizante (slide-in desde lateral)
- **Pros**: conserva proximidad visual al botón
- **Contras**: ocupa espacio valioso en pantalla; interfiere con editor; z-index conflicts

### Alternativa 3: Panel modal centrado (elegida)
- **Pros**: máximo espacio, contenido legible, comportamiento familiar (modal), resuelve z-index conflicts
- **Contras**: modal "pesada"; requiere click en backdrop para cerrar

## Consecuencias

### Positivas
- Contenido no causa scroll de página; viewport centrado en modal
- Z-index superior (10000) evita oclusión por sidebar (z-index 100001 reservado para planes modal)
- UX consistente con patrones web estándar
- Animaciones smooth (fade + scale) vs slide
- Cierre por backdrop click o botón X

### Negativas
- Modal "heavier" que tooltip; puede parecer disruptiva en flujo rápido
- Requiere click adicional para cerrar vs hover-away
- Más CSS/TS para gestionar (backdrop, overlay)

### Riesgos
- Si futuro contenido supera `max-height: 80vh`, scroll dentro modal (acceptable)
- Z-index conflicts si otros modales (sidebar, diálogos) sin z-index explícito
- A11y: aria-modal=true, pero falta manejo Escape key (TODO)

## Referencias
- [ToolHelpComponent](../frontend/src/app/editor/components/tool-help/)
- PR: Tool help modal refactor
- Relacionado: [ADR-0008](./0008-posicionamiento-del-drawer-sidebar-debajo-de-la-navbar-superior.md) (sidebar z-index strategy)
