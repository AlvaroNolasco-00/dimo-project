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

# Security: Shared Secret via Modal Secrets
gpu_secret = modal.Secret.from_name("dimo-gpu-secret")

try:
    from fastapi import UploadFile, File, Form, HTTPException, Header
    from fastapi.responses import Response
except ImportError:
    # Fallback for when fastapi isn't installed locally
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


# --- Contour-Clip helpers (ported from backend/services/processing.py) ---

_ROI_DILATE_RATIO = 15
_ROI_DILATE_MIN = 31
_CHROMA_THRESHOLD = 28
_BG_CORNER_SAMPLE_RATIO = 20
_BG_CORNER_SAMPLE_MIN = 20
_BG_VARIANCE_FALLBACK = 40.0


def _keep_largest_components(mask: np.ndarray, min_area_ratio: float = 0.005) -> np.ndarray:
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    total = mask.shape[0] * mask.shape[1]
    min_area = int(total * min_area_ratio)
    out = np.zeros_like(mask)
    areas = stats[1:, cv2.CC_STAT_AREA]
    if len(areas) == 0:
        return mask
    max_label = int(np.argmax(areas)) + 1
    for label_idx in range(1, num_labels):
        area = stats[label_idx, cv2.CC_STAT_AREA]
        if area >= min_area or label_idx == max_label:
            out[labels == label_idx] = 255
    return out


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    inverted = 255 - mask
    padded = cv2.copyMakeBorder(inverted, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
    flood = np.zeros((h + 4, w + 4), np.uint8)
    cv2.floodFill(padded, flood, (0, 0), 0)
    inner = padded[1:-1, 1:-1]
    holes = (inner == 255).astype(np.uint8) * 255
    return cv2.bitwise_or(mask, holes)


def _decontaminate_edges(rgba: np.ndarray) -> np.ndarray:
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    semi_mask = (alpha > 0.05) & (alpha < 0.95)
    if not semi_mask.any():
        return rgba
    result = rgba.copy().astype(np.float32)
    bg_sample = rgba[:, :, :3].astype(np.float32)
    transparent_mask = (rgba[:, :, 3] < 10).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    for c in range(3):
        channel = bg_sample[:, :, c]
        filled = cv2.dilate(channel.astype(np.uint8), kernel).astype(np.float32)
        bg_sample[:, :, c] = np.where(transparent_mask > 0, channel, filled)
    a = alpha[:, :, np.newaxis]
    fg = (result[:, :, :3] - (1.0 - a) * bg_sample) / np.where(a > 0.05, a, 1.0)
    decontaminated = np.clip(fg, 0, 255)
    result[:, :, :3] = np.where(semi_mask[:, :, np.newaxis], decontaminated, result[:, :, :3])
    return result.astype(np.uint8)


def _smooth_alpha_edge_aware(rgba: np.ndarray) -> np.ndarray:
    alpha = rgba[:, :, 3]
    guide = rgba[:, :, :3]
    try:
        smoothed = cv2.ximgproc.jointBilateralFilter(
            joint=guide, src=alpha, d=5, sigmaColor=30, sigmaSpace=5
        )
    except AttributeError:
        smoothed = cv2.bilateralFilter(alpha, d=5, sigmaColor=30, sigmaSpace=5)
    result = rgba.copy()
    result[:, :, 3] = smoothed
    return result


def _estimate_bg_color_from_image(rgb: np.ndarray, subject_mask: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    cs = max(_BG_CORNER_SAMPLE_MIN, min(h, w) // _BG_CORNER_SAMPLE_RATIO)
    corners = np.vstack([
        rgb[:cs, :cs].reshape(-1, 3),
        rgb[:cs, -cs:].reshape(-1, 3),
        rgb[-cs:, :cs].reshape(-1, 3),
        rgb[-cs:, -cs:].reshape(-1, 3),
    ]).astype(np.int32)
    corner_std = float(np.mean(np.std(corners, axis=0)))
    if corner_std < _BG_VARIANCE_FALLBACK:
        return np.median(corners, axis=0).astype(np.int32)
    outside = cv2.bitwise_not(subject_mask)
    ring_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))
    ring = cv2.dilate(subject_mask, ring_kernel, iterations=1) & outside
    ring_pixels = rgb[ring > 0]
    if len(ring_pixels) >= 200:
        return np.median(ring_pixels.astype(np.int32), axis=0)
    all_outside = rgb[outside > 0]
    if len(all_outside) == 0:
        return np.median(corners, axis=0).astype(np.int32)
    return np.median(all_outside.astype(np.int32), axis=0)


class ContourClipProcessor:
    def __init__(self, rembg_session):
        self.session = rembg_session

    def process(
        self,
        image_bytes: bytes,
        colors: list = None,
        tolerance: int = 30,
    ) -> bytes:
        img_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img_pil.size
        orig_rgb = np.array(img_pil)

        # Neural inference via rembg (GPU on Modal T4)
        rembg_res = remove(image_bytes, session=self.session)
        rgba = np.array(Image.open(io.BytesIO(rembg_res)).convert("RGBA"))
        if rgba.shape[:2] != (h, w):
            rgba = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_LINEAR)
        soft_alpha = rgba[:, :, 3].copy()

        # Chromakey: force alpha=0 on pixels matching user-supplied BG color hints
        if colors:
            data_lab = cv2.cvtColor(rgba[:, :, :3].astype(np.uint8), cv2.COLOR_RGB2LAB)
            for color in colors:
                target_lab = cv2.cvtColor(
                    np.array([[color[:3]]], dtype=np.uint8),
                    cv2.COLOR_RGB2LAB
                )[0, 0]
                dist = np.linalg.norm(data_lab.astype(np.float32) - target_lab.astype(np.float32), axis=2)
                soft_alpha[dist <= tolerance] = 0

        # Build birefnet hint → keep largest → dilate to ROI
        birefnet_hint = (soft_alpha > 30).astype(np.uint8) * 255
        birefnet_hint = _keep_largest_components(birefnet_hint, min_area_ratio=0.005)

        roi_kernel_sz = max(_ROI_DILATE_MIN, min(h, w) // _ROI_DILATE_RATIO)
        if roi_kernel_sz % 2 == 0:
            roi_kernel_sz += 1
        roi_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (roi_kernel_sz, roi_kernel_sz))
        roi = cv2.dilate(birefnet_hint, roi_kernel, iterations=1)

        # Estimate bg color from original image
        bg_color = _estimate_bg_color_from_image(orig_rgb, birefnet_hint)

        # Chromakey inside ROI
        orig_int = orig_rgb.astype(np.int32)
        color_dist = np.linalg.norm(orig_int - bg_color[np.newaxis, np.newaxis, :], axis=2)
        chroma_mask = (color_dist > _CHROMA_THRESHOLD).astype(np.uint8) * 255
        chroma_in_roi = cv2.bitwise_and(chroma_mask, roi)

        # Combine + clean
        combined = cv2.bitwise_or(birefnet_hint, chroma_in_roi)
        combined = _keep_largest_components(combined, min_area_ratio=0.005)
        combined = _fill_holes(combined)

        # Alpha assembly
        final_alpha = np.zeros_like(soft_alpha)
        inside = combined > 0
        soft_zone = inside & (soft_alpha >= 40) & (soft_alpha < 220)
        final_alpha[inside] = 255
        final_alpha[soft_zone] = np.maximum(soft_alpha[soft_zone], final_alpha[soft_zone])

        # Restore RGB from original (avoid rembg zeroing bg pixels)
        rgba[:, :, :3] = orig_rgb
        rgba[:, :, 3] = final_alpha

        # Edge-aware alpha smoothing + color decontamination
        rgba = _smooth_alpha_edge_aware(rgba)
        rgba = _decontaminate_edges(rgba)

        buf = io.BytesIO()
        Image.fromarray(rgba).save(buf, format="PNG", compress_level=1)
        return buf.getvalue()


# --- Modal Class with Web Endpoints ---

@app.cls(
    gpu="T4",
    scaledown_window=300,
    max_containers=10,
    min_containers=0,
    secrets=[gpu_secret]
)
class GPUWorker:
    @modal.enter()
    def initialize(self):
        # Load models when the container starts
        self.upscaler = Upscaler()
        self.remover = BackgroundRemover()
        self.contour = ContourClipProcessor(self.remover.session)
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

    @modal.fastapi_endpoint(method="POST")
    def contour_clip(
        self,
        file: UploadFile = File(...),
        secret: str = Header(alias="x-api-key"),
        colors: str = Form("[]"),
        tolerance: int = Form(30),
    ):
        import json as _json
        expected_secret = os.environ["GPU_SERVICE_SECRET"]
        if secret != expected_secret:
            raise HTTPException(status_code=401, detail="Invalid API Key")

        try:
            content = file.file.read()

            try:
                validate_upload(file, content)
            except ValueError as e:
                if "exceeds maximum" in str(e) and "File size" in str(e):
                    raise HTTPException(status_code=413, detail=str(e))
                elif "not allowed" in str(e):
                    raise HTTPException(status_code=415, detail=str(e))
                else:
                    raise HTTPException(status_code=400, detail=str(e))

            try:
                colors_list = _json.loads(colors)
                if not isinstance(colors_list, list):
                    raise ValueError("colors must be a JSON array")
            except (ValueError, TypeError) as e:
                raise HTTPException(status_code=400, detail=f"Invalid colors format: {e}")

            result_bytes = self.contour.process(
                content,
                colors=colors_list if colors_list else None,
                tolerance=tolerance,
            )
            return Response(content=result_bytes, media_type="image/png")
        except HTTPException:
            raise
        except Exception as e:
            print(f"Contour-clip error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
