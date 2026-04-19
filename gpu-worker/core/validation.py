import io
from PIL import Image

# Constants
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
