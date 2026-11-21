#!/usr/bin/env python3
"""Prepare real sky photographs (360 panoramas) for WishWorld.

Sources are CC0 sky panoramas from Poly Haven and NASA's public-domain star map, expected in
ThirdParty/_downloads/skies (see THIRD_PARTY.md). Each is resized to 4096 x 2048 and written to
Assets/ThirdParty/Skies/Sky_<Name>.jpg. For every sky the script also measures where the sun (or moon) is and
the colour of the sky at the horizon and overhead, and writes them to Assets/ThirdParty/Skies/skies.json, so the
Unity builder can aim the scene light at the sun in the photo and match the fog to the horizon.

Usage:  python3 Tools/bake_skies.py
"""
import json, math, os
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ThirdParty', '_downloads', 'skies')
OUT = os.path.join(ROOT, 'Assets', 'ThirdParty', 'Skies')
W, H = 4096, 2048

# output name, source file, options
SKIES = [
    ('Hub', 'snow_field_puresky.jpg', {}),
    ('Race', 'kloofendal_48d_partly_cloudy_puresky.jpg', {}),
    ('Zoo', 'qwantani_sunset_puresky.jpg', {}),
    ('Farm', 'sunflowers_puresky.jpg', {}),
    ('Dinosaurs', 'hilly_terrain_01_puresky.jpg', {}),
    ('Arctic', 'kloppenheim_02_puresky.jpg', {'aurora': True, 'night': (0.36, 0.50, 0.80)}),
    ('Rainforest', 'kloofendal_misty_morning_puresky.jpg', {'tint': (0.90, 1.0, 0.90)}),
    ('Sky', 'rocky_ridge_puresky.jpg', {}),
    ('Space', 'starmap_nasa.jpg', {'gain': 1.6, 'stars': True}),
]

def srgb_to_linear(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def linear_to_srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)

def aurora(img):
    """Paint green northern lights over the upper sky (the photograph is a real moonlit night sky without them)."""
    h, w, _ = img.shape
    el = (0.5 - (np.arange(h) + 0.5) / h) * math.pi                 # +pi/2 at the top row
    az = (np.arange(w) + 0.5) / w * 2 * math.pi
    A, E = np.meshgrid(az, el)
    wob = 0.5 + 0.25 * np.sin(A * 3 + 1.3) + 0.15 * np.sin(A * 7 + 0.4) + 0.10 * np.sin(A * 13 + 2.1)
    band = 0.50 + 0.17 * np.sin(A * 2 + wob * 2.4)                    # the curtain's height wanders with direction
    curtain = np.exp(-((E - band) / 0.17) ** 2)
    rays = 0.55 + 0.45 * (0.5 + 0.5 * np.sin(A * 46 + np.sin(A * 9) * 4)) ** 2      # fine vertical streaks
    strength = (0.35 + 0.65 * wob) * curtain * rays * np.clip((E - 0.04) / 0.2, 0, 1)
    second = np.exp(-((E - (band + 0.33)) / 0.11) ** 2) * (0.3 + 0.7 * (0.5 + 0.5 * np.sin(A * 5 + 2.0))) * 0.45
    green = np.array([0.20, 0.95, 0.60]); violet = np.array([0.55, 0.30, 0.85])
    img = img + strength[..., None] * green * 0.6 + second[..., None] * (green * 0.5 + violet * 0.5) * 0.45
    return np.clip(img, 0, 1)

def measure(img):
    """Sun direction (u across the image, elevation in degrees), horizon colour and overhead colour, all sRGB."""
    small = np.asarray(Image.fromarray((img * 255).astype(np.uint8)).resize((256, 128), Image.BOX), dtype=np.float32) / 255
    lum = small @ np.array([0.2126, 0.7152, 0.0722])
    k = np.ones(5) / 5
    blur = np.apply_along_axis(lambda r: np.convolve(np.concatenate([r[-2:], r, r[:2]]), k, 'valid'), 1, lum)
    blur = np.apply_along_axis(lambda c: np.convolve(np.pad(c, 2, 'edge'), k, 'valid'), 0, blur)
    upper = blur[:62]                                                # leave out the last rows next to the horizon
    y, x = np.unravel_index(np.argmax(upper), upper.shape)
    sun_u = (x + 0.5) / 256
    sun_el = (0.5 - (y + 0.5) / 128) * 180
    lin = srgb_to_linear(small)
    horizon = linear_to_srgb(lin[56:63].reshape(-1, 3).mean(0))      # about 1.5 to 11 degrees above the horizon
    weights = np.cos(np.radians((0.5 - (np.arange(64) + 0.5) / 128) * 180))[:, None, None]
    overhead = linear_to_srgb((lin[:64] * weights).sum((0, 1)) / (weights.sum() * 256))
    return float(sun_u), float(sun_el), [float(v) for v in horizon], [float(v) for v in overhead]

def main():
    os.makedirs(OUT, exist_ok=True)
    info = []
    for name, src, opt in SKIES:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print('  MISSING', src); continue
        im = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
        img = np.asarray(im, dtype=np.float32) / 255
        if 'gain' in opt: img = np.clip(img * opt['gain'], 0, 1)
        if 'tint' in opt: img = np.clip(img * np.array(opt['tint'], dtype=np.float32), 0, 1)
        if opt.get('stars'):                                          # deepen the black between the stars
            img = np.clip((img - 0.03) * 1.15, 0, 1) ** 1.15
        if 'night' in opt:                                            # the moonlit photograph is exposed like day: bring it down to night
            img = np.clip(img ** 2.1 * np.array(opt['night'], dtype=np.float32) * 1.25, 0, 1)
        if opt.get('aurora'): img = aurora(img)
        sun_u, sun_el, horizon, overhead = measure(img)
        Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'Sky_{name}.jpg'), quality=90, subsampling=1)
        info.append({'name': name, 'source': src, 'sunU': sun_u, 'sunElevation': sun_el, 'horizon': horizon, 'overhead': overhead})
        size = os.path.getsize(os.path.join(OUT, f'Sky_{name}.jpg')) / 1e6
        print(f'  Sky_{name:11s} {size:4.1f} MB  sun u={sun_u:.3f} el={sun_el:5.1f}  horizon=({horizon[0]:.2f},{horizon[1]:.2f},{horizon[2]:.2f})  overhead=({overhead[0]:.2f},{overhead[1]:.2f},{overhead[2]:.2f})')
    json.dump({'skies': info}, open(os.path.join(OUT, 'skies.json'), 'w'), indent=1)

if __name__ == '__main__': main()
