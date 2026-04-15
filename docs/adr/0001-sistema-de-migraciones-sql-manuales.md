# ADR-0001: Sistema de migraciones SQL manuales sin Alembic

## Metadata
- **Status**: accepted
- **Date**: 2024-12-18
- **Deciders**: Equipo backend
- **Scope**: database

## Contexto

Al iniciar el proyecto, fue necesario decidir cómo manejar cambios en el esquema de la base de datos PostgreSQL. FastAPI con SQLAlchemy típicamente usa Alembic como herramienta de migración automática para generar scripts de cambios incrementales. Sin embargo, el equipo evaluó las necesidades del proyecto en función de:

- Complejidad de las migraciones (transformaciones de datos complejas, operaciones batch)
- Control explícito sobre el orden y timing de aplicación de cambios
- Preferencia por revisión manual antes de ejecutar cambios en producción
- Libertad para optimizar migraciones específicas del dominio

## Decisión

Se implementó un sistema de migraciones **manuales usando scripts SQL directos** en lugar de un ORM-driven migration tool como Alembic. Los scripts viven en `backend/sql/` organizados por fecha de creación (`YYYY-MM-DD-*-descripcion.sql`). Cada script es aplicado manualmente contra la BD de desarrollo y luego contra producción bajo control del equipo.

## Alternativas Consideradas

### Alternativa 1: Alembic
- **Pros**: Autogeneración de scripts desde cambios en models.py, reversibilidad automática, historial versionado
- **Contras**: Genera código que puede no ser óptimo para migraciones complejas, menos control explícito, requiere manejar conflictos de merge en ambientes colaborativos

### Alternativa 2: Migrations manuales dentro del ORM (SQLAlchemy con estructura de carpetas)
- **Pros**: Integración con SQLAlchemy
- **Contras**: Sigue siendo overhead para cambios simples, sigue sin dar el control que se necesita

## Consecuencias

### Positivas
- Control total sobre cómo y cuándo se aplican cambios
- Scripts optimizados manualmente para operaciones específicas
- Flexibilidad para transformaciones de datos complejas
- Transparencia — el SQL es visible y revisable sin abstracciones

### Negativas
- Requiere disciplina manual para mantener sincronización entre models.py y el esquema real
- Sin reversibilidad automática — cada cambio debe incluir un plan de rollback explícito
- Mayor responsabilidad del desarrollador en verificar que no haya divergencias

### Riesgos
- Posible desincronización entre models.py y esquema si no se documenta bien
- Migraciones accidentales sin testing en pre-prod
- Requiere conocimiento de SQL moderado

## Referencias
- `backend/sql/` — directorio de migraciones
- `CLAUDE.md` — documentación que menciona la falta de Alembic
- Cambios recientes en `backend/models.py` que requieren sincronización manual
