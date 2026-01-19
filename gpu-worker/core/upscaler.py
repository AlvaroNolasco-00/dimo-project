import cv2
import numpy as np
import torch
from realesrgan import RealESRGANer
from basicsr.archs.rrdbnet_arch import RRDBNet
from PIL import Image

class Upscaler:
    def __init__(self, model_path='weights/RealESRGAN_x4plus.pth', device=None):
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
            tile=400, # Tile partition to avoid OOM on smaller GPUs
            tile_pad=10,
            pre_pad=0,
            half=True if 'cuda' in str(self.device) else False, # Use fp16 on CUDA
            device=self.device,
        )

    def process(self, image_bytes: bytes, out_scale=4) -> bytes:
        # Convert bytes to cv2 image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")

        # Run inference
        # output is the upscaled image (numpy array)
        try:
            output, _ = self.upsampler.enhance(img, outscale=out_scale)
        except RuntimeError as e:
            print(f"Error during upscaling: {e}")
            raise e

        # Convert back to bytes
        is_success, buffer = cv2.imencode(".png", output)
        if not is_success:
            raise ValueError("Failed to encode output image")
            
        return buffer.tobytes()
