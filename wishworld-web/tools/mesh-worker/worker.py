"""WishWorld local mesh worker: turns scanned photos into 3D models on this computer, for free.

It is an optional extra to the hosted routes the site already uses (see README.md). While it runs it asks
the site every few seconds for scans that are still waiting, builds a model for each with TripoSR (MIT
licence, runs on a plain CPU) and uploads the .glb. The site simplifies the model and marks the gift
ready; whichever of the site's own routes or this worker finishes first wins.

    python worker.py                       poll the site and work until stopped (Ctrl+C)
    python worker.py --once photo.jpg      build one model from a file and write photo.glb next to it
    python worker.py --once photo.jpg --out model.glb --resolution 192

Settings (environment variables, or KEY=VALUE lines in a file called .env beside this script):
    MESH_WORKER_KEY   required for polling: the same secret that is set on the site (Vercel)
    WISHWORLD_SITE    default https://wishworld-web.vercel.app
    TRIPOSR_DIR       folder holding the TripoSR source (the one that contains "tsr"); default ./TripoSR
    MESH_RESOLUTION   marching-cubes resolution, default 160 (higher = finer and slower; 256 is the maximum
                      that still fits the upload limit)
"""
from __future__ import annotations

import argparse
import base64
import io
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_env_file() -> None:
    """KEY=VALUE lines from .env beside this script become environment variables (real ones win)."""
    path = HERE / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def log(*parts) -> None:
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


# ---------------------------------------------------------------------------------------------- the model


class Mesher:
    """TripoSR, loaded once. build(photo bytes) -> .glb bytes."""

    def __init__(self, resolution: int):
        triposr_dir = Path(os.environ.get("TRIPOSR_DIR") or HERE / "TripoSR")
        if not (triposr_dir / "tsr" / "system.py").is_file():
            sys.exit(f"TripoSR source not found in {triposr_dir}. See README.md, step 3.")
        # shim/torchmcubes.py stands in for the torchmcubes package, which needs a C++ compiler to install.
        sys.path.insert(0, str(HERE / "shim"))
        sys.path.insert(0, str(triposr_dir))

        import numpy as np
        import rembg
        import torch
        from PIL import Image
        from tsr.system import TSR
        from tsr.utils import remove_background, resize_foreground, to_gradio_3d_orientation

        self.np, self.torch, self.Image = np, torch, Image
        self.remove_background, self.resize_foreground = remove_background, resize_foreground
        self.orient = to_gradio_3d_orientation
        self.resolution = resolution
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"

        started = time.time()
        log(f"loading TripoSR on {self.device} (the first run downloads about 1.7 GB of weights)...")
        self.model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
        self.model.renderer.set_chunk_size(8192)
        self.model.to(self.device)
        self.rembg_session = rembg.new_session("u2net")  # the small, freely licensed model (170 MB)
        log(f"model ready in {time.time() - started:.0f} s")

    def build(self, photo: bytes) -> bytes:
        np, torch, Image = self.np, self.torch, self.Image
        image = Image.open(io.BytesIO(photo)).convert("RGB")
        image.thumbnail((1024, 1024))
        cut = self.remove_background(image, self.rembg_session)
        cut = self.resize_foreground(cut, 0.85)
        arr = np.array(cut).astype(np.float32) / 255.0
        arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5  # grey behind the object, as TripoSR expects
        prepared = Image.fromarray((arr * 255.0).astype(np.uint8))
        with torch.no_grad():
            codes = self.model([prepared], device=self.device)
            mesh = self.model.extract_mesh(codes, True, resolution=self.resolution)[0]
        if mesh.volume < 0:  # triangles wound inside out (depends on the marching-cubes library): turn them round
            mesh.invert()
        mesh = self.orient(mesh)  # same orientation as the hosted TripoSR Space: y up, front towards -z
        mesh = decimate(mesh, 60000)
        return mesh.export(file_type="glb")


def decimate(mesh, max_faces: int):
    """Keeps uploads small. The site does the final simplification to about 20,000 triangles."""
    if len(mesh.faces) <= max_faces:
        return mesh
    try:
        import fast_simplification
        import numpy as np
        import trimesh
        from scipy.spatial import cKDTree

        points, faces = fast_simplification.simplify(
            np.asarray(mesh.vertices, dtype=np.float32), np.asarray(mesh.faces, dtype=np.int32), target_count=max_faces
        )
        colors = None
        if mesh.visual is not None and getattr(mesh.visual, "vertex_colors", None) is not None:
            nearest = cKDTree(mesh.vertices).query(points)[1]
            colors = np.asarray(mesh.visual.vertex_colors)[nearest]
        return trimesh.Trimesh(vertices=points, faces=faces, vertex_colors=colors, process=False)
    except Exception as err:  # decimation is a nicety: fall back to the full mesh
        log("could not decimate locally:", err)
        return mesh


# ---------------------------------------------------------------------------------------------- the loop


def poll(mesher: Mesher, site: str, key: str, interval: float) -> None:
    import requests

    headers = {"x-mesh-key": key}
    seen: set[int] = set()
    typical = 60.0  # seconds one model takes here; refined after each job
    log(f"watching {site} for scans. Ctrl+C to stop.")
    while True:
        try:
            res = requests.get(f"{site}/api/scan-status", params={"pending": "1"}, headers=headers, timeout=20)
            if res.status_code in (401, 403):
                sys.exit(f"The site refused the worker key ({res.status_code}): {res.text[:200]}")
            res.raise_for_status()
            jobs = [j for j in res.json().get("jobs", []) if j["id"] not in seen]
        except requests.RequestException as err:
            log("could not reach the site:", err)
            time.sleep(interval * 3)
            continue

        # Newest first: it has the most time left before the site's two-minute rule turns it into a creature.
        for job in sorted(jobs, key=lambda j: -j["id"]):
            seen.add(job["id"])
            left = job["ms_left"] / 1000.0
            if left < typical + 8:
                log(f"gift {job['id']}: only {left:.0f} s left, a model takes about {typical:.0f} s here; skipped")
                continue
            started = time.time()
            try:
                photo = requests.get(job["image_url"], timeout=30)
                photo.raise_for_status()
                glb = mesher.build(photo.content)
                took = time.time() - started
                typical = 0.5 * typical + 0.5 * took
                body = {"id": job["id"], "model": base64.b64encode(glb).decode("ascii")}
                up = requests.post(f"{site}/api/scan-status", json=body, headers=headers, timeout=60)
                if up.ok:
                    used = up.json().get("used")
                    log(f"gift {job['id']}: model built in {took:.0f} s, {len(glb) // 1024} KB, "
                        + ("used" if used else "not needed (the site finished it first)"))
                else:
                    log(f"gift {job['id']}: upload refused ({up.status_code}): {up.text[:200]}")
            except Exception as err:  # one bad photo must not stop the worker
                log(f"gift {job['id']}: failed after {time.time() - started:.0f} s:", err)
        time.sleep(interval)


def main() -> None:
    load_env_file()
    parser = argparse.ArgumentParser(description="WishWorld local mesh worker (TripoSR)")
    parser.add_argument("--once", metavar="PHOTO", help="build one model from a photo file and exit")
    parser.add_argument("--out", help="where to write the .glb in --once mode (default: beside the photo)")
    parser.add_argument("--resolution", type=int, default=int(os.environ.get("MESH_RESOLUTION") or 160))
    parser.add_argument("--interval", type=float, default=3.0, help="seconds between polls")
    args = parser.parse_args()

    site = (os.environ.get("WISHWORLD_SITE") or "https://wishworld-web.vercel.app").rstrip("/")
    key = os.environ.get("MESH_WORKER_KEY") or ""
    if not args.once and not key:
        sys.exit("MESH_WORKER_KEY is not set. Put it in the environment or in tools/mesh-worker/.env (see README.md).")

    mesher = Mesher(max(64, min(256, args.resolution)))
    if args.once:
        photo = Path(args.once)
        out = Path(args.out) if args.out else photo.with_suffix(".glb")
        started = time.time()
        glb = mesher.build(photo.read_bytes())
        out.write_bytes(glb)
        log(f"wrote {out} ({len(glb) // 1024} KB) in {time.time() - started:.0f} s")
        return
    try:
        poll(mesher, site, key, args.interval)
    except KeyboardInterrupt:
        log("stopped")


if __name__ == "__main__":
    main()
