from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

from pathlib import Path

# Load .env from the same directory as this file (backend/.env)
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Determinar el entorno (por defecto 'local' si no está definido)
APP_ENV = os.getenv("APP_ENV", "local")

# Obtener URL de base de datos según el entorno
if APP_ENV == "production":
    SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
else:
    # Intenta obtener la URL local explícita, sino usa la default o fallback
    SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL_LOCAL")
    if not SQLALCHEMY_DATABASE_URL:
        # Fallback para compatibilidad si no se define _LOCAL
        SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Validación básica
if not SQLALCHEMY_DATABASE_URL:
    raise ValueError(f"DATABASE_URL no está configurada para el entorno: {APP_ENV}")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
