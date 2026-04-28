# ADR-0030: Lienzo como Modo Independiente del Studio

## Metadata
- **Status**: accepted
- **Date**: 2026-04-27
- **Superseded by**: N/A
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

Lienzo (canvas multi-imagen para componer impresiones) estaba integrado como una herramienta más dentro del Studio Shell — un `ToolId` en el array `TOOLS[]`, con un botón en el sidebar de herramientas al mismo nivel que "Crop", "Filtros" o "Remove BG".

Esto generaba confusión UX: el usuario no distinguía que Lienzo es un modo de trabajo completamente diferente al editor de imagen individual. Lienzo no edita una imagen, compone múltiples imágenes en un canvas para generar una impresión final. Semánticamente no es una herramienta de edición.

## Decisión

Lienzo se extrae como modo independiente con su propia ruta `/lienzo`, al mismo nivel jerárquico que `/studio`. Ambos modos comparten:
- Los mismos guards (`approvedGuard`, `projectGuard`)
- El mismo `MainLayoutComponent` con `isStudio()` detectando ambas rutas (full-screen, sin sidebar)

Un **mode switcher pill `[Editor | Lienzo]`** visible en el top bar de ambos modos comunica explícitamente el cambio de contexto. El botón activo muestra el modo actual con accent color; el inactivo navega a la ruta contraria via `Router.navigate()`.

Cambios concretos:
- Nueva ruta `/lienzo` en `app.routes.ts` cargando `LienzoShellComponent` directamente
- `lienzo` removido de `ToolId` y `TOOLS[]` en `tool.types.ts`
- `studio-shell` limpiado del condicional `@if (activeTool() === 'lienzo')`
- Mode switcher añadido a `TopBarComponent` y `LienzoToolbarComponent`

## Alternativas Consideradas

### Alternativa 1: Mantener lienzo como herramienta pero con visual diferenciado
- **Pros**: sin cambio de rutas, menos refactor
- **Contras**: no resuelve el problema semántico; el usuario sigue percibiendo Lienzo como herramienta de edición

### Alternativa 2: Modal de selección de modo al entrar al Studio
- **Pros**: onboarding explícito
- **Contras**: fricción innecesaria para usuarios frecuentes; más complejo de mantener

### Alternativa 3: Ruta propia + mode switcher (ELEGIDA)
- **Pros**: jerarquía clara en URL, UX persistente, código limpio, sin lógica condicional en studio-shell
- **Contras**: cambio de URL para usuarios que tenían `/studio` como destino para Lienzo (mínimo impacto)

## Consecuencias

### Positivas
- URL semánticamente correcta: `/studio` = editor, `/lienzo` = compositor
- Studio Shell más simple — sin imports ni lógica condicional de Lienzo
- Mode switcher siempre visible = usuario siempre sabe en qué modo está
- Escalable: futuros modos pueden seguir el mismo patrón

### Negativas
- Usuarios que navegaban a `/studio` y seleccionaban Lienzo ahora deben ir a `/lienzo` directo

### Riesgos
- Ninguno significativo — `LienzoStateService` es independiente, no comparte estado con `StudioStateService`

## Referencias
- ADR-0029: Lienzo Multi-Imagen con Canvas2D y Signals (implementación inicial del canvas)
- ADR-0023: Studio Shell - Nueva Interfaz de Edición de Imágenes
