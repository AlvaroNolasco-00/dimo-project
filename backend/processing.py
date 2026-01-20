import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import io
import os
import httpx

# GPU Service Configuration
# GPU Service Configuration
# We support distinct URLs for each microservice (Modal/Serverless style)
GPU_UPSCALE_URL = os.getenv("GPU_UPSCALE_URL") # Full URL e.g. https://...modal.run
GPU_REMOVER_URL = os.getenv("GPU_REMOVER_URL") # Full URL e.g. https://...modal.run
GPU_SERVICE_SECRET = os.getenv("GPU_SERVICE_SECRET")

async def call_gpu_service(service_type: str, image_bytes: bytes, params: dict = None) -> bytes:
    """
    Helper to call the GPU worker service.
    service_type: 'upscale' or 'remove-background'
    """
    url = None
    if service_type == "upscale":
        url = GPU_UPSCALE_URL
    elif service_type == "remove-background":
        url = GPU_REMOVER_URL
    
    if not url:
        # If specific URL not found, check if legacy monolithic URL is set (Koyeb fallback)
        base_url = os.getenv("GPU_SERVICE_URL")
        if base_url:
             url = f"{base_url}/{service_type}"
        else:
             raise ValueError(f"No configured URL for GPU service: {service_type}")

    headers = {"x-api-key": GPU_SERVICE_SECRET} if GPU_SERVICE_SECRET else {}
    
    # 60s timeout for Cold Starts
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Prepare multipart/form-data
        files = {"file": ("image.png", image_bytes, "image/png")}
        
        # httpx merges params into query string or form? 
        # For our GPU service, we defined params as query params in main.py?
        # main.py: upscale(file=..., scale=...) -> scale is query param (default) or Form.
        # Let's check main.py... `scale: float = 2.0` in FastAPI is Query by default unless File/Form used.
        # Since we use File(...), other args usually become Query unless explicitly Form.
        # Use query params for simplicity.
        
        response = await client.post(url, files=files, params=params, headers=headers)
        
        if response.status_code != 200:
            raise Exception(f"GPU Service Failed: {response.status_code} - {response.text}")
            
        return response.content

def read_image_file(file_bytes: bytes) -> Image.Image:
    """Reads image bytes and returns a PIL Image. Preserves Alpha if present."""
    img = Image.open(io.BytesIO(file_bytes))
    if img.mode not in ("RGB", "RGBA"):
        return img.convert("RGB")
    return img

def pil_to_bytes(image: Image.Image) -> bytes:
    """Converts PIL Image to bytes."""
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='PNG')
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

# 1. Remover Objetos (Inpainting Avanzado)
def remove_objects(image_bytes: bytes, mask_bytes: bytes) -> bytes:
    """
    Removes objects using a high-precision approach:
    1. Adaptive masking to cover shadows.
    2. Background pre-filling to prevent color bleeding from the object.
    3. Multi-stage inpainting for better texture.
    4. Texture/Grain restoration.
    """
    # Read image and mask
    img_pil = read_image_file(image_bytes)
    mask_pil = read_image_file(mask_bytes).convert('L')

    img_cv = pil_to_cv2(img_pil)
    mask_cv = np.array(mask_pil)
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

    # 4. Texture Restoration (Add subtle grain)
    # This prevents the area from looking like a flat plastic spot
    noise = np.random.normal(0, 1.5, (h, w, 3)).astype(np.float32)
    res_float = res_cv.astype(np.float32) + noise
    res_cv = np.clip(res_float, 0, 255).astype(np.uint8)

    # 5. Smooth Blending with original edges
    mask_blurred = cv2.GaussianBlur(mask_dilated, (kernel_size * 2 + 1, kernel_size * 2 + 1), 0)
    alpha = mask_blurred.astype(float) / 255.0
    alpha = cv2.merge([alpha, alpha, alpha])
    
    final_cv = (res_cv.astype(float) * alpha + img_cv.astype(float) * (1.0 - alpha))
    final_cv = np.clip(final_cv, 0, 255).astype(np.uint8)

    return pil_to_bytes(cv2_to_pil(final_cv))

def create_mask_from_point(image_bytes: bytes, x: int, y: int, tolerance: int = 30) -> bytes:
    """
    Creates a mask using flood fill from a single point (Magic Wand style).
    x, y: Coordinates of the click
    tolerance: Color similarity threshold (0-255)
    Returns: Mask image as bytes
    """
    img_pil = read_image_file(image_bytes)
    img_cv = pil_to_cv2(img_pil)
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
    
    # Convert to PIL Image
    mask_pil = Image.fromarray(mask)
    return pil_to_bytes(mask_pil)

# 2. Quitar Fondo
async def remove_background(image_bytes: bytes) -> bytes:
    """
    Removes background. Tries GPU service first, falls back to CPU (rembg).
    """
    if GPU_REMOVER_URL:
        try:
            return await call_gpu_service("remove-background", image_bytes)
        except Exception as e:
            print(f"GPU BG Removal failed, falling back to CPU: {e}")
            pass

    # Legacy Fallback (CPU)
    from rembg import remove
    output_bytes = remove(image_bytes)
    return output_bytes

# ... (omitted unrelated code)

# 4. Aumentar Resolución (Upscaling)
async def upscale_image(image_bytes: bytes, factor=2, detail_boost=1.5) -> bytes:
    """
    Upscales image using AI (Real-ESRGAN) via GPU Service.
    Falls back to legacy Lanczos if GPU_UPSCALE_URL is not set.
    """
    if GPU_UPSCALE_URL:
        try:
            return await call_gpu_service("upscale", image_bytes, params={"scale": factor})
        except Exception as e:
            print(f"GPU Upscale failed, falling back to CPU: {e}")
            # Fallback to local (CPU)
            pass
            
    # Legacy Fallback (CPU)
    return upscale_image_legacy(image_bytes, factor, detail_boost)

def upscale_image_legacy(image_bytes: bytes, factor=2, detail_boost=1.5) -> bytes:
    """Legacy CPU upscaling using Lanczos."""
    img_pil = read_image_file(image_bytes)
    width, height = img_pil.size
    MAX_DIMENSION = 10000
    
    new_width = int(width * factor)
    new_height = int(height * factor)
    
    if new_width > MAX_DIMENSION or new_height > MAX_DIMENSION:
        raise ValueError(f"Upscale factor too large. Resulting image would exceed {MAX_DIMENSION}x{MAX_DIMENSION} pixels.")
    
    if width < 1000:
        img_pil = img_pil.filter(ImageFilter.MedianFilter(size=3))

    res_pil = img_pil.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    if detail_boost > 0:
        radius = 1 + (factor / 4)
        percent = int(100 * detail_boost)
        res_pil = res_pil.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=3))
    
    return pil_to_bytes(res_pil)

def generate_halftone(image_bytes: bytes, dot_size: int = 10, scale: float = 1.0, remove_colors: list = None, tolerance: int = 30, spacing: int = 0) -> bytes:
    """
    Advanced halftone for professional screen printing (Iteration 3).
    - spacing: pixels to subtract from dot radius to enforce separation.
    """
    img_pil = read_image_file(image_bytes).convert("RGBA")
    img_np = np.array(img_pil).astype(np.float32)
    h, w = img_np.shape[:2]
    
    # 1. Base/Shirt Color
    # Default to Black if no color provided
    shirt_color = np.array(remove_colors[0], dtype=np.float32) if remove_colors and len(remove_colors) > 0 else np.array([0, 0, 0], dtype=np.float32)
    
    # 2. Output Image (Transparent BG)
    output = np.zeros((h, w, 4), dtype=np.uint8)
    
    # Pre-calculated constants
    max_dist = np.sqrt(3 * (255**2))
    
    # 3. Process image in a grid
    for y in range(0, h, dot_size):
        for x in range(0, w, dot_size):
            y_end = min(y + dot_size, h)
            x_end = min(x + dot_size, w)
            
            cell = img_np[y:y_end, x:x_end]
            if cell.size == 0: continue
            
            # Average color of the cell (ignoring transparency if already present)
            mask_active = cell[:, :, 3] > 10
            if np.any(mask_active):
                avg_rgba = np.mean(cell[mask_active], axis=0)
            else:
                avg_rgba = np.mean(cell, axis=0)
            
            avg_rgb = avg_rgba[:3]
            
            # 4. Color Knockout Logic
            # Calculate how 'different' the color is from the shirt color
            # We use a more aggressive distance for 'solid' colors
            dist = np.linalg.norm(avg_rgb - shirt_color)
            
            # Normalize Alpha based on tolerance and distance
            # If distance < tolerance, alpha is 0
            # Otherwise, it scales up to 1.0
            t_low = tolerance * 1.5 
            if dist <= t_low:
                alpha = 0
            else:
                # Scale from t_low to max possible distance
                alpha = (dist - t_low) / (max_dist - t_low)
                
            # Gamma adjustment/Midtone boost
            # This ensures that subtle differences from the shirt color still produce dots
            alpha = np.power(alpha, 0.6) # Professional boost for visibility
            
            # Calculate dot radius
            # Dots should overlap slightly at 100% to create solid color
            # BUT we subtract 'spacing' (half from radius) if provided
            max_r = (dot_size / 2) * 1.4 * scale
            
            # Apply separation
            # We subtract spacing/2 from radius because spacing is total gap between two dots
            radius = int((alpha * max_r) - (spacing / 2))
            
            if radius > 0:
                center_x = x + (x_end - x) // 2
                center_y = y + (y_end - y) // 2
                
                # 5. Ink Color Reconstruction (Un-blending)
                # If C_pixel = Alpha * C_ink + (1 - Alpha) * C_shirt
                # then C_ink = (C_pixel - (1 - Alpha) * C_shirt) / Alpha
                # We cap it to [0, 255]
                if alpha > 0.1:
                    reconstructed_rgb = (avg_rgb - (1 - alpha) * shirt_color) / alpha
                    reconstructed_rgb = np.clip(reconstructed_rgb, 0, 255).astype(np.uint8)
                else:
                    reconstructed_rgb = avg_rgb.astype(np.uint8)
                
                color_bgr = (int(reconstructed_rgb[2]), int(reconstructed_rgb[1]), int(reconstructed_rgb[0]), 255)
                cv2.circle(output, (center_x, center_y), radius, color_bgr, -1, cv2.LINE_AA)

    return pil_to_bytes(cv2_to_pil(output))
async def contour_clip(image_bytes: bytes, mask_bytes: bytes = None, mode: str = 'manual', refine: bool = False, colors: list = None, tolerance: int = 30) -> bytes:
    """
    Advanced Contour Clipping (GrabCut or Automatic).
    - If mode == 'manual', uses user strokes as 'Definite Foreground'.
    - If mode == 'auto', uses 'rembg' (via GPU service if avail) (with optional color hints).
    - If refine == True, uses GrabCut snapped refinement.
    """
    img_pil = read_image_file(image_bytes).convert("RGB")
    img_cv = pil_to_cv2(img_pil)
    h, w = img_cv.shape[:2]

    if mode == 'auto':
        # 1. Get initial mask from rembg (Use our async wrapper which tries GPU)
        rembg_res = await remove_background(image_bytes)
        
        rembg_pil = Image.open(io.BytesIO(rembg_res)).convert("L")
        rembg_mask = np.array(rembg_pil)
        
        if rembg_mask.shape[:2] != (h, w):
            rembg_mask = cv2.resize(rembg_mask, (w, h), interpolation=cv2.INTER_NEAREST)
            
        if not colors:
            return rembg_res

        # 2. Hybrid Mode: Refine rembg mask with specific color hints
        # Create GrabCut mask from rembg mask
        # rembg is usually very confident, but we'll mark it as Probable Foreground
        gc_mask = np.where(rembg_mask > 200, cv2.GC_PR_FGD, cv2.GC_BGD).astype(np.uint8)
        
        # Add color-based Definite Background hints
        if colors:
            data_rgb = np.array(img_pil)
            for color in colors:
                target = np.array(color)
                diff = data_rgb - target
                dist = np.linalg.norm(diff, axis=2)
                color_mask = dist <= tolerance
                # If color matches, it's definitely background
                gc_mask[color_mask] = cv2.GC_BGD
    
    else: # Manual Mode
        if not mask_bytes:
            return await remove_background(image_bytes)

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
        iterations = 10 if (refine or mode == 'auto') else 5
        cv2.grabCut(img_cv, gc_mask, None, bgd_model, fgd_model, iterations, cv2.GC_INIT_WITH_MASK)
    except Exception as e:
        print(f"GrabCut error: {e}")
        return await remove_background(image_bytes)
    
    # Final mask: where GrabCut says it is foreground
    mask_res = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    
    # 5. Post-processing to remove small artifacts and smooth edges
    if refine:
        # Remove small isolated noise (floaters)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask_res = cv2.morphologyEx(mask_res, cv2.MORPH_OPEN, kernel, iterations=1)
        
        # Slight dilation to ensure tips aren't cut off too aggressively
        mask_res = cv2.dilate(mask_res, kernel, iterations=1)
    
    # Set Alpha to 0 where it's not foreground
    img_rgba = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGBA)
    img_rgba[mask_res == 0, 3] = 0
    
    # 6. Smooth the Alpha edges to avoid jaggy borders
    if refine:
        alpha = img_rgba[:, :, 3]
        # Gaussian blur only on the alpha channel edges
        alpha_blurred = cv2.GaussianBlur(alpha, (3, 3), 0)
        img_rgba[:, :, 3] = alpha_blurred

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
    
    # 3. Paste
    transparent_layer = Image.new('RGBA', base_img.size, (0, 0, 0, 0))
    transparent_layer.paste(watermark_img, (x, y), mask=watermark_img)
    
    combined_img = Image.alpha_composite(base_img, transparent_layer)
    
    return pil_to_bytes(combined_img)
