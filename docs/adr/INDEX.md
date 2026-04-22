# Registro de Decisiones Arquitectónicas (ADR)

> Este directorio contiene las decisiones arquitectónicas del proyecto DIMO.
> Para crear un nuevo ADR, copiar `TEMPLATE.md` y usar el script `new-adr.sh`.

## Índice

| # | Decisión | Status | Scope | Fecha |
|---|----------|--------|-------|-------|
| [0001](./0001-sistema-de-migraciones-sql-manuales.md) | Sistema de migraciones SQL manuales sin Alembic | accepted | database | 2024-12-18 |
| [0002](./0002-multi-tenancy-por-proyecto.md) | Multi-tenancy lógico por Project ID | accepted | fullstack | 2024-12-18 |
| [0003](./0003-angular-signals-para-estado.md) | Angular Signals como estrategia de estado | accepted | frontend | 2024-12-18 |
| [0004](./0004-procesamiento-gpu-remoto-con-fallback-local.md) | Procesamiento GPU remoto con fallback a CPU local | accepted | infrastructure | 2025-01-19 |
| [0005](./0005-esquemas-y-modelos-en-archivos-unicos.md) | Esquemas y modelos en archivos únicos | accepted | backend | 2024-12-18 |
| [0006](./0006-sistema-adr-para-bitacora-de-decisiones.md) | Sistema ADR para bitácora de decisiones | accepted | fullstack | 2026-04-14 |
| [0007](./0007-pipeline-no-destructivo-con-encadenamiento-de-pasos.md) | Pipeline no-destructivo con encadenamiento de pasos | accepted | frontend | 2026-04-14 |
| [0008](./0008-posicionamiento-del-drawer-sidebar-debajo-de-la-navbar-superior.md) | Posicionamiento del drawer sidebar debajo de la navbar superior | accepted | frontend | 2026-04-14 |
| [0009](./0009-fix-visualización-acumulada-de-resultados-en-pipeline-y-recálculo-de-inputmode-en-reordenamiento.md) | Fix: visualización acumulada y recálculo de inputMode en pipeline | accepted | frontend | 2026-04-15 |
| [0010](./0010-control-acceso-basado-roles-por-proyecto.md) | Control de acceso basado en roles por proyecto (RBAC) | accepted | fullstack | 2026-04-15 |
| [0011](./0011-componentizacion-interfaz-usuario-compartida.md) | Componentización de interfaz de usuario compartida | accepted | frontend | 2026-04-16 |
| [0012](./0012-modal-tooltip-ayuda-herramientas.md) | Modal en lugar de tooltip para ayuda de herramientas | accepted | frontend | 2026-04-16 |
| [0013](./0013-visualizacion-parametros-pasos-pipeline.md) | Visualización de parámetros de pasos en pipeline | accepted | frontend | 2026-04-16 |
| [0014](./0014-nombre-sugerido-descargas-con-timestamp.md) | Nombre sugerido para descargas con timestamp automático | accepted | frontend | 2026-04-16 |
| [0015](./0015-pipeline-batch-server-side-chaining.md) | Pipeline batch server-side chaining | accepted | fullstack | 2026-04-16 |
| [0016](./0016-visualizacion-estadisticas-imagen-entrada-salida.md) | Image input/output statistics visualization | accepted | frontend | 2026-04-17 |
| [0017](./0017-fix-trackpad-zoom-pan-state-interference.md) | Fix trackpad gesture interference with zoom controls | accepted | frontend | 2026-04-17 |
| [0018](./0018-validacion-estricta-de-carga-de-imagenes.md) | Validación Estricta de Carga de Imágenes | accepted | fullstack | 2026-04-19 |
| [0019](./0019-pipeline-hibrido-de-segmentacion-en-auto-contour-clip.md) | Pipeline Híbrido de Segmentación en Auto Contour Clip | accepted | backend | 2026-04-19 |
| [0020](./0020-optimizacion-de-deployment-y-seguridad-en-worker-gpu.md) | Optimización de Deployment y Seguridad en Worker GPU | accepted | infrastructure | 2026-04-19 |
| [0021](./0021-costos-derivados-conscientes-de-variantes.md) | Costos Derivados Conscientes de Variantes | accepted | frontend | 2026-04-19 |
| [0022](./0022-paths-de-catalog-con-project-id-en-path.md) | Paths de catalog con project_id en path | accepted | fullstack | 2026-04-19 |
| [0023](./0023-studio-shell-nueva-interfaz-de-edicion-de-imagenes.md) | Studio Shell - Nueva Interfaz de Edición de Imágenes | accepted | frontend | 2026-04-21 |
| [0024](./0024-limpieza-de-dot-al-cambiar-herramienta.md) | Limpieza de dot al cambiar herramienta | accepted | frontend | 2026-04-22 |
| [0025](./0025-control-de-modo-mask-desde-herramientas.md) | Control de modo mask desde herramientas | accepted | frontend | 2026-04-22 |

## Cómo usar

### Crear un nuevo ADR

```bash
./docs/adr/new-adr.sh "titulo descriptivo de la decision"
```

Esto:
1. Crea un archivo nuevo con número autoincremental
2. Rellena la plantilla con número y fecha
3. Recuerda actualizar el INDEX.md

### Completar un ADR

El script genera el boilerplate. Completa:
- **Contexto**: problema que requiere decisión
- **Decisión**: qué se decide concretamente (ser específico)
- **Alternativas Consideradas**: qué otras opciones había y por qué no se eligieron
- **Consecuencias**: impactos positivos, negativos, y riesgos
- **Referencias**: links a código, PRs, o documentación relacionada

### Gestionar ADRs

- **Proponer**: crear con status `proposed` cuando es idea inicial
- **Aceptar**: cambiar a `accepted` cuando se aprueba
- **Deprecar**: marcar como `deprecated` si ya no se usa pero fue válido
- **Superseder**: marcar como `superseded` si fue reemplazado, y referenciar ADR nuevo

## Convenciones

- **Numeración**: 4 dígitos zero-padded (0001, 0002, ...)
- **Slug**: descriptivo en español, minúsculas, guiones
- **Contenido**: español, términos técnicos en inglés
- **Status values**: siempre en inglés (proposed, accepted, deprecated, superseded)
- **Metadata**: llenar Scope con uno de: backend, frontend, infrastructure, fullstack, database

## Lectura Recomendada

- [Architecture Decision Records - Michael Nygard](https://adr.github.io/)
- [ADR GitHub Organization](https://github.com/adr)
