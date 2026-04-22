# GEMINI.md - DIMO Project 📸

## Project Overview
**DIMO Project** is a comprehensive multi-tenant platform that combines a professional photo editing suite (powered by AI) with a robust business management system. It allows users to process images (background removal, upscaling, halftone) and manage business operations (orders, clients, finances, projects) within isolated project environments.

### Core Architecture
- **Backend**: **FastAPI** (Python) providing a RESTful API. It uses **PostgreSQL** with **SQLAlchemy** for persistence and **JWT** for secure, role-based authentication.
- **Frontend**: **Angular 21** using **Standalone Components** and **Signals** for reactive state management.
- **GPU Worker**: A specialized **FastAPI** service designed for heavy image processing tasks (upscaling, background removal) using AI models.
- **Multi-tenancy**: Resources (orders, clients, etc.) are scoped to `Project` entities. Users access projects via a many-to-many relationship with specific roles.

---

## Technical Stack
- **Backend**: FastAPI, SQLAlchemy, Pydantic, OpenCV, Pillow, Rembg, Uvicorn/Gunicorn.
- **Frontend**: Angular, RxJS, Signals, SCSS, Phosphor Icons, Leaflet.
- **Database**: PostgreSQL (Managed via manual SQL migrations).
- **Deployment**: Backend on **Koyeb**, Frontend on **Vercel**.

---

## Building and Running

### Backend
1.  **Environment**: Create a `.env` file in the root or `backend/` based on `configuracion_backend.md`.
2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run Development Server**:
    ```bash
    python3 -m backend.main
    ```
    API will be available at `http://localhost:8000`.

### Frontend
1.  **Install Dependencies**:
    ```bash
    cd frontend
    npm install
    ```
2.  **Run Development Server**:
    ```bash
    npm start
    ```
    App will be available at `http://localhost:4200`.

### GPU Worker
1.  **Run Locally**:
    ```bash
    cd gpu-worker
    python3 main.py
    ```

---

## Development Conventions

### 1. Database Migrations
- **No Alembic**: Migrations are handled manually.
- **Process**: New SQL scripts should be added to `backend/sql/migrations/` (following the date-prefixed naming convention).
- **Execution**: Run scripts manually or via `backend/scripts/run_migrations.py`.

### 2. Architecture Patterns
- **Backend**:
    - Keep `routers/` thin; place complex business logic in `services/`.
    - Centralized models in `backend/models.py` and schemas in `backend/schemas.py`.
    - Use dependency injection (`backend/core/deps.py`) for auth and role checks.
- **Frontend**:
    - Use **Signals** for component state.
    - Lazy-load modules and protect routes with Guards (`authGuard`, `approvedGuard`, `projectGuard`).
    - Use **Interceptors** for JWT injection.

### 3. Documentation (ADR)
- **Architectural Decisions**: Must be documented as ADRs in `docs/adr/`.
- **Creation**: Use `./docs/adr/new-adr.sh "Title"` to create a new record and update `docs/adr/INDEX.md`.

### 4. Code Style
- **Python**: Follow PEP 8. Use async/await for I/O bound operations.
- **TypeScript**: Strict typing. Prefer functional patterns over class-based inheritance where appropriate.

## Communication Style
- **Caveman Mode**: Always active at **full** intensity.
- **Rules**: Drop articles (a/an/the), no filler/pleasantries, fragments OK. Technical terms exact.
- **Pattern**: `[thing] [action] [reason]. [next step].`

---

## Project Structure
- `backend/`: FastAPI source code, routers, models, and services.
- `frontend/`: Angular source code, components, and assets.
- `gpu-worker/`: Heavy processing service logic.
- `docs/adr/`: History of architectural decisions.
- `backend/sql/`: Database initialization and migration scripts.
- `contexts/`: High-level context documentation for LLMs and developers.

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## Think in Code — MANDATORY

When you need to analyze, count, filter, compare, search, parse, transform, or process data: **write code** that does the work via `mcp__context-mode__ctx_execute(language, code)` and `console.log()` only the answer. Do NOT read raw data into context to process mentally. Your role is to PROGRAM the analysis, not to COMPUTE it. Write robust, pure JavaScript — no npm dependencies, only Node.js built-ins (`fs`, `path`, `child_process`). Always use `try/catch`, handle `null`/`undefined`, and ensure compatibility with both Node.js and Bun. One script replaces ten tool calls and saves 100x context.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any shell command containing `curl` or `wget` will be intercepted and blocked. Do NOT retry.
Instead use:
- `mcp__context-mode__ctx_fetch_and_index(url, source)` to fetch and index web pages
- `mcp__context-mode__ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any shell command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` will be intercepted and blocked. Do NOT retry with shell.
Instead use:
- `mcp__context-mode__ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch / web browsing — BLOCKED
Direct web fetching is blocked. Use the sandbox equivalent.
Instead use:
- `mcp__context-mode__ctx_fetch_and_index(url, source)` then `mcp__context-mode__ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Shell (>20 lines output)
Shell is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `mcp__context-mode__ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `mcp__context-mode__ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### read_file (for analysis)
If you are reading a file to **edit** it → read_file is correct (edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `mcp__context-mode__ctx_execute_file(path, language, code)` instead. Only your printed summary enters context.

### grep / search (large results)
Search results can flood context. Use `mcp__context-mode__ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `mcp__context-mode__ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls. Each command: `{label: "descriptive header", command: "..."}`. Label becomes FTS5 chunk title — descriptive labels improve search.
2. **FOLLOW-UP**: `mcp__context-mode__ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `mcp__context-mode__ctx_execute(language, code)` | `mcp__context-mode__ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `mcp__context-mode__ctx_fetch_and_index(url, source)` then `mcp__context-mode__ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `mcp__context-mode__ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `upgrade` MCP tool, run the returned shell command, display as checklist |
| `ctx purge` | Call the `purge` MCP tool with confirm: true. Warns before wiping the knowledge base. |

After /clear or /compact: knowledge base and session stats are preserved. Use `ctx purge` if you want to start fresh.
