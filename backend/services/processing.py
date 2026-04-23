import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import io
import os
import httpx
import asyncio
import threading
from typing import Optional

import logging

# Configure Logging
logger = logging.getLogger(__name__)

# Cloud GPU Service Configuration (Modal/Serverless style)
GPU_UPSCALE_URL = os.getenv("GPU_UPSCALE_URL")
GPU_REMOVER_URL = os.getenv("GPU_REMOVER_URL")
GPU_SERVICE_SECRET = os.getenv("GPU_SERVICE_SECRET")
# Legacy/Koyeb Fallback URL
GPU_SERVICE_URL = os.getenv("GPU_SERVICE_URL")
# Dedicated contour-clip GPU URL (reuses remover endpoint if unset)
GPU_CONTOUR_URL = os.getenv("GPU_CONTOUR_URL")

# App Environment
APP_ENV = os.getenv("APP_ENV", "local")

# ─── Module-level singletons ─────────────────────────────────────────────────

_LOCAL_ACCELERATOR_CACHE = None
_REMBG_SESSIONS: dict = {}
_HTTP_CLIENT: Optional[httpx.AsyncClient] = None
_HTTP_CLIENT_THREAD_LOCAL = threading.local()

def _get_http_client() -> httpx.AsyncClient:
    """Returns a reusable httpx AsyncClient with connection pooling.
    Thread-safe: creates one client per thread/event loop.
    """
    global _HTTP_CLIENT
    
    # Check if we're in the main thread
    if threading.current_thread() is threading.main_thread():
        if _HTTP_CLIENT is None:
            _HTTP_CLIENT = httpx.AsyncClient(
                timeout=httpx.Timeout(180.0, connect=60.0),
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            )
        return _HTTP_CLIENT
    
    # In worker threads, use thread-local client
    if not hasattr(_HTTP_CLIENT_THREAD_LOCAL, 'client') or _HTTP_CLIENT_THREAD_LOCAL.client.is_closed:
        _HTTP_CLIENT_THREAD_LOCAL.client = httpx.AsyncClient(
            timeout=httpx.Timeout(180.0, connect=60.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _HTTP_CLIENT_THREAD_LOCAL.client

# ─── Local Hardware Accelerator Detection ───────────────────────────────────

def _get_local_accelerator() -> str:
    """
    Detects best available local hardware accelerator.
    Returns: 'mps' (Apple Silicon GPU), 'coreml' (Neural Engine), or 'cpu'.
    Result is cached after first call.
    """
    global _LOCAL_ACCELERATOR_CACHE
    if _LOCAL_ACCELERATOR_CACHE is not None:
        return _LOCAL_ACCELERATOR_CACHE

    # Check MPS (Metal Performance Shaders — Apple Silicon GPU via PyTorch)
    try:
        import torch
        if torch.backends.mps.is_available() and torch.backends.mps.is_built():
            _LOCAL_ACCELERATOR_CACHE = 'mps'
            logger.info("🍎 Apple Silicon detected: MPS (Metal Performance Shaders) available")
            return _LOCAL_ACCELERATOR_CACHE
    except ImportError:
        logger.debug("PyTorch not installed — MPS not available")

    # Check CoreML (Neural Engine via onnxruntime-silicon)
    try:
        import onnxruntime as ort
        if 'CoreMLExecutionProvider' in ort.get_available_providers():
            _LOCAL_ACCELERATOR_CACHE = 'coreml'
            logger.info("🍎 Apple Silicon detected: CoreML (Neural Engine) available via onnxruntime-silicon")
            return _LOCAL_ACCELERATOR_CACHE
    except Exception:
        pass

    _LOCAL_ACCELERATOR_CACHE = 'cpu'
    logger.info("💻 No hardware accelerator detected — using CPU")
    return _LOCAL_ACCELERATOR_CACHE

# ─── Cloud GPU Routing ───────────────────────────────────────────────────────

def _should_use_cloud_gpu(capability: str = None) -> bool:
    """
    Determines if we should route to the Cloud GPU Service.
    Only active in production and only if the service URLs are configured.
    
    Capabilities:
    - "upscale": Real-ESRGAN upscaling (GPU_UPSCALE_URL)
    - "remove-background": rembg neural inference (GPU_REMOVER_URL)
    - "contour-clip": rembg for auto mode + chromakey post-proc (GPU_CONTOUR_URL or GPU_REMOVER_URL)
    """
    if APP_ENV == "local":
        return False

    if capability == "upscale" and GPU_UPSCALE_URL:
        return True
    if capability == "remove-background" and GPU_REMOVER_URL:
        return True
    if capability == "contour-clip" and (GPU_CONTOUR_URL or GPU_REMOVER_URL):
        return True

    if GPU_SERVICE_URL:
        return True

    return False

# Keep backward-compatible alias (used in existing call sites)
def _should_use_gpu(capability: str = None) -> bool:
    return _should_use_cloud_gpu(capability)

# ─── Dimension limits per accelerator ────────────────────────────────────────
# MPS (M-chip GPU): high limit — M4 has unified memory and handles large tensors well.
# CPU / cloud:      conservative limit — avoids OOM on cloud free tiers.
MAX_DIMENSION_MPS = 8000
MAX_DIMENSION_CPU = 4000

# Log startup mode
if APP_ENV == "local":
    _accel = _get_local_accelerator()
    logger.info(f"🍎 PROCESSING MODE: LOCAL — Hardware accelerator: {_accel.upper()} (Env: {APP_ENV})")
else:
    gpu_caps = []
    if _should_use_cloud_gpu("upscale"):
        gpu_caps.append("upscale")
    if _should_use_cloud_gpu("remove-background"):
        gpu_caps.append("remove-bg")
    if _should_use_cloud_gpu("contour-clip"):
        gpu_caps.append("contour-clip")
    
    if gpu_caps:
        logger.info(f"🚀 PROCESSING MODE: CLOUD GPU ENABLED — [{', '.join(gpu_caps)}] (Env: {APP_ENV})")
    else:
        logger.info(f"💻 PROCESSING MODE: CLOUD CPU FALLBACK — no GPU URLs configured (Env: {APP_ENV})")

async def call_gpu_service(service_type: str, image_bytes: bytes, params: dict = None, data: dict = None) -> bytes:
    """
    Helper to call the GPU worker service.
    service_type: 'upscale', 'remove-background', or 'contour-clip'
    """
    url = None
    if service_type == "upscale":
        url = GPU_UPSCALE_URL
    elif service_type == "remove-background":
        url = GPU_REMOVER_URL
    elif service_type == "contour-clip":
        url = GPU_CONTOUR_URL or GPU_REMOVER_URL

    if not url:
        base_url = os.getenv("GPU_SERVICE_URL")
        if base_url:
             url = f"{base_url}/{service_type}"
        else:
             raise ValueError(f"No configured URL for GPU service: {service_type}")

    headers = {"x-api-key": GPU_SERVICE_SECRET} if GPU_SERVICE_SECRET else {}
    files = {"file": ("image.png", image_bytes, "image/png")}

    client = _get_http_client()
    response = await client.post(url, files=files, params=params, data=data, headers=headers)

    if response.status_code != 200:
        raise Exception(f"GPU Service Failed: {response.status_code} - {response.text}")

    return response.content


async def warmup_gpu_service() -> bool:
    """
    Sends a lightweight GET request to Modal warmup endpoint.
    Triggers container provisioning without processing an image.
    Call this on backend startup or periodically to avoid cold starts.
    Returns True if warmup succeeded, False otherwise.
    """
    # Use the remover URL as base (same container serves both endpoints)
    base_url = GPU_REMOVER_URL or GPU_UPSCALE_URL
    if not base_url:
        return False

    # Replace endpoint path with /warmup
    # Modal URLs look like: https://user--app-endpoint.modal.run
    warmup_url = base_url.rsplit("/", 1)[0] + "/warmup" if "/" in base_url.rsplit("modal.run", 1)[-1] else base_url.replace("remove-background", "warmup").replace("upscale", "warmup").replace("contour_clip", "warmup")

    try:
        client = _get_http_client()
        response = await client.get(warmup_url, timeout=30.0)
        if response.status_code == 200:
            logger.info("✅ GPU service warmed up successfully")
            global _LAST_GPU_CALL_TIME
            import time
            _LAST_GPU_CALL_TIME = time.monotonic()
            return True
        logger.warning(f"⚠️ GPU warmup returned {response.status_code}")
        return False
    except Exception as e:
        logger.warning(f"⚠️ GPU warmup failed: {e}")
        return False

# Track last successful GPU call to detect potential cold starts
_LAST_GPU_CALL_TIME: float = 0.0
_GPU_IDLE_THRESHOLD = 300  # 5 min matches Modal scaledown_window


async def _call_cloud_gpu_with_retry(
    service_type: str,
    image_bytes: bytes,
    params: dict = None,
    data: dict = None,
    max_retries: int = 3,
    initial_backoff: float = 3.0,
) -> bytes:
    """
    Wrapper con retry exponencial para cloud GPU services.
    Detecta cold-start de Modal y ajusta el backoff automáticamente.
    
    Args:
        service_type: 'upscale', 'remove-background', o 'contour-clip'
        image_bytes: imagen a procesar
        params: query params
        data: form data
        max_retries: reintentos máximos (default: 3)
        initial_backoff: segundos iniciales (default: 3.0)
    
    Raises:
        ValueError: Si URLs GPU no configuradas
        Exception: Si todos los reintentos fallan
    """
    import time
    import httpx
    
    global _LAST_GPU_CALL_TIME, _GPU_IDLE_THRESHOLD
    
    # Detect potential cold start: if idle > 5 min, Modal likely scaled to zero
    now = time.monotonic()
    idle_time = now - _LAST_GPU_CALL_TIME if _LAST_GPU_CALL_TIME > 0 else float('inf')
    is_likely_cold_start = idle_time > _GPU_IDLE_THRESHOLD
    
    if is_likely_cold_start:
        logger.info(f"🥶 Potential Modal cold-start detected (idle {idle_time:.0f}s). Using extended backoff.")
        # Use longer initial backoff for cold start: 8s → 16s → 32s
        # This gives Modal time to provision container + load models
        effective_backoff = max(initial_backoff, 8.0)
    else:
        effective_backoff = initial_backoff
    
    last_exception = None
    backoff = effective_backoff
    
    for attempt in range(max_retries + 1):
        try:
            result = await call_gpu_service(service_type, image_bytes, params, data)
            _LAST_GPU_CALL_TIME = time.monotonic()
            return result
        except httpx.TimeoutException as e:
            last_exception = e
            logger.warning(
                f"⏱️ Timeout {service_type} (attempt {attempt + 1}/{max_retries + 1}), "
                f"retrying in {backoff:.1f}s..."
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500:
                last_exception = e
                # 503 often means Modal is provisioning
                if e.response.status_code == 503:
                    logger.warning(
                        f"🔄 Modal provisioning ({service_type}, attempt {attempt + 1}/{max_retries + 1}). "
                        f"Waiting {backoff:.1f}s for container..."
                    )
                else:
                    logger.warning(
                        f"⚠️ HTTP {e.response.status_code} {service_type} "
                        f"(attempt {attempt + 1}/{max_retries + 1}), retrying..."
                    )
            else:
                raise
        except Exception as e:
            last_exception = e
            logger.warning(
                f"❌ {service_type} error (attempt {attempt + 1}/{max_retries + 1}): {e}"
            )
        
        if attempt < max_retries:
            await asyncio.sleep(backoff)
            backoff *= 2
    
    raise Exception(
        f"Cloud GPU {service_type} failed after {max_retries + 1} attempts: {last_exception}"
    )


def read_image_file(file_bytes: bytes) -> Image.Image:
    """Reads image bytes and returns a PIL Image. Preserves Alpha if present."""
    img = Image.open(io.BytesIO(file_bytes))
    if img.mode not in ("RGB", "RGBA"):
        return img.convert("RGB")
    return img

def pil_to_bytes(image: Image.Image) -> bytes:
    """Converts PIL Image to bytes. Uses compress_level=1 for ~3x faster encoding."""
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='PNG', compress_level=1)
    return img_byte_arr.getvalue()

def pil_to_cv2(image: Image.Image) -> np.ndarray:
    """Converts PIL Image to OpenCV format (BGR or BGRA)."""
    if image.mode == 'RGBA':
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGBA2BGRA)
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

def cv2_to_pil(image: np.ndarray) -> Image.Image:
    """Converts OpenCV image (BGR or BGRA) to PIL Image (RGB or RGBA)."""
    if image.shape[2] == 4:
        return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA))
    return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

# 0. Mejorar Calidad

def _enhance_quality_mps(image_bytes: bytes, contrast: float, brightness: float, sharpness: float) -> bytes:
    """Enhance quality via PyTorch MPS (Metal Performance Shaders) on Apple Silicon."""
    import torch
    import torch.nn.functional as F

    img_pil = read_image_file(image_bytes)
    has_alpha = img_pil.mode == 'RGBA'
    if has_alpha:
        alpha_np = np.array(img_pil.split()[3])

    device = torch.device('mps')
    img_np = np.array(img_pil.convert('RGB')).astype(np.float32) / 255.0
    t = torch.from_numpy(img_np.transpose(2, 0, 1)).unsqueeze(0).to(device)

    # Brightness: scale all channels
    t = t * brightness

    # Contrast: stretch around the image mean
    mean = t.mean()
    t = mean + (t - mean) * contrast

    # Sharpness: unsharp mask using 3x3 Gaussian kernel (softer than box blur, fewer halos)
    gaussian_1d = torch.tensor([1.0, 2.0, 1.0], device=device)
    gaussian_2d = (gaussian_1d[:, None] * gaussian_1d[None, :]) / 16.0
    kernel = gaussian_2d.unsqueeze(0).unsqueeze(0).expand(3, 1, 3, 3).contiguous()
    blurred = F.conv2d(t, kernel, padding=1, groups=3)
    t = blurred + (t - blurred) * sharpness

    t = t.clamp(0, 1)
    result_np = (t.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8)
    result_pil = Image.fromarray(result_np, 'RGB')

    if has_alpha:
        result_pil = result_pil.convert('RGBA')
        result_pil.putalpha(Image.fromarray(alpha_np))

    return pil_to_bytes(result_pil)


def _enhance_quality_cpu(image_bytes: bytes, contrast: float, brightness: float, sharpness: float) -> bytes:
    """Enhance quality via PIL ImageEnhance — universal CPU fallback."""
    img = read_image_file(image_bytes)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Brightness(img).enhance(brightness)
    img = ImageEnhance.Sharpness(img).enhance(sharpness)
    return pil_to_bytes(img)


async def enhance_quality(image_bytes: bytes, contrast: float, brightness: float, sharpness: float) -> bytes:
    """
    Enhances image quality (contrast, brightness, sharpness).
    - Local M-chip: MPS (Metal Performance Shaders via PyTorch)
    - Production / CPU: PIL ImageEnhance
    """
    accelerator = _get_local_accelerator()
    logger.info(f"✨ Enhancing image quality (accelerator: {accelerator.upper()})...")

    if accelerator == 'mps':
        return await asyncio.to_thread(_enhance_quality_mps, image_bytes, contrast, brightness, sharpness)

    return await asyncio.to_thread(_enhance_quality_cpu, image_bytes, contrast, brightness, sharpness)


# 1. Remover Fondo con Máscara Manual

def _remove_background_with_mask_mps(image_bytes: bytes, mask_bytes: bytes, refine: bool) -> bytes:
    """Remove background with mask via PyTorch MPS on Apple Silicon."""
    import torch
    import torch.nn.functional as F

    device = torch.device('mps')

    img_pil = read_image_file(image_bytes).convert("RGBA")
    mask_pil = read_image_file(mask_bytes).convert("L")
    if mask_pil.size != img_pil.size:
        mask_pil = mask_pil.resize(img_pil.size, Image.NEAREST)

    img_t = torch.from_numpy(np.array(img_pil)).to(device).float()   # HxWx4
    mask_t = torch.from_numpy(np.array(mask_pil)).to(device).float()  # HxW

    # White areas (>127) → background → alpha = 0
    mask_binary = (mask_t > 127).float()
    img_t[:, :, 3] = img_t[:, :, 3] * (1.0 - mask_binary)

    if refine:
        alpha_t = img_t[:, :, 3].unsqueeze(0).unsqueeze(0)  # 1x1xHxW
        alpha_blurred = F.gaussian_blur(alpha_t, kernel_size=[3, 3], sigma=[1.0, 1.0])
        img_t[:, :, 3] = alpha_blurred.squeeze()

    result_np = img_t.clamp(0, 255).cpu().numpy().astype(np.uint8)
    return pil_to_bytes(Image.fromarray(result_np, 'RGBA'))


def _remove_background_with_mask_cpu(image_bytes: bytes, mask_bytes: bytes, refine: bool) -> bytes:
    """Remove background with mask via OpenCV — universal CPU fallback."""
    img_pil = read_image_file(image_bytes)
    img_cv = cv2.cvtColor(np.array(img_pil.convert("RGBA")), cv2.COLOR_RGBA2BGRA)
    h, w = img_cv.shape[:2]

    mask_pil = read_image_file(mask_bytes).convert("L")
    mask_cv = np.array(mask_pil)

    if mask_cv.shape[:2] != (h, w):
        mask_cv = cv2.resize(mask_cv, (w, h), interpolation=cv2.INTER_NEAREST)

    _, mask_binary = cv2.threshold(mask_cv, 127, 255, cv2.THRESH_BINARY)
    img_cv[mask_binary > 0, 3] = 0

    if refine:
        alpha = img_cv[:, :, 3]
        img_cv[:, :, 3] = cv2.GaussianBlur(alpha, (3, 3), 0)

    return pil_to_bytes(Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGRA2RGBA)))


async def remove_background_with_mask(image_bytes: bytes, mask_bytes: bytes, refine: bool = False) -> bytes:
    """
    Removes background using a manually drawn mask. White mask areas → transparent.
    - Local M-chip: MPS (Metal Performance Shaders via PyTorch)
    - Production / CPU: OpenCV
    """
    accelerator = _get_local_accelerator()
    logger.info(f"🎭 Removing background with mask (accelerator: {accelerator.upper()})...")

    if accelerator == 'mps':
        return await asyncio.to_thread(_remove_background_with_mask_mps, image_bytes, mask_bytes, refine)

    return await asyncio.to_thread(_remove_background_with_mask_cpu, image_bytes, mask_bytes, refine)

# 2. Remover Objetos (Inpainting Avanzado)
def remove_objects(image_bytes: bytes, mask_bytes: bytes) -> bytes:
    """
    Removes objects using a high-precision approach:
    1. Adaptive masking to cover shadows.
    2. Background pre-filling to prevent color bleeding from the object.
    3. Multi-stage inpainting for better texture.
    4. Texture/Grain restoration.
    """
    # Read image and mask directly to OpenCV (avoids PIL round-trip)
    img_cv = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    mask_cv = cv2.imdecode(np.frombuffer(mask_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    if img_cv is None:
        raise ValueError("Could not decode image")
    if mask_cv is None:
        raise ValueError("Could not decode mask")
    h, w = img_cv.shape[:2]

    # 1. Adaptive Dilation: Adjust based on image resolution
    # Larger images need more dilation to cover anti-aliased edges
    scale_factor = max(1, min(w, h) // 1000)
    kernel_size = 3 + (2 * scale_factor)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    
    # Threshold and Dilate
    _, mask_binary = cv2.threshold(mask_cv, 50, 255, cv2.THRESH_BINARY)
    mask_dilated = cv2.dilate(mask_binary, kernel, iterations=2)

    # 2. Prevent Color Bleeding: Sample surrounding colors
    # We create a "buffer" area around the mask to sample the background
    sampling_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size + 10, kernel_size + 10))
    extended_mask = cv2.dilate(mask_dilated, sampling_kernel, iterations=1)
    boundary_mask = cv2.subtract(extended_mask, mask_dilated)
    
    # Get median color of the surrounding fabric
    surrounding_pixels = img_cv[boundary_mask > 0]
    if len(surrounding_pixels) > 0:
        median_color = np.median(surrounding_pixels, axis=0).astype(np.uint8)
        # Create a "clean" base image where the object is already filled with surrounding color
        # This is the KEY step to avoid "dirty" smudges
        clean_base = img_cv.copy()
        clean_base[mask_dilated > 0] = median_color
    else:
        clean_base = img_cv

    # 3. Apply Inpainting on the "cleaned" base
    # Using a larger radius for smoother transitions in large areas
    inpaint_radius = int(5 * scale_factor)
    res_cv = cv2.inpaint(clean_base, mask_dilated, inpaint_radius, cv2.INPAINT_NS)

    # 4. Texture Restoration (Add subtle grain only in inpainted area)
    # This prevents the area from looking like a flat plastic spot
    noise = np.random.normal(0, 1.5, (h, w, 3)).astype(np.float32)
    res_float = res_cv.astype(np.float32)
    noise_mask = (mask_dilated > 0)[:, :, np.newaxis]  # broadcast to 3 channels
    res_float = np.where(noise_mask, res_float + noise, res_float)
    res_cv = np.clip(res_float, 0, 255).astype(np.uint8)

    # 5. Smooth Blending with original edges
    mask_blurred = cv2.GaussianBlur(mask_dilated, (kernel_size * 2 + 1, kernel_size * 2 + 1), 0)
    alpha = mask_blurred.astype(float) / 255.0
    alpha = cv2.merge([alpha, alpha, alpha])
    
    final_cv = (res_cv.astype(float) * alpha + img_cv.astype(float) * (1.0 - alpha))
    final_cv = np.clip(final_cv, 0, 255).astype(np.uint8)

    _, buf = cv2.imencode('.png', final_cv, [cv2.IMWRITE_PNG_COMPRESSION, 1])
    return buf.tobytes()

def create_mask_from_point(image_bytes: bytes, x: int, y: int, tolerance: int = 30) -> bytes:
    """
    Creates a mask using flood fill from a single point (Magic Wand style).
    x, y: Coordinates of the click
    tolerance: Color similarity threshold (0-255)
    Returns: Mask image as bytes
    """
    img_cv = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img_cv is None:
        raise ValueError("Could not decode image")
    h, w = img_cv.shape[:2]

    # Validate coordinates
    if x < 0 or x >= w or y < 0 or y >= h:
        raise ValueError(f"Coordinates ({x}, {y}) are out of bounds for image size ({w}x{h})")
    
    # Create mask - needs to be 2 pixels larger in each dimension for floodFill
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    
    # Perform flood fill
    # loDiff and upDiff define the color tolerance
    cv2.floodFill(
        img_cv, 
        ff_mask, 
        seedPoint=(x, y),
        newVal=(255, 255, 255),
        loDiff=(tolerance, tolerance, tolerance),
        upDiff=(tolerance, tolerance, tolerance),
        flags=cv2.FLOODFILL_MASK_ONLY | (255 << 8)
    )
    
    # Extract the mask (remove the 2-pixel border)
    mask = ff_mask[1:-1, 1:-1]
    
    # Improve the "Magic Wand" mask by dilating it slightly
    # This helps pick up edge pixels that might be slightly outside the tolerance 
    # but are part of the object.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.dilate(mask, kernel, iterations=1)

    _, buf = cv2.imencode('.png', mask, [cv2.IMWRITE_PNG_COMPRESSION, 1])
    return buf.tobytes()


def remove_specific_colors(image_bytes: bytes, colors: list, tolerance: int = 30) -> bytes:
    """
    Removes specific colors from the image by making them transparent.
    colors: list of [R, G, B]
    tolerance: distance threshold
    """
    img_pil = read_image_file(image_bytes).convert("RGBA")
    data = np.array(img_pil)
    
    # We look at RGB channels
    rgb_data = data[:, :, :3]
    
    mask_accumulated = np.zeros(data.shape[:2], dtype=bool)
    
    for color in colors:
        target = np.array(color[:3]) # Ensure we only use RGB
        diff = rgb_data - target
        # Euclidean distance
        dist = np.linalg.norm(diff, axis=2)
        mask = dist <= tolerance
        mask_accumulated = mask_accumulated | mask
        
    # Set alpha to 0 where mask matches
    data[mask_accumulated, 3] = 0
    
    return pil_to_bytes(Image.fromarray(data))

def _get_rembg_session(model: str = "u2net"):
    """Returns cached rembg session for given model, creating it on first use."""
    global _REMBG_SESSIONS
    if model in _REMBG_SESSIONS:
        return _REMBG_SESSIONS[model]

    from rembg import new_session
    accelerator = _get_local_accelerator()

    if accelerator in ('coreml', 'mps'):
        providers = ['CoreMLExecutionProvider', 'CPUExecutionProvider']
    else:
        providers = ['CPUExecutionProvider']

    try:
        session = new_session(model, providers=providers)
        logger.info(f"✅ rembg session '{model}' initialized — providers: {providers}")
    except Exception as e:
        logger.warning(f"⚠️ Accelerated rembg session failed ({e}). Using default session.")
        session = new_session(model)

    _REMBG_SESSIONS[model] = session
    return session


# 2. Quitar Fondo
async def remove_background(
    image_bytes: bytes,
    model: str = "u2net",
    alpha_matting: bool = False,
    fg_threshold: int = 220,
    bg_threshold: int = 20,
    erode_size: Optional[int] = None
) -> bytes:
    """
    Removes background.
    - Production: Cloud GPU (Modal T4) → CPU fallback (rembg on Koyeb).
    - Local dev: CoreML (Neural Engine) or CPU via rembg.
    model: rembg model name (e.g. 'u2net', 'birefnet-general', 'isnet-general-use')
    alpha_matting: enable soft edge matting via pymatting (best for hair/fur/fine details)
    erode_size: trimap erosion radius; smaller = preserves thin outlines better (auto-calculated if None)
    """
    if _should_use_cloud_gpu("remove-background"):
        try:
            logger.info("🎨 Removing background via Cloud GPU (with retry)...")
            return await _call_cloud_gpu_with_retry("remove-background", image_bytes)
        except Exception as e:
            logger.error(f"❌ Cloud GPU BG Removal failed after retries: {e}. Falling back to CPU.")

    accelerator = _get_local_accelerator()
    logger.info(f"🍎 Removing background via local engine (model: {model}, accelerator: {accelerator.upper()})...")

    session = _get_rembg_session(model)

    from rembg import remove
    if alpha_matting:
        if erode_size is None:
            # Escalar basado en dimensión más pequeña
            with Image.open(io.BytesIO(image_bytes)) as img:
                w, h = img.size
            erode_size = max(2, min(10, min(h, w) // 200))
            
        output_bytes = await asyncio.to_thread(
            remove,
            image_bytes,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=fg_threshold,
            alpha_matting_background_threshold=bg_threshold,
            alpha_matting_erode_size=erode_size,
        )
    else:
        output_bytes = await asyncio.to_thread(remove, image_bytes, session=session)
    return output_bytes

# ... (omitted unrelated code)

from backend.core.database import SessionLocal
from backend import models
from backend.services import storage

async def run_upscale_task(task_id: str, audit_log_id: Optional[int], image_bytes: bytes, factor: float, detail_boost: float):
    """
    Background worker for upscaling task.
    Handles GPU -> CPU Fallback transition explicitly to update DB status.
    Also updates the ProcessingAuditLog entry (audit_log_id) when complete or failed.
    """
    import time as _time
    start_time = _time.monotonic()

    db = SessionLocal()
    try:
        result_bytes = None

        # 1. Try GPU if enabled
        if _should_use_gpu("upscale"):
            try:
                result_bytes = await upscale_image(image_bytes, factor, detail_boost)
            except Exception as e:
                logger.error(f"⚠️ GPU Upscale Task {task_id} failed: {e}")

                # Update DB to warn about fallback
                task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
                if task:
                    task.status = "FALLBACK_CPU"
                    # We commit here so if the CPU process crashes (OOM), we at least know it reached this state
                    db.commit()

                # We will fall through to Legacy CPU logic below
                result_bytes = None

        # 2. Local processing (MPS on Apple Silicon, or CPU fallback)
        if result_bytes is None:
            accelerator = _get_local_accelerator()
            logger.info(f"🔄 Task {task_id}: Using local upscaling (accelerator: {accelerator.upper()}).")

            # Safety limits — higher on MPS (M-chip GPU), conservative on CPU
            img_pil = read_image_file(image_bytes)
            w, h = img_pil.size
            max_dim = MAX_DIMENSION_MPS if accelerator == 'mps' else MAX_DIMENSION_CPU
            if (w * factor) > max_dim or (h * factor) > max_dim:
                raise ValueError(
                    f"El resultado sería demasiado grande ({w}x{h} → x{factor} = "
                    f"{int(w*factor)}x{int(h*factor)}px). Límite: {max_dim}px."
                )

            if accelerator == 'mps':
                try:
                    result_bytes = await asyncio.to_thread(upscale_image_mps, image_bytes, factor, detail_boost)
                    logger.info(f"✅ Task {task_id}: MPS upscale completed.")
                except Exception as e:
                    logger.warning(f"⚠️ Task {task_id}: MPS upscale failed ({e}). Falling back to CPU Lanczos.")
                    result_bytes = await asyncio.to_thread(upscale_image_legacy, image_bytes, factor, detail_boost)
            else:
                result_bytes = await asyncio.to_thread(upscale_image_legacy, image_bytes, factor, detail_boost)

        # 3. Save Success
        if result_bytes:
            filename = f"upscale_{task_id}.png"
            result_url = await storage.upload_file(result_bytes, "", filename)

            # Update ProcessingTask
            task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
            if task:
                task.status = "COMPLETED"
                task.result_url = result_url
                db.commit()

            # Update audit log
            if audit_log_id:
                from backend.services.audit import update_audit_log_async
                elapsed_ms = int((_time.monotonic() - start_time) * 1000)
                update_audit_log_async(db, audit_log_id, "SUCCESS",
                                       duration_ms=elapsed_ms,
                                       output_file_size=len(result_bytes))

    except Exception as e:
        logger.error(f"❌ Error in run_upscale_task for task {task_id}: {str(e)}")
        # Check if session is still valid
        try:
            task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
            if task:
                task.status = "FAILED"
                task.error = str(e)
                db.commit()
        except Exception as db_err:
            logger.error(f"DB session broken for task {task_id}: {db_err}")

        # Update audit log with failure
        if audit_log_id:
            try:
                from backend.services.audit import update_audit_log_async
                elapsed_ms = int((_time.monotonic() - start_time) * 1000)
                update_audit_log_async(db, audit_log_id, "FAILED",
                                       duration_ms=elapsed_ms,
                                       error_message=str(e))
            except Exception:
                pass
    finally:
        db.close()


async def run_contour_clip_task(
    task_id: str,
    audit_log_id: Optional[int],
    image_bytes: bytes,
    mask_bytes: Optional[bytes],
    mode: str,
    refine: bool,
    colors: Optional[list],
    tolerance: int
):
    """
    Background worker for contour-clip task.
    Handles GPU -> CPU fallback and updates DB status.
    """
    import time as _time
    start_time = _time.monotonic()

    db = SessionLocal()
    try:
        result_bytes = None

        # 1. Auto mode: routes to Cloud GPU (Modal) if configured, local engine otherwise.
        #    Fail-fast on GPU failure — no CPU fallback (prevents OOM on Koyeb free tier).
        if mode == 'auto':
            result_bytes = await contour_clip(image_bytes, mask_bytes, mode, refine, colors, tolerance)

        # 2. Manual mode (GrabCut) — CPU only, no GPU needed.
        if result_bytes is None:
            logger.info(f"🔄 Task {task_id}: Manual contour-clip (GrabCut, CPU).")
            result_bytes = await contour_clip(image_bytes, mask_bytes, mode, refine, colors, tolerance)

        # 3. Save Success
        if result_bytes:
            filename = f"contour_clip_{task_id}.png"
            result_url = await storage.upload_file(result_bytes, "", filename)

            task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
            if task:
                task.status = "COMPLETED"
                task.result_url = result_url
                db.commit()

            if audit_log_id:
                from backend.services.audit import update_audit_log_async
                elapsed_ms = int((_time.monotonic() - start_time) * 1000)
                update_audit_log_async(db, audit_log_id, "SUCCESS",
                                       duration_ms=elapsed_ms,
                                       output_file_size=len(result_bytes))

    except Exception as e:
        logger.error(f"❌ Error in run_contour_clip_task for task {task_id}: {str(e)}")
        try:
            task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
            if task:
                task.status = "FAILED"
                task.error = str(e)
                db.commit()
        except Exception as db_err:
            logger.error(f"DB session broken for task {task_id}: {db_err}")

        if audit_log_id:
            try:
                from backend.services.audit import update_audit_log_async
                elapsed_ms = int((_time.monotonic() - start_time) * 1000)
                update_audit_log_async(db, audit_log_id, "FAILED",
                                       duration_ms=elapsed_ms,
                                       error_message=str(e))
            except Exception:
                pass
    finally:
        db.close()

# 4. Aumentar Resolución (Upscaling)
async def upscale_image(image_bytes: bytes, factor=2, detail_boost=1.5) -> bytes:
    """
    Upscales image. Routes to Cloud GPU (production) or local hardware (local).
    NOTE: run_upscale_task controls fallback logic — this function raises on cloud failure.
    """
    if _should_use_cloud_gpu("upscale"):
        logger.info(f"🔍 Upscaling image x{factor} via Cloud GPU (with retry)...")
        form_data = {"scale": factor, "factor": factor, "detail_boost": detail_boost}
        return await _call_cloud_gpu_with_retry("upscale", image_bytes, data=form_data)

    # Local path — MPS preferred, CPU fallback
    accelerator = _get_local_accelerator()
    logger.info(f"🍎 Upscaling image x{factor} via local engine (accelerator: {accelerator.upper()})...")

    if accelerator == 'mps':
        return await asyncio.to_thread(upscale_image_mps, image_bytes, factor, detail_boost)

    return await asyncio.to_thread(upscale_image_legacy, image_bytes, factor, detail_boost)

def upscale_image_legacy(image_bytes: bytes, factor=2, detail_boost=1.5) -> bytes:
    """CPU upscaling using Lanczos — universal fallback."""
    img_pil = read_image_file(image_bytes)
    width, height = img_pil.size

    new_width = int(width * factor)
    new_height = int(height * factor)

    if new_width > MAX_DIMENSION_CPU or new_height > MAX_DIMENSION_CPU:
        raise ValueError(f"Upscale factor too large. Result would exceed {MAX_DIMENSION_CPU}px.")

    if width < 1000:
        img_pil = img_pil.filter(ImageFilter.MedianFilter(size=3))

    res_pil = img_pil.resize((new_width, new_height), Image.Resampling.LANCZOS)

    if detail_boost > 0:
        radius = 1 + (factor / 4)
        percent = int(100 * detail_boost)
        res_pil = res_pil.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=3))

    return pil_to_bytes(res_pil)


def upscale_image_mps(image_bytes: bytes, factor: float, detail_boost: float) -> bytes:
    """
    Upscaling via PyTorch MPS (Metal Performance Shaders) on Apple Silicon.
    Uses bicubic interpolation on the M-chip GPU — significantly faster than CPU Lanczos.
    Falls back to Lanczos if MPS is unavailable at runtime.
    """
    import torch
    import torch.nn.functional as F

    img_pil = read_image_file(image_bytes)
    has_alpha = img_pil.mode == 'RGBA'
    width, height = img_pil.size

    new_width = int(width * factor)
    new_height = int(height * factor)

    if new_width > MAX_DIMENSION_MPS or new_height > MAX_DIMENSION_MPS:
        raise ValueError(f"Upscale factor too large. Result would exceed {MAX_DIMENSION_MPS}px.")

    device = torch.device('mps')

    def _resize_tensor(arr: np.ndarray) -> np.ndarray:
        """Move a CHW float32 tensor to MPS, interpolate, return numpy HWC uint8."""
        t = torch.from_numpy(arr).float().div(255.0).unsqueeze(0).to(device)
        t = F.interpolate(t, size=(new_height, new_width), mode='bicubic', align_corners=False)
        return t.squeeze(0).permute(1, 2, 0).clamp(0, 1).cpu().numpy()

    if has_alpha:
        rgb_np = np.array(img_pil.convert('RGB'))          # HWC uint8
        alpha_np = np.array(img_pil.split()[3])             # HW  uint8

        rgb_chw = rgb_np.transpose(2, 0, 1)                # CHW
        alpha_chw = alpha_np[np.newaxis, :, :]              # 1HW

        rgb_out = (_resize_tensor(rgb_chw) * 255).astype(np.uint8)
        alpha_out = (_resize_tensor(alpha_chw) * 255).astype(np.uint8).squeeze()

        result = Image.fromarray(rgb_out, 'RGB').convert('RGBA')
        result.putalpha(Image.fromarray(alpha_out))
    else:
        rgb_np = np.array(img_pil.convert('RGB'))
        rgb_chw = rgb_np.transpose(2, 0, 1)
        rgb_out = (_resize_tensor(rgb_chw) * 255).astype(np.uint8)
        result = Image.fromarray(rgb_out, 'RGB')

    if detail_boost > 0:
        radius = 1 + (factor / 4)
        percent = int(100 * detail_boost)
        result = result.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=3))

    return pil_to_bytes(result)

def generate_halftone(image_bytes: bytes, dot_size: int = 10, scale: float = 1.0, remove_colors: list = None, tolerance: int = 30, spacing: int = 0) -> bytes:
    """
    Advanced halftone for professional screen printing.
    - spacing: pixels to subtract from dot radius to enforce separation.
    Vectorized implementation: replaces Python loop with NumPy batch operations.
    """
    img_pil = read_image_file(image_bytes).convert("RGBA")
    img_np = np.array(img_pil).astype(np.float32)
    h, w = img_np.shape[:2]

    # 1. Base/Shirt Color — default Black
    shirt_color = np.array(remove_colors[0], dtype=np.float32) if remove_colors and len(remove_colors) > 0 else np.array([0.0, 0.0, 0.0], dtype=np.float32)

    # 2. Output Image (Transparent BG)
    output = np.zeros((h, w, 4), dtype=np.uint8)

    max_dist = np.sqrt(3.0 * (255.0 ** 2))

    # ── Stage A: Batch cell averages ─────────────────────────────────────────
    # Pad to exact multiple of dot_size so reshape works cleanly
    pad_h = (dot_size - h % dot_size) % dot_size
    pad_w = (dot_size - w % dot_size) % dot_size
    if pad_h > 0 or pad_w > 0:
        padded = np.pad(img_np, ((0, pad_h), (0, pad_w), (0, 0)), mode='edge')
    else:
        padded = img_np
    ph, pw = padded.shape[:2]
    rows, cols = ph // dot_size, pw // dot_size

    # Reshape to (rows, dot_size, cols, dot_size, 4)
    cells = padded.reshape(rows, dot_size, cols, dot_size, 4)

    # Active pixels: alpha channel > 10  →  (rows, dot_size, cols, dot_size)
    active_mask = cells[:, :, :, :, 3] > 10
    active_count = active_mask.sum(axis=(1, 3))  # (rows, cols)

    # Weighted sum for active pixels only
    cells_masked = cells * active_mask[:, :, :, :, np.newaxis]
    cell_sums = cells_masked.sum(axis=(1, 3))  # (rows, cols, 4)

    # Where active cells exist: use active average; else use full-cell mean
    has_active = active_count > 0
    safe_count = np.where(has_active, active_count, 1)[:, :, np.newaxis]
    avg_active = cell_sums / safe_count
    avg_all = cells.mean(axis=(1, 3))  # (rows, cols, 4)
    avg_rgba = np.where(has_active[:, :, np.newaxis], avg_active, avg_all)
    avg_rgb = avg_rgba[:, :, :3]  # (rows, cols, 3)

    # ── Stage B: Batch distances, alphas, radii ───────────────────────────────
    diff = avg_rgb - shirt_color[np.newaxis, np.newaxis, :]
    dist = np.linalg.norm(diff, axis=2)  # (rows, cols)

    t_low = float(tolerance) * 1.5
    alpha_arr = np.where(dist <= t_low, 0.0, (dist - t_low) / (max_dist - t_low))
    alpha_arr = np.power(alpha_arr, 0.6)  # midtone boost

    max_r = (dot_size / 2.0) * 1.4 * scale
    radius_arr = (alpha_arr * max_r - spacing / 2.0).astype(np.int32)

    # Ink color reconstruction (vectorized un-blending)
    # C_ink = (C_pixel - (1 - alpha) * C_shirt) / alpha  for alpha > 0.1
    safe_alpha = np.where(alpha_arr > 0.1, alpha_arr, 1.0)[:, :, np.newaxis]
    reconstructed = (avg_rgb - (1.0 - alpha_arr[:, :, np.newaxis]) * shirt_color) / safe_alpha
    reconstructed = np.where(alpha_arr[:, :, np.newaxis] > 0.1, reconstructed, avg_rgb)
    reconstructed = np.clip(reconstructed, 0, 255).astype(np.uint8)  # (rows, cols, 3) RGB

    # Cell center coordinates
    cy = np.arange(rows) * dot_size + dot_size // 2  # (rows,)
    cx = np.arange(cols) * dot_size + dot_size // 2  # (cols,)
    center_y, center_x = np.meshgrid(cy, cx, indexing='ij')  # (rows, cols)

    # ── Stage C: Draw only valid dots ─────────────────────────────────────────
    valid = radius_arr > 0
    v_cx = center_x[valid].tolist()
    v_cy = center_y[valid].tolist()
    v_r = radius_arr[valid].tolist()
    v_colors = reconstructed[valid]  # (N, 3) RGB

    for i in range(len(v_cx)):
        r, g, b = int(v_colors[i, 0]), int(v_colors[i, 1]), int(v_colors[i, 2])
        cv2.circle(output, (v_cx[i], v_cy[i]), v_r[i], (b, g, r, 255), -1, cv2.LINE_AA)

    return pil_to_bytes(cv2_to_pil(output))


# ─── Auto Contour Clip Helpers ───────────────────────────────────────────────

_ROI_DILATE_RATIO = 15          # region-of-interest dilation around birefnet hint
_ROI_DILATE_MIN = 31
_CHROMA_THRESHOLD = 28          # RGB distance to treat pixel as "not background"
_BG_CORNER_SAMPLE_RATIO = 20    # corner patch size = min(h,w) // ratio
_BG_CORNER_SAMPLE_MIN = 20
_BG_VARIANCE_FALLBACK = 40.0    # if corner std > this, corners contaminated → use outside-ring fallback


def _estimate_bg_color_from_image(rgb: np.ndarray, subject_mask: np.ndarray) -> np.ndarray:
    """
    Estimate background color from ORIGINAL image (not rembg output).
    Strategy:
      1. Sample 4 image corners. If std is low → corners are clean background → use them.
      2. Else sample a ring just outside the subject mask.
      3. Else fall back to all non-subject pixels.
    Returns median RGB as int32 array [R,G,B].
    """
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

    # Corners noisy → subject likely touches corner. Try ring just outside mask.
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


def _keep_largest_components(mask: np.ndarray, min_area_ratio: float = 0.005) -> np.ndarray:
    """Keep only foreground blobs >= min_area_ratio * total pixels. Removes floaters."""
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    total = mask.shape[0] * mask.shape[1]
    min_area = int(total * min_area_ratio)

    out = np.zeros_like(mask)
    # Label 0 is background — skip it
    areas = stats[1:, cv2.CC_STAT_AREA]
    if len(areas) == 0:
        return mask  # nothing to filter

    # Always keep the largest component regardless of ratio
    max_label = int(np.argmax(areas)) + 1
    for label_idx in range(1, num_labels):
        area = stats[label_idx, cv2.CC_STAT_AREA]
        if area >= min_area or label_idx == max_label:
            out[labels == label_idx] = 255
    return out


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    """Fill interior holes (background pockets completely enclosed by foreground)."""
    h, w = mask.shape
    inverted = 255 - mask  # 0=subject, 255=background
    # Border=255 so flood fill can reach all border-connected background
    padded = cv2.copyMakeBorder(inverted, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
    flood = np.zeros((h + 4, w + 4), np.uint8)
    # Fill all background connected to image border with 0 (mark as reachable)
    cv2.floodFill(padded, flood, (0, 0), 0)
    inner = padded[1:-1, 1:-1]
    # Pixels still 255 = background NOT reachable from border = interior holes
    holes = (inner == 255).astype(np.uint8) * 255
    return cv2.bitwise_or(mask, holes)


def _decontaminate_edges(rgba: np.ndarray) -> np.ndarray:
    """
    Remove background color fringe on semi-transparent edge pixels.
    For each partially-transparent pixel: estimates nearby opaque BG contribution
    and subtracts it from the RGB channels.
    """
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    semi_mask = (alpha > 0.05) & (alpha < 0.95)
    if not semi_mask.any():
        return rgba

    result = rgba.copy().astype(np.float32)

    # Estimate local background from surrounding fully-transparent pixels via dilation
    bg_sample = rgba[:, :, :3].astype(np.float32)
    transparent_mask = (rgba[:, :, 3] < 10).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    # Spread transparent pixel colors inward as BG estimate
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
    """
    Edge-aware alpha smoothing: joint bilateral using RGB as guide.
    Preserves hard object edges while smoothing staircase aliasing.
    Falls back to bilateral on alpha alone if ximgproc unavailable.
    """
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


async def contour_clip(image_bytes: bytes, mask_bytes: bytes = None, mode: str = 'manual', refine: bool = False, colors: list = None, tolerance: int = 30) -> bytes:
    """
    Advanced Contour Clipping.
    
    Production routing architecture:
    - mode='auto': Neural inference (rembg) → Cloud GPU (Modal T4)
                    Post-processing (chromakey, morphology, decontamination) → CPU (Koyeb)
                    Falls back to CPU rembg if GPU unavailable.
    - mode='manual': GrabCut — CPU only (no GPU needed).
    
    Dimension limit (MAX_DIMENSION_CPU=4000px) enforced in production to prevent OOM.
    """
    img_pil = read_image_file(image_bytes).convert("RGB")

    # Production dimension limit — avoid OOM on cloud CPU instances
    w_orig, h_orig = img_pil.size
    max_dim = MAX_DIMENSION_CPU
    if max(w_orig, h_orig) > max_dim:
        scale = max_dim / max(w_orig, h_orig)
        new_w, new_h = int(w_orig * scale), int(h_orig * scale)
        logger.info(f"   📏 Downscaling {w_orig}x{h_orig} → {new_w}x{new_h} (max {max_dim}px)")
        img_pil = img_pil.resize((new_w, new_h), Image.LANCZOS)
        img_pil = img_pil.convert("RGB")
        buf = io.BytesIO()
        img_pil.save(buf, format='PNG')
        image_bytes = buf.getvalue()

    img_cv = pil_to_cv2(img_pil)
    h, w = img_cv.shape[:2]

    if mode == 'auto':
        if _should_use_cloud_gpu("contour-clip"):
            import json as _json
            logger.info(f"🔬 Auto contour clip ({w}x{h}) — Full pipeline → Cloud GPU (Modal)")
            form = {
                "colors": _json.dumps(colors if colors else []),
                "tolerance": str(tolerance),
            }
            return await _call_cloud_gpu_with_retry("contour-clip", image_bytes, data=form)

        accelerator = _get_local_accelerator()
        logger.info(f"🔬 Auto contour clip ({w}x{h}) — Local engine (accelerator: {accelerator.upper()})")

        # Original image for color analysis (rembg may zero RGB in transparent pixels)
        orig_rgb = np.array(img_pil)  # (h, w, 3) RGB

        # 1. Neural inference via rembg
        rembg_res = await remove_background(image_bytes, model="u2net", alpha_matting=False)
        rgba = np.array(Image.open(io.BytesIO(rembg_res)).convert("RGBA"))
        if rgba.shape[:2] != (h, w):
            rgba = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_LINEAR)
        soft_alpha = rgba[:, :, 3].copy()

        # 2. Force alpha=0 on pixels matching user-supplied BG color hints
        if colors:
            data_lab = cv2.cvtColor(rgba[:, :, :3].astype(np.uint8), cv2.COLOR_RGB2LAB)
            for color in colors:
                target_lab = cv2.cvtColor(
                    np.array([[color[:3]]], dtype=np.uint8),
                    cv2.COLOR_RGB2LAB
                )[0, 0]
                dist = np.linalg.norm(data_lab.astype(np.float32) - target_lab.astype(np.float32), axis=2)
                soft_alpha[dist <= tolerance] = 0

        # 3. Build birefnet hint mask → keep largest → dilate HEAVILY to form ROI
        birefnet_hint = (soft_alpha > 30).astype(np.uint8) * 255
        birefnet_hint = _keep_largest_components(birefnet_hint, min_area_ratio=0.005)

        roi_kernel_sz = max(_ROI_DILATE_MIN, min(h, w) // _ROI_DILATE_RATIO)
        if roi_kernel_sz % 2 == 0:
            roi_kernel_sz += 1
        roi_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (roi_kernel_sz, roi_kernel_sz))
        roi = cv2.dilate(birefnet_hint, roi_kernel, iterations=1)

        # 4. Estimate bg color from ORIGINAL image (corners first, fallback to ring)
        bg_color = _estimate_bg_color_from_image(orig_rgb, birefnet_hint)
        logger.info(f"   bg_color estimate: {bg_color.tolist()}")

        # 5. Chromakey inside ROI: pixels whose color differs from bg → subject
        orig_int = orig_rgb.astype(np.int32)
        color_dist = np.linalg.norm(orig_int - bg_color[np.newaxis, np.newaxis, :], axis=2)
        chroma_mask = (color_dist > _CHROMA_THRESHOLD).astype(np.uint8) * 255
        chroma_in_roi = cv2.bitwise_and(chroma_mask, roi)

        # 6. Combine: (birefnet strong) OR (chroma inside ROI)
        combined = cv2.bitwise_or(birefnet_hint, chroma_in_roi)
        combined = _keep_largest_components(combined, min_area_ratio=0.005)
        combined = _fill_holes(combined)

        # 7. Alpha assembly:
        #    - Outside combined → 0
        #    - Inside combined where birefnet was soft-uncertain (hair/fur) → preserve soft_alpha
        #    - Inside combined otherwise → 255
        final_alpha = np.zeros_like(soft_alpha)
        inside = combined > 0
        soft_zone = inside & (soft_alpha >= 40) & (soft_alpha < 220)
        final_alpha[inside] = 255
        final_alpha[soft_zone] = np.maximum(soft_alpha[soft_zone], final_alpha[soft_zone])

        # Restore RGB from original (avoid rembg zeroing bg pixels)
        rgba[:, :, :3] = orig_rgb
        rgba[:, :, 3] = final_alpha

        # 8. Edge-aware alpha smoothing (joint bilateral guided by RGB)
        rgba = _smooth_alpha_edge_aware(rgba)

        # 9. Color decontamination — remove BG color fringe on semi-transparent edges
        rgba = _decontaminate_edges(rgba)

        logger.info("✅ Auto contour clip complete")
        return pil_to_bytes(Image.fromarray(rgba))

    # ── Manual Mode (GrabCut) — CPU only, no GPU needed ───────────────────────
    if not mask_bytes:
        return await remove_background(image_bytes)

    logger.info(f"✂️ Manual contour clip ({w}x{h}) — GrabCut (CPU)")

    mask_pil = read_image_file(mask_bytes).convert("L")
    mask_cv = np.array(mask_pil)
    if mask_cv.shape[:2] != (h, w):
        mask_cv = cv2.resize(mask_cv, (w, h), interpolation=cv2.INTER_NEAREST)
    _, mask_binary = cv2.threshold(mask_cv, 127, 255, cv2.THRESH_BINARY)

    if np.sum(mask_binary) == 0:
        return await remove_background(image_bytes)

    if refine:
        gc_mask = np.full((h, w), cv2.GC_BGD, dtype=np.uint8)
        search_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (40, 40))
        search_area = cv2.dilate(mask_binary, search_kernel, iterations=1)
        gc_mask[search_area > 0] = cv2.GC_PR_BGD
        gc_mask[mask_binary > 0] = cv2.GC_PR_FGD
        core_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        forest_core = cv2.erode(mask_binary, core_kernel, iterations=2)
        gc_mask[forest_core > 0] = cv2.GC_FGD
    else:
        gc_mask = np.full((h, w), cv2.GC_PR_BGD, dtype=np.uint8)
        gc_mask[mask_binary > 0] = cv2.GC_FGD

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    try:
        cv2.grabCut(img_cv, gc_mask, None, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
    except Exception as e:
        logger.error(f"GrabCut error: {e}")
        return await remove_background(image_bytes)

    mask_res = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    if refine:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask_res = cv2.morphologyEx(mask_res, cv2.MORPH_OPEN, kernel, iterations=1)
        mask_res = cv2.dilate(mask_res, kernel, iterations=1)

    img_rgba = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGBA)
    img_rgba[mask_res == 0, 3] = 0

    if refine:
        img_rgba[:, :, 3] = cv2.GaussianBlur(img_rgba[:, :, 3], (3, 3), 0)

    logger.info(f"✅ Manual contour clip complete ({w}x{h})")
    return pil_to_bytes(Image.fromarray(img_rgba))

def apply_watermark(base_bytes: bytes, watermark_bytes: bytes, x: int, y: int, scale: float = 1.0, shape: str = "original") -> bytes:
    """
    Overlays a watermark image onto a base image at specific coordinates.
    scale: resizing factor relative to the watermark size
    shape: 'original', 'circle', 'square', 'rect-4-3', 'rect-3-4'
    """
    base_img = read_image_file(base_bytes).convert("RGBA")
    watermark_img = read_image_file(watermark_bytes).convert("RGBA")
    
    # 1. Apply Shape Crop/Mask (before resize for better quality)
    w, h = watermark_img.size
    
    if shape == "circle":
        # Crop to square
        size = min(w, h)
        left = (w - size) // 2
        top = (h - size) // 2
        watermark_img = watermark_img.crop((left, top, left + size, top + size))
        
        # Apply circle mask
        mask = Image.new("L", (size, size), 0)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size, size), fill=255)
        
        # Apply mask to alpha channel
        existing_alpha = watermark_img.split()[3]
        combined_mask = Image.fromarray(np.minimum(np.array(existing_alpha), np.array(mask)))
        watermark_img.putalpha(combined_mask)
        
    elif shape == "square":
        size = min(w, h)
        left = (w - size) // 2
        top = (h - size) // 2
        watermark_img = watermark_img.crop((left, top, left + size, top + size))
        
    elif shape == "rect-4-3":
        # Width should be 4/3 of Height OR Height should be 3/4 of Width?
        # Target aspect ratio 1.333
        current_ar = w / h
        target_ar = 4/3
        
        if current_ar > target_ar:
            # Too wide, crop width
            new_w = int(h * target_ar)
            left = (w - new_w) // 2
            watermark_img = watermark_img.crop((left, 0, left + new_w, h))
        else:
            # Too tall, crop height
            new_h = int(w / target_ar)
            top = (h - new_h) // 2
            watermark_img = watermark_img.crop((0, top, w, top + new_h))

    elif shape == "rect-3-4":
        # Target aspect ratio 0.75
        current_ar = w / h
        target_ar = 3/4
        
        if current_ar > target_ar:
            # Too wide, crop width
            new_w = int(h * target_ar)
            left = (w - new_w) // 2
            watermark_img = watermark_img.crop((left, 0, left + new_w, h))
        else:
            # Too tall, crop height
            new_h = int(w / target_ar)
            top = (h - new_h) // 2
            watermark_img = watermark_img.crop((0, top, w, top + new_h))
    
    # 2. Resize
    if scale != 1.0:
        new_w = int(watermark_img.width * scale)
        new_h = int(watermark_img.height * scale)
        # Use high quality resizing
        watermark_img = watermark_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # 3. Paste (x, y is the center of the watermark)
    transparent_layer = Image.new('RGBA', base_img.size, (0, 0, 0, 0))
    final_w, final_h = watermark_img.size
    paste_x = x - final_w // 2
    paste_y = y - final_h // 2
    transparent_layer.paste(watermark_img, (paste_x, paste_y), mask=watermark_img)
    
    combined_img = Image.alpha_composite(base_img, transparent_layer)

    return pil_to_bytes(combined_img)

FILTERS = {
    'grayscale': lambda img: img.convert('L').convert('RGBA'),
    'sepia': lambda img: _apply_sepia(img),
    'vintage': lambda img: _apply_vintage(img),
    'cinematic': lambda img: _apply_cinematic(img),
    'vivid': lambda img: ImageEnhance.Color(img).enhance(1.8),
    'cool': lambda img: _apply_cool_tint(img),
    'warm': lambda img: _apply_warm_tint(img),
    'fade': lambda img: _apply_fade(img),
    'noir': lambda img: _apply_noir(img),
    'dramatic': lambda img: _apply_dramatic(img),
}

def _apply_sepia(img: Image.Image) -> Image.Image:
    pixels = np.array(img, dtype=np.float32)
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    tr = (0.393 * r + 0.769 * g + 0.189 * b).clip(0, 255)
    tg = (0.349 * r + 0.686 * g + 0.168 * b).clip(0, 255)
    tb = (0.272 * r + 0.534 * g + 0.131 * b).clip(0, 255)
    result = np.stack([tr, tg, tb], axis=-1).astype(np.uint8)
    return Image.fromarray(result, 'RGB')

def _apply_vintage(img: Image.Image) -> Image.Image:
    img = ImageEnhance.Contrast(img).enhance(0.8)
    img = ImageEnhance.Brightness(img).enhance(1.1)
    img = ImageEnhance.Color(img).enhance(0.7)
    img = img.convert('RGB')
    pixels = np.array(img, dtype=np.float32)
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    tr = (0.5 * r + 0.4 * g + 0.1 * b).clip(0, 255)
    tg = (0.2 * r + 0.6 * g + 0.2 * b).clip(0, 255)
    tb = (0.1 * r + 0.3 * g + 0.5 * b).clip(0, 255)
    result = np.stack([tr, tg, tb], axis=-1).astype(np.uint8)
    return Image.fromarray(result, 'RGB')

def _apply_cinematic(img: Image.Image) -> Image.Image:
    img = ImageEnhance.Contrast(img).enhance(1.3)
    img = ImageEnhance.Color(img).enhance(0.85)
    img = img.convert('RGB')
    pixels = np.array(img, dtype=np.float32)
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    teal = (0.0 * r + 0.3 * g + 0.4 * b).clip(0, 255)
    orange = (0.6 * r + 0.3 * g + 0.1 * b).clip(0, 255)
    result = np.stack([orange, g * 0.9, teal], axis=-1).astype(np.uint8)
    return Image.fromarray(result, 'RGB')

def _apply_cool_tint(img: Image.Image) -> Image.Image:
    img = img.convert('RGB')
    pixels = np.array(img, dtype=np.float32)
    pixels[:, :, 2] = (pixels[:, :, 2] * 1.2).clip(0, 255)
    pixels[:, :, 0] = (pixels[:, :, 0] * 0.9).clip(0, 255)
    return Image.fromarray(pixels.astype(np.uint8), 'RGB')

def _apply_warm_tint(img: Image.Image) -> Image.Image:
    img = img.convert('RGB')
    pixels = np.array(img, dtype=np.float32)
    pixels[:, :, 0] = (pixels[:, :, 0] * 1.15).clip(0, 255)
    pixels[:, :, 1] = (pixels[:, :, 1] * 1.05).clip(0, 255)
    pixels[:, :, 2] = (pixels[:, :, 2] * 0.85).clip(0, 255)
    return Image.fromarray(pixels.astype(np.uint8), 'RGB')

def _apply_fade(img: Image.Image) -> Image.Image:
    img = ImageEnhance.Contrast(img).enhance(0.7)
    img = ImageEnhance.Brightness(img).enhance(1.15)
    img = img.convert('RGB')
    pixels = np.array(img, dtype=np.float32)
    pixels = (pixels * 0.8 + 30).clip(0, 255)
    return Image.fromarray(pixels.astype(np.uint8), 'RGB')

def _apply_noir(img: Image.Image) -> Image.Image:
    img = img.convert('L').convert('RGB')
    img = ImageEnhance.Contrast(img).enhance(1.4)
    return img

def _apply_dramatic(img: Image.Image) -> Image.Image:
    img = ImageEnhance.Contrast(img).enhance(1.6)
    img = ImageEnhance.Brightness(img).enhance(0.9)
    img = ImageEnhance.Color(img).enhance(1.3)
    return img

def apply_filter(image_bytes: bytes, filter_name: str, intensity: float = 1.0) -> bytes:
    if filter_name not in FILTERS:
        raise ValueError(f"Unknown filter: {filter_name}")
    img = read_image_file(image_bytes)
    has_alpha = img.mode == 'RGBA'
    if has_alpha:
        alpha = img.split()[3]
    base = img.convert('RGB')
    filtered = FILTERS[filter_name](base).convert('RGB')
    if intensity < 1.0:
        filtered = Image.blend(base, filtered, intensity)
    if has_alpha:
        filtered = filtered.convert('RGBA')
        filtered.putalpha(alpha)
    return pil_to_bytes(filtered)

def color_correct(image_bytes: bytes, hue: float = 0, saturation: float = 1.0, lightness: float = 1.0) -> bytes:
    img = read_image_file(image_bytes)
    has_alpha = img.mode == 'RGBA'
    if has_alpha:
        alpha = img.split()[3]
    img = img.convert('RGB')
    arr = np.array(img, dtype=np.float32) / 255.0
    import colorsys
    hls_arr = np.zeros_like(arr)
    for i in range(arr.shape[0]):
        for j in range(arr.shape[1]):
            r, g, b = arr[i, j]
            h, l, s = colorsys.rgb_to_hls(r, g, b)
            h = (h + hue / 360.0) % 1.0
            s = min(1.0, s * saturation)
            l = min(1.0, l * lightness)
            hls_arr[i, j] = colorsys.hls_to_rgb(h, l, s)
    result = (hls_arr * 255).clip(0, 255).astype(np.uint8)
    out = Image.fromarray(result, 'RGB')
    if has_alpha:
        out = out.convert('RGBA')
        out.putalpha(alpha)
    return pil_to_bytes(out)

def transform_image(image_bytes: bytes, rotation: float = 0, flip_h: bool = False, flip_v: bool = False) -> bytes:
    img = read_image_file(image_bytes)
    if rotation != 0:
        img = img.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)
    if flip_h:
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if flip_v:
        img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    return pil_to_bytes(img)


# ─── Orphaned Task Rescue ────────────────────────────────────────────────────

_ORPHAN_THRESHOLD_SECONDS = 300  # 5 minutes


async def rescue_orphan_tasks(orphan_threshold_seconds: int = _ORPHAN_THRESHOLD_SECONDS) -> int:
    """
    Finds PENDING tasks older than threshold and marks them as FAILED.
    Background tasks are in-memory only — if Koyeb restarts/scales, the task
    record stays PENDING forever. This rescue worker detects and cleans them up.

    Returns the number of rescued tasks.
    """
    import time as _time
    from datetime import datetime, timedelta, timezone

    db = SessionLocal()
    rescued = 0
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=orphan_threshold_seconds)
        orphaned = (
            db.query(models.ProcessingTask)
            .filter(
                models.ProcessingTask.status == "PENDING",
                models.ProcessingTask.created_at < cutoff
            )
            .all()
        )

        for task in orphaned:
            logger.warning(f"🚨 Rescuing orphaned task {task.id} (created {task.created_at})")
            task.status = "FAILED"
            task.error = "Task was lost due to server restart or timeout. Please retry."
            task.updated_at = datetime.now(timezone.utc)
            rescued += 1

            # Also update the audit log
            audit = (
                db.query(models.ProcessingAuditLog)
                .filter(models.ProcessingAuditLog.task_id == task.id)
                .first()
            )
            if audit and audit.status == "PENDING":
                audit.status = "FAILED"
                audit.error_message = "Task was lost due to server restart or timeout."

        if rescued > 0:
            db.commit()
            logger.info(f"✅ Rescued {rescued} orphaned task(s)")

    except Exception as e:
        logger.error(f"❌ Error in rescue_orphan_tasks: {e}")
        db.rollback()
    finally:
        db.close()

    return rescued


async def _rescue_worker_loop(interval_seconds: int = 120):
    """
    Periodic background worker that rescues orphaned PENDING tasks.
    Runs every `interval_seconds` (default: 2 minutes).
    """
    import asyncio
    logger.info("🔍 Orphan task rescue worker started (interval: %ds)", interval_seconds)
    while True:
        try:
            await rescue_orphan_tasks()
        except Exception as e:
            logger.error(f"❌ Rescue worker iteration failed: {e}")
        await asyncio.sleep(interval_seconds)
