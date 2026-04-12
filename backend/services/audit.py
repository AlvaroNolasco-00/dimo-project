"""
Servicio de auditoría para operaciones de procesamiento de imágenes.
Registra en la bitácora quién hizo qué, cuándo y cuánto tardó.
"""

import time
import logging
from PIL import Image
import io
from sqlalchemy.orm import Session
from typing import Optional
from backend import models

logger = logging.getLogger(__name__)


def _get_image_dimensions(image_bytes: bytes) -> tuple:
    """
    Extrae dimensiones de la imagen leyendo solo el header (sin decodificar píxeles).
    Retorna (width, height) o (None, None) si falla.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        return img.size  # (width, height)
    except Exception:
        return (None, None)


def _detect_accelerator(operation: str) -> str:
    """
    Detecta el acelerador que se usaría para la operación.
    Importa las funciones del servicio de procesamiento para evitar duplicar lógica.
    """
    try:
        from backend.services.processing import _get_local_accelerator, _should_use_cloud_gpu, APP_ENV
        # En producción puede usar cloud GPU
        if APP_ENV != "local":
            cap_map = {
                "REMOVE_BACKGROUND": "remove-background",
                "UPSCALE": "upscale",
            }
            cap = cap_map.get(operation)
            if cap and _should_use_cloud_gpu(cap):
                return "cloud_gpu"
        return _get_local_accelerator()
    except Exception:
        return "unknown"


class AuditContext:
    """
    Contexto de auditoría para una operación de procesamiento de imagen.

    Uso:
        audit = AuditContext(db, user, "REMOVE_BACKGROUND", image_bytes, {"threshold": 30})
        try:
            result = process(...)
            audit.complete(result)
        except Exception as e:
            audit.fail(str(e))
            raise

    Si el registro de auditoría falla, NO bloquea la respuesta al usuario.
    """

    def __init__(self, db: Session, user, operation: str, image_bytes: bytes, parameters: dict = None):
        self.db = db
        self.start_time = time.monotonic()
        self._committed = False

        width, height = _get_image_dimensions(image_bytes)
        accelerator = _detect_accelerator(operation)

        self.entry = models.ProcessingAuditLog(
            user_id=user.id if user else None,
            operation=operation,
            status="PENDING",
            input_file_size=len(image_bytes),
            input_width=width,
            input_height=height,
            accelerator=accelerator,
            parameters=parameters or {},
        )

        try:
            db.add(self.entry)
            db.flush()  # Obtener ID sin hacer commit completo
        except Exception as e:
            logger.error(f"AuditContext: no se pudo crear registro de auditoría: {e}")

    def complete(self, result_bytes: bytes = None):
        """Marca la operación como exitosa y registra duración y tamaño del output."""
        elapsed = int((time.monotonic() - self.start_time) * 1000)
        self.entry.status = "SUCCESS"
        self.entry.duration_ms = elapsed
        if result_bytes:
            self.entry.output_file_size = len(result_bytes)
        self._save()

    def fail(self, error_message: str):
        """Marca la operación como fallida con el mensaje de error."""
        elapsed = int((time.monotonic() - self.start_time) * 1000)
        self.entry.status = "FAILED"
        self.entry.duration_ms = elapsed
        self.entry.error_message = str(error_message)[:1000]  # Truncar mensajes muy largos
        self._save()

    def set_task_id(self, task_id: str):
        """Vincula el registro a un ProcessingTask (solo para operaciones async como upscale)."""
        self.entry.task_id = task_id

    def get_id(self) -> Optional[int]:
        """Retorna el ID del registro creado (para pasarlo a tareas async)."""
        return getattr(self.entry, 'id', None)

    def _save(self):
        """Hace commit del registro. Si falla, loguea pero NO propaga el error."""
        if self._committed:
            return
        try:
            self.db.commit()
            self._committed = True
        except Exception as e:
            logger.error(f"AuditContext: error al guardar registro de auditoría: {e}")
            try:
                self.db.rollback()
            except Exception:
                pass


def update_audit_log_async(db: Session, audit_log_id: int, status: str,
                            duration_ms: int = None, output_file_size: int = None,
                            error_message: str = None):
    """
    Actualiza un registro de auditoría desde una tarea async (background task).
    Usado por run_upscale_task para actualizar el registro creado en el endpoint.
    """
    try:
        entry = db.query(models.ProcessingAuditLog).filter(
            models.ProcessingAuditLog.id == audit_log_id
        ).first()
        if not entry:
            logger.warning(f"audit: registro {audit_log_id} no encontrado para actualizar")
            return
        entry.status = status
        if duration_ms is not None:
            entry.duration_ms = duration_ms
        if output_file_size is not None:
            entry.output_file_size = output_file_size
        if error_message is not None:
            entry.error_message = str(error_message)[:1000]
        db.commit()
    except Exception as e:
        logger.error(f"audit: error al actualizar registro {audit_log_id}: {e}")
        try:
            db.rollback()
        except Exception:
            pass
