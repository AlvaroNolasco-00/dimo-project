"""
Storage service — bifurcación local vs. Cloudinary.

- APP_ENV=local       → archivos en backend/static/ (sin costo externo)
- APP_ENV=production  → Cloudinary (CDN externo, persistent across deploys)

Interfaz pública:
    await upload_file(content: bytes, folder: str, filename: str) -> str
    await delete_file(url: str) -> None
"""

import asyncio
import os
import re

APP_ENV = os.getenv("APP_ENV", "local")

# Directorio estático raíz (solo se usa en modo local)
STATIC_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static"
)

# ---------------------------------------------------------------------------
# Interfaz pública
# ---------------------------------------------------------------------------

async def upload_file(file_content: bytes, folder: str, filename: str) -> str:
    """
    Sube un archivo y retorna su URL pública.

    Args:
        file_content: Bytes del archivo a subir.
        folder:       Subdirectorio relativo (e.g. "uploads/orders/5/client").
                      Usar cadena vacía para raíz.
        filename:     Nombre de archivo con extensión.

    Returns:
        URL pública del recurso.
    """
    if APP_ENV == "local":
        return _upload_local(file_content, folder, filename)
    return await _upload_cloudinary(file_content, folder, filename)


async def delete_file(url: str) -> None:
    """
    Elimina un archivo a partir de su URL pública.
    No lanza excepción si el archivo no existe.

    Args:
        url: URL retornada por upload_file().
    """
    if not url:
        return
    if APP_ENV == "local":
        _delete_local(url)
    else:
        await _delete_cloudinary_by_url(url)


# ---------------------------------------------------------------------------
# Implementación LOCAL
# ---------------------------------------------------------------------------

def _upload_local(file_content: bytes, folder: str, filename: str) -> str:
    target_dir = os.path.join(STATIC_DIR, folder) if folder else STATIC_DIR
    os.makedirs(target_dir, exist_ok=True)
    with open(os.path.join(target_dir, filename), "wb") as f:
        f.write(file_content)
    return f"/api/static/{folder}/{filename}" if folder else f"/api/static/{filename}"


def _delete_local(url: str) -> None:
    # Soporta /api/static/... y /static/... (formato legacy de avatares)
    relative = url.removeprefix("/api/static/").removeprefix("/static/")
    file_path = os.path.join(STATIC_DIR, relative)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"[storage] Error eliminando archivo local {file_path}: {e}")


# ---------------------------------------------------------------------------
# Implementación CLOUDINARY
# ---------------------------------------------------------------------------

_cloudinary_configured = False


def _ensure_cloudinary() -> None:
    global _cloudinary_configured
    if _cloudinary_configured:
        return
    import cloudinary  # noqa: F401 — importación tardía para no requerir el paquete en local

    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        secure=True,
    )
    _cloudinary_configured = True


def _cloudinary_public_id(folder: str, filename: str) -> str:
    """
    Construye el public_id de Cloudinary (sin extensión).
    Ejemplo: folder="uploads/products/3", filename="uuid_foto.jpg"
             → "dimo/uploads/products/3/uuid_foto"
    """
    name_no_ext = os.path.splitext(filename)[0]
    return f"dimo/{folder}/{name_no_ext}" if folder else f"dimo/{name_no_ext}"


async def _upload_cloudinary(file_content: bytes, folder: str, filename: str) -> str:
    import cloudinary.uploader  # noqa: F401

    _ensure_cloudinary()
    public_id = _cloudinary_public_id(folder, filename)

    result = await asyncio.to_thread(
        cloudinary.uploader.upload,
        file_content,
        public_id=public_id,
        resource_type="auto",
        overwrite=True,
    )
    return result["secure_url"]


async def _delete_cloudinary_by_url(url: str) -> None:
    """
    Extrae public_id y resource_type de la URL de Cloudinary y llama destroy().
    URL típica: https://res.cloudinary.com/{cloud}/{type}/upload/v123/dimo/...ext
    """
    import cloudinary.uploader  # noqa: F401

    _ensure_cloudinary()

    match = re.search(
        r"cloudinary\.com/[^/]+/(\w+)/upload/(?:v\d+/)?(.+?)(\.[^./]+)?$", url
    )
    if not match:
        print(f"[storage] No se pudo parsear URL de Cloudinary para eliminar: {url}")
        return

    resource_type = match.group(1)  # "image", "raw", "video"
    public_id = match.group(2)

    try:
        await asyncio.to_thread(
            cloudinary.uploader.destroy, public_id, resource_type=resource_type
        )
    except Exception as e:
        print(f"[storage] Error eliminando de Cloudinary ({public_id}): {e}")
