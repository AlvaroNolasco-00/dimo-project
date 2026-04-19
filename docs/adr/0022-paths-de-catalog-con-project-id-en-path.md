# ADR-0022: Paths de catalog con project_id en path

## Metadata
- **Status**: accepted
- **Date**: 2026-04-19
- **Deciders**: Alvaro Nolasco
- **Scope**: fullstack

## Contexto

Al auditar rutas del backend se encontró inconsistencia en el router `catalog`:
- Otros routers (orders, clients, finance) usan `/projects/{project_id}/recurso`
- Catalog usaba query param `?project_id=X` aunque tenía autorización correcta con `check_project_role`

Esto genera confusión y no sigue convención RESTful del proyecto.

## Decisión

Migrar todos los paths de catalog para usar `/projects/{project_id}/recurso`:
- `/api/catalog/categories?project_id=X` → `/api/catalog/projects/{project_id}/categories`
- `/api/catalog/products?project_id=X` → `/api/catalog/projects/{project_id}/products`
- Create/Update/Delete同理

**Backend cambios:**
- `backend/routers/catalog.py`: actualizar paths + pasar `project_id` a servicios
- `backend/services/catalog.py`: firma de `create_category()` y `create_product()` cambiar para recibir `project_id` como argumento separado

**Frontend cambios:**
- `frontend/src/app/services/catalog.service.ts`: actualizar métodos para no enviar `project_id` en body/params, usar en path
- Componentes que usan el service: actualizar llamadas

## Alternativas Consideradas

### Alternativa 1: Mantener query param
- **Pros**: menos cambios código
- **Contras**: inconsistente con resto de APIs, no RESTful

### Alternativa 2: Usar header `X-Project-ID`
- **Pros**: limpio
- **Contras**: no sigue convención del proyecto (todos usan path), menos visible en logs

## Consecuencias

### Positivas
- Consistencia con resto de routers
- PathsRESTful claros
- Mejor logging/debugging (project_id visible en URL)

### Negativas
- Breaking change — 需要 migrate frontend
- Componentes que usan catalog service requieren update

### Riesgos
- **Break en producción**: si frontend hace deploy antes de backend, falla 404. Mitigación: deploy backend primero

## Referencias
- ADR-0010: Control de acceso basado en roles por proyecto
- Backend router example: `orders.py`, `clients.py`
- Commits: este cambio

---

## Actualización: Fix errores de compilación TypeScript (2026-04-19)

Al migrar componentes frontend a nueva convención de paths con `project_id`, surgieron errores TypeScript:

### Errores corregidos

1. **Signal sin invocar** (`catalogo.component.ts:101,120`)
   - `this.projectId` es Signal `<number | null>` pero se pasaba sin `()`
   - Fix: usar `this.projectId()!`

2. **Null check ausente** (`categorias.component.ts:121`)
   - `cat.id` puede ser null en ProductCategory
   - Fix: agregar check `&& cat.id && this.projectId`

3. **project_id faltante en ProductCreate** (`producto-form.component.ts:329`)
   - `ProductCreate` requiere `project_id` en tipo
   - Fix: agregar `project_id: this.projectId` al objeto

4. **Import no usado** (`producto-form.component.ts:10,20`)
   - `QuantityControlComponent` importado pero no usado en template
   - Fix: remover import

### Archivos modificados
- `frontend/src/app/gestion/catalogo/catalogo.component.ts`
- `frontend/src/app/gestion/catalogo/categorias/categorias.component.ts`
- `frontend/src/app/gestion/catalogo/producto-form/producto-form.component.ts`
- `frontend/src/app/services/catalog.service.ts` (type ProductCreate)