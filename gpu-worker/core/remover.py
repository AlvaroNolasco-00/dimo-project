from rembg import remove, new_session
import numpy as np
from PIL import Image
import io

class BackgroundRemover:
    def __init__(self, model_name="u2net"):
        print(f"Initializing BackgroundRemover with {model_name}...")
        # Create a session once to load the model into GPU memory
        # 'u2net' is the general purpose model. 'isnet-general-use' is also good.
        self.session = new_session(model_name)

    def process(self, image_bytes: bytes) -> bytes:
        # rembg simply takes bytes and returns bytes
        # It handles the onnxruntime session internally if passed
        
        output = remove(image_bytes, session=self.session)
        return output
