#!/usr/bin/env python
"""Turn public USGS 3DEP lidar into the small static point clouds used by the Explore tab.

    python preprocess.py liberty
    python preprocess.py niagara
    python preprocess.py all

What it does for one place:
  1. Reads only the octree nodes that touch a box around the place, straight from the Entwine
     Point Tiles in the public `usgs-lidar-public` bucket over HTTPS (see ept.py; no PDAL).
     Downloads are cached in tools/lidar/cache/ so a second run is offline and fast.
  2. Converts Web Mercator to real metres (multiply by cos(latitude)) and recentres on the box.
  3. Drops noise, works out height above ground, splits trees from buildings (this lidar has
     no photo colour and no vegetation/building classes), and colours every point.
  4. Thins to the point budget, keeping more points on the landmark and steep faces and fewer
     on flat ground and water.
  5. Writes public/lidar/<place>.bin and <place>.json in the format fixed by docs/CONTRACT.md:
        .bin  = Int16 x,y,z for every point (little-endian), then Uint8 r,g,b for every point
        .json = { name, count, scale, bounds, source, facts, ... }
     metres = int16 * scale.  +X east, +Y up, +Z south (north is -Z).  Origin: centre of the
     box, y = 0 at the water level (the harbour for Liberty, the lower river for Niagara).
     Points are stored in random order, so drawing only the first N is an even thinning.

Nothing here invents geometry: every point written is a measured lidar return. Only the colours
are chosen by this script.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ept import Ept, lonlat_to_mercator  # noqa: E402

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
OUT = HERE.parent.parent / "public" / "lidar"
BUCKET = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public"

# ASPRS classes used by these datasets
C_UNCLASSIFIED, C_GROUND, C_LOW_NOISE, C_WATER, C_RAIL, C_BRIDGE, C_HIGH_NOISE, C_IGNORED = 1, 2, 7, 9, 10, 17, 18, 20

CATEGORIES = ["landmark", "structure", "veg", "ground", "water"]
LANDMARK, STRUCTURE, VEG, GROUND, WATER = range(5)


def rgb(hexstr: str) -> np.ndarray:
    hexstr = hexstr.lstrip("#")
    return np.array([int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


PLACES = {
    "liberty": {
        "name": "Statue of Liberty",
        # Box centre: a little north-west of the statue so the star-shaped fort, the sea wall,
        # the pier and the tree-lined mall all fit.
        "center": (40.68945, -74.04480),
        "size": 340.0,
        "datasets": ["NY_NewYorkCity"],
        "dataset_notes": "USGS CMGP Post-Sandy New York City lidar (NAVD88 metres)",
        "target": 660_000,
        "grid": 1.0,
        "water_below": 0.8,   # m above the water level: unclassified returns this low are harbour water
        # relative voxel size per category when thinning (bigger = thinned harder); 0 = keep every point
        "thin": {"landmark": 0.0, "structure": 0.8, "veg": 1.0, "ground": 1.25, "water": 2.4},
        "statue": {
            "copper_above": 48.0,    # NAVD88 m: top of the granite pedestal, measured in the data
            "flame_above": 89.2,     # the gilded torch flame
            "pedestal_above": 17.5,  # above the fort's terrace
            "radius": 30.0,
        },
        "grass_range": (0.55, 0.9),
        "palette": {
            "water_deep": "#1f5f8f", "water_light": "#4f9cc4", "foam": "#9fd0e6",
            "ground_dark": "#948b7b", "ground_light": "#79b356",
            "veg_dark": "#2f6b3a", "veg_light": "#86c25a",
            "roof_dark": "#a9957c", "roof_light": "#e6d3b3",
            "low": "#b3a58c",
        },
        "facts": [
            "The Statue of Liberty was a gift of friendship from the people of France to the United States.",
            "Her skin is copper, about as thick as two pennies. She started out brown like a penny and took about thirty years to turn green.",
        ],
        "fact_sources": ["https://www.nps.gov/stli/index.htm", "https://www.nps.gov/stli/faqs.htm",
                         "https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm"],
    },
    "niagara": {
        "name": "Niagara Falls",
        # Box centre: between the American Falls and the Horseshoe Falls, so both falls, the gorge
        # and most of Goat Island fit. The US surveys reach across the river, so the Canadian
        # bank and the whole Horseshoe Falls are in the data.
        "center": (43.0813, -79.07175),
        "size": 1250.0,
        "datasets": ["NY_3County_2019", "NY_FEMAR2_Central_B1_2018"],
        "dataset_notes": "USGS NY 3 County lidar merged with NY FEMA Region 2 Central lidar; NAVD88 metres",
        "target": 660_000,
        "grid": 2.0,
        "river": True,          # moving water, spray and falls (see build())
        "surface_only": True,   # too big for the budget to keep the inside of every tree
        "thin": {"landmark": 0.6, "structure": 0.85, "veg": 0.95, "ground": 1.1, "water": 1.1},
        "palette": {
            "water_deep": "#0f6a6e", "water_light": "#35b3a6", "foam": "#f1fbfb",
            "ground_dark": "#8b8478", "ground_light": "#86b25c",
            "veg_dark": "#255f33", "veg_light": "#7dbb50",
            "roof_dark": "#a39584", "roof_light": "#ead9bd",
            "low": "#a59a86",
        },
        "facts": [
            "Niagara Falls is three waterfalls side by side: the Horseshoe Falls, the American Falls and the little Bridal Veil Falls.",
            "The water comes from four of the Great Lakes. It rushes down the Niagara River, over the falls, and on to Lake Ontario.",
        ],
        "fact_sources": ["https://www.niagarafallsstatepark.com/niagara-falls-state-park/amazing-niagara-facts"],
    },
}


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------------------------------
# 1. fetch
# ------------------------------------------------------------------------------------------
def fetch(place: str, cfg: dict, refresh: bool = False) -> dict:
    """Points inside the box as local metres: e (east), n (north), z (NAVD88 m), plus attributes."""
    lat, lon = cfg["center"]
    half = cfg["size"] / 2
    sig = hashlib.sha1(json.dumps([cfg["center"], cfg["size"], cfg["datasets"]]).encode()).hexdigest()[:10]
    raw_path = CACHE / f"{place}_raw_{sig}.npz"
    if raw_path.exists() and not refresh:
        log(f"[{place}] using cached crop {raw_path.name}")
        return dict(np.load(raw_path))

    cx, cy = lonlat_to_mercator(lon, lat)
    k = math.cos(math.radians(lat))       # Web Mercator stretches distances by 1/cos(lat)
    hm = half / k
    box = (cx - hm, cy - hm, cx + hm, cy + hm)
    parts = []
    for si, ds in enumerate(cfg["datasets"]):
        ept = Ept(f"{BUCKET}/{ds}", CACHE / ds)
        srs = ept.meta.get("srs", {})
        if str(srs.get("horizontal")) != "3857":
            raise SystemExit(f"{ds}: expected EPSG:3857, got {srs.get('authority')}:{srs.get('horizontal')}")
        nodes = ept.find_nodes(box, lambda lo, hi: 99)
        log(f"[{place}] {ds}: {len(nodes)} nodes touch the box (deepest level {max((d for d, *_ in nodes), default=-1)})")
        p = ept.read_nodes(nodes, box, log=log) if nodes else None
        if p is None:
            log(f"[{place}] {ds}: NO POINTS in the box")
            continue
        inten = p["inten"].astype(np.float32)
        lo, hi = np.percentile(inten, [2, 98])
        parts.append({
            "e": ((p["x"] - cx) * k).astype(np.float32),
            "n": ((p["y"] - cy) * k).astype(np.float32),
            "z": p["z"].astype(np.float32),
            "cls": p["cls"],
            "inten": np.clip((inten - lo) / max(hi - lo, 1), 0, 1).astype(np.float32),
            "nret": p["nret"],
            "src": np.full(len(inten), si, dtype=np.uint8),
        })
        log(f"[{place}] {ds}: {len(inten):,} points in the box")
    if not parts:
        raise SystemExit(f"[{place}] no usable lidar found. Not writing anything.")
    raw = {k_: np.concatenate([p[k_] for p in parts]) for k_ in parts[0]}

    # coverage check: how much of the box has any return at all (10 m cells)
    g = Grid(half, 10.0)
    covered = float((g.reduce(g.index(raw["e"], raw["n"]), None, "count") > 0).mean())
    log(f"[{place}] {len(raw['e']):,} points; {covered:.0%} of the box has returns "
        f"({len(raw['e']) / cfg['size'] ** 2:.1f} points per square metre)")
    if covered < 0.25:
        raise SystemExit(f"[{place}] coverage is too thin to be usable. Not writing anything.")
    np.savez(raw_path, **raw)
    return raw


# ------------------------------------------------------------------------------------------
# grid helpers (row = north index, col = east index)
# ------------------------------------------------------------------------------------------
class Grid:
    def __init__(self, half: float, cell: float):
        self.half, self.cell = half, cell
        self.n = int(math.ceil(2 * half / cell))

    def index(self, e, n):
        ix = np.clip(((e + self.half) / self.cell).astype(np.int32), 0, self.n - 1)
        iy = np.clip(((n + self.half) / self.cell).astype(np.int32), 0, self.n - 1)
        return iy * self.n + ix

    def reduce(self, idx, val, how):
        if how == "count":
            return np.bincount(idx, minlength=self.n * self.n).reshape(self.n, self.n).astype(np.float32)
        if how == "sum":
            return np.bincount(idx, weights=val, minlength=self.n * self.n).reshape(self.n, self.n).astype(np.float32)
        out = np.full(self.n * self.n, np.inf if how == "min" else -np.inf, dtype=np.float32)
        (np.minimum if how == "min" else np.maximum).at(out, idx, val)
        out[~np.isfinite(out)] = np.nan
        return out.reshape(self.n, self.n)


def fill_nearest(a: np.ndarray) -> np.ndarray:
    bad = np.isnan(a)
    if not bad.any():
        return a
    if bad.all():
        return np.zeros_like(a)
    i = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True)
    return a[tuple(i)]


def hillshade(surface: np.ndarray, cell: float, sigma: float = 1.0, az: float = 315.0, alt: float = 50.0) -> np.ndarray:
    """0..1 brightness of a height grid lit from the north-west (the usual map convention)."""
    s = ndi.gaussian_filter(surface, sigma) if sigma > 0 else surface
    dn, de = np.gradient(s, cell)
    a, t = math.radians(az), math.radians(alt)
    sx, sy, sz = math.sin(a) * math.cos(t), math.cos(a) * math.cos(t), math.sin(t)
    return np.clip((-de * sx - dn * sy + sz) / np.sqrt(de * de + dn * dn + 1), 0, 1).astype(np.float32)


def smoothstep(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def lerp(c0, c1, t):
    return c0[None, :] + (c1 - c0)[None, :] * t[:, None]


def odd(x: float) -> int:
    return max(1, int(round(x))) | 1


# ------------------------------------------------------------------------------------------
# 2-4. clean, colour, thin
# ------------------------------------------------------------------------------------------
def drop_isolated(e, n, z, cell=3.0, min_neighbours=4):
    """True for points that have company: >= min_neighbours points in their 3x3x3 block of cells."""
    kx = np.floor(e / cell).astype(np.int64) + (1 << 19)
    ky = np.floor(n / cell).astype(np.int64) + (1 << 19)
    kz = np.floor(z / cell).astype(np.int64) + (1 << 19)
    key = (kx << 40) | (ky << 20) | kz
    uniq, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    total = np.zeros(len(uniq), dtype=np.int64)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                q = uniq + (dx << 40) + (dy << 20) + dz
                j = np.clip(np.searchsorted(uniq, q), 0, len(uniq) - 1)
                total += np.where(uniq[j] == q, cnt[j], 0)
    return (total >= min_neighbours)[inv]


def voxel_pick(e, n, y, cell, level):
    """Index of the first point in every voxel; `cell` is each point's voxel size, `level` its size class."""
    kx = np.floor(e / cell).astype(np.int64) + (1 << 18)
    ky = np.floor(n / cell).astype(np.int64) + (1 << 18)
    kz = np.floor(y / cell).astype(np.int64) + (1 << 18)
    key = (level.astype(np.int64) << 57) | (kx << 38) | (ky << 19) | kz
    _, first = np.unique(key, return_index=True)
    return first


def build(place: str, cfg: dict, raw: dict, seed: int = 7) -> tuple[np.ndarray, np.ndarray, dict]:
    rng = np.random.default_rng(seed)
    half = cfg["size"] / 2
    cell = cfg["grid"]
    pal = {k: rgb(v) for k, v in cfg["palette"].items()}
    extra: dict = {}

    # shuffle once: every later "first point in a voxel" choice is then a random one
    order = rng.permutation(len(raw["e"]))
    e, n, z = raw["e"][order], raw["n"][order], raw["z"][order]
    cls, inten, nret = raw["cls"][order], raw["inten"][order], raw["nret"][order]

    # ---- clean -----------------------------------------------------------------------------
    keep = ~np.isin(cls, (C_LOW_NOISE, C_HIGH_NOISE))
    zlo, zhi = np.percentile(z[keep], [0.02, 99.98])
    keep &= (z > zlo - 5) & (z < zhi + 60)
    keep[keep] &= drop_isolated(e[keep], n[keep], z[keep])
    log(f"[{place}] cleaned: {keep.sum():,} of {len(keep):,} points kept")
    e, n, z, cls, inten, nret = e[keep], n[keep], z[keep], cls[keep], inten[keep], nret[keep]

    # ---- datum: y = 0 at the (lowest) water level ---------------------------------------------
    water = cls == C_WATER
    y0 = float(np.percentile(z[water], 2)) if water.sum() > 1000 else float(np.percentile(z, 0.5))
    h = z - y0
    if cfg.get("water_below"):
        # still water (a harbour): unclassified returns at the water level are the water surface
        cls = np.where((cls == C_UNCLASSIFIED) & (h < cfg["water_below"]), C_WATER, cls).astype(np.uint8)
    log(f"[{place}] water level {y0:.2f} m NAVD88 -> y = 0; highest point y = {h.max():.1f} m")

    # ---- surfaces ----------------------------------------------------------------------------
    g = Grid(half, cell)
    idx = g.index(e, n)

    def at(grid):                      # grid value under every point
        return grid.ravel()[idx]

    def mean(grid, metres):            # box blur over about `metres`
        return ndi.uniform_filter(grid, odd(metres / cell))

    ground_like = np.isin(cls, (C_GROUND, C_WATER, C_IGNORED))
    dtm_raw = fill_nearest(g.reduce(idx[ground_like], h[ground_like], "min"))
    dtm = ndi.gaussian_filter(dtm_raw, 1.0)
    dsm = fill_nearest(g.reduce(idx, h, "max"))
    hag = h - at(dtm)

    def water_surface():
        """Mean water height per cell (NaN where no water return) and distance to the nearest water cell."""
        m = cls == C_WATER
        c = g.reduce(idx[m], None, "count")
        s_ = np.where(c > 0, g.reduce(idx[m], h[m], "sum") / np.maximum(c, 1), np.nan)
        return s_, ndi.distance_transform_edt(np.isnan(s_)) * cell

    dead = np.zeros(len(e), bool)                                          # points to leave out
    over_water = np.zeros(len(e), bool)
    if cfg.get("river"):
        # Rapids: both surveys label a lot of white water "unclassified" or even "ground". A return
        # that sits at the height of the water surface next to it is water. Grown in three short
        # steps so wide patches fill in, while banks (which step up) stay land.
        loose = lambda: np.isin(cls, (C_UNCLASSIFIED, C_GROUND, C_IGNORED))
        for _ in range(3):
            wsurf, wdist = water_surface()
            near = (np.abs(h - at(fill_nearest(wsurf))) < 0.6) & (at(wdist) < 30)
            cls = np.where(near & loose(), C_WATER, cls).astype(np.uint8)
        # standing waves are rougher than that: inside mostly-water surroundings allow 2 m
        wsurf, wdist = water_surface()
        share = at(mean(g.reduce(idx[cls == C_WATER], None, "count"), 20) / np.maximum(mean(g.reduce(idx, None, "count"), 20), 1e-6))
        cls = np.where((np.abs(h - at(fill_nearest(wsurf))) < 2.0) & (share > 0.5) & loose(), C_WATER, cls).astype(np.uint8)
        # Out over the river (no bare-earth return within ~6 m): low unclassified returns are
        # splashes, higher ones are the mist cloud. Keep mist only where it is dense; single
        # returns up there are birds and noise.
        wsurf, wdist = water_surface()
        bare = np.isin(cls, (C_GROUND, C_IGNORED))
        over_water = (at(mean(g.reduce(idx[bare], None, "count"), 12)) < 1e-6) & (at(wdist) < 30) & (cls == C_UNCLASSIFIED)
        cls = np.where(over_water & (hag < 4), C_WATER, cls).astype(np.uint8)
        over_water &= cls == C_UNCLASSIFIED
        if over_water.any():
            lonely = ~drop_isolated(e[over_water], n[over_water], z[over_water], cell=4.0, min_neighbours=8)
            dead[np.flatnonzero(over_water)[lonely]] = True

    count_all = g.reduce(idx, None, "count")
    count_water = g.reduce(idx[cls == C_WATER], None, "count")
    wfrac = at(mean(count_water, 20) / np.maximum(mean(count_all, 20), 1e-6))   # share of water within ~20 m

    # how tree-like each cell is: share of above-ground returns that came from a split pulse
    above = (cls == C_UNCLASSIFIED) & (hag > 1.5)
    multi = g.reduce(idx[above], (nret[above] > 1).astype(np.float32), "sum")
    cnt = g.reduce(idx[above], None, "count")
    vegscore = mean(multi, 4) / np.maximum(mean(cnt, 4), 1e-6)
    # roofs are flat (little height spread inside a cell); trees are rough
    lowest_above = g.reduce(idx[above], h[above], "min")
    rough = mean(np.where(np.isnan(lowest_above), 0, dsm - np.nan_to_num(lowest_above)), 4)
    treelike = at((vegscore > 0.16) | (rough > 3.5))

    # steep faces (gorge walls): big steps in the ground/water surface within ~8 m
    w = odd(16 / cell)
    lo_s, hi_s = ndi.minimum_filter(dtm_raw, w), ndi.maximum_filter(dtm_raw, w)
    relief = at(hi_s - lo_s)
    rel_h = np.clip((h - at(lo_s)) / np.maximum(relief, 1.0), 0, 1)          # 0 foot of the drop, 1 top

    # ---- categories --------------------------------------------------------------------------
    is_water = cls == C_WATER
    is_ground = np.isin(cls, (C_GROUND, C_IGNORED))
    is_bridge = np.isin(cls, (C_BRIDGE, C_RAIL))
    is_spray = above & over_water
    tower = above & (hag > 45)                                             # no tree is that tall
    is_veg = above & treelike & ~is_spray & ~tower
    is_roof = above & (~treelike | tower) & ~is_spray
    is_low = (cls == C_UNCLASSIFIED) & ~above

    shade_dtm = at(hillshade(dtm, cell, 0.0))
    shade_dsm = at(hillshade(dsm, cell, 1.0))
    canopy = np.maximum(at(dsm - dtm), 3.0)

    def smooth_intensity(mask, metres=3.0):
        """Lidar intensity is noisy point to point; average it over a few metres for surface colours."""
        s = mean(g.reduce(idx[mask], inten[mask], "sum"), metres) / np.maximum(mean(g.reduce(idx[mask], None, "count"), metres), 1e-6)
        return 0.7 * at(s) + 0.3 * inten

    col = np.zeros((len(e), 3), dtype=np.float32)
    lum = np.ones(len(e), dtype=np.float32)

    # ground: near-infrared lidar bounces brightly off grass and dimly off paving, so intensity
    # separates lawns from paths. Unclassified returns lying on the ground are coloured the same way.
    flat = is_ground | (is_low & (hag < 0.6))
    is_low = is_low & ~flat
    if flat.any():
        t = smoothstep(smooth_intensity(flat), *cfg.get("grass_range", (0.3, 0.7)))
        col[flat] = lerp(pal["ground_dark"], pal["ground_light"], t[flat])
        lum[flat] = 0.74 + 0.40 * shade_dtm[flat]

    col[is_low] = lerp(pal["low"] * 0.82, pal["low"] * 1.08, inten[is_low])
    lum[is_low] = 0.72 + 0.38 * shade_dsm[is_low]

    tv = np.clip(hag / canopy, 0, 1)
    col[is_veg] = lerp(pal["veg_dark"], pal["veg_light"], (tv * tv)[is_veg])
    lum[is_veg] = 0.80 + 0.30 * shade_dsm[is_veg]

    col[is_roof] = lerp(pal["roof_dark"], pal["roof_light"], smoothstep(inten, 0.1, 0.8)[is_roof])
    lum[is_roof] = 0.62 + 0.52 * shade_dsm[is_roof]

    col[is_bridge] = rgb("#a3a3a8")
    lum[is_bridge] = 0.75 + 0.35 * shade_dsm[is_bridge]

    # water: calm water is dark and returns little; white water returns a lot
    if is_water.any():
        wi = smooth_intensity(is_water, 6.0)
        wc = lerp(pal["water_deep"], pal["water_light"], smoothstep(wi, 0.05, 0.55))
        foam = smoothstep(wi, *cfg.get("foam_range", (0.6, 1.0))) * 0.8
        wc = wc + (pal["foam"][None, :] - wc) * np.clip(foam, 0, 1)[:, None]
        col[is_water] = wc[is_water]
        lum[is_water] = 1.0

    category = np.full(len(e), VEG, dtype=np.uint8)
    category[is_roof | is_bridge] = STRUCTURE
    category[flat | is_low] = GROUND
    category[is_water] = WATER
    keep3d = np.zeros(len(e), bool)                                        # see "surface_only" below

    # ---- the falls ----------------------------------------------------------------------------
    if cfg.get("river"):
        # The brink: river water with a big drop right next to it. Anything that is not ground and
        # hangs below a brink within ~18 m is the falling sheet (or the white water it lands in).
        wsurf, _ = water_surface()
        w2 = odd(36 / cell)
        brink = at(ndi.maximum_filter(np.nan_to_num(wsurf, nan=-1e9), w2))
        foot = at(ndi.minimum_filter(dtm_raw, w2))
        drop = brink - foot
        falling = (drop > 12) & (h < brink - 1.0) & ~is_ground & ~is_bridge
        t = np.clip((h - foot) / np.maximum(drop, 1.0), 0, 1)                # 0 foot, 1 brink
        # green where the river bends over the brink, white as it falls
        fc = lerp(pal["foam"], pal["water_light"], smoothstep(t, 0.72, 1.0) * 0.8)
        col[falling] = fc[falling]
        lum[falling] = (0.93 + 0.09 * t + 0.05 * (inten - 0.5))[falling]
        crest = (drop > 12) & is_water & ~falling                            # the lip itself: bright green water
        col[crest] = 0.5 * col[crest] + 0.5 * pal["water_light"] * 1.12
        # Mist hangs over the pool at the foot of a fall: the water under it is well below the
        # river within 80 m. The same kind of return over level water is a tree on an islet.
        over_pool = at(dtm_raw) < at(ndi.maximum_filter(np.nan_to_num(wsurf, nan=-1e9), odd(160 / cell))) - 8
        mist = is_spray & ~falling & over_pool
        islet = is_spray & ~falling & ~over_pool
        col[mist] = pal["foam"]
        lum[mist] = 0.95
        col[islet] = np.where(treelike[islet, None], lerp(pal["veg_dark"], pal["veg_light"], (tv * tv)[islet]), pal["roof_dark"][None, :])
        lum[islet] = 0.80 + 0.30 * shade_dsm[islet]
        steep = relief > 12
        rock = steep & ~falling & (is_roof | is_low | flat)
        col[rock] = lerp(rgb("#6f665c"), rgb("#a89b89"), smoothstep(inten, 0.1, 0.8)[rock])
        lum[rock] = (0.70 + 0.30 * rel_h)[rock]
        category[mist] = WATER
        category[islet] = VEG
        category[rock] = STRUCTURE
        category[falling] = LANDMARK
        keep3d = falling | rock

    # ---- the statue ---------------------------------------------------------------------------
    st = cfg.get("statue")
    if st:
        tall = z > st["copper_above"] + 8
        if tall.sum() < 50:
            raise SystemExit(f"[{place}] expected a tall statue in the box and did not find one")
        ax_e, ax_n = float(np.median(e[tall])), float(np.median(n[tall]))
        r = np.hypot(e - ax_e, n - ax_n)
        copper = (r < 14) & (z > st["copper_above"])
        flame = copper & (z > st["flame_above"])
        pedestal = (r < st["radius"]) & (z > st["pedestal_above"]) & ~copper
        # light from the north-west: brighten the side of the figure that faces it
        sun = (-(e - ax_e) + (n - ax_n)) / (np.maximum(r, 0.5) * math.sqrt(2))
        hz = (z - st["copper_above"]) / (z.max() - st["copper_above"])
        col[copper] = lerp(rgb("#3f9f86"), rgb("#8fe0c4"), np.clip(0.25 + 0.75 * hz, 0, 1)[copper])
        lum[copper] = (0.86 + 0.16 * sun + 0.10 * (inten - 0.5))[copper]
        col[flame] = rgb("#ffd24a")
        lum[flame] = 1.0
        col[pedestal] = lerp(rgb("#b9ab95"), rgb("#efe3cc"), smoothstep(z, st["pedestal_above"], st["copper_above"])[pedestal])
        lum[pedestal] = (0.84 + 0.14 * np.clip(sun, -1, 1))[pedestal]
        category[copper | pedestal] = LANDMARK
        extra["statue"] = {"x": round(ax_e, 2), "z": round(-ax_n, 2),
                           "pedestalTopY": round(st["copper_above"] - y0, 2), "topY": round(float(h[copper].max()), 2),
                           "copperPoints": int(copper.sum())}
        log(f"[{place}] statue axis at east {ax_e:.1f} m, north {ax_n:.1f} m; {copper.sum():,} copper points, "
            f"{pedestal.sum():,} pedestal points; torch tip {h[copper].max():.1f} m above the water")

    # gentle overall height cue + a little grain so flat areas are not flat colour
    lum *= 0.94 + 0.10 * smoothstep(h, 0, max(float(np.percentile(h, 99)), 1.0))
    lum *= 1.0 + rng.uniform(-0.04, 0.04, len(e)).astype(np.float32)
    col = np.clip(col * lum[:, None], 0, 1)

    # ---- thin to the budget ----------------------------------------------------------------------
    # One point per voxel, with a voxel size per category. With "surface_only" (large areas) the
    # flat categories keep a single layer: the top of the tree canopy, the roof, the ground, the
    # water. Only the falls and the rock walls keep their full 3D shape.
    sel = np.flatnonzero(~dead)
    yk = h.copy()
    if cfg.get("surface_only"):
        sel = sel[~((category[sel] == VEG) & (hag[sel] < 0.5 * canopy[sel]))]   # drop the inside of the trees
        tops = np.isin(category[sel], (VEG, STRUCTURE)) & ~keep3d[sel]
        sel = sel[np.argsort(np.where(tops, -h[sel], 0), kind="stable")]   # highest first for canopy and roofs
        yk[~keep3d] = 0.0
    factor = np.array([cfg["thin"][nm] for nm in CATEGORIES], dtype=np.float32)[category]
    always = sel[factor[sel] == 0]
    sel = sel[factor[sel] > 0]
    target = cfg["target"]

    def pick(base, s):
        return s[voxel_pick(e[s], n[s], yk[s], factor[s] * base, category[s])]

    base = 0.0
    if len(sel) + len(always) > target:
        lo_b, hi_b = 0.02, 40.0
        if len(sel) > 8 * target:
            lo_b = cfg.get("prethin", 0.5)
            sel = pick(lo_b, sel)                                          # cheap first pass
        for _ in range(24):
            base = math.sqrt(lo_b * hi_b)
            c = len(always) + len(pick(base, sel))
            if c > target:
                lo_b = base
            else:
                hi_b = base
                if c > target * 0.996:
                    break
        base = hi_b
        sel = pick(base, sel)
    chosen = np.concatenate([always, sel])
    chosen = chosen[rng.permutation(len(chosen))]
    counts = {nm: int((category[chosen] == i).sum()) for i, nm in enumerate(CATEGORIES)}
    log(f"[{place}] thinned to {len(chosen):,} points (base cell {base:.3f} m): {counts}")

    # ---- to the file's axes: +X east, +Y up, +Z south -------------------------------------------
    pos = np.stack([e[chosen], h[chosen], -n[chosen]], axis=1).astype(np.float64)
    colour = np.round(col[chosen] * 255).astype(np.uint8)
    extra.update({"waterLevelNavd88": round(y0, 2), "categories": counts, "baseCell": round(base, 3)})
    return pos, colour, extra


# ------------------------------------------------------------------------------------------
# 5. write
# ------------------------------------------------------------------------------------------
def write(place: str, cfg: dict, pos: np.ndarray, colour: np.ndarray, extra: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    reach = float(np.abs(pos).max())
    scale = next(s for s in (0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.25) if reach <= 32767 * s)
    q = np.round(pos / scale).astype("<i2")
    bin_path = OUT / f"{place}.bin"
    with open(bin_path, "wb") as f:
        f.write(q.tobytes())            # x,y,z for point 0, then point 1, ...
        f.write(colour.tobytes())       # r,g,b for point 0, then point 1, ...
    metres = q.astype(np.float64) * scale
    lat, lon = cfg["center"]
    urls = [f"{BUCKET}/{ds}/ept.json" for ds in cfg["datasets"]]
    meta = {
        "name": cfg["name"],
        "count": int(len(q)),
        "scale": scale,
        "bounds": {"min": [round(float(v), 3) for v in metres.min(axis=0)],
                   "max": [round(float(v), 3) for v in metres.max(axis=0)]},
        "source": f"{cfg['dataset_notes']}. USGS 3DEP public-domain lidar, Entwine Point Tiles: " + " and ".join(urls),
        "facts": cfg["facts"],
        # extras (not required by the contract)
        "factSources": cfg.get("fact_sources", []),
        "axes": "+X east, +Y up, +Z south; metres = int16 * scale; y = 0 is the water level",
        "center": {"lat": lat, "lon": lon},
        "sizeMetres": cfg["size"],
        "datasets": [{"name": ds, "url": u} for ds, u in zip(cfg["datasets"], urls)],
        "colorSpace": "srgb",
        "order": "random (the first N points are an even subsample)",
        **extra,
    }
    (OUT / f"{place}.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    log(f"[{place}] wrote {bin_path} ({bin_path.stat().st_size / 1e6:.2f} MB, {len(q):,} points, scale {scale})")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("place", choices=[*PLACES, "all"])
    ap.add_argument("--size", type=float, help="box edge in metres (overrides the built-in value)")
    ap.add_argument("--target", type=int, help="point budget (overrides the built-in value)")
    ap.add_argument("--refresh", action="store_true", help="ignore the cached crop and read the nodes again")
    args = ap.parse_args()
    for place in (PLACES if args.place == "all" else [args.place]):
        cfg = dict(PLACES[place])
        if args.size:
            cfg["size"] = args.size
        if args.target:
            cfg["target"] = args.target
        t0 = time.time()
        raw = fetch(place, cfg, args.refresh)
        pos, colour, extra = build(place, cfg, raw)
        write(place, cfg, pos, colour, extra)
        log(f"[{place}] done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
