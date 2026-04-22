# 0024. Limpieza de dot al cambiar herramienta

**Status**: accepted

**Scope**: frontend

**Fecha**: 2026-04-22

## Contexto

Al hacer click en la imagen del canvas, aparece un "dot" (punto visual) que indica dónde se hizo click. Sin embargo, al cambiar de herramienta (por ejemplo, de Click a Halftone), el dot permanecía visible en pantalla aunque ya no era relevante para la nueva herramienta.

## Decisión

Se implementó la limpieza automática del dot al seleccionar una nueva herramienta:

1. **CanvasViewportComponent**: agregar método `clearDot()` que establece `dotPos` a `null`
2. **StudioShellComponent**: invocar `clearDot()` en `onToolSelect()` cada vez que se selecciona una herramienta

## Alternativas Consideradas

- **Limpiar en cada herramienta**: cada tool maneja su propio estado — añadido complejidad
- **Timeout automático**: limpiar después de X segundos — UX confusa si usuario quiere ver dónde hizo click

## Consecuencias

- **Positivo**: UI más limpia, sin indicadores obsoletos
- **Negativo**: mínimo — solo 10 líneas de código

## Referencias

- `frontend/src/app/studio/components/canvas-viewport/canvas-viewport.component.ts`
- `frontend/src/app/studio/studio-shell/studio-shell.component.ts`
