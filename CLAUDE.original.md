# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A multi-tenant photo editing platform + business management suite. Users can process images (AI background removal, object removal, upscaling, halftone effects) and manage orders, clients, delivery zones, coupons, and finances — all scoped per project (tenant).

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

Backend requires a `.env` file (see `configuracion_backend.md`):
- `APP_ENV`: `local` or `production` — controls which `DATABASE_URL` is used
- `DATABASE_URL_LOCAL` / `DATABASE_URL`: PostgreSQL connection strings
- `WOMPI_*`: Payment gateway keys (Wompi, Latin America)
- `GPU_UPSCALE_URL`, `GPU_REMOVER_URL`, `GPU_SERVICE_SECRET`: Optional cloud GPU endpoints

Frontend API base URL is set in `frontend/src/environments/`:
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
- Schemas live in a single `schemas.py`; models in a single `models.py`
- Routers are thin — delegate to `services/` for non-trivial logic
- Image processing routes to GPU (via async HTTP) or local CPU depending on `GPU_*` env vars
- Async task polling for upscaling: task ID stored in `ProcessingTask` model, frontend polls `/api/processing/tasks/{task_id}`

**Authorization levels (via `core/deps.py`):**
1. No auth — public order view via token (`/api/orders/public/{token}`)
2. `get_current_user` — any valid JWT
3. `get_approved_user` — JWT + `is_approved=True`
4. `get_admin_user` — JWT + `is_admin=True`

**Multi-tenancy:** Most endpoints scope data to `current_user.projects` (many-to-many). Admins see all projects.

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

**State management (Angular Signals):**
- `AuthService._user` signal → current user + their projects
- `AuthService._currentProject` signal → selected project (multi-project users)
- Computed: `isAuthenticated()`, `isApproved()`, `isAdmin()`
- Persisted in localStorage: `dimo_auth_token`, `dimo_current_project`

**Auth flow:**
1. Login → JWT (30-day expiry) stored in localStorage
2. `auth.interceptor.ts` injects Bearer token on every request
3. Guards compose: `authGuard` → `approvedGuard` → `projectGuard` → `adminGuard`
4. First registered user auto-becomes admin+approved; others need admin approval

**Route structure:**
- `/auth/*` — public (login, register)
- `/track/:token` — public order view
- `/utilidades/*` — image editor (approved users)
- `/gestion/*` — management (approved users; `/proyectos` admin-only)
- `/usuarios/*` — user management (admin for create/permissions)

## Key Domain Models

| Model | Purpose |
|-------|---------|
| `User` | Auth, approval, admin flag, project membership |
| `Project` | Tenant container; users assigned via `user_projects` join table |
| `Order` + `OrderItem` | Orders with line items, coupon, delivery zone, payment tracking, state machine |
| `CostType` | Configurable cost categories per project (with required attribute definitions) |
| `OperativeCost` | Costs with dynamic JSON attributes; supports parent-child variants |
| `DeliveryZone` | Geographic delivery areas with pricing and polygon coordinates |
| `Coupon` | Discount codes (fixed/percentage), single-use, usage history |
| `Client` | Customer data linked to delivery zones |
| `ProcessingTask` | Async GPU task tracking (task_id, status, result_url) |

## Deployment

| Component | Platform |
|-----------|----------|
| Backend | Koyeb (`koyeb.yaml`) — 1 Gunicorn worker |
| Frontend | Vercel |
| Database | PostgreSQL (external, referenced via `DATABASE_URL`) |

SQL migration scripts live in `backend/sql/`. There is no ORM migration tool (Alembic) — schema changes are applied manually.

## Communication Style

**Caveman Mode: Always Active (full)**
- Terse responses: drop articles (a/an/the), filler (just/really/basically), pleasantries
- Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for")
- Pattern: `[thing] [action] [reason]. [next step].`
- Technical terms exact, code blocks normal
- Off only explicit request: "stop caveman" / "normal mode"

## Architecture Decision Records (ADRs)

Architectural decisions are documented in `docs/adr/`. Each ADR follows the template in `docs/adr/TEMPLATE.md`.

**When to create an ADR:**
- Choosing or changing a technology, library, or service
- Defining a new architectural pattern or convention
- Database schema design decisions (especially important given manual SQL migrations)
- Decisions that affect multiple modules or have long-term consequences
- When deprecating or replacing a previous approach

**Workflow:** Create via `./docs/adr/new-adr.sh "titulo"`, fill in all sections, update `docs/adr/INDEX.md`, commit with the implementing code.
