# 0025. Control de modo mask desde herramientas

**Status**: accepted

**Scope**: frontend

**Fecha**: 2026-04-22

## Contexto

El mask overlay (visualización de máscara en modo screen con opacidad 0.75) debe mostrarse solo cuando la herramienta lo requiera. Antes, `StudioShellComponent` determinaba esto consultando `TOOLS.find()` con lógica hardcodeada de tool IDs.

## Decisión

Se delegó el control del modo mask a cada herramienta:

1. **StudioStateService**: nuevo signal `_maskMode` con getter/setter
2. **RemoveBgToolComponent**: setMaskMode(true) cuando mode === 'draw'
3. **ContourClipToolComponent**: setMaskMode(true) cuando mode === 'manual'
4. **StudioShellComponent.maskActive**: usar `state.maskMode()` directamente

## Alternativas Consideradas

- **Mantener lógica en Shell**: seguir consultando tool IDs — difícil de mantener
- **Boolean input en tool definition**: requeriría cambiar schema de TOOLS

## Consecuencias

- **Positivo**: cada tool controla su propia visibilidad de mask
- **Negativo**: mínimo — solo signals y setters

## Referencias

- `frontend/src/app/studio/services/studio-state.service.ts`
- `frontend/src/app/studio/tools/remove-bg-tool/remove-bg-tool.component.ts`
- `frontend/src/app/studio/tools/contour-clip-tool/contour-clip-tool.component.ts`
- `frontend/src/app/studio/studio-shell/studio-shell.component.ts`
- `frontend/src/app/studio/components/mask-painter/mask-painter.component.ts`