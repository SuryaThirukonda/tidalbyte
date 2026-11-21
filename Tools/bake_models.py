#!/usr/bin/env python3
"""Bake third-party CC0 models (GLB, or OBJ+MTL) into WishWorld's format.

Each output is Assets/ThirdParty/Baked/<Name>.bytes: unindexed triangles in Unity space with one flat colour
per triangle (taken from the material colour or the palette texture at the triangle's centre), scaled to a real
size in metres, facing +Z, standing on y = 0 or centred. The Unity builder (Editor/PackMeshes.cs) turns these into
meshes that use the project's single vertex-colour material, so tinting, glow and faceted shading all still work.

Usage:  python3 Tools/bake_models.py          (sources are expected in ThirdParty/_downloads, see THIRD_PARTY.md)
"""
import colorsys, glob, json, math, os, struct, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ThirdParty', '_downloads')
OUT = os.path.join(ROOT, 'Assets', 'ThirdParty', 'Baked')

# ---------------------------------------------------------------- small maths
def mat_mul(a, b): return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def mat_identity(): return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
def mat_trs(t, q, s):
    x, y, z, w = q
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    m = mat_identity()
    for i in range(3):
        for j in range(3): m[i][j] = r[i][j] * s[j]
        m[i][3] = t[i]
    return m
def xform(m, p): return tuple(m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3))
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

RAW_COLOURS = False   # set for kits whose files already hold display (sRGB) colours: Kenney's Asset Forge exports
def srgb(c): return tuple(max(0.0, min(1.0, v)) for v in c) if RAW_COLOURS else tuple(max(0.0, min(1.0, v)) ** (1 / 2.2) for v in c)

# ---------------------------------------------------------------- readers: return [(p0, p1, p2, (r,g,b) sRGB 0..1)] right-handed
def read_glb(path):
    data = open(path, 'rb').read()
    jlen = struct.unpack('<I', data[12:16])[0]
    j = json.loads(data[20:20 + jlen])
    bin_ = data[20 + jlen + 8:]
    def accessor(idx):
        a = j['accessors'][idx]; bv = j['bufferViews'][a['bufferView']]
        fmt, size = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}[a['componentType']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride') or size * n
        out = []
        for i in range(a['count']):
            v = struct.unpack_from('<' + fmt * n, bin_, off + i * stride)
            if a.get('normalized'): v = tuple(x / (255.0 if size == 1 else 65535.0) for x in v)
            out.append(v if n > 1 else v[0])
        return out
    images = {}
    def image(i):
        if i not in images:
            im = j['images'][i]
            if 'uri' in im: images[i] = Image.open(os.path.join(os.path.dirname(path), im['uri'])).convert('RGB')
            else:
                bv = j['bufferViews'][im['bufferView']]
                import io
                images[i] = Image.open(io.BytesIO(bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
        return images[i]
    tris = []
    def visit(ni, parent):
        node = j['nodes'][ni]
        if 'matrix' in node:
            m = node['matrix']; local = [[m[c * 4 + r] for c in range(4)] for r in range(4)]
        else:
            local = mat_trs(node.get('translation', [0, 0, 0]), node.get('rotation', [0, 0, 0, 1]), node.get('scale', [1, 1, 1]))
        world = mat_mul(parent, local)
        if 'mesh' in node:
            m = mat_identity() if 'skin' in node else world     # skinned meshes are placed by their joints, not their node
            for prim in j['meshes'][node['mesh']]['primitives']:
                if prim.get('mode', 4) != 4: continue
                pos = [xform(m, p) for p in accessor(prim['attributes']['POSITION'])]
                uv = accessor(prim['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in prim['attributes'] else None
                idx = accessor(prim['indices']) if 'indices' in prim else list(range(len(pos)))
                factor, tex = (1, 1, 1), None
                if 'material' in prim:
                    pbr = j['materials'][prim['material']].get('pbrMetallicRoughness', {})
                    factor = srgb(tuple(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3]))
                    if 'baseColorTexture' in pbr and uv:
                        tex = image(j['textures'][pbr['baseColorTexture']['index']]['source'])
                for t in range(0, len(idx) - 2, 3):
                    a, b, c = idx[t], idx[t + 1], idx[t + 2]
                    col = factor
                    if tex is not None:
                        u = (uv[a][0] + uv[b][0] + uv[c][0]) / 3 % 1.0; v = (uv[a][1] + uv[b][1] + uv[c][1]) / 3 % 1.0
                        px = tex.getpixel((min(tex.width - 1, int(u * tex.width)), min(tex.height - 1, int(v * tex.height))))
                        col = tuple(px[k] / 255.0 * factor[k] for k in range(3))
                    tris.append((pos[a], pos[b], pos[c], col))
        for ch in node.get('children', []): visit(ch, world)
    scene = j['scenes'][j.get('scene', 0)]
    for n in scene['nodes']: visit(n, mat_identity())
    return tris

def read_obj(path):
    mtl = {}
    mpath = os.path.splitext(path)[0] + '.mtl'
    if os.path.exists(mpath):
        cur = None
        for line in open(mpath, errors='replace'):
            p = line.split()
            if not p: continue
            if p[0] == 'newmtl': cur = p[1]
            elif p[0] == 'Kd' and cur: mtl[cur] = srgb(tuple(min(1.0, float(x) * (1.0 if RAW_COLOURS else 1.25)) for x in p[1:4]))   # Blender writes colour x 0.8 intensity
    verts, tris, col = [], [], (0.8, 0.8, 0.8)
    for line in open(path, errors='replace'):
        p = line.split()
        if not p: continue
        if p[0] == 'v': verts.append(tuple(float(x) for x in p[1:4]))
        elif p[0] == 'usemtl': col = mtl.get(p[1], (0.8, 0.8, 0.8))
        elif p[0] == 'f':
            ids = [int(x.split('/')[0]) for x in p[1:]]
            ids = [i - 1 if i > 0 else len(verts) + i for i in ids]
            for k in range(1, len(ids) - 1): tris.append((verts[ids[0]], verts[ids[k]], verts[ids[k + 1]], col))
    return tris

# ---------------------------------------------------------------- processing
def to_unity(tris):
    """Right-handed (glTF / OBJ) to Unity's left-handed space: mirror X and reverse the winding."""
    f = lambda p: (-p[0], p[1], p[2])
    return [(f(a), f(c), f(b), col) for a, b, c, col in tris]

def bounds(tris):
    xs = [p[i] for t in tris for p in t[:3] for i in (0,)]; ys = [p[1] for t in tris for p in t[:3]]; zs = [p[2] for t in tris for p in t[:3]]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

def normalise(tris, axis, metres, yaw=0, ground=True, scale=None):
    """Rotate about Y, scale so the chosen extent (h = height, l = longest horizontal, m = largest) is `metres`, then place."""
    c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    rot = lambda p: (p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c)
    tris = [(rot(a), rot(b), rot(cc), col) for a, b, cc, col in tris]
    lo, hi = bounds(tris)
    ext = (hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    if scale is None:
        ref = ext[1] if axis == 'h' else max(ext[0], ext[2]) if axis == 'l' else max(ext)
        scale = metres / ref if ref > 1e-9 else 1.0
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    cy = lo[1] if ground else (lo[1] + hi[1]) / 2
    mv = lambda p: ((p[0] - cx) * scale, (p[1] - cy) * scale, (p[2] - cz) * scale)
    return [(mv(a), mv(b), mv(cc), col) for a, b, cc, col in tris], scale

def top_half(tris, flesh):
    """Cut a centred model through y = 0, keep the top, close the cut with a flat cap in the flesh colour."""
    out, rim = [], []
    for a, b, c, col in tris:
        poly, pts = [], [a, b, c]
        for i in range(3):
            p, q = pts[i], pts[(i + 1) % 3]
            if p[1] >= 0: poly.append(p)
            if (p[1] >= 0) != (q[1] >= 0):
                t = p[1] / (p[1] - q[1]); x = tuple(p[k] + (q[k] - p[k]) * t for k in range(3)); x = (x[0], 0.0, x[2])
                poly.append(x); rim.append(x)
        for k in range(1, len(poly) - 1): out.append((poly[0], poly[k], poly[k + 1], col))
    if len(rim) >= 3:
        cx = sum(p[0] for p in rim) / len(rim); cz = sum(p[2] for p in rim) / len(rim)
        rim.sort(key=lambda p: math.atan2(p[2] - cz, p[0] - cx))
        for i in range(len(rim)):
            p, q = rim[i], rim[(i + 1) % len(rim)]
            tri = ((cx, 0.0, cz), p, q)
            if cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))[1] > 0: tri = (tri[0], tri[2], tri[1])   # cap must face down
            out.append(tri + (flesh,))
    return out

def write(name, tris):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + '.bytes'), 'wb') as f:
        f.write(b'WWM1'); f.write(struct.pack('<i', len(tris)))
        for a, b, c, _ in tris: f.write(struct.pack('<9f', *a, *b, *c))
        for _, _, _, col in tris:
            h, s, v = colorsys.rgb_to_hsv(*col)
            body = 0 if (s < 0.18 and (v > 0.85 or v < 0.22)) else 255     # eyes, teeth and outlines are not tinted by colour commands
            f.write(bytes([int(max(0, min(1, x)) * 255 + 0.5) for x in col] + [body]))
    lo, hi = bounds(tris)
    print(f'  {name:22s} {len(tris):5d} tris  size {hi[0]-lo[0]:.2f} x {hi[1]-lo[1]:.2f} x {hi[2]-lo[2]:.2f} m')

def load(rel):
    hits = sorted(glob.glob(os.path.join(SRC, rel)))
    if not hits: print('  MISSING source', rel); return None
    path = hits[0]
    return to_unity(read_glb(path) if path.lower().endswith('.glb') else read_obj(path))

# ---------------------------------------------------------------- what to bake
FARM = 'quaternius_farm/Farm Animals by @Quaternius/OBJ/'
FOOD = 'kenney_food-kit/Models/GLB format/'
HOLI = 'kenney_holiday-kit/Models/GLB format/'
SPACE = 'quaternius_spacekit/'
# name, source, axis, metres, yaw, stands on ground
MODELS = [
    ('Cow', FARM + 'Cow.obj', 'h', 1.45, 180, True), ('Horse', FARM + 'Horse.obj', 'h', 1.75, 180, True),
    ('Pig', FARM + 'Pig.obj', 'h', 0.75, 180, True), ('Sheep', FARM + 'Sheep.obj', 'h', 0.95, 180, True),
    ('Zebra', FARM + 'Zebra.obj', 'h', 1.45, 180, True),
    ('TreeSnowA', HOLI + 'tree-snow-a.glb', 'h', 3.4, 0, True), ('TreeSnowB', HOLI + 'tree-snow-b.glb', 'h', 2.8, 0, True),
    ('TreeSnowC', HOLI + 'tree-snow-c.glb', 'h', 4.0, 0, True), ('TreeDecorated', HOLI + 'tree-decorated-snow.glb', 'h', 3.0, 0, True),
    ('Snowman', HOLI + 'snowman-hat.glb', 'h', 1.35, 0, True), ('Lantern', HOLI + 'lantern.glb', 'h', 1.1, 0, True),
    ('Sled', HOLI + 'sled.glb', 'l', 1.2, 0, True), ('PresentA', HOLI + 'present-a-cube.glb', 'h', 0.42, 0, True),
    ('PresentB', HOLI + 'present-b-round.glb', 'h', 0.36, 0, True), ('PresentC', HOLI + 'present-a-rectangle.glb', 'h', 0.3, 0, True),
    ('SnowPile', HOLI + 'snow-pile.glb', 'l', 2.2, 0, True), ('RocksLarge', HOLI + 'rocks-large.glb', 'l', 2.4, 0, True),
    ('Reindeer', HOLI + 'reindeer.glb', 'h', 1.5, 0, True), ('Bench', HOLI + 'bench.glb', 'l', 1.5, 0, True),
    ('CandyCane', HOLI + 'candy-cane-red.glb', 'h', 1.0, 0, True),
]
# fruit: name, source, largest size in metres, flesh colour (sRGB)
FRUIT = [
    ('Apple', FOOD + 'apple.glb', 0.115, (0.98, 0.95, 0.80)), ('Orange', FOOD + 'orange.glb', 0.115, (1.00, 0.72, 0.30)),
    ('Watermelon', FOOD + 'watermelon.glb', 0.21, (0.95, 0.28, 0.33)), ('Lemon', FOOD + 'lemon.glb', 0.105, (1.00, 0.96, 0.66)),
    ('Pear', FOOD + 'pear.glb', 0.13, (0.97, 0.96, 0.78)), ('Coconut', FOOD + 'coconut.glb', 0.135, (0.99, 0.98, 0.94)),
]

# Whole scenery kits, baked at their native size (the Unity scenery builder scales each prop where it places it).
# These go to a folder Unity does not import (its name ends in ~); only the editor reads them, to build merged
# scenery meshes. kit prefix, folder holding the models
KITS = [
    ('nature', 'kenney_nature-kit/Models/*/'), ('racing', 'kenney_racing-kit/Models/*/'),
    ('pirate', 'kenney_pirate-kit/Models/*/'), ('town', 'kenney_fantasy-town-kit/Models/*/'),
    ('car', 'kenney_car-kit/Models/*/'), ('survival', 'kenney_survival-kit/Models/*/'),
    ('holiday', 'kenney_holiday-kit/Models/*/'), ('space', 'kenney_space-kit/Models/'),
    ('qspace', 'quaternius_spacekit/'),
]
KIT_OUT = os.path.join(OUT, 'Scenery~')

def bake_kits():
    index = []
    global RAW_COLOURS
    for kit, rel in KITS:
        RAW_COLOURS = kit in ('nature', 'racing', 'space')
        files = {}
        for ext in ('obj', 'glb'):                       # a GLB wins over an OBJ of the same name
            for path in glob.glob(os.path.join(SRC, rel, '*.' + ext)):
                files[os.path.splitext(os.path.basename(path))[0]] = path
        os.makedirs(os.path.join(KIT_OUT, kit), exist_ok=True)
        done = 0
        for name, path in sorted(files.items()):
            clean = name.split('-')[0].strip() if kit == 'qspace' and name.rsplit('-', 1)[-1][:1].isalnum() and len(name.rsplit('-', 1)[-1]) == 10 else name
            clean = clean.replace(' ', '_')
            try:
                tris = to_unity(read_glb(path) if path.lower().endswith('.glb') else read_obj(path))
            except Exception as e:
                print('  failed', kit, name, e); continue
            if not tris or len(tris) > 9000: continue      # a few hero models are too heavy to use
            tris, _ = normalise(tris, 'h', 1, 0, True, scale=1.0)
            lo, hi = bounds(tris)
            with open(os.path.join(KIT_OUT, kit, clean + '.bytes'), 'wb') as f:
                f.write(b'WWM1'); f.write(struct.pack('<i', len(tris)))
                for a, b, c, _ in tris: f.write(struct.pack('<9f', *a, *b, *c))
                for _, _, _, col in tris: f.write(bytes([int(max(0, min(1, x)) * 255 + 0.5) for x in col] + [0]))
            index.append(f'{kit}/{clean}\t{len(tris)}\t{hi[0]-lo[0]:.2f}\t{hi[1]-lo[1]:.2f}\t{hi[2]-lo[2]:.2f}')
            done += 1
        print(f'  kit {kit:9s} {done} models')
    RAW_COLOURS = False
    open(os.path.join(KIT_OUT, 'index.tsv'), 'w').write('name\ttris\tx\ty\tz\n' + '\n'.join(index) + '\n')

def main():
    print('Baking into', OUT)
    if '--kits' in sys.argv: bake_kits(); return
    for name, rel, axis, metres, yaw, ground in MODELS:
        t = load(rel)
        if t: write(name, normalise(t, axis, metres, yaw, ground)[0])
    planets = sorted(glob.glob(os.path.join(SRC, SPACE, 'Planet*.glb')))
    # picked by eye from the eleven in the kit: the tan ringed one (the Earth-like one is 10,000 triangles, too heavy)
    for name, index, metres in [('Saturn', 4, 1.25)]:
        if len(planets) >= index: write(name, normalise(to_unity(read_glb(planets[index - 1])), 'm', metres, 0, False)[0])
    for name, rel, size, flesh in FRUIT:
        t = load(rel)
        if not t: continue
        whole, _ = normalise(t, 'm', size, 0, False)
        write('Fruit_' + name, whole)
        write('FruitHalf_' + name, top_half(whole, flesh))

if __name__ == '__main__': main()
