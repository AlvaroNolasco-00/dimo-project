from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

APP_ENV = os.getenv("APP_ENV", "local")

from backend import models
from backend.core import database
from backend.routers import projects, auth, users, processing, finance, orders, payments, clients, catalog, audit
from backend.core.database import engine

# Create DB tables
# models.Base.metadata.create_all(bind=engine)  # Commented out due to permission error

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: warm up GPU service to avoid cold start on first request
    if APP_ENV != "local":
        import asyncio
        from backend.services.processing import warmup_gpu_service, _rescue_worker_loop
        asyncio.create_task(warmup_gpu_service())
        # Start orphan task rescue worker (checks every 2 min)
        asyncio.create_task(_rescue_worker_loop(interval_seconds=120))
    yield
    # Graceful shutdown: close shared httpx client
    from backend.services.processing import _HTTP_CLIENT
    if _HTTP_CLIENT:
        await _HTTP_CLIENT.aclose()

app = FastAPI(title="PhotoEdit Suite API", lifespan=lifespan)

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(processing.router)
app.include_router(finance.router)
app.include_router(projects.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(clients.router)
app.include_router(catalog.router)
app.include_router(audit.router)

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "https://dimo-project-git-main-alvaronolasco-00s-projects.vercel.app",
        "https://dimo-project.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# Servir archivos estáticos solo en local — en producción los assets van a Cloudinary
if APP_ENV == "local":
    app.mount("/api/static", StaticFiles(directory=STATIC_DIR), name="static")

import uvicorn
if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
