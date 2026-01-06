from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from . import models, database
from .routers import projects, auth, users, processing, finance, orders
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

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

app.mount("/api/static", StaticFiles(directory=STATIC_DIR), name="static")

import uvicorn
if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
