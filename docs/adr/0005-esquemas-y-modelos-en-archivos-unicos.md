# ADR-0005: Esquemas y modelos en archivos únicos

## Metadata
- **Status**: accepted
- **Date**: 2024-12-18
- **Deciders**: Equipo backend
- **Scope**: backend

## Contexto

En aplicaciones FastAPI/SQLAlchemy, hay dos patrones comunes de organización:

1. **Per-domain** — carpetas para cada dominio (auth/, orders/, finance/) con models y schemas separados
2. **Centralizados** — un único `models.py` y `schemas.py` para toda la aplicación

El proyecto necesitaba balancear:
- Modularidad (mantener código relacionado junto)
- Mantenibilidad (fácil encontrar qué existe)
- Evitar importes circulares
- Escalabilidad conforme crece el proyecto

## Decisión

Se eligió mantener **todos los modelos SQLAlchemy en `backend/models.py`** y **todos los schemas Pydantic en `backend/schemas.py`**, en lugar de dispersarlos por carpetas de dominio. Los routers en `backend/routers/` importan de estos archivos centrales.

```
backend/
├── models.py       # User, Project, Order, OrderItem, Client, DeliveryZone, ...
├── schemas.py      # UserCreate, OrderResponse, ClientUpdate, ...
└── routers/        # auth.py, orders.py, finance.py, ...
```

## Alternativas Consideradas

### Alternativa 1: Per-domain (models y schemas por dominio)
- **Pros**: Mejor organización conceptual, fácil de navegar por dominio
- **Contras**: Archivos potencialmente largos si un dominio es grande, riesgo de importes circulares entre dominios, búsqueda menos directa

### Alternativa 2: Híbrida (models centralizados, schemas per-domain)
- **Pros**: Compromiso intermedio
- **Contras**: Inconsistencia, confunde dónde buscar qué

## Consecuencias

### Positivas
- `models.py` es fuente única de verdad para estructura de datos
- No hay importes circulares entre módulos de modelos
- Fácil ver todas las entidades del sistema en un vistazo
- Imports simples: `from backend.models import User, Order`
- Fácil refactor de nombres/relaciones

### Negativas
- Archivos pueden volverse muy largos (actualmente ~500 líneas models.py, ~1000 schemas.py)
- Menos "aislamiento" conceptual de dominios
- Cambios en un modelo afectan toda la aplicación (sin encapsulación por dominio)

### Riesgos
- Si el proyecto crece significativamente, podría valer la pena dividir (`models/auth.py`, `models/orders.py`)
- Búsqueda de modelos es más lenta visualmente en archivos muy largos

## Referencias
- `backend/models.py` — fuente única de ORM models
- `backend/schemas.py` — fuente única de Pydantic schemas
- `backend/routers/*` — todos usan imports de `backend.models` y `backend.schemas`
- `CLAUDE.md` — sección Backend Architecture menciona este patrón
