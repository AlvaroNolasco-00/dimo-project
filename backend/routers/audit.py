"""
Router de auditoría — endpoints para consultar la bitácora de procesamiento.
Solo accesible por administradores.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from typing import Optional
from datetime import datetime, timedelta

from backend import models
from backend import schemas
from backend.core.deps import get_admin_user, get_db

router = APIRouter(
    prefix="/api/audit",
    tags=["audit"]
)


@router.get("/processing", response_model=schemas.ProcessingAuditLogList)
async def get_processing_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: Optional[int] = Query(None),
    operation: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    current_user: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Lista paginada y filtrable de la bitácora de procesamiento.
    Solo admins.
    """
    query = db.query(models.ProcessingAuditLog)

    if user_id is not None:
        query = query.filter(models.ProcessingAuditLog.user_id == user_id)
    if operation:
        query = query.filter(models.ProcessingAuditLog.operation == operation)
    if status:
        query = query.filter(models.ProcessingAuditLog.status == status)
    if date_from:
        query = query.filter(models.ProcessingAuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(models.ProcessingAuditLog.created_at <= date_to)

    total = query.count()
    items = (
        query
        .options(joinedload(models.ProcessingAuditLog.user))
        .order_by(desc(models.ProcessingAuditLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return schemas.ProcessingAuditLogList(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/processing/stats", response_model=schemas.ProcessingAuditStats)
async def get_processing_stats(
    days: int = Query(30, ge=1, le=365),
    current_user: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Estadísticas agregadas de la bitácora para el panel admin.
    Solo admins.
    """
    since = datetime.utcnow() - timedelta(days=days)
    base = db.query(models.ProcessingAuditLog).filter(
        models.ProcessingAuditLog.created_at >= since
    )

    total = base.count()
    success = base.filter(models.ProcessingAuditLog.status == "SUCCESS").count()
    failed = base.filter(models.ProcessingAuditLog.status == "FAILED").count()

    avg_duration = (
        base
        .filter(models.ProcessingAuditLog.status == "SUCCESS")
        .with_entities(func.avg(models.ProcessingAuditLog.duration_ms))
        .scalar()
    )

    # Agrupados por tipo de operación
    ops_by_type = dict(
        base
        .with_entities(models.ProcessingAuditLog.operation, func.count())
        .group_by(models.ProcessingAuditLog.operation)
        .all()
    )

    # Agrupados por acelerador de hardware
    ops_by_accel_raw = (
        base
        .with_entities(models.ProcessingAuditLog.accelerator, func.count())
        .group_by(models.ProcessingAuditLog.accelerator)
        .all()
    )
    ops_by_accel = {str(k) if k else "unknown": v for k, v in ops_by_accel_raw}

    # Top 10 usuarios por volumen
    ops_by_user = [
        {"user_id": uid, "full_name": name, "count": cnt}
        for uid, name, cnt in (
            base
            .join(models.User, models.ProcessingAuditLog.user_id == models.User.id)
            .with_entities(models.User.id, models.User.full_name, func.count())
            .group_by(models.User.id, models.User.full_name)
            .order_by(func.count().desc())
            .limit(10)
            .all()
        )
    ]

    return schemas.ProcessingAuditStats(
        total_operations=total,
        success_count=success,
        failure_count=failed,
        avg_duration_ms=round(float(avg_duration), 1) if avg_duration else None,
        operations_by_type=ops_by_type,
        operations_by_user=ops_by_user,
        operations_by_accelerator=ops_by_accel,
    )
