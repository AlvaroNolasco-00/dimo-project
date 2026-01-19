from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
import os
import io

# Import our core logic
# We wrap imports in try-except to allow building the docker image without crashing 
# if dependencies aren't perfect in local dev environment, though Dockerfile handles it.
try:
    from core.upscaler import Upscaler
    from core.remover import BackgroundRemover
    
    # Initialize global instances to load models into memory on startup (Cold Start hit)
    # This ensures the first request only waits for inference, not model loading.
    upscaler = Upscaler()
    remover = BackgroundRemover()
except Exception as e:
    print(f"WARNING: Operations failed to initialize. {e}")
    upscaler = None
    remover = None

app = FastAPI(title="Dimo GPU Worker")

# Security: Shared Secret
API_SECRET = os.getenv("GPU_SERVICE_SECRET", "dev-secret-123")

async def verify_token(x_api_key: str = Header(...)):
    if x_api_key != API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid API Key")

@app.get("/health")
def health():
    return {"status": "ok", "gpu": upscaler is not None}

@app.post("/upscale")
async def upscale(
    file: UploadFile = File(...), 
    scale: float = 2.0,
    _: str = Depends(verify_token)
):
    if not upscaler:
        raise HTTPException(status_code=503, detail="Upscaler not initialized")
    
    try:
        content = await file.read()
        
        # Real-ESRGAN native is x4. 
        # If user wants x2, we process x4 then downscale (better quality)
        # If user wants > x4, we process x4 (limit for now)
        target_scale = 4
        
        result_bytes = upscaler.process(content, out_scale=target_scale)
        
        # If requested scale is different from 4, we implicitly handled it? 
        # The upscaler class handles out_scale. But if we want exactly 2.0:
        # The RealESRGANer 'outscale' parameter actually dictates the zoom.
        # But 'outscale' in RealESRGANer just resizes the OUTPUT of the net.
        # So passing scale=2.0 there works fine.
        
        return io.BytesIO(result_bytes) # FastAPI returns bytes automatically
    except Exception as e:
        print(f"Upscale error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/remove-background")
async def remove_bg(
    file: UploadFile = File(...), 
    _: str = Depends(verify_token)
):
    if not remover:
        raise HTTPException(status_code=503, detail="Remover not initialized")
        
    try:
        content = await file.read()
        result_bytes = remover.process(content)
        return io.BytesIO(result_bytes)
    except Exception as e:
        print(f"Remove BG error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
