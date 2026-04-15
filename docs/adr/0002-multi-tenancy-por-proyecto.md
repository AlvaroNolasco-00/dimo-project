# ADR-0002: Multi-tenancy lógico por Project ID

## Metadata
- **Status**: accepted
- **Date**: 2024-12-18
- **Deciders**: Equipo fullstack
- **Scope**: fullstack

## Contexto

DIMO es una plataforma multi-inquilino donde múltiples usuarios pueden trabajar de forma independiente, y un mismo usuario puede participar en múltiples "proyectos" (tenants lógicos). La arquitectura necesitaba una estrategia clara para:

- Aislar datos entre proyectos
- Permitir que un usuario tenga múltiples proyectos
- Escalar sin necesidad de bases de datos separadas por inquilino
- Mantener consultas eficientes filtrando por proyecto

## Decisión

Se implementó **multi-tenancy lógico mediante una columna `project_id` en la mayoría de tablas** junto con una relación muchos-a-muchos `user_projects` que define qué usuarios pertenecen a qué proyectos. Cada operación de lectura/escritura filtra automáticamente por `project_id` del usuario actual. El backend enforza esto a nivel de router mediante dependencias inyectadas (`get_approved_user`).

## Alternativas Consideradas

### Alternativa 1: Multi-tenancy por base de datos separada (database-per-tenant)
- **Pros**: Aislamiento físico total, escalabilidad horizontal simple, compliance regulatorio fuerte
- **Contras**: Gestión operacional compleja (múltiples conexiones, sincronización de esquema), mayor costo infraestructura, complejidad de queries globales

### Alternativa 2: Row-level security (RLS) con políticas de PostgreSQL
- **Pros**: Enforcement en la BD, imposible burlar por error de aplicación, mejor para regulaciones
- **Contras**: Complejidad en PostgreSQL, debugging más difícil, menos flexible para lógica de negocio

### Alternativa 3: Sin multi-tenancy, una base de datos por usuario
- **Pros**: Simpleza inicial
- **Contras**: No soporta el caso de uso de múltiples proyectos por usuario, escalabilidad pobre

## Consecuencias

### Positivas
- Una sola base de datos PostgreSQL con esquema unificado
- Un usuario puede participar en múltiples proyectos sin duplicar datos
- Escalabilidad horizontal sin cambios arquitectónicos
- Queries simples y eficientes

### Negativas
- Requiere disciplina — cada router debe filtrar por `project_id`, no hay enforcement en BD
- Riesgo de data leaks si se olvida filtro en algún endpoint
- Más lógica en aplicación que en BD

### Riesgos
- Regresiones de seguridad si nuevo código olvida filtro `project_id`
- Migraciones complejas si en el futuro se necesita aislar físicamente algunos proyectos

## Referencias
- `backend/models.py` — columna `project_id` en Order, Client, CostType, etc.
- `backend/core/deps.py` — `get_current_user`, `get_approved_user` con filtrado por proyecto
- `backend/routers/*` — ejemplos de queries que usan `.filter(Model.project_id == current_user.get_project_id())`
- `CLAUDE.md` — sección "Multi-tenancy" en Backend Architecture
