# CLAUDE.md

Guidance for Claude Code on this repo.

## What This Project Is

Multi-tenant photo editor + business suite. Users process images (AI background removal, object removal, upscaling, halftone, contour-clip, crop, watermark) and manage orders, clients, zones, coupons, catalog, finances — all per project (tenant). RBAC roles per project: viewer / editor / manager / owner.

## Commands

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
python3 -m backend.main          # Dev server → localhost:8000
# Production (Koyeb):
gunicorn -w 1 -k uvicorn.workers.UvicornWorker backend.main:app
```

### Frontend (Angular 21)
```bash
cd frontend
npm install
npm start        # Dev server → localhost:4200
npm run build    # Production build
npm test         # Vitest unit tests
```

## Environment Variables

Backend needs `.env` (see `backend/.env.example`):
- `APP_ENV`: `local` or `production` — picks `DATABASE_URL`
- `DATABASE_URL_LOCAL` / `DATABASE_URL`: PostgreSQL strings
- `WOMPI_*`: Payment keys (Wompi, Latin America)
- `GPU_UPSCALE_URL`, `GPU_REMOVER_URL`, `GPU_SERVICE_SECRET`: Optional cloud GPU
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Prod asset storage (optional in local)

Frontend API base in `frontend/src/environments/`:
- Dev: `http://localhost:8000/api`
- Prod: Koyeb URL

## Backend Architecture

```
backend/
├── main.py           # FastAPI app, CORS, GZip, router registration
├── models.py         # All SQLAlchemy ORM models
├── schemas.py        # All Pydantic request/response schemas
├── core/
│   ├── auth.py       # JWT creation/verification, bcrypt hashing
│   ├── database.py   # Engine + SessionLocal (env-aware)
│   └── deps.py       # DI: get_current_user, get_approved_user, get_admin_user
├── routers/          # auth, users, processing, orders, finance, projects, clients, payments, catalog, audit
├── services/         # processing.py, orders.py, wompi.py, catalog.py, audit.py, storage.py
└── scripts/          # run_migrations.py
```

**Key patterns:**
- Schemas + models in single files (`schemas.py`, `models.py`)
- Routers thin — logic in `services/`
- Image processing → GPU (async HTTP) or local CPU by `GPU_*` vars
- Async upscale polling: task ID in `ProcessingTask`, frontend polls `/api/processing/tasks/{task_id}`
- Asset storage: `services/storage.py` bifurcates local (`backend/static/`) vs. Cloudinary (production)

**Authorization (`core/deps.py`):**
1. No auth — public order via token (`/api/orders/public/{token}`)
2. `get_current_user` — any valid JWT
3. `get_approved_user` — JWT + `is_approved=True`
4. `get_admin_user` — JWT + `is_admin=True`

**Multi-tenancy:** Most endpoints scope to `current_user.projects` (many-to-many). Admins see all.

## Frontend Architecture

```
frontend/src/app/
├── auth/             # Login, register, pending-approval, no-project screens
├── layout/           # main-layout (sidebar), auth-layout, public-layout, navbar-top
├── editor/           # Image editor — Signals-based, Canvas rendering; watermark sub-component
├── gestion/          # pedidos, clientes, proyectos, finanzas/*, catalogo/*, bitacora
├── usuarios/         # listado, permisos, creacion
├── public/           # order-view, product-view, category-view (no auth)
├── profile/          # User profile
├── components/       # Shared UI: toast-container
├── directives/       # money-mask
├── interfaces/       # order, project, user interfaces
├── services/         # api, auth, finance, project, catalog, pipeline, image-persistence, toast, layout, user
├── guards/           # authGuard, approvedGuard, adminGuard, projectGuard, editorGuard, managerGuard, ownerGuard
├── interceptors/     # auth.interceptor.ts — injects `Authorization: Bearer {token}`
└── app.routes.ts     # Lazy-loaded routes with guard composition
```

**State (Angular Signals):**
- `AuthService._user` signal → current user + projects
- `AuthService._currentProject` signal → selected project
- Computed: `isAuthenticated()`, `isApproved()`, `isAdmin()`, `currentProjectRole()`
- Persisted: `dimo_auth_token`, `dimo_current_project` in localStorage

**Auth flow:**
1. Login → JWT (30-day expiry) → localStorage
2. `auth.interceptor.ts` injects Bearer token
3. Guards compose: `authGuard` → `approvedGuard` → `projectGuard` → role guards
4. First user auto-admin+approved; others need approval

**RBAC (project-level roles):**
- Roles: `viewer` < `editor` < `manager` < `owner`
- Admins always get `owner` role on any project
- Guards: `editorGuard`, `managerGuard`, `ownerGuard` — use `projectRoleGuard(minRole)` factory

**Routes:**
- `/auth/*` — public (login, register)
- `/track/:token` — public order tracking
- `/shop/:token` — public product shop
- `/catalogo/:token` — public category catalog
- `/profile` — user profile (approved)
- `/utilidades/*` — editor tools: remove-bg, remove-objects, enhance, upscale, halftone, contour-clip, crop, watermark (approved + project)
- `/gestion/*` — management (approved):
  - `pedidos`, `pedidos/crear` (editor+), `pedidos/:id`
  - `clientes`, `clientes/crear` (editor+), `clientes/editar/:id` (editor+)
  - `proyectos` (admin only)
  - `finanzas`, `finanzas/costos-operativos`, `finanzas/recuento-gastos`, `finanzas/recuento-ganancias`, `finanzas/delivery-zones`, `finanzas/coupons` (manager+)
  - `catalogo`, `catalogo/nuevo`, `catalogo/:id/editar`, `catalogo/categorias` (manager+)
  - `bitacora` (admin only)
- `/usuarios/*` — listado, permisos (approved); creacion (admin)

## Key Domain Models

| Model | Purpose |
|-------|---------|
| `User` | Auth, approval, admin, project membership |
| `UserProject` | Join table User↔Project with role (viewer/editor/manager/owner) |
| `Project` | Tenant; users via `user_projects` join; has custom order states |
| `Order` + `OrderItem` + `OrderItemDetail` | Orders with line items, detail, coupon, zone, payment, state |
| `OrderState` + `ProjectOrderState` | Global states + per-project state config |
| `OrderHistory` | State change audit trail |
| `CostType` | Configurable cost categories per project |
| `OperativeCost` | Costs with dynamic JSON attrs; parent-child variants |
| `DeliveryZone` + `DeliveryZoneHistory` | Geographic areas with pricing, polygon coords, change history |
| `Coupon` + `CouponHistory` | Discounts (fixed/%), single-use, usage history |
| `Client` + `ClientAddress` | Customer data with multiple addresses |
| `ProductCategory` + `Product` + `ProductCostLine` | Public-facing product catalog |
| `ProcessingTask` | Async GPU task (id, status, result_url) |
| `ProcessingAuditLog` | Processing usage audit log |

## Deployment

| Component | Platform |
|-----------|----------|
| Backend | Koyeb (`koyeb.yaml`) — 1 Gunicorn worker |
| Frontend | Vercel |
| Database | PostgreSQL (external, `DATABASE_URL`) |
| Asset storage | Local `backend/static/` (dev) / Cloudinary (prod) |
| GPU worker | `gpu-worker/` — Modal deployment (`modal_app.py`) |

SQL migrations in `backend/sql/`. Manual (no Alembic).

## Communication Style

**Caveman Mode: Always Active (full)**
- Terse: drop articles (a/an/the), filler (just/really), pleasantries
- Fragments OK. Short synonyms
- Pattern: `[thing] [action] [reason]. [next step].`
- Technical terms exact, code blocks normal
- Off: "stop caveman" / "normal mode"

## Architecture Decision Records (ADRs)

ADRs in `docs/adr/`. Template: `docs/adr/TEMPLATE.md`.

**When to create:**
- Technology/library/service choice
- New architectural pattern
- Database schema design (important: manual migrations)
- Multi-module decisions + long-term impact
- Deprecating/replacing existing approach

**Workflow:** `./docs/adr/new-adr.sh "titulo"` → fill sections → update `docs/adr/INDEX.md` → commit with code.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
