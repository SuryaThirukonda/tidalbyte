# Lidar preprocessing for the Explore tab

Turns public USGS 3DEP lidar into small static point clouds in `public/lidar/`: the Statue of Liberty, Niagara
Falls, the Golden Gate Bridge, the Gateway Arch, the Washington Monument, Devils Tower and the Grand Canyon. Run once
on a laptop; the headset only ever loads the finished files.

## Run

```
cd tools/lidar
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt      (macOS/Linux: .venv/bin/python)
.venv\Scripts\python preprocess.py all                        (or one: liberty, niagara, goldengate, gateway,
                                                              washington, devilstower, grandcanyon)
```

No PDAL or conda needed: `ept.py` reads the Entwine Point Tiles octree over plain HTTPS and
decodes the LAZ nodes with `laspy[lazrs]`. The first run downloads about 520 MB into `cache/`
(git-ignored) and takes a few minutes; later runs use the cache (Liberty about 2 s, Niagara about
30 s). Options: `--size <metres>`, `--target <points>`, `--refresh`.

Check the result on a desktop:

```
python -m http.server 8105 --directory public        (from the project root)
http://localhost:8105/lidar/preview.html?place=liberty
http://localhost:8105/lidar/preview.html?place=niagara
```

Drag to orbit, wheel to zoom, `[` `]` point size, `B` toggles the base slab.
Extra query options: `az`, `el`, `dist`, `tx`, `ty`, `tz`, `size`, `n` (draw only the first n points), `base=0`.

## Data used

| Place | Box | Dataset (EPT root under `https://s3-us-west-2.amazonaws.com/usgs-lidar-public/`) | Raw points in the box |
|---|---|---|---|
| Statue of Liberty | 340 m square centred 40.68945, -74.04480 | `NY_NewYorkCity` (USGS CMGP Post-Sandy lidar) | 0.72 million, 6.2 per m² |
| Niagara Falls | 1250 m square centred 43.0813, -79.07175 | `NY_3County_2019` plus `NY_FEMAR2_Central_B1_2018` | 16.4 million, 10.5 per m² |
| Golden Gate Bridge | 1800 m square centred 37.8183, -122.4783 (mid span) | `USGS_LPC_CA_NoCal_Wildfires_B5b_QL1_2018`, `USGS_LPC_CA_WestCoastElNinoUTM10_2016_LAS_2017` and `CA_SanFrancisco_1_B23` merged | 33.0 million, 10.2 per m² |
| Gateway Arch | 500 m square centred 38.62453, -90.18478 | `USGS_LPC_MO_StLouis_2017_LAS_2018` | 0.46 million, 1.8 per m² |
| Washington Monument | 500 m square centred 38.88948, -77.03524 | `USGS_LPC_MD_VA_Sandy_NCR_2014_LAS_2015` | 1.9 million, 7.7 per m² |
| Devils Tower | 900 m square centred 44.5904, -104.7153 | `WY_FEMA_East_B3_2019` | 4.2 million, 5.2 per m² |
| Grand Canyon (Mather Point) | 1500 m square centred 36.0617, -112.1078, octree level 9 | `AZ_GrandCanyonNP_1_2019` | 9.9 million, 4.4 per m² |

Options a place can set in `preprocess.py` besides the box and palette:

- `landmark`: colour what rises well above its surroundings inside a `circle` (lat, lon, radius) or along a
  `segment` (two lat/lon ends and a `half_width`), from `low` to `high` by height; `rise` is how far above the
  median of the ring just outside the shape a return must be. The landmark's position goes into the `.json`
  (`landmark: {x, z, baseY, topY}`), which is where walking starts from.
- `strata`: below the rim, colour by depth in bands (the Grand Canyon's rock layers).
- `max_depth`: read the octree only to this level (a lighter download for very dense surveys).
- `min_coverage`: share of the box that must have returns (default 0.25; the Golden Gate box is mostly open water).

Survey names (and the bucket addresses in each `.json`) are the USGS dataset identifiers, kept as they are.

Found through the index at https://usgs.entwine.io/ (`boundaries/resources.geojson`). Notes:

- Liberty: `USGS_Lidar_Point_Cloud_NJ_SdL5_2014_LAS_2015` also covers the island but returns exactly
  the same points, so only one is used. No newer survey of the island is in the index.
- Niagara: both New York surveys reach across the river, so the whole Horseshoe Falls and the
  Canadian bank are in the data. The primary survey has a missing tile in the north-east corner of the
  box and patchy returns on the upper river; the supplemental survey fills both, so the two are merged.
- Both datasets are EPSG:3857 with heights in NAVD88 metres (checked: the torch tip comes out
  92.9 m above the harbour, and the Niagara River drops from about 169 m to 101 m at the falls).
- Neither has photo colour or vegetation/building classes. Classes present: 1 unclassified,
  2 ground, 7/18 noise, 9 water, 10 rail, 17 bridge, 20 ignored ground.

Licence: USGS 3DEP lidar is a US Government work in the public domain. Credit "U.S. Geological
Survey 3D Elevation Program". The fact sources are listed in each `.json` (`factSources`).

## Output format (fixed by `docs/CONTRACT.md`)

`<place>.bin`: `Int16` x,y,z for every point (little-endian, 6 bytes a point), then `Uint8` r,g,b for
every point. `<place>.json`: `{ name, count, scale, bounds: {min, max}, source, facts }` plus a few
extras (`axes`, `center`, `sizeMetres`, `datasets`, `factSources`, `colorSpace`, `order`, `categories`,
and for Liberty `statue: { x, z, pedestalTopY, topY }`).

- metres = int16 × `scale` (0.01 for Liberty, 0.02 for Niagara).
- **+X east, +Y up, +Z south** (north is −Z). Origin = centre of the box.
- **y = 0 is the water level**: the harbour for Liberty, the lower river (below the falls) for
  Niagara, so the upper river sits near y = 68 m. A few returns dip just below 0.
- Colours are **sRGB** bytes.
- Points are in **random order**: drawing only the first N (`geometry.setDrawRange(0, N)`) gives an
  even thinning, which is the cheap way to drop detail on a slow device.

| File | Points | Size | Extent |
|---|---|---|---|
| `liberty.bin` | 658,715 | 5.93 MB | 340 × 340 m, 93 m tall |
| `niagara.bin` | 657,818 | 5.92 MB | 1250 × 1250 m, 113 m tall (lower river to treetops) |

### Loading it in three.js

`public/lidar/preview.html` has two small functions worth copying: `loadLidar(name)` and
`makeMaterial(meta, pointMetres)`.

- The `Int16Array` is used directly as the position attribute; the shader multiplies by `scale`,
  so there is no per-point conversion and the positions cost 6 bytes each on the GPU.
- The shader writes the sRGB bytes straight to the screen. If you use `THREE.PointsMaterial` with
  `vertexColors` instead, three.js treats the bytes as linear and the model looks washed out;
  convert them first (`THREE.Color.setRGB(r, g, b, THREE.SRGBColorSpace)`).
- Point size: about 1.5 × sqrt(area / count) metres in model space (0.6 m for Liberty, 2.3 m for
  Niagara) closes the gaps. `uPx` must be half the height in pixels of the surface being drawn;
  in an XR session that is the eye buffer, not the canvas.
- Put a plain dark slab under the model (the preview does). Calm water and vertical walls return
  no lidar, so without it the room shows through.

## How each place is built

1. Read every octree node touching the box, crop, convert Web Mercator to metres with
   cos(latitude), recentre.
2. Drop noise classes and isolated returns (fewer than 4 neighbours within a 9 m block).
3. Height above ground from a 1 m (Liberty) or 2 m (Niagara) ground grid. Above-ground
   unclassified returns are split into trees and structures by how many laser pulses split into
   several returns and how rough the surface is.
4. Colour: ground by lidar intensity (near-infrared is bright on grass and dull on paving), trees
   by height in the canopy, structures warm stone, water blue-green, everything shaded as if lit
   from the north-west.
   - Liberty: returns within 14 m of the statue's axis and above the pedestal top (48.0 m NAVD88)
     are copper green, the torch flame above 89.2 m is gold, the pedestal is pale granite.
   - Niagara: returns at the height of the neighbouring water surface are water (both surveys
     label much of the rapids "unclassified" or "ground"). Anything that is not ground and hangs
     below a brink of the river within about 18 m is the falling sheet, coloured white, with
     green where the river bends over the edge. Gorge walls are rock brown.
5. Thin to about 660,000 points with one point per voxel, voxel size by category.
   - Liberty: every statue and pedestal return is kept (6,922); land is close to full density;
     only the harbour is thinned noticeably.
   - Niagara: trees, roofs, ground and water keep one layer (the top surface); the falls and the
     gorge walls keep their 3D shape at a finer voxel.

## Known limits (say these plainly)

- New places: the Gateway Arch's legs and the Washington Monument's sides are nearly vertical, so they are thin
  outlines; the arch's lower legs barely show. The Golden Gate's open water returns few points, and the Grand
  Canyon survey has no returns in the north-east corner of its box (the base shows there).

- Every point is a real measured return. Nothing is modelled or filled in. Only the colours are
  chosen by the script.
- The lidar was flown from aircraft, so tops and ground are dense and vertical faces are thin.
  The statue is about 1,500 points: from the side it is a clear silhouette (raised arm, torch,
  crown, tablet arm, robe) on a well-defined star fort and pedestal, not a detailed sculpture.
  The fort and pedestal walls have gaps.
- Niagara: calm water returns no lidar, so the deep lower river and parts of the plunge pool are
  empty (the base slab shows there). The curtain of the Horseshoe Falls has holes where the mist
  swallowed the laser. Canadian-side buildings at the box edge are partly cut off.
- The scenes use the Liberty and Niagara surveys described above.
