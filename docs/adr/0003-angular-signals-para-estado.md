# ADR-0003: Angular Signals como estrategia de estado

## Metadata
- **Status**: accepted
- **Date**: 2024-12-18
- **Deciders**: Equipo frontend
- **Scope**: frontend

## Contexto

Angular 18 introdujo Signals como una nueva primitiva reactiva que reemplaza el patrón tradicional de Observable/RxJS para ciertos casos de uso. Al iniciar la arquitectura frontend de DIMO, el equipo necesitaba elegir entre:

- Signals (nuevo, performante, más simple)
- RxJS/BehaviorSubject (maduro, poderoso pero verbose)
- NgRx (completo pero heavy para aplicación mediana)

La aplicación requería:
- Estado compartido entre componentes (usuario actual, proyecto seleccionado)
- Persistencia en localStorage
- Reactividad clara sin boilerplate excesivo
- Performance en la ruta crítica de edición de imágenes

## Decisión

Se eligió **Angular Signals como estrategia principal de estado** para estado application-wide (`AuthService._user`, `AuthService._currentProject`). Signals se usan también dentro de componentes para estado local. RxJS se usa solo donde es necesario (subscripciones a eventos, streams de datos HTTP).

## Alternativas Consideradas

### Alternativa 1: NgRx (Redux-like state management)
- **Pros**: Arquitectura predecible, time-travel debugging, bueno para equipos grandes
- **Contras**: Boilerplate excesivo para aplicación mediana, curva de aprendizaje, overkill para este proyecto

### Alternativa 2: RxJS/BehaviorSubject tradicional
- **Pros**: Maduro, integrado en Angular, poderoso para transformaciones de streams
- **Contras**: Verbose, requiere `.subscribe()` manual, riesgo de memory leaks, menos performante que Signals

### Alternativa 3: Plain TypeScript properties sin reactividad
- **Pros**: Simpleza máxima
- **Contras**: Imposible detectar cambios automáticamente, requiere change detection manual, no escalable

## Consecuencias

### Positivas
- Sintaxis simple: `signal(value)` y lectura con `signal()`
- Change detection automático solo en componentes que usan ese signal
- Performance mejor que RxJS para estado simple
- Menos código que RxJS o NgRx
- Computed signals para estado derivado

### Negativas
- Relativamente nuevo — menos recursos/comunidad que RxJS
- No es tan poderoso para transformaciones complejas de streams
- Requiere Angular 18+ (vinculación a versión específica)

### Riesgos
- Si en futuro se necesita estado muy complejo, refactor a NgRx sería trabajo
- Nuevos desarrolladores pueden no estar familiarizados con Signals

## Referencias
- `frontend/src/app/services/auth.service.ts` — implementación con `_user` y `_currentProject` signals
- `frontend/src/app/editor/components/editor-sidebar/` — uso de Signals en componentes
- Commit `eabe4d6` — refactor de state management en PipelineService
- [Angular Signals docs](https://angular.io/guide/signals)
