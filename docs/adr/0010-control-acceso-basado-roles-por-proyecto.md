# ADR-0010: Control de acceso basado en roles por proyecto

## Metadata
- **Status**: accepted
- **Date**: 2026-04-15
- **Deciders**: Alvaro Nolasco
- **Scope**: fullstack

## Contexto

Sistema multi-tenant existente (ADR-0002) autoriza users con `is_admin` global. Sin embargo:
- Proyectos requieren control granular: algunos users deben editar pedidos pero no finanzas
- Admins globales = owners en todo proyecto; otros users necesitan roles distintos
- Frontend carece visibilidad de permisos por proyecto → no puede ocultar UI prohibida

Necesidad: RBAC (role-based access control) **por proyecto**, no global.

## Decisión

Implementar 4 roles jerárquicos **por proyecto**:
1. `viewer` — lectura (pedidos, clientes, finanzas)
2. `editor` — crear/editar pedidos y clientes
3. `manager` — gestionar finanzas, cupones, zonas delivery, catálogo
4. `owner` — asignar roles, crear/eliminar usuarios en proyecto

**ORM change:** `user_projects` Table → `UserProject` model con columna `role: VARCHAR(20)`.
- Admins (`is_admin=true`) implícitamente `owner` en todo proyecto.
- Usuarios nuevos en proyecto → default `editor`.
- First-time admin registrado → `owner` automático.

**Backend enforcement:** Dependency factory `require_project_role(min_role)` en handlers. Manual check via `check_project_role(project_id, user, db, min_role)` para queries dinámicas.

**Frontend visibility:** `AuthService.currentProjectRole` computed signal + `hasProjectRole(minRole)` método. Guards: `editorGuard`, `managerGuard`, `ownerGuard`.

## Alternativas Consideradas

### Alternativa 1: Roles globales solamente
- **Pros**: simple, menos DB schema changes
- **Contras**: no hay control granular por proyecto. Admin = acceso total. Imposible restringir editors a solo pedidos.

### Alternativa 2: ACL (Access Control List) por recurso
- **Pros**: máxima flexibilidad
- **Contras**: complejidad explosion (N usuarios × M recursos = N×M checks). Query performance sufre. Frontend overhead.

### Alternativa 3: Atributos dinámicos (attribute-based access control)
- **Pros**: flexible, escalable
- **Contras**: overkill para current scope. Evaluación de reglas es CPU-intensivo. No justificado sin reqs futuras.

## Consecuencias

### Positivas
- Control granular: editors no pueden tocar finanzas/catálogo sin promote a manager
- Seguridad defensiva: frontend + backend enforcement juntos
- Multi-project users claros: cada project → role explícito en JWT/auth response
- Escalable: agregar roles/permisos futuro sin redesign

### Negativas
- DB migration necesaria (ALTER TABLE user_projects ADD COLUMN role)
- Todos handlers con auth requieren `Depends(require_project_role(...))` — boilerplate
- Existing users (pre-rol) requieren asignación manual de roles post-deploy
- `is_admin` vs `role=owner` redundancia — admins implícitamente owner pero no vía DB

### Riesgos
- **Migration risk:** si SQL falla en prod, proyecto down. Mitigación: test local, rollback plan.
- **Privilege escalation:** si `check_project_role()` ignorada en algún handler, user podría bypass. Mitigación: code review, tests.
- **Stale roles en cache:** si frontend cache user roles, cambios de rol no reflejados hasta re-login. Mitigación: `fetchMe()` refresh on project change.

## Referencias
- [ADR-0002: Multi-tenancy por proyecto](./0002-multi-tenancy-por-proyecto.md) — baseline
- [ADR-0005: Esquemas y modelos únicos](./0005-esquemas-y-modelos-en-archivos-unicos.md) — ORM location
- Implementación:
  - Backend: `backend/models.py::UserProject`, `backend/core/deps.py::require_project_role`, routers/* role checks
  - Frontend: `frontend/src/app/interfaces/project.interface.ts::ProjectRole`, `frontend/src/app/services/auth.service.ts::currentProjectRole`, `frontend/src/app/guards/auth.guard.ts::projectRoleGuard`
  - SQL: `backend/sql/add_role_to_user_projects.sql`
