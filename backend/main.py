from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from . import models, database
from .routers import projects, auth, users, processing, finance, orders, payments, clients
from .database import engine

# Create DB tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PhotoEdit Suite API")

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(processing.router)
app.include_router(finance.router)
app.include_router(projects.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(clients.router)

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

app.mount("/api/static", StaticFiles(directory=STATIC_DIR), name="static")

import uvicorn
if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
