import httpx
import asyncio
import os

UPSCALE_URL = "https://alvaronolasco-00--dimo-gpu-worker-gpuworker-upscale.modal.run"
REMOVER_URL = "https://alvaronolasco-00--dimo-gpu-worker-gpuworker-remove-background.modal.run"
SECRET = "dev-secret-123"

async def test_endpoint(name, url, image_path):
    print(f"Testing {name}...")
    headers = {"x-api-key": SECRET}
    
    with open(image_path, "rb") as f:
        files = {"file": ("test.png", f.read(), "image/png")}
        
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(url, files=files, headers=headers)
            if response.status_code == 200:
                output_path = f"test_output_{name}.png"
                with open(output_path, "wb") as f:
                    f.write(response.content)
                print(f"✅ {name} success! Saved to {output_path}")
            else:
                print(f"❌ {name} failed: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"❌ {name} error: {e}")

async def main():
    # Use a local image if possible, otherwise skip or use a dummy
    test_image = "frontend/dist/frontend/browser/media/marker-icon-2V3QKKVC.png"
    if not os.path.exists(test_image):
        print(f"Test image {test_image} not found. Searching for any png...")
        # Just pick the first one from find if literal fail
        import glob
        pngs = glob.glob("**/*.png", recursive=True)
        if pngs:
            test_image = pngs[0]
        else:
            print("No png found in project to test.")
            return

    print(f"Using test image: {test_image}")
    await test_endpoint("upscale", UPSCALE_URL, test_image)
    await test_endpoint("remove_bg", REMOVER_URL, test_image)

if __name__ == "__main__":
    asyncio.run(main())
