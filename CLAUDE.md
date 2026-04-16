# CLAUDE.md

Guidance for Claude Code on this repo.

## What This Project Is

Multi-tenant photo editor + business suite. Users process images (AI background removal, object removal, upscaling, halftone) and manage orders, clients, zones, coupons, finances — all per project (tenant).

## Commands

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
python3 -m backend.main          # Dev server → localhost:8000
# Production (Koyeb):
gunicorn -w 1 -k uvicorn.workers.UvicornWorker backend.main:app
```

### Frontend (Angular 18)
```bash
cd frontend
npm install
npm start        # Dev server → localhost:4200
npm run build    # Production build
npm test         # Vitest unit tests
```

## Environment Variables

Backend needs `.env` (see `configuracion_backend.md`):
- `APP_ENV`: `local` or `production` — picks `DATABASE_URL`
- `DATABASE_URL_LOCAL` / `DATABASE_URL`: PostgreSQL strings
- `WOMPI_*`: Payment keys (Wompi, Latin America)
- `GPU_UPSCALE_URL`, `GPU_REMOVER_URL`, `GPU_SERVICE_SECRET`: Optional cloud GPU

Frontend API base in `frontend/src/environments/`:
- Dev: `http://localhost:8000/api`
- Prod: Koyeb URL

## Backend Architecture

```
backend/
├── main.py           # FastAPI app, CORS, router registration
├── models.py         # All SQLAlchemy ORM models
├── schemas.py        # All Pydantic request/response schemas
├── core/
│   ├── auth.py       # JWT creation/verification, bcrypt hashing
│   ├── database.py   # Engine + SessionLocal (env-aware)
│   └── deps.py       # DI: get_current_user, get_approved_user, get_admin_user
├── routers/          # One file per domain (auth, users, processing, orders, finance, projects, clients, payments)
└── services/         # Business logic (processing.py, orders.py, wompi.py)
```

**Key patterns:**
- Schemas + models in single files (`schemas.py`, `models.py`)
- Routers thin — logic in `services/`
- Image processing → GPU (async HTTP) or local CPU by `GPU_*` vars
- Async upscale polling: task ID in `ProcessingTask`, frontend polls `/api/processing/tasks/{task_id}`

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
├── layout/           # main-layout (sidebar), auth-layout, public-layout
├── editor/           # Image editor — Signals-based, Canvas rendering
├── gestion/          # Management: pedidos, clientes, proyectos, finanzas/*
├── usuarios/         # Admin: user list, permissions, creation
├── public/           # Public order view (no auth)
├── services/         # api.service, auth.service, finance.service, project.service, ...
├── guards/           # authGuard, approvedGuard, adminGuard, projectGuard
├── interceptors/     # auth.interceptor.ts — injects `Authorization: Bearer {token}`
└── app.routes.ts     # Lazy-loaded routes with guard composition
```

**State (Angular Signals):**
- `AuthService._user` signal → current user + projects
- `AuthService._currentProject` signal → selected project
- Computed: `isAuthenticated()`, `isApproved()`, `isAdmin()`
- Persisted: `dimo_auth_token`, `dimo_current_project` in localStorage

**Auth flow:**
1. Login → JWT (30-day expiry) → localStorage
2. `auth.interceptor.ts` injects Bearer token
3. Guards compose: `authGuard` → `approvedGuard` → `projectGuard` → `adminGuard`
4. First user auto-admin+approved; others need approval

**Routes:**
- `/auth/*` — public (login, register)
- `/track/:token` — public order view
- `/utilidades/*` — editor (approved)
- `/gestion/*` — management (approved; `/proyectos` admin only)
- `/usuarios/*` — users (admin only)

## Key Domain Models

| Model | Purpose |
|-------|---------|
| `User` | Auth, approval, admin, project membership |
| `Project` | Tenant; users via `user_projects` join |
| `Order` + `OrderItem` | Orders with items, coupon, zone, payment, state |
| `CostType` | Configurable costs per project (required attrs) |
| `OperativeCost` | Costs with dynamic JSON attrs; parent-child variants |
| `DeliveryZone` | Geographic areas with pricing, polygon coords |
| `Coupon` | Discounts (fixed/%), single-use, history |
| `Client` | Customer data linked to zones |
| `ProcessingTask` | Async GPU task (id, status, result_url) |

## Deployment

| Component | Platform |
|-----------|----------|
| Backend | Koyeb (`koyeb.yaml`) — 1 Gunicorn worker |
| Frontend | Vercel |
| Database | PostgreSQL (external, `DATABASE_URL`) |

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