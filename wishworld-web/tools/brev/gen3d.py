"""WishWorld's 3D generator on the team's Brev GPU (see README.md beside this file).

    POST /generate  {"prompt": "...", "image_prompt": "..."}   -> model/gltf-binary   a wish, from words
    POST /image3d   raw image bytes (Content-Type image/*)       -> model/gltf-binary   a scan, from a photo
    GET  /health                                                 -> {"ok": true, ...}

Words become a picture with SDXL-Turbo (one step, about a second on an L40S), and a picture becomes a
textured model with TRELLIS, running as the public Hugging Face Space's own container on this machine
(http://127.0.0.1:7860, never exposed). Every request needs the header  x-key: <GEN3D_KEY>.
WishWorld's server slims every model for the Quest 2 afterwards, so nothing is simplified here.
"""
import io
import os
import tempfile
import threading
import time

import torch
import uvicorn
from diffusers import AutoPipelineForText2Image
from fastapi import FastAPI, HTTPException, Request, Response
from gradio_client import Client, handle_file

KEY = os.environ.get("GEN3D_KEY", "")
TRELLIS = os.environ.get("TRELLIS_URL", "http://127.0.0.1:7860")
app = FastAPI()
lock = threading.Lock()          # one generation at a time: the GPU is shared with Nemotron
state = {"pipe": None, "trellis": None, "served": 0}


def check(request: Request):
    if not KEY or request.headers.get("x-key", "") != KEY:
        raise HTTPException(status_code=401, detail="bad key")


def picture_pipe():
    if state["pipe"] is None:
        pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16")
        state["pipe"] = pipe.to("cuda")
    return state["pipe"]


def trellis():
    if state["trellis"] is None:
        state["trellis"] = Client(TRELLIS, verbose=False)
    return state["trellis"]


def image_to_glb(path: str) -> bytes:
    c = trellis()
    try:
        c.predict(api_name="/start_session")
    except Exception:
        pass
    cut = c.predict(image=handle_file(path), api_name="/preprocess_image")
    # (image, multi-view images, seed, structure guidance, structure steps, detail guidance, detail steps,
    #  multi-image algorithm, simplify, texture size); the Space's session state is not passed by the client.
    out = c.predict(handle_file(cut), [], 0, 7.5, 12, 3, 12, "stochastic", 0.95, 1024, api_name="/generate_and_extract_glb")
    glb = None
    for item in (out if isinstance(out, (list, tuple)) else [out]):
        p = item.get("value") if isinstance(item, dict) else item
        if isinstance(p, str) and p.endswith(".glb") and os.path.exists(p):
            glb = p
    if not glb:
        raise HTTPException(status_code=502, detail="TRELLIS gave no model")
    with open(glb, "rb") as f:
        return f.read()


@app.get("/health")
def health():
    return {"ok": True, "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None, "served": state["served"]}


@app.post("/generate")
async def generate(request: Request):
    check(request)
    body = await request.json()
    prompt = str(body.get("image_prompt") or body.get("prompt") or "").strip()[:400]
    if not prompt:
        raise HTTPException(status_code=400, detail="no prompt")
    t0 = time.time()
    with lock:
        img = picture_pipe()(prompt=prompt, num_inference_steps=1, guidance_scale=0.0, height=768, width=768).images[0]
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            img.save(tmp.name)
            glb = image_to_glb(tmp.name)
    state["served"] += 1
    return Response(glb, media_type="model/gltf-binary", headers={"x-ms": str(int((time.time() - t0) * 1000))})


@app.post("/image3d")
async def image3d(request: Request):
    check(request)
    data = await request.body()
    if not data or len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="send one image, at most 8 MB")
    t0 = time.time()
    with lock:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(data)
        glb = image_to_glb(tmp.name)
    state["served"] += 1
    return Response(glb, media_type="model/gltf-binary", headers={"x-ms": str(int((time.time() - t0) * 1000))})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8002")))
