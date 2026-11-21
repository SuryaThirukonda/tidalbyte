"""Minimal Entwine Point Tiles (EPT) reader over plain HTTPS. No PDAL needed.

EPT layout (https://entwine.io/en/latest/entwine-point-tile.html):
  <root>/ept.json                      bounds (a cube), srs, span, dataType
  <root>/ept-hierarchy/D-X-Y-Z.json    { "D-X-Y-Z": pointCount, ... }; -1 means "see that key's own file"
  <root>/ept-data/D-X-Y-Z.laz          the points of one octree node

Node D-X-Y-Z covers the cube `bounds` split 2**D times along each axis. Every node holds at most
span**3 points, so depth D adds detail at a spacing of about cubeWidth / (span * 2**D).
"""
from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import laspy
import numpy as np

USER_AGENT = "ept-box-reader/1.0 (python urllib)"
R_MERC = 6378137.0


def lonlat_to_mercator(lon: float, lat: float) -> tuple[float, float]:
    x = math.radians(lon) * R_MERC
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R_MERC
    return x, y


def _get(url: str, tries: int = 5) -> bytes:
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                raise
            last = e
        except Exception as e:  # timeouts, resets
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


class Ept:
    def __init__(self, root_url: str, cache_dir: Path):
        self.root = root_url.rstrip("/")
        if self.root.endswith("/ept.json"):
            self.root = self.root[: -len("/ept.json")]
        self.cache = Path(cache_dir)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.meta = json.loads(self._cached("ept.json"))
        if self.meta.get("dataType") != "laszip":
            raise RuntimeError(f"unsupported EPT dataType {self.meta.get('dataType')}")
        b = self.meta["bounds"]
        self.min = np.array(b[:3], dtype=np.float64)
        self.width = float(b[3] - b[0])
        self.span = int(self.meta["span"])
        self._hier: dict[str, dict] = {}

    # -- files -------------------------------------------------------------------------------
    def _cached(self, rel: str) -> bytes:
        path = self.cache / rel
        if path.exists() and path.stat().st_size > 0:
            return path.read_bytes()
        data = _get(f"{self.root}/{rel}")
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(data)
        tmp.replace(path)
        return data

    def _hierarchy(self, key: str) -> dict:
        if key not in self._hier:
            self._hier[key] = json.loads(self._cached(f"ept-hierarchy/{key}.json"))
        return self._hier[key]

    # -- geometry ----------------------------------------------------------------------------
    def spacing(self, depth: int) -> float:
        """Approximate point spacing (dataset units) added by nodes at this depth."""
        return self.width / (self.span * 2 ** depth)

    def node_bounds(self, d: int, x: int, y: int, z: int):
        size = self.width / 2 ** d
        lo = self.min + np.array([x, y, z]) * size
        return lo, lo + size

    def find_nodes(self, box, max_depth_fn):
        """Nodes whose footprint touches box=(minx, miny, maxx, maxy).

        max_depth_fn(lo, hi) -> deepest depth wanted for a node with those bounds, which lets the
        caller ask for more detail inside a focus area.
        """
        minx, miny, maxx, maxy = box
        out: dict[tuple, int] = {}

        def visit(key, hier):
            name = "-".join(map(str, key))
            n = hier.get(name)
            if n is None:
                return
            lo, hi = self.node_bounds(*key)
            if hi[0] < minx or lo[0] > maxx or hi[1] < miny or lo[1] > maxy:
                return
            if key[0] > max_depth_fn(lo, hi):
                return
            if n == -1:
                hier = self._hierarchy(name)
                n = hier.get(name, 0)
            if n > 0:
                out[key] = n
            d, x, y, z = key
            for i in range(8):
                visit((d + 1, 2 * x + (i & 1), 2 * y + ((i >> 1) & 1), 2 * z + ((i >> 2) & 1)), hier)

        visit((0, 0, 0, 0), self._hierarchy("0-0-0-0"))
        return out

    # -- points ------------------------------------------------------------------------------
    def read_nodes(self, nodes, box, workers: int = 12, log=print):
        """Download (cached) and decode nodes, cropped to box. Returns a dict of numpy arrays."""
        minx, miny, maxx, maxy = box
        keys = sorted(nodes)
        names = ["-".join(map(str, k)) for k in keys]

        def fetch(name):
            self._cached(f"ept-data/{name}.laz")
            return name

        to_fetch = [n for n in names if not (self.cache / f"ept-data/{n}.laz").exists()]
        if to_fetch:
            log(f"  downloading {len(to_fetch)} nodes ({len(names) - len(to_fetch)} already cached)")
            done = 0
            with ThreadPoolExecutor(workers) as pool:
                for _ in pool.map(fetch, to_fetch):
                    done += 1
                    if done % 50 == 0 or done == len(to_fetch):
                        log(f"    {done}/{len(to_fetch)}")

        cols = {k: [] for k in ("x", "y", "z", "cls", "inten", "ret", "nret", "depth", "rgb")}
        has_rgb = False
        for key, name in zip(keys, names):
            las = laspy.read(self.cache / f"ept-data/{name}.laz")
            x = np.asarray(las.x, dtype=np.float64)
            y = np.asarray(las.y, dtype=np.float64)
            m = (x >= minx) & (x <= maxx) & (y >= miny) & (y <= maxy)
            if not m.any():
                continue
            cols["x"].append(x[m])
            cols["y"].append(y[m])
            cols["z"].append(np.asarray(las.z, dtype=np.float64)[m])
            cols["cls"].append(np.asarray(las.classification, dtype=np.uint8)[m])
            cols["inten"].append(np.asarray(las.intensity, dtype=np.uint16)[m])
            cols["ret"].append(np.asarray(las.return_number, dtype=np.uint8)[m])
            cols["nret"].append(np.asarray(las.number_of_returns, dtype=np.uint8)[m])
            cols["depth"].append(np.full(int(m.sum()), key[0], dtype=np.uint8))
            dims = set(las.point_format.dimension_names)
            if {"red", "green", "blue"} <= dims:
                rgb = np.stack([np.asarray(las.red), np.asarray(las.green), np.asarray(las.blue)], axis=1)[m]
                has_rgb = has_rgb or bool(rgb.any())
                cols["rgb"].append(rgb.astype(np.uint16))
            else:
                cols["rgb"].append(np.zeros((int(m.sum()), 3), dtype=np.uint16))
        if not cols["x"]:
            return None
        out = {k: np.concatenate(v) for k, v in cols.items()}
        out["has_rgb"] = np.array(has_rgb)
        return out
