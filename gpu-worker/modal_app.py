import modal
import io
import os
import sys

# Define the image with necessary system and Python dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0", "git", "wget", "libgl1")
    .pip_install(
        "fastapi==0.109.0",
        "uvicorn[standard]==0.27.0",
        "python-multipart==0.0.9",
        "requests==2.31.0",
        "numpy==1.26.3",
        "Pillow==10.2.0",
        # Install PyTorch with CUDA support
        "torch==2.2.0+cu118",
        "torchvision==0.17.0+cu118",
        # AI Libraries
        "rembg[gpu]==2.0.56",
        "onnxruntime-gpu==1.17.0",
        # Real-ESRGAN dependencies
        "basicsr==1.4.2",
        "facexlib>=0.2.5",
        "gfpgan>=1.3.5",
        "realesrgan==0.3.0",
        "opencv-python-headless==4.9.0.80",
        extra_index_url="https://download.pytorch.org/whl/cu118",
    )
    .run_commands(
        # Download weights during build to bake them into the image
        "mkdir -p /weights",
        "wget https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth -O /weights/RealESRGAN_x4plus.pth"
    )
)

app = modal.App("dimo-gpu-worker", image=image)

# Security: Shared Secret - required environment variable
if "GPU_SERVICE_SECRET" not in os.environ:
    raise RuntimeError("GPU_SERVICE_SECRET environment variable is required")

try:
    from fastapi import UploadFile, File, HTTPException, Header, Depends
    from fastapi.responses import Response
except ImportError:
    # These imports are only needed locally for the type hints 
    # when Modal parses the file for deployment.
    # Inside the container, image.imports() handles them.
    pass

with image.imports():
    import cv2
    import numpy as np
    import torch
    import io
    from PIL import Image
    
    # Fix for basicsr + torchvision 0.17+ compatibility
    import sys
    try:
        import torchvision.transforms.functional as F
        sys.modules['torchvision.transforms.functional_tensor'] = F
    except ImportError:
        pass

    from realesrgan import RealESRGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from rembg import remove, new_session

# --- Logic Classes (Ported from core/) ---

# --- Validation Utilities ---
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_IMAGE_DIMENSION = 4096  # pixels
ALLOWED_FORMATS = {'.jpg', '.jpeg', '.png', '.webp'}
ALLOWED_CONTENT_TYPES = {
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
}

def validate_file_size(file_size: int) -> None:
    """Validate file size does not exceed MAX_FILE_SIZE."""
    if file_size > MAX_FILE_SIZE:
        raise ValueError(f"File size {file_size} exceeds maximum of {MAX_FILE_SIZE} bytes")

def validate_image_format(filename: str, content_type: str) -> None:
    """Validate image format by filename extension and content type."""
    # Check content type
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(f"Content type '{content_type}' not allowed. Allowed: {ALLOWED_CONTENT_TYPES}")
    
    # Check filename extension
    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
    if f'.{ext}' not in ALLOWED_FORMATS:
        raise ValueError(f"File extension '.{ext}' not allowed. Allowed: {ALLOWED_FORMATS}")

def validate_image_dimensions(image_bytes: bytes, max_dim: int = MAX_IMAGE_DIMENSION) -> tuple[int, int]:
    """Validate image dimensions without loading full image into memory."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size
            if width > max_dim or height > max_dim:
                raise ValueError(f"Image dimensions {width}x{height} exceed maximum of {max_dim}x{max_dim}")
            return width, height
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to read image dimensions: {e}")

def validate_image_integrity(image_bytes: bytes) -> None:
    """Validate image integrity by attempting to verify it."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
        # verify() closes the file, need to reopen for actual processing
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.load()  # Force loading to ensure it's valid
    except Exception as e:
        raise ValueError(f"Image integrity check failed: {e}")

def validate_upload(file, content: bytes) -> None:
    """Run all validations on an uploaded file."""
    # Validate size
    validate_file_size(len(content))
    
    # Validate format
    validate_image_format(file.filename, file.content_type)
    
    # Validate dimensions
    validate_image_dimensions(content)
    
    # Validate integrity
    validate_image_integrity(content)

# --- Logic Classes (Ported from core/) ---

class Upscaler:
    def __init__(self, model_path='/weights/RealESRGAN_x4plus.pth', device=None):
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = device
            
        print(f"Initializing Upscaler on {self.device}...")
        
        # Initialize the model (RealESRGAN_x4plus)
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        
        self.upsampler = RealESRGANer(
            scale=4,
            model_path=model_path,
            model=model,
            tile=400, # Tile partition to avoid OOM
            tile_pad=10,
            pre_pad=0,
            half=True if 'cuda' in str(self.device) else False,
            device=self.device,
        )

    def process(self, image_bytes: bytes, out_scale=4) -> bytes:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")

        try:
            output, _ = self.upsampler.enhance(img, outscale=out_scale)
        except RuntimeError as e:
            print(f"Error during upscaling: {e}")
            raise e

        is_success, buffer = cv2.imencode(".png", output)
        if not is_success:
            raise ValueError("Failed to encode output image")
            
        return buffer.tobytes()

class BackgroundRemover:
    def __init__(self, model_name="u2net"):
        print(f"Initializing BackgroundRemover with {model_name}...")
        self.session = new_session(model_name)

    def process(self, image_bytes: bytes) -> bytes:
        output = remove(image_bytes, session=self.session)
        return output

# --- Modal Class with Web Endpoints ---

@app.cls(
    gpu="T4",
    scaledown_window=300, # rename from container_idle_timeout
    max_containers=10,    # rename from concurrency_limit
    min_containers=0      # rename from keep_warm
)
class GPUWorker:
    @modal.enter()
    def initialize(self):
        # Load models when the container starts
        self.upscaler = Upscaler()
        self.remover = BackgroundRemover()
        self._last_warmup = 0

    @modal.fastapi_endpoint(method="GET")
    def warmup(self):
        """Health check / keep-alive endpoint.
        Call periodically (every 4 min) to prevent scale-to-zero.
        Returns container status and time since last warmup.
        """
        import time
        now = time.time()
        elapsed = now - self._last_warmup if self._last_warmup > 0 else None
        self._last_warmup = now
        return {
            "status": "warm",
            "models_loaded": True,
            "seconds_since_last_warmup": elapsed,
        }

    @modal.fastapi_endpoint(method="POST")
    def upscale(self, file: UploadFile = File(...), secret: str = Header(alias="x-api-key")):
        # Simple security check
        expected_secret = os.environ["GPU_SERVICE_SECRET"]
        if secret != expected_secret:
            raise HTTPException(status_code=401, detail="Invalid API Key")

        try:
            content = file.file.read()
            
            # Validate file before processing
            try:
                validate_upload(file, content)
            except ValueError as e:
                # Map validation errors to appropriate HTTP status codes
                if "exceeds maximum" in str(e) and "File size" in str(e):
                    raise HTTPException(status_code=413, detail=str(e))
                elif "not allowed" in str(e):
                    raise HTTPException(status_code=415, detail=str(e))
                else:
                    raise HTTPException(status_code=400, detail=str(e))
            
            result_bytes = self.upscaler.process(content, out_scale=4)
            return Response(content=result_bytes, media_type="image/png")
        except Exception as e:
            print(f"Upscale error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @modal.fastapi_endpoint(method="POST")
    def remove_background(self, file: UploadFile = File(...), secret: str = Header(alias="x-api-key")):
        expected_secret = os.environ["GPU_SERVICE_SECRET"]
        if secret != expected_secret:
            raise HTTPException(status_code=401, detail="Invalid API Key")

        try:
            content = file.file.read()
            
            # Validate file before processing
            try:
                validate_upload(file, content)
            except ValueError as e:
                # Map validation errors to appropriate HTTP status codes
                if "exceeds maximum" in str(e) and "File size" in str(e):
                    raise HTTPException(status_code=413, detail=str(e))
                elif "not allowed" in str(e):
                    raise HTTPException(status_code=415, detail=str(e))
                else:
                    raise HTTPException(status_code=400, detail=str(e))
            
            result_bytes = self.remover.process(content)
            return Response(content=result_bytes, media_type="image/png")
        except Exception as e:
            print(f"Remove BG error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
