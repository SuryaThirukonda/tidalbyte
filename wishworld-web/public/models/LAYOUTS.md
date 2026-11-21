# Layouts: how to rebuild each Unity scene in three.js

Written by the Unity exporter (`Assets/WishWorld/Editor/WebExporter.cs`, menu **WishWorld > Web > Export Everything**).
The numbers below are also in `layouts.json` (same folder) for code to read; `manifest.json` lists every model.
Game rules, UI text and timings are in `docs/UNITY_PARITY.md`; this file is only about where things are.

## 1. Axes, units, frames

- One unit is one metre. Nothing is rescaled.
- **Export axes** (every `.glb` here, and every number in this file and in `layouts.json`): Unity `(x, y, z)` is
  `(-x, y, z)`. A Unity rotation `(x, y, z, w)` is `(x, -y, -z, w)`; a Unity yaw of `a` degrees is a three.js
  `rotation.y` of `-a` degrees. Unity forward (+Z) stays +Z, so creatures and props face **+Z** in their files, and in a
  scene file the player stands at the origin facing **+Z**.
- **Headset world frame**: a three.js camera and a WebXR viewer look along -Z. `/vr/core/environment.js` therefore puts
  exported scenery under a group with `rotation.y = Math.PI`. Put anything placed from this file in that same group and
  it lands where Unity has it. Outside the group, a value `(x, y, z)` from this file is `(-x, y, -z)` and a yaw `a` is
  `a + 180`.
- Skies (`/textures/sky_<id>.jpg`) keep Unity's orientation. In the headset world frame they need no rotation; with the
  `.glb` files added unrotated use `scene.backgroundRotation.y = Math.PI`. Both were checked against Unity (section 8).
- A model file dropped at a `position` + `quaternion` (or `yaw`) from `layouts.json` sits exactly as in the game.

## 2. What is in a file, and how to shade it

- Geometry is `POSITION`, `COLOR_0` (RGBA bytes, **linear** colour, alpha always 1) and indices. No normals, no UVs,
  no textures. Vertices that share a position and colour are welded.
- **No normals on purpose**: the game shades one normal per triangle. GLTFLoader turns on `flatShading` for a mesh
  without normals, so the look is right with no extra work. Do not call `computeVertexNormals()`.
- `_BODYMASK` (`geometry.attributes._bodymask`, 0 or 1; present on 66 of the 112 files): 1 marks the part a colour wish
  repaints (the body), 0 the details (eyes, beaks, stripes). Unity keeps this in vertex alpha.
- Materials: `VertexLit` (base colour white, metallic 0, roughness 1, so nothing is darkened), `VertexLit_Glow`
  (the blade: the same plus an emissive ice blue) and `UIPanel` (the `ui_*.glb` panels, `KHR_materials_unlit`).
  All are single sided.
- The game's shader, for an exact match (`/shared/models.js` already implements it), all colours linear:
  `albedo = vertexColour * baseColour`; `wrap = (0.5 * max(dot(faceNormal, toSun), 0) + 0.5)^2`;
  `colour = albedo * (sunColour * sunIntensity * wrap * 0.62 + ambient * 0.61)`; then **linear** fog on view depth,
  `mix(colour, fogColour, clamp((depth - near) / (far - near), 0, 1))` (three.js `Fog` uses a smoothstep instead).
  Sun and fog colours are sRGB as authored (convert to linear); **ambient numbers are used as linear, unconverted**.
- With plain three.js lights instead (measured 1.8 / 255 mean error against Unity in the hub):
  `DirectionalLight(sunColour, Math.PI * 0.62 * 0.75 * sunIntensity)` placed along `toSun`, plus
  `AmbientLight(ambientLinear * 0.61 + sunColourLinear * 0.155 * sunIntensity, Math.PI)`, and `Fog(colour, near, far)`.
- No shadows are cast anywhere. Creatures and hub props get a soft dark blob on the ground (`/textures/dot.png`).

## 3. Scene files

| File | Contents | Size |
|---|---|---|
| `scene_hub.glb` | Hub terrain (snow plain, hills, mountain ring, 162 trees, hamlet, church and the camp props, one mesh `Terrain`) + `Clouds/Cloud0..8` | 66,216 tris, 2.6 MB |
| `scene_hub_lite.glb` | The same cut to 40,000 terrain triangles: far forest thinned, everything near kept | 41,756 tris, 1.4 MB |
| `world_aquarium.glb` / `world_aquarium_lite.glb` | Surroundings of the aquarium world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 178,874 tris, 3.4 MB / 40,000 tris, 1.0 MB |
| `world_zoo.glb` / `world_zoo_lite.glb` | Surroundings of the zoo world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 103,982 tris, 2.1 MB / 40,000 tris, 1.0 MB |
| `world_space.glb` / `world_space_lite.glb` | Surroundings of the space world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 109,554 tris, 2.0 MB / 40,000 tris, 1.0 MB |
| `world_dinosaurs.glb` / `world_dinosaurs_lite.glb` | Surroundings of the dinosaurs world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 143,518 tris, 3.3 MB / 40,000 tris, 1.1 MB |
| `world_arctic.glb` / `world_arctic_lite.glb` | Surroundings of the arctic world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 68,382 tris, 2.1 MB / 40,000 tris, 1.2 MB |
| `world_rainforest.glb` / `world_rainforest_lite.glb` | Surroundings of the rainforest world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 201,511 tris, 3.6 MB / 40,000 tris, 1.0 MB |
| `world_farm.glb` / `world_farm_lite.glb` | Surroundings of the farm world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 177,377 tris, 3.4 MB / 40,001 tris, 0.9 MB |
| `world_sky.glb` / `world_sky_lite.glb` | Surroundings of the sky world: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 60,624 tris, 1.9 MB / 40,000 tris, 1.2 MB |
| `world_race.glb` / `world_race_lite.glb` | Snow Circuit surroundings: terrain and props to the horizon, nodes `Sector0..7` (compass sectors, for culling) | 238,272 tris, 6.0 MB / 40,000 tris, 1.2 MB |
| `track_snowcircuit.glb` | Race track surface, kerbs, start line | 5,500 tris, 0.1 MB |
| `frostslice_props.glb` | The static pieces of the Frost Slice scene | 460 tris, 0.0 MB |
| `world_ground.glb`, `world_platform.glb` | Plain ground disc (radius 45 m) and round platform (radius 1.7 m) for a world that has no surroundings; in the game only the Wish World shows one (its platform) | small |

All of these are placed already: add them at the origin of the scenery group, no offset. The `_lite` files keep the
triangles that cover the most of the view (area over squared distance from the player, or from the track for the race) up
to 40,000; they are meant for the headset. The full files are for the desktop preview or a strong device. Every scene file
is over 20,000 triangles; one mesh per sector means 8 draw calls.

## 4. Hub (`Hub.unity`)

- Player: origin, facing +Z, eye height 1.6. Camera: fov 60, near 0.05, far 800.
- Sky `sky_hub.jpg`. Fog #979793, 45 to 620 m. Ambient (linear) (0.74, 0.78, 0.85). Sun #fff7eb x 1, toSun (-0.627, 0.616, -0.477).
- Penguin guide `penguin_guide.glb` at (1.30, 0.00, 2.15), yaw -148.8 (it faces the player). Nodes `Body`, `LeftWing`, `RightWing`; the wings wave (UNITY_PARITY 3).
- Snowfall emitter at (0.00, 4.50, 2.00): sprites from `/textures/dot.png` (numbers in UNITY_PARITY 3.4).
- Menu: 1.8 m in front of the player at height 1.38 (so at (0, 1.38, 1.8) here), facing the player. Banner `ui_ribbon.glb` 0.39 above the menu centre; cards `ui_card.glb` (0.44 x 0.32). Card positions and text: UNITY_PARITY 3.

Clouds (inside `scene_hub.glb`; each turns about the world Y axis through the origin at the rate shown, degrees per second as a three.js `rotation.y` rate in export axes):

| Node | Position | Yaw | Rate |
|---|---|---|---|
| `Cloud0` | (-41.11, 12.25, 0.00) | -90 | -0.91 |
| `Cloud1` | (-30.76, 15.79, 25.81) | -50 | -1.39 |
| `Cloud2` | (-7.11, 18.44, 40.34) | -10 | -0.69 |
| `Cloud3` | (16.05, 11.07, 27.80) | 30 | -0.81 |
| `Cloud4` | (38.57, 13.49, 14.04) | 70 | -0.99 |
| `Cloud5` | (40.42, 12.07, -14.71) | 110 | -0.77 |
| `Cloud6` | (22.10, 17.28, -38.28) | 150 | -0.71 |
| `Cloud7` | (-6.84, 11.06, -38.79) | -170 | -0.75 |
| `Cloud8` | (-27.52, 12.95, -23.09) | -130 | -0.90 |

The camp and the twelve near trees are already part of `scene_hub.glb`. They are also separate files, should a tab want
them on their own (for example in AR, where the terrain is not shown). Placement in export axes:

| Model | Position | Yaw | Scale |
|---|---|---|---|
| `snowman.glb` | (-2.45, 0.00, 2.90) | 139.8 | 1 |
| `lantern.glb` | (1.75, 0.00, 2.70) | -147.1 | 1.15 |
| `lantern.glb` | (-1.75, 0.00, 2.70) | 147.1 | 1.15 |
| `sled.glb` | (-2.50, 0.00, 1.30) | 47.5 | 1 |
| `present_a.glb` | (-2.15, 0.00, 1.75) | 109.1 | 1 |
| `present_b.glb` | (-2.60, 0.00, 2.05) | 158.3 | 1 |
| `present_c.glb` | (-2.90, 0.00, 1.60) | 73.9 | 1 |
| `bench.glb` | (2.70, 0.00, 0.90) | -108.4 | 1 |
| `reindeer.glb` | (3.40, 0.00, 3.60) | -166.6 | 1 |
| `tree_decorated.glb` | (-3.30, 0.00, 4.40) | 143.1 | 1.2 |
| `candy_cane.glb` | (2.30, 0.00, 3.30) | -145.1 | 1 |
| `candy_cane.glb` | (-3.10, 0.00, 3.20) | -44.1 | 1 |
| `rocks_large.glb` | (5.50, 0.00, 5.50) | -135.0 | 1.2 |
| `rocks_large.glb` | (-6.50, 0.00, 3.00) | 24.8 | 1 |
| `snow_pile.glb` | (3.60, 0.00, 1.90) | -117.8 | 0.9 |
| `snow_pile.glb` | (-4.20, 0.00, 2.60) | 61.8 | 1.1 |
| `tree_snow_a.glb` | (-5.59, 0.00, 7.05) | 141.6 | 1.08 |
| `tree_snow_b.glb` | (-3.78, 0.00, 11.39) | 161.6 | 1.64 |
| `tree_snow_c.glb` | (4.71, 0.00, 6.47) | -143.9 | 0.747 |
| `tree_snow_a.glb` | (10.41, 0.00, 7.78) | -126.8 | 1.22 |
| `tree_snow_b.glb` | (-13.72, 0.00, 2.78) | 101.5 | 1.56 |
| `tree_snow_c.glb` | (-8.78, 0.00, -4.79) | 61.4 | 0.862 |
| `tree_snow_a.glb` | (-5.44, 0.00, -13.98) | 21.2 | 1.42 |
| `tree_snow_b.glb` | (9.86, 0.00, -4.87) | -63.7 | 1.4 |
| `tree_snow_c.glb` | (3.61, 0.00, -8.25) | -23.6 | 0.805 |
| `tree_snow_a.glb` | (2.85, 0.00, 15.74) | -169.7 | 1.49 |
| `tree_snow_b.glb` | (-5.54, 0.00, 3.40) | 121.5 | 0.986 |
| `tree_snow_c.glb` | (6.29, 0.00, 2.60) | -112.4 | 0.747 |

## 5. Worlds (`World.unity`: one scene, a world is data)

- Player: origin, facing +Z, eye height 1.6. Before a world is applied: fog #ffffff 12 to 40 m, ambient (0.62, 0.66, 0.72),
  white sun x 1 with toSun (-0.321, 0.766, -0.557).
- Surroundings bring their own ground. Only a world without surroundings shows a plain one: `Ground` mode Full shows
  `world_ground.glb`, mode Platform shows `world_platform.glb`, each multiplied by the world's ground colour (the
  material's base colour). In the game as built that is only the Wish World (`blank`, platform #f5edfa). In AR neither
  is shown.
- Creatures are placed by rule, not by position: a ring around the player from `distance` and `height` in
  `layouts.json > creatures` (also in `/shared/creatures.js`); the rule is `Spawner.cs`, described in UNITY_PARITY 1.

| World | Sky | Scenery | Ground | Fog | Ambient (linear) | Sun | Sound | Creatures |
|---|---|---|---|---|---|---|---|---|
| `aquarium` Aquarium | `sky_aquarium.jpg` | `world_aquarium.glb` | Full #dbc794 | #1a78ad, 4.96 to 62 m | (0.46, 0.64, 0.78) | #bfebff x 0.95, toSun (-0.321, 0.766, -0.557) | `amb_water` | clownfish x8, turtle x1, shark x1, jellyfish x4, ray x1 |
| `zoo` Zoo | `sky_zoo.jpg` | `world_zoo.glb` | Full #ccad61 | #c8c4b9, 79.2 to 660 m | (0.74, 0.68, 0.58) | #ffe6b8 x 1.1, toSun (-0.676, 0.500, -0.541) | `amb_outdoor` | elephant x1, giraffe x1, zebra x2, lion x1, flamingo x3 |
| `space` Space | `sky_space.jpg` | `world_space.glb` | Platform #4c5473 | none | (0.36, 0.37, 0.48) | #fffaf2 x 1.1, toSun (-0.379, 0.504, -0.776) | `amb_hum` | saturn x1, earth x1, venus x1, astronaut x1, rocket x1, satellite x1, comet x1 |
| `dinosaurs` Dinosaurs | `sky_dinosaurs.jpg` | `world_dinosaurs.glb` | Full #5c8f47 | #b8bbaf, 81.6 to 680 m | (0.62, 0.72, 0.62) | #fff7e0 x 1.05, toSun (-0.702, 0.500, -0.507) | `amb_outdoor` | trex x1, triceratops x1, stegosaurus x1, pterosaur x2 |
| `arctic` Arctic | `sky_arctic.jpg` | `world_arctic.glb` | Full #ebf5ff | #385ca9, 84 to 700 m | (0.44, 0.54, 0.74) | #cce6ff x 0.85, toSun (-0.649, 0.500, -0.574) | `amb_wind` | penguin x4, polarbear x1, seal x1, whale x1, snowyowl x1 |
| `rainforest` Rainforest | `sky_rainforest.jpg` | `world_rainforest.glb` | Full #427038 | #afc3b2, 9 to 150 m | (0.52, 0.66, 0.52) | #f2ffdb x 0.95, toSun (-0.548, 0.698, -0.461) | `amb_outdoor` | parrot x2, monkey x1, frog x2, butterfly x6, sloth x1 |
| `farm` Farm | `sky_farm.jpg` | `world_farm.glb` | Full #75b252 | #aab0ab, 81.6 to 680 m | (0.70, 0.75, 0.70) | #fffae6 x 1.1, toSun (-0.570, 0.698, -0.433) | `amb_outdoor` | cow x1, sheep x3, horse x1, chicken x3, pig x1 |
| `sky` Sky | `sky_sky.jpg` | `world_sky.glb` | Platform #f7faff | #b3b2b3, 237 to 790 m | (0.75, 0.80, 0.90) | #ffffff x 1.1, toSun (-0.558, 0.500, -0.663) | `amb_wind` | balloon x2, bird x6, kite x1, plane x1 |
| `blank` Wish World | `sky_blank.jpg` | none | Platform #f5edfa | none | (0.72, 0.72, 0.80) | #fffaf5 x 1.05, toSun (-0.321, 0.766, -0.557) | `amb_wind` | none |

## 6. Frost Slice (`Game_FrostSlice.unity`)

- Player: origin, facing +Z, standing. Normally the real room is shown (passthrough); the fallback sky is `sky_hub.jpg`.
- Fog none. Ambient (linear) (0.72, 0.72, 0.74). Sun #ffffff x 1, toSun (-0.321, 0.766, -0.557).
- `frostslice_props.glb` at the origin (size (1.67, 0.50, 2.68) m).
- Blades: `blade.glb` on each controller at the grip, pointing +Z, tip at z = 0.64. Fruit: `fruit_<name>.glb`, halves `fruit_half_<name>.glb` (cut face toward -Y), hazard `ice_block.glb`.
- Fruit fly from x -0.45..0.45, y 0.35, z 1.5..2.0 up to x -0.38..0.38, y 1.1..1.55, z 0.45..0.62 (x mirrors, the range is symmetric). Menu panel at (0, 1.4, 1.35), score board at (0, 2.05, 2.5). Rules: UNITY_PARITY 8.

## 7. Snow Circuit (`Game_SnowCircuit.unity`)

- `track_snowcircuit.glb` + `world_race.glb` (or `_lite`) at the origin. Sky `sky_race.jpg`.
- Fog #9ca4b6, 90 to 740 m. Ambient (linear) (0.74, 0.78, 0.86). Sun #fffaf0 x 1.05, toSun (-0.571, 0.733, -0.371).
- Track centre line: `layouts.json > track`: 320 points, closed, evenly spaced, width 7 m, lap length 201.3 m. First point (0.00, 0.00, 0.00), second (0.02, 0.00, 0.63) (the driving direction).
- Car start: position (-0.10, 0.00, -4.00), yaw 1.48. The rig (seated player) is a child of the car at (0, -0.1, 0), so the eyes are about 1.5 m above the car origin.
- `car_player.glb`: nodes `Cockpit`, `WheelMount` at (0, 0.70, 0.44) tilted 22 degrees with child `Wheel` (turn it about its own Z), `Dash` at (0, 0.89, 0.77) tilted 15 degrees with three empty `Readout` nodes at x = 0.18, 0, -0.18 for the speed, lap and time texts. `car_cockpit.glb` and `steering_wheel.glb` are the two meshes alone.
- Rivals `rival_car_0..4.glb` (4 m long, facing +Z), ghost `ghost_car.glb`. Grid positions and speeds: `RaceRivals.cs`, UNITY_PARITY 8.

## 8. Checks made on this export

- Every `.glb` passes the Khronos glTF validator (0 errors, 0 warnings) and loads in the vendored three.js r187 GLTFLoader
  with the triangle count and size given in `manifest.json`.
- The hub was rendered in Unity and in three.js (scene_hub.glb + sky_hub.jpg + penguin_guide.glb placed from
  `layouts.json`) from the same eye point in two directions: mean difference 0.9 / 255 per channel with the game's
  shader formula, 1.8 / 255 with the plain light recipe of section 2. That covers axes, winding, colour, sky
  orientation, light direction and fog.

## 9. Things to know

- **Farm animals**: in Unity the cow, horse, pig, sheep and zebra (the Quaternius pack) are baked facing -Z, so in the
  game they walk tail first. Their `.glb` files and thumbnails are turned to face +Z like every other creature.
- Creature files are centred in X and Z on their bounding box; Y is as in the game (walkers stand on y = 0, swimmers
  and fliers are centred on their body). `min` / `max` in `manifest.json` give the exact box.
- `ui_*.glb` panels face -Z (toward a viewer who looks along +Z) and are single sided; text sits 4 mm in front (z - 0.004).
- Thumbnails: `thumbs/<creature id>.png`, 256 x 256, transparent background, seen from the front left.
- Sizes: creatures are 3 to 36 KB (100 to 2,010 triangles, 331 KB for all forty); props are 2 to 83 KB.
- Not exported because the game has none: mailbox, gift box, gift card, music. Snow, juice bursts, pointer rays and the
  blade trail are particle or line effects with no mesh. Reef props on their own (coral, kelp) exist only merged into
  `world_aquarium.glb`.

