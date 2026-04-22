# ADR-0023: Studio Shell - Nueva Interfaz de Edición de Imágenes

## Metadata
- **Status**: accepted
- **Date**: 2026-04-21
- **Deciders**: [Alvaro Nolasco]
- **Scope**: frontend

## Contexto

El editor actual de imágenes en `/editor` tiene limitaciones para workflows de edición avanzada:
- No permite encadenar múltiples operaciones de forma fluida
- Carece de historial de operacionesundo/redo
- La UI de herramientas está dispersa en el pipeline

Se necesita una nueva interfaz "Studio" que proporcione:
- Canvas interactivo con zoom/pan
- Sidebar de herramientas especializadas
- Historial de operaciones
- Estado global de sesión de edición

## Decisión

Crear nueva ruta `/studio` con arquitectura de Studio Shell:

### Componentes Core
- `studio-shell`: Componente contenedor principal
- `canvas-viewport`: Canvas interactivo con zoom/pan via mouse/trackpad
- `tool-sidebar`: Sidebar con herramientas disponibles
- `top-bar`: Barra superior con acciones (export, reset)
- `history-strip`: Strip inferior con historial de operaciones

### Herramientas
- `remove-bg-tool`: Remover fondo
- `remove-objects-tool`: Remover objetos con máscara
- `upscale-tool`: Aumentar resolución
- `contour-clip-tool`: Contour clip
- `halftone-tool`: Efecto halftone
- `watermark-tool`: Aplicar watermark
- `enhance-tool`: Mejora de imagen

### Servicios
- `studio-state.service`: Estado global (imagen actual, tool activo)
- `studio-history.service`: Historial undo/redo
- `studio-processing.service`: Integración con API de procesamiento

### Rutas
- `/studio` - Studio shell principal
- `/studio/herramienta/:toolName` - Acceso directo a herramienta

## Alternativas Consideradas

### Alternativa 1: Extender editor existente
- **Pros**: Reutilizar código existente
- **Contras**: Acoplamiento fuerte, difícil mantener ambos modos

### Alternativa 2: Nueva ruta independiente (Elegida)
- **Pros**: Flexibilidad total, separation of concerns, puede coexistir con editor
- **Contras**: Más código inicial

## Consecuencias

### Positivas
- UI dedicada para workflows complejos
- Historial de operaciones permite deshacer
- Canvas interactivo mejora UX
- Navegación directa a herramientas

### Negativas
- Duplicación de código de procesamiento
- Mantener dos interfaces

### Riesgos
- Consistencia entre editor y studio debe mantenerse

## Referencias
- [Angular Signals](0003-angular-signals-para-estado.md)
- [Pipeline no destructivo](0007-pipeline-no-destructivo-con-encadenamiento-de-pasos.md)
