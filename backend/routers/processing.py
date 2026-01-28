from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
import uuid

from typing import Optional
from .. import models, processing, schemas
from ..deps import get_approved_user, get_db

router = APIRouter(
    prefix="/api",
    tags=["processing"]
)

@router.post("/remove-objects")
async def api_remove_objects(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    x: Optional[int] = Form(None),
    y: Optional[int] = Form(None),
    tolerance: int = Form(30),
    user: models.User = Depends(get_approved_user)
):
    """
    Remove objects from image using one of two modes:
    1. Manual mask mode: Provide 'mask' file (from canvas drawing)
    2. Flood fill mode: Provide 'x' and 'y' coordinates (magic wand)
    """
    try:
        image_bytes = await image.read()
        
        # Mode 1: Manual mask provided
        if mask is not None:
            mask_bytes = await mask.read()
            result = await run_in_threadpool(processing.remove_objects, image_bytes, mask_bytes)
            return Response(content=result, media_type="image/png")
        
        # Mode 2: Coordinates provided (flood fill)
        elif x is not None and y is not None:
            # Generate mask from point
            mask_bytes = await run_in_threadpool(processing.create_mask_from_point, image_bytes, x, y, tolerance)
            # Apply inpainting with generated mask
            result = await run_in_threadpool(processing.remove_objects, image_bytes, mask_bytes)
            return Response(content=result, media_type="image/png")
        
        else:
            raise HTTPException(
                status_code=400, 
                detail="Either 'mask' file or both 'x' and 'y' coordinates must be provided"
            )
            
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/remove-background")
async def api_remove_background(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    colors: Optional[str] = Form(None),
    threshold: int = Form(30),
    refine: bool = Form(False),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        
        # Mode 1: Manual mask provided
        if mask is not None:
            mask_bytes = await mask.read()
            result = await run_in_threadpool(processing.remove_background_with_mask, image_bytes, mask_bytes, refine)
            return Response(content=result, media_type="image/png")
            
        # Mode 2: Specific colors provided
        elif colors:
            import json
            # Expecting colors as a JSON string of list of lists/tuples, e.g. "[[255, 0, 0]]"
            try:
                colors_list = json.loads(colors)
                result = await run_in_threadpool(processing.remove_specific_colors, image_bytes, colors_list, threshold)
            except Exception as e:
                 raise HTTPException(status_code=400, detail=f"Invalid color format: {str(e)}")
        
        # Mode 3: Automatic background removal (rembg)
        else:
            # Auto mode calls remove_background which is async
            result = await processing.remove_background(image_bytes)
            
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/enhance-quality")
async def api_enhance_quality(
    image: UploadFile = File(...),
    contrast: float = Form(1.2),
    brightness: float = Form(1.1),
    sharpness: float = Form(1.3),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        result = await run_in_threadpool(processing.enhance_quality, image_bytes, contrast, brightness, sharpness)
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upscale", response_model=schemas.TaskResponse)
async def api_upscale(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...), 
    factor: float = Form(2.0),
    detail_boost: float = Form(1.5),
    user: models.User = Depends(get_approved_user),
    db: Session = Depends(get_db)
):
    try:
        if factor <= 0:
            raise HTTPException(status_code=400, detail="Upscale factor must be greater than 0")
            
        task_id = str(uuid.uuid4())
        image_bytes = await image.read()
        
        # Create task in DB
        task = models.ProcessingTask(id=task_id, status="PENDING")
        db.add(task)
        db.commit()
        
        # Start background task
        background_tasks.add_task(
            processing.run_upscale_task, 
            task_id, 
            image_bytes, 
            factor, 
            detail_boost
        )
        
        return {"task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/processing/tasks/{task_id}", response_model=schemas.TaskStatus)
async def get_task_status(task_id: str, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.post("/halftone")
async def api_halftone(
    image: UploadFile = File(...),
    dot_size: int = Form(10),
    scale: float = Form(1.0),
    colors: Optional[str] = Form(None),
    threshold: int = Form(30),
    spacing: int = Form(0),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        
        colors_list = None
        if colors:
            import json
            try:
                colors_list = json.loads(colors)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid color format: {str(e)}")
        
        result = await run_in_threadpool(
            processing.generate_halftone,
            image_bytes, 
            dot_size=dot_size, 
            scale=scale, 
            remove_colors=colors_list, 
            tolerance=threshold,
            spacing=spacing
        )
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/contour-clip")
async def api_contour_clip(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    mode: str = Form('manual'),
    refine: bool = Form(False),
    colors: Optional[str] = Form(None),
    threshold: int = Form(30),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        mask_bytes = None
        if mask:
            mask_bytes = await mask.read()
            
        colors_list = None
        if colors:
            import json
            try:
                colors_list = json.loads(colors)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid color format: {str(e)}")
            
        # contour_clip is now async
        result = await processing.contour_clip(image_bytes, mask_bytes, mode, refine, colors_list, threshold)
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/watermark")
async def api_watermark(
    base_image: UploadFile = File(...),
    watermark_image: UploadFile = File(...),
    x: int = Form(...),
    y: int = Form(...),
    scale: float = Form(1.0),
    shape: str = Form("original"),
    user: models.User = Depends(get_approved_user)
):
    try:
        base_bytes = await base_image.read()
        watermark_bytes = await watermark_image.read()
        
        result = await run_in_threadpool(processing.apply_watermark, base_bytes, watermark_bytes, x, y, scale, shape)
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
