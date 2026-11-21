# WishWorld: Unity parity reference

What the Unity game (Unity 6000.3.29f1, URP 17.3, Meta Quest 2) contains, so the three.js WebXR build can look and
behave the same. Read-only inventory taken from commit `f1b6111`. Making it changed nothing under
`Assets/`, `Packages/` or `ProjectSettings/` and did not run Unity: every number below was read from source or from the
serialized `.asset` / `.prefab` / `.unity` files. `.env` and the service config asset (they hold keys) were not opened.
(`Assets/WishWorld/Editor/WebExporter.cs` and `Assets/WishWorld/Scripts/Web/` appeared while this was being written; they
belong to the export work and are not described here.)

**Conventions used in this file**

- Paths are relative to the repo root. `Scripts/…` and `Editor/…` mean `Assets/WishWorld/Scripts/…` and `Assets/WishWorld/Editor/…`.
- Positions are Unity coordinates: metres, left-handed, **+Y up, +Z forward, +X right**. The player stands at the origin facing +Z.
- Colours are written as the sRGB hex of the Unity `Color` in the source (Unity colour floats are sRGB values; the project
  renders in **linear** colour space, `ProjectSettings/ProjectSettings.asset` `m_ActiveColorSpace: 1`).
- "Generated" = built in code by the editor builder (`WishWorld > Rebuild All`, `Editor/Builder.*.cs`) and saved as a
  Unity mesh asset. "Pack" = a third-party CC0 model baked to `Assets/ThirdParty/Baked/<Name>.bytes` and turned into the
  same kind of mesh by `Editor/PackMeshes.cs`.

**Contents**: 0 Read this first · 1 Creature / wish library · 2 Worlds · 3 Hub scene · 4 Look (theme, fonts, shaders, UI,
lights) · 5 Player rig and input · 6 Voice and AI · 7 Audio · 8 Games · 9 Asset inventory · 10 Export notes ·
Appendix A: the 354 baked voice lines. The machine-readable copy of sections 1 and 2 is `public/shared/creatures.js`.

## 0. Read this first: things that differ from what the web spec assumes

1. **There is no world called "reef".** The sea world's Unity id is `aquarium` (display name "Aquarium"; "reef" is only one
   of its keywords, and its surroundings builder is called `SceneryReef`). `creatures.js` uses `aquarium`.
2. **ElevenLabs agents are not used.** `ELEVENLABS_AGENT_ID` / `ELEVENLABS_GUIDE_AGENT_ID` are never read by any code;
   `BUILD_LOG.md` (line 575) says they belong to another app ("Poise"). Unity uses plain REST text-to-speech and
   speech-to-text only. No websocket, no conversational agent.
3. **34 of the 40 creature models are generated in code** from boxes, spheres and cylinders (prefabs named `PLACEHOLDER_*`).
   Only zebra, cow, sheep, horse, pig and Saturn are third-party models (`Model_*`). The sea creatures are all generated:
   `THIRD_PARTY.md` says the planned Quaternius fish, shark, ray and whale could not be downloaded.
4. **No texture is used on any model.** Everything is vertex-coloured and drawn with one material (`M_VertexLit`). The
   only textures are the sky panoramas, a 64 px soft dot (particles, blob shadows) and the font atlases.
5. **No sound files exist except the baked voice lines.** Every sound effect and ambient loop is synthesised in code
   (`Scripts/Core/Sfx.cs`); section 7 gives the formulas.
6. **Unity has five movement types: Swim, Fly, Walk, Float, Orbit.** There is no "hover". `Float` creatures (jellyfish,
   astronaut, satellite, sloth, balloon, kite) do not travel at all: they bob and slowly spin in place, and their `speed`
   value is never used. `Orbit` is used by the three planets.
7. **Facts are not verified.** Every creature is saved with `factChecked: 0`; `Editor/Builder.Worlds.cs` line 21 says they
   were written from general knowledge. Check them before showing them to children.
8. **Creature placement uses a random seed that cannot be reproduced in JavaScript** (`new System.Random(def.id.GetHashCode())`,
   `Scripts/Worlds/Spawner.cs` line 29). The rules can be matched; the exact spots cannot.
9. **The hub's reindeer, snowman, trees, sled and presents are not separate objects.** They are merged into one mesh,
   `HubTerrain.asset` (183,151 vertices). To get the reindeer alone, convert `Assets/ThirdParty/Baked/Reindeer.bytes`
   (format in section 10).
10. The API keys ship inside the Unity app (`Assets/WishWorld/Config/Resources/WishWorldServiceConfig.asset`, git-ignored).
    The web build must not copy that pattern: keys stay in `/api`.

---

## 1. Creature / wish library

### 1.1 Where it is defined

| What | Where |
|---|---|
| Source of truth (edit here) | `Assets/WishWorld/Editor/Builder.Worlds.cs`, the `Creatures` array (lines 23 to 113) and the `Worlds` array (lines 126 to 181) |
| Saved creature definitions | `Assets/WishWorld/Definitions/Creatures/<id>.asset` (class `CreatureDefinition`, `Scripts/Worlds/CreatureDefinition.cs`) |
| Saved world definitions | `Assets/WishWorld/Definitions/Worlds/<id>.asset` (class `WorldDefinition`, `Scripts/Worlds/WorldDefinition.cs`) |
| Runtime library | `Assets/WishWorld/Resources/WorldLibrary.asset`, loaded with `WorldLibrary.I` (`Scripts/Worlds/WorldLibrary.cs`). Holds 9 worlds, 40 creatures, `snowPrefab` = `Generated/Prefabs/Snowfall.prefab`, `guidePrefab` = `Generated/Prefabs/PLACEHOLDER_PenguinGuide.prefab`, `skyMaterial` = `Generated/Materials/M_SkyPanorama.mat` |
| Model geometry | `Assets/WishWorld/Editor/CreatureMeshes.cs` (one function per creature) and `Assets/ThirdParty/Baked/<Name>.bytes` for the six pack models |
| Movement | `Scripts/Worlds/Mover.cs`, placement in `Scripts/Worlds/Spawner.cs`, touch / gaze / glow in `Scripts/Worlds/Creature.cs` |

The asset files were compared with `Builder.Worlds.cs` for this document: all 40 facts, quiz questions and keyword lists
are identical.

**Ids.** The option id is `CreatureDefinition.id` (same as the asset file name). The words sent to and returned by the
AI are **not** the ids: they are each creature's first keyword (`CommandParser.Options`, `Scripts/Wish/CommandParser.cs`
line 143). They differ for 4 creatures: `trex` → "t rex", `polarbear` → "polar bear", `snowyowl` → "snowy owl", `balloon` → "hot air balloon". For every other creature the first keyword equals the id. World options are the world ids.

**Keyword quirks** (from the keyword lists; `CommandParser.Parse` adds every creature whose keyword appears):
"fish" and "flying fish" select the clownfish; "planet" selects Saturn, Earth and Venus together; "bear" selects the polar
bear; "bird" the sky bird; "jelly" the jellyfish; "rex" the T. rex; "pony" the horse; "lamb" the sheep; "hen" the chicken;
"piglet" the pig; "balloon" the hot-air balloon. Plurals in -s, -es and -y → -ies are matched automatically.

### 1.2 Models

All creatures: prefab root scale 1, one `MeshFilter` + `MeshRenderer` (`M_VertexLit`, no shadows cast or received) + a
trigger `BoxCollider` sized to the mesh bounds with a minimum of 0.12 m per side (`Builder.Worlds.cs` lines 201 to 204).
Models face **+Z**. Walkers stand on y = 0; swimmers and flyers are centred on their origin (`CreatureMeshes.cs` lines 5
to 9). "Lowest y" below is the bottom of the mesh bounds, so 0 means it stands on the ground.
Prefab paths are under `Assets/WishWorld/Generated/Prefabs/`, mesh paths under `Assets/WishWorld/Generated/Meshes/`.
Habitat is not a Unity field; it is derived here from the movement type and the world.

| id | Name | Keywords (first = the wish option) | Habitat (derived) | World (start count) | Prefab → mesh | How the mesh is produced | Vertices / triangles | Size x × y × z (m) | Lowest y (m) | Colours (dominant first) |
|---|---|---|---|---|---|---|---|---|---|---|
| `clownfish` | Clownfish | clownfish, flying fish, fish | water | aquarium (8) | `PLACEHOLDER_Clownfish.prefab` → `PLACEHOLDER_Clownfish.asset` | generated: `CreatureMeshes.Clownfish()` | 288 / 144 | 0.08 × 0.1 × 0.18 | -0.04 | body `#fa7a1a`, fins `#f2590d`, stripes `#f7f7f7`, pupils `#14141a` |
| `turtle` | Sea Turtle | turtle, sea turtle | water | aquarium (1) | `PLACEHOLDER_SeaTurtle.prefab` → `PLACEHOLDER_SeaTurtle.asset` | generated: `CreatureMeshes.Turtle()` | 264 / 132 | 1.1 × 0.27 × 0.93 | -0.09 | shell `#4d854d`, top plate `#66a357`, skin `#9ec270`, underside `#e5d68f` |
| `shark` | Shark | shark | water | aquarium (1) | `PLACEHOLDER_Shark.prefab` → `PLACEHOLDER_Shark.asset` | generated: `CreatureMeshes.Shark()` | 432 / 216 | 1.12 × 0.85 × 1.97 | -0.28 | body `#6b8099`, belly `#e5edf5`, gills `#404d61` |
| `jellyfish` | Jellyfish | jellyfish, jelly | water | aquarium (4) | `PLACEHOLDER_Jellyfish.prefab` → `PLACEHOLDER_Jellyfish.asset` | generated: `CreatureMeshes.Jellyfish()` | 264 / 132 | 0.34 × 0.6 × 0.35 | -0.42 | bell `#f58fc7`, underside and tentacles `#fccce5` |
| `ray` | Ray | ray, stingray, manta ray, manta | water | aquarium (1) | `PLACEHOLDER_Ray.prefab` → `PLACEHOLDER_Ray.asset` | generated: `CreatureMeshes.Ray()` | 264 / 132 | 1.14 × 0.14 × 1.42 | -0.06 | body `#475c85`, underside `#f7f7f7` |
| `elephant` | Elephant | elephant | land | zoo (1) | `PLACEHOLDER_Elephant.prefab` → `PLACEHOLDER_Elephant.asset` | generated: `CreatureMeshes.Elephant()` | 478 / 352 | 1.35 × 2.65 × 3.72 | 0 | body `#9ea3b0`, tusks `#f7f7f7` |
| `giraffe` | Giraffe | giraffe | land | zoo (1) | `PLACEHOLDER_Giraffe.prefab` → `PLACEHOLDER_Giraffe.asset` | generated: `CreatureMeshes.Giraffe()` | 599 / 540 | 0.8 × 4.54 × 2.29 | 0 | body `#f2cc6b`, spots, horns, tail `#99612e` |
| `zebra` | Zebra | zebra | land | zoo (2) | `Model_Zebra.prefab` → `Model_Zebra.asset` | pack: `Assets/ThirdParty/Baked/Zebra.bytes` (Quaternius Farm Animals Pack (CC0 1.0)); generated fallback `CreatureMeshes.Zebra()` | 4062 / 1354 | 0.53 × 1.45 × 1.89 | 0 | `#e6e6e6` 52% (not tintable), `#333333` 48% (not tintable) |
| `lion` | Lion | lion | land | zoo (1) | `PLACEHOLDER_Lion.prefab` → `PLACEHOLDER_Lion.asset` | generated: `CreatureMeshes.Lion()` | 414 / 324 | 0.68 × 1.5 × 2.1 | 0 | body `#e0ad5c`, mane, tail tuft `#8c5426`, muzzle `#f7f7f7` |
| `flamingo` | Flamingo | flamingo | land | zoo (3) | `PLACEHOLDER_Flamingo.prefab` → `PLACEHOLDER_Flamingo.asset` | generated: `CreatureMeshes.Flamingo()` | 354 / 410 | 0.25 × 1.36 × 0.65 | 0 | body `#fa8ca6`, legs `#f2738c`, beak `#14141a` |
| `saturn` | Saturn | saturn, planet | air | space (1) | `Model_Saturn.prefab` → `Model_Saturn.asset` | pack: `Assets/ThirdParty/Baked/Saturn.bytes` (Quaternius Ultimate Space Kit (CC0 1.0)); generated fallback `CreatureMeshes.Saturn()` | 6030 / 2010 | 1.25 × 0.74 × 1.16 | -0.37 | `#cb9157` 42% (tintable), `#9d724f` 34% (tintable), `#b67346` 14% (tintable) |
| `earth` | Earth | earth, planet | air | space (1) | `PLACEHOLDER_Earth.prefab` → `PLACEHOLDER_Earth.asset` | generated: `CreatureMeshes.Earth()` | 405 / 604 | 0.53 × 0.52 × 0.5 | -0.26 | ocean `#3373e0`, land `#4da852`, ice caps `#f7f7f7` |
| `venus` | Venus | venus, planet | air | space (1) | `PLACEHOLDER_Venus.prefab` → `PLACEHOLDER_Venus.asset` | generated: `CreatureMeshes.Venus()` | 450 / 756 | 0.46 × 0.46 × 0.45 | -0.23 | body `#f2d694`, light band `#fcedc2`, dark band `#dbb270` |
| `astronaut` | Astronaut | astronaut | air | space (1) | `PLACEHOLDER_Astronaut.prefab` → `PLACEHOLDER_Astronaut.asset` | generated: `CreatureMeshes.Astronaut()` | 280 / 176 | 0.78 × 1.34 × 0.51 | 0 | suit `#f7f7f7`, limbs `#dbe0eb`, visor `#263359`, backpack `#ccd1db`, chest badge `#f28c4d` |
| `rocket` | Rocket | rocket, rocket ship | air | space (1) | `PLACEHOLDER_Rocket.prefab` → `PLACEHOLDER_Rocket.asset` | generated: `CreatureMeshes.Rocket()` | 228 / 194 | 0.99 × 0.86 × 2.5 | -0.3 | body `#f7f7f7`, nose and fins `#e54038`, window `#59b2f2`, flame `#ffa626` |
| `satellite` | Satellite | satellite | air | space (1) | `PLACEHOLDER_Satellite.prefab` → `PLACEHOLDER_Satellite.asset` | generated: `CreatureMeshes.Satellite()` | 218 / 178 | 2.45 × 0.65 × 0.66 | -0.2 | body `#ebbf4d`, solar panels `#335cbf`, dish `#f7f7f7` |
| `comet` | Comet | comet | air | space (1) | `PLACEHOLDER_Comet.prefab` → `PLACEHOLDER_Comet.asset` | generated: `CreatureMeshes.Comet()` | 179 / 230 | 0.36 × 0.36 × 1.57 | -0.18 | head `#c7ebff`, tail `#9ed1ff`, sparks `#f7f7f7` |
| `trex` | T. rex | t rex, trex, tyrannosaurus, rex | land | dinosaurs (1) | `PLACEHOLDER_Trex.prefab` → `PLACEHOLDER_Trex.asset` | generated: `CreatureMeshes.TRex()` | 747 / 954 | 1.34 × 3.62 × 5.79 | 0 | body `#5c8f52`, belly, jaw `#ccd18f` |
| `triceratops` | Triceratops | triceratops | land | dinosaurs (1) | `PLACEHOLDER_Triceratops.prefab` → `PLACEHOLDER_Triceratops.asset` | generated: `CreatureMeshes.Triceratops()` | 481 / 408 | 1.5 × 2.69 × 5.09 | 0 | body `#c7854d`, frill `#db9e5c`, horns `#f7f7f7` |
| `stegosaurus` | Stegosaurus | stegosaurus | land | dinosaurs (1) | `PLACEHOLDER_Stegosaurus.prefab` → `PLACEHOLDER_Stegosaurus.asset` | generated: `CreatureMeshes.Stegosaurus()` | 510 / 282 | 1.1 × 2.84 × 5.25 | 0 | body `#859e57`, plates `#eb8f42`, tail spikes `#f7f7f7` |
| `pterosaur` | Pterosaur | pterosaur, pterodactyl | air | dinosaurs (2) | `PLACEHOLDER_Pterosaur.prefab` → `PLACEHOLDER_Pterosaur.asset` | generated: `CreatureMeshes.Pterosaur()` | 308 / 376 | 2.84 × 0.48 × 1.72 | -0.15 | body `#b26b52`, wings `#d18f66`, beak `#f2cc66`, crest `#eb8040` |
| `penguin` | Penguin | penguin | land | arctic (4) | `PLACEHOLDER_Penguin.prefab` → `PLACEHOLDER_Penguin.asset` | generated: `CreatureMeshes.Penguin()` | 264 / 132 | 0.65 × 0.9 × 0.49 | 0 | body `#14141a`, belly, face `#f7f7f7`, beak, feet `#fa9e2e` |
| `polarbear` | Polar Bear | polar bear, bear | land | arctic (1) | `PLACEHOLDER_PolarBear.prefab` → `PLACEHOLDER_PolarBear.asset` | generated: `CreatureMeshes.PolarBear()` | 424 / 356 | 0.85 × 1.61 × 2.5 | 0 | body `#f7f7f0`, nose `#14141a` |
| `seal` | Seal | seal | land | arctic (1) | `PLACEHOLDER_Seal.prefab` → `PLACEHOLDER_Seal.asset` | generated: `CreatureMeshes.Seal()` | 264 / 132 | 0.93 × 0.7 × 1.82 | -0.05 | body `#858f9e`, muzzle `#c2c7cc` |
| `whale` | Blue Whale | whale, blue whale | water | arctic (1) | `PLACEHOLDER_BlueWhale.prefab` → `PLACEHOLDER_BlueWhale.asset` | generated: `CreatureMeshes.Whale()` | 408 / 204 | 1.94 × 1.09 × 3.98 | -0.55 | body `#3d66a8`, belly `#dbe5f2`, throat grooves `#b2c2d6` |
| `snowyowl` | Snowy Owl | snowy owl, owl | air | arctic (1) | `PLACEHOLDER_SnowyOwl.prefab` → `PLACEHOLDER_SnowyOwl.asset` | generated: `CreatureMeshes.SnowyOwl()` | 382 / 306 | 1.14 × 0.38 × 0.81 | -0.12 | body `#f7f7f7`, wings, tail `#ebebe5`, eyes `#fad126`, beak `#404047` |
| `parrot` | Parrot | parrot | air | rainforest (2) | `PLACEHOLDER_Parrot.prefab` → `PLACEHOLDER_Parrot.asset` | generated: `CreatureMeshes.Parrot()` | 262 / 138 | 0.73 × 0.27 × 0.95 | -0.09 | body `#e53329`, wings, tail `#2e6be5`, beak `#fad966`, tail feather `#facc26` |
| `monkey` | Monkey | monkey | land | rainforest (1) | `PLACEHOLDER_Monkey.prefab` → `PLACEHOLDER_Monkey.asset` | generated: `CreatureMeshes.Monkey()` | 512 / 504 | 0.48 × 0.88 × 0.65 | 0 | body `#805738`, face, ears `#e5bd94` |
| `frog` | Tree Frog | frog, tree frog | land | rainforest (2) | `PLACEHOLDER_TreeFrog.prefab` → `PLACEHOLDER_TreeFrog.asset` | generated: `CreatureMeshes.Frog()` | 390 / 544 | 0.35 × 0.2 × 0.28 | 0 | body `#4dc752`, belly `#faeb80`, toes `#f27333` |
| `butterfly` | Butterfly | butterfly | air | rainforest (6) | `PLACEHOLDER_Butterfly.prefab` → `PLACEHOLDER_Butterfly.asset` | generated: `CreatureMeshes.Butterfly()` | 312 / 436 | 0.2 × 0.04 × 0.12 | -0.01 | fore wings `#fa8c1f`, hind wings `#fab833`, body, wing dots `#14141a` |
| `sloth` | Sloth | sloth | air | rainforest (1) | `PLACEHOLDER_Sloth.prefab` → `PLACEHOLDER_Sloth.asset` | generated: `CreatureMeshes.Sloth()` | 340 / 384 | 1.1 × 0.89 × 0.43 | -0.43 | body `#a89475`, face `#ebdbbd`, branch `#735238` |
| `cow` | Cow | cow | land | farm (1) | `Model_Cow.prefab` → `Model_Cow.asset` | pack: `Assets/ThirdParty/Baked/Cow.bytes` (Quaternius Farm Animals Pack (CC0 1.0)); generated fallback `CreatureMeshes.Cow()` | 2388 / 796 | 0.64 × 1.45 × 2.58 | 0 | `#e6e6e6` 63% (not tintable), `#333333` 33% (not tintable), `#e6747f` 4% (tintable) |
| `sheep` | Sheep | sheep, lamb | land | farm (3) | `Model_Sheep.prefab` → `Model_Sheep.asset` | pack: `Assets/ThirdParty/Baked/Sheep.bytes` (Quaternius Farm Animals Pack (CC0 1.0)); generated fallback `CreatureMeshes.Sheep()` | 1836 / 612 | 0.48 × 0.95 × 1.29 | 0 | `#e6e6e6` 83% (not tintable), `#393939` 17% (tintable) |
| `horse` | Horse | horse, pony | land | farm (1) | `Model_Horse.prefab` → `Model_Horse.asset` | pack: `Assets/ThirdParty/Baked/Horse.bytes` (Quaternius Farm Animals Pack (CC0 1.0)); generated fallback `CreatureMeshes.Horse()` | 2070 / 690 | 0.65 × 1.75 × 2.34 | 0 | `#734e3f` 86% (tintable), `#2b2b2b` 14% (not tintable) |
| `chicken` | Chicken | chicken, hen | land | farm (3) | `PLACEHOLDER_Chicken.prefab` → `PLACEHOLDER_Chicken.asset` | generated: `CreatureMeshes.Chicken()` | 368 / 256 | 0.35 × 0.66 × 0.57 | 0.09 | body `#f7f7f7`, wings, tail `#edede5`, beak, legs `#fac233`, comb, wattle `#e52e2e` |
| `pig` | Pig | pig, piglet | land | farm (1) | `Model_Pig.prefab` → `Model_Pig.asset` | pack: `Assets/ThirdParty/Baked/Pig.bytes` (Quaternius Farm Animals Pack (CC0 1.0)); generated fallback `CreatureMeshes.Pig()` | 1686 / 562 | 0.54 × 0.75 × 1.6 | 0 | `#d7a0a3` 99% (tintable), `#7b5441` 1% (tintable) |
| `balloon` | Hot-Air Balloon | hot air balloon, balloon | air | sky (2) | `PLACEHOLDER_HotAirBalloon.prefab` → `PLACEHOLDER_HotAirBalloon.asset` | generated: `CreatureMeshes.Balloon()` | 602 / 868 | 2.19 × 3.35 × 2.13 | 0 | envelope `#fa8c5c`, white band `#f7f7f7`, blue band `#599ef2`, basket `#9e7042` |
| `bird` | Bird | bird | air | sky (6) | `PLACEHOLDER_Bird.prefab` → `PLACEHOLDER_Bird.asset` | generated: `CreatureMeshes.SkyBird()` | 240 / 120 | 0.73 × 0.24 × 0.51 | -0.08 | body `#4d99f2`, wings, tail `#3873d9`, beak `#fac233` |
| `kite` | Kite | kite | air | sky (1) | `PLACEHOLDER_Kite.prefab` → `PLACEHOLDER_Kite.asset` | generated: `CreatureMeshes.Kite()` | 190 / 100 | 0.99 × 1.9 × 0.03 | -1.4 | sail `#fa9e6b`, spars `#f7f7f7`, tail bows `#599ef2`, tail bows `#fad94d` |
| `plane` | Plane | plane, airplane, aeroplane | air | sky (1) | `PLACEHOLDER_Plane.prefab` → `PLACEHOLDER_Plane.asset` | generated: `CreatureMeshes.Plane()` | 252 / 226 | 2.6 × 0.7 × 2.53 | -0.21 | fuselage `#f7f7f7`, wings, nose, tail `#e5473d`, canopy `#59b2f2` |

Colour notes: `W` white is `#f7f7f7` (0.97) and `K` black is `#14141a` (0.08, 0.08, 0.10) in `CreatureMeshes.cs` line 12.
Eyes are a white cube or sphere with a smaller black one in front. Vertex alpha is 1 on "body" parts (the parts a colour
wish recolours) and 0 on details such as eyes, bellies, beaks and stripes. On the pack models the mask came from the
baker, with uneven results: a colour wish recolours all of the pig and Saturn, 86% of the horse (its coat), 17% of the
sheep (face and legs, not the wool), 4% of the cow (its pink nose) and **nothing on the zebra**.

### 1.3 Movement parameters (from the `.asset` files)

| id | MoveType | speed (m/s) | Ring distance min to max (m) | Height min to max (m) | arScale | Longest side: VR → AR (m) | addCount | Schooling | voicePitch → chirp start |
|---|---|---|---|---|---|---|---|---|---|
| `clownfish` | Swim | 0.35 | 1.3 to 2.4 | 1 to 1.7 | 1 | 0.18 → 0.18 | 8 | yes | 1.8 → 792 Hz |
| `turtle` | Swim | 0.25 | 2 to 3.4 | 0.9 to 1.8 | 0.5 | 1.1 → 0.55 | 1 | no | 0.8 → 352 Hz |
| `shark` | Swim | 0.5 | 3.6 to 5.4 | 1.2 to 2.4 | 0.35 | 1.97 → 0.69 | 1 | no | 0.5 → 220 Hz |
| `jellyfish` | Float | 0.1 (unused) | 1.4 to 3 | 1 to 2.2 | 0.8 | 0.6 → 0.48 | 3 | no | 1.5 → 660 Hz |
| `ray` | Swim | 0.35 | 2.6 to 4.4 | 0.6 to 1.2 | 0.45 | 1.42 → 0.64 | 1 | no | 0.7 → 308 Hz |
| `elephant` | Walk | 0.3 | 4.8 to 5.8 | 0 to 0 | 0.12 | 3.72 → 0.45 | 1 | no | 0.45 → 198 Hz |
| `giraffe` | Walk | 0.3 | 4.8 to 5.9 | 0 to 0 | 0.1 | 4.54 → 0.45 | 1 | no | 0.9 → 396 Hz |
| `zebra` | Walk | 0.4 | 3 to 4.5 | 0 to 0 | 0.2 | 1.89 → 0.38 | 1 | no | 1.1 → 484 Hz |
| `lion` | Walk | 0.35 | 3 to 4.5 | 0 to 0 | 0.22 | 2.1 → 0.46 | 1 | no | 0.55 → 242 Hz |
| `flamingo` | Walk | 0.2 | 2 to 3.4 | 0 to 0 | 0.3 | 1.36 → 0.41 | 3 | no | 1.4 → 616 Hz |
| `saturn` | Orbit | 0.22 | 1.7 to 1.7 | 0 to 0 | 0.3 | 1.25 → 0.38 | 1 | no | 0.6 → 264 Hz |
| `earth` | Orbit | 0.3 | 1.2 to 1.2 | 0 to 0 | 0.3 | 0.53 → 0.16 | 1 | no | 0.8 → 352 Hz |
| `venus` | Orbit | 0.35 | 0.75 to 0.75 | 0 to 0 | 0.3 | 0.46 → 0.14 | 1 | no | 1 → 440 Hz |
| `astronaut` | Float | 0.1 (unused) | 2 to 3.4 | 1 to 2 | 0.25 | 1.34 → 0.34 | 1 | no | 1.2 → 528 Hz |
| `rocket` | Fly | 0.7 | 3.6 to 5 | 1.6 to 3 | 0.2 | 2.5 → 0.5 | 1 | no | 0.4 → 176 Hz |
| `satellite` | Float | 0.1 (unused) | 2.6 to 4 | 1.8 to 2.8 | 0.25 | 2.45 → 0.61 | 1 | no | 2 → 880 Hz |
| `comet` | Fly | 0.9 | 4 to 5.5 | 2 to 3.2 | 0.4 | 1.57 → 0.63 | 1 | no | 2.4 → 1056 Hz |
| `trex` | Walk | 0.35 | 5.2 to 5.9 | 0 to 0 | 0.1 | 5.79 → 0.58 | 1 | no | 0.35 → 154 Hz |
| `triceratops` | Walk | 0.25 | 4.6 to 5.6 | 0 to 0 | 0.12 | 5.09 → 0.61 | 1 | no | 0.5 → 220 Hz |
| `stegosaurus` | Walk | 0.25 | 4.6 to 5.8 | 0 to 0 | 0.12 | 5.25 → 0.63 | 1 | no | 0.6 → 264 Hz |
| `pterosaur` | Fly | 0.9 | 4 to 5.5 | 2.6 to 3.6 | 0.2 | 2.84 → 0.57 | 2 | no | 1.6 → 704 Hz |
| `penguin` | Walk | 0.2 | 1.8 to 3 | 0 to 0 | 0.4 | 0.9 → 0.36 | 3 | no | 1.5 → 660 Hz |
| `polarbear` | Walk | 0.3 | 3.6 to 5 | 0 to 0 | 0.18 | 2.5 → 0.45 | 1 | no | 0.5 → 220 Hz |
| `seal` | Walk | 0.12 | 2.6 to 4 | 0 to 0 | 0.25 | 1.82 → 0.46 | 1 | no | 0.9 → 396 Hz |
| `whale` | Swim | 0.4 | 5.6 to 6 | 2.6 to 3.4 | 0.12 | 3.98 → 0.48 | 1 | no | 0.3 → 132 Hz |
| `snowyowl` | Fly | 0.8 | 2.6 to 4.4 | 1.8 to 3 | 0.5 | 1.14 → 0.57 | 1 | no | 1.3 → 572 Hz |
| `parrot` | Fly | 0.8 | 2 to 4 | 1.6 to 2.8 | 0.6 | 0.95 → 0.57 | 2 | no | 1.9 → 836 Hz |
| `monkey` | Walk | 0.35 | 2.5 to 4 | 0 to 0 | 0.3 | 0.88 → 0.26 | 1 | no | 1.6 → 704 Hz |
| `frog` | Walk | 0.1 | 1.3 to 2.2 | 0 to 0 | 0.8 | 0.35 → 0.28 | 2 | no | 2.2 → 968 Hz |
| `butterfly` | Fly | 0.3 | 1.2 to 2.5 | 1 to 1.9 | 1 | 0.2 → 0.2 | 8 | no | 2.6 → 1144 Hz |
| `sloth` | Float | 0.05 (unused) | 2.5 to 3.5 | 2 to 2.6 | 0.4 | 1.1 → 0.44 | 1 | no | 0.7 → 308 Hz |
| `cow` | Walk | 0.2 | 3 to 4.5 | 0 to 0 | 0.18 | 2.58 → 0.47 | 1 | no | 0.5 → 220 Hz |
| `sheep` | Walk | 0.2 | 2.5 to 4 | 0 to 0 | 0.25 | 1.29 → 0.32 | 3 | no | 1.2 → 528 Hz |
| `horse` | Walk | 0.4 | 3.5 to 5 | 0 to 0 | 0.16 | 2.34 → 0.37 | 1 | no | 0.8 → 352 Hz |
| `chicken` | Walk | 0.25 | 1.5 to 2.8 | 0 to 0 | 0.5 | 0.66 → 0.33 | 3 | no | 2 → 880 Hz |
| `pig` | Walk | 0.2 | 2 to 3.5 | 0 to 0 | 0.3 | 1.6 → 0.48 | 1 | no | 1 → 440 Hz |
| `balloon` | Float | 0.05 (unused) | 4.6 to 5.8 | 1.5 to 3 | 0.12 | 3.35 → 0.4 | 2 | no | 0.6 → 264 Hz |
| `bird` | Fly | 1 | 2 to 4.5 | 1.8 to 3.2 | 0.7 | 0.73 → 0.51 | 5 | yes | 2.3 → 1012 Hz |
| `kite` | Float | 0.05 (unused) | 3 to 4.5 | 2.6 to 3.4 | 0.3 | 1.9 → 0.57 | 1 | no | 1.7 → 748 Hz |
| `plane` | Fly | 1.4 | 5 to 5.9 | 2.8 to 3.8 | 0.12 | 2.6 → 0.31 | 1 | no | 0.45 → 198 Hz |

`addCount` is how many appear when the creature is added by a wish. The count a world starts with is in section 2.
The chirp is the sound a creature makes when learned: `Sfx.Chirp(voicePitch)`, a 0.22 s sine that starts at the frequency
shown and sweeps upward to nearly twice that (section 7).

### 1.4 How movement works (`Scripts/Worlds/Mover.cs`, `Scripts/Worlds/Spawner.cs`)

Every creature stays on a horizontal ring of radius `radius` around a centre (the floor point under the player),
at height `height`. `angle` is its position on the ring, `t` is time, `phase` is a random 0 to 2π, `direction` is ±1,
`speedScale` is 1 normally and eases to 0.15 while its fact card is showing (rate 1.5 per second).

| Type | Position | Rotation |
|---|---|---|
| **Swim** | `angle += direction * (speed*speedScale / max(radius, 0.2)) * dt`; y = `height + sin(t*0.6 + phase) * bob` | faces along the tangent, then pitch `-cos(t*0.6+phase) * 6°`, yaw wiggle `sin(t*5+phase) * 7° * speedScale` |
| **Fly** | same angle step; y = `height + sin(t*0.9 + phase) * bob` | tangent, pitch `-cos(t*0.9+phase) * 8°`, roll `-direction * 14°` (banks into the turn) |
| **Orbit** | same angle step with `direction = 1`; y = `height + sin(angle + phase) * bob` | does not face its path: `Euler(12°, t*20° + phase, 0)` (tilted, spinning at 20°/s) |
| **Float** | angle never changes; y = `height + sin(t*0.6 + phase) * bob` | `Euler(sin(t*0.4+phase) * 6°, phase + t*12° * direction * speedScale, 0)` |
| **Walk** | paces a short arc: `walkT += dt * speed*speedScale / max(0.05, radius*arc)`; `angle = home + arc * sin(walkT)`; y = `height + abs(sin(t*5+phase)) * 0.02 * abs(cos(walkT)) * scaleY` (a small step bounce) | faces the way it is walking (flips at each end of the arc), sway `sin(t*5+phase) * 2° * abs(cos(walkT))` about Z, turned with `Slerp(…, dt*2.5)` |

Position on the ring is `centre + (cos(angle)*radius, y, sin(angle)*radius)`; the tangent is `(-sin(angle), 0, cos(angle)) * direction`.

**Placement** (`Spawner.Spawn`):

- Per creature: `speed = def.speed * random(0.8, 1.2)`; `phase = random(0, 2π)`; `bob` = 0.25 m for Fly, 0.15 m otherwise.
- `size = entry.scale * (AR ? def.arScale : 1)`; the instance scale is the prefab scale times `size`.
- **Schooling** (clownfish, bird): one shared radius `random(minD, maxD)`, one shared height `random(minH, maxH)`, one
  shared direction; each member gets radius ±0.35 m, height ±0.3 m, and angle `base + i*0.16 rad ± 0.05`, so the school is a
  string of fish following each other. `base` = the forward direction plus `random(-0.7, 0.1)` rad.
- **Not schooling**: own radius and height in the ranges, own direction, angle `base + i * (2π / max(count, 3)) ± 0.3`
  with `base` = forward plus `random(-1.2, 1.2)` rad.
- Then (all types except Orbit) `radius = clamp(max(radius, 1 + 0.4*(size - 1)), 1, 6)`: bigger creatures stand further
  back. Ring limits are `MinRing = 1`, `MaxRing = 6` metres.
- **Walk**: height 0; all walkers in the world share the circle equally: `slice = 2π / walkerTotal`, walker k stands at
  `forward + slice * (k + 0.5)` and paces `arc = min(0.45, slice * 0.32)` rad either side.
- **Orbit** (planets): centre is `floor + forward * 3.2 m` at height 1.45 m; radius is `minD` (= `maxD`) so Venus 0.75,
  Earth 1.2, Saturn 1.7 m; `bob = radius * 0.18`.
- Blob shadow under each creature when the world has a floor or in AR (section 4.6).
- Limits: 30 per creature kind, 60 creatures in total (`WorldController.MaxPerEntry`, `MaxTotal`).

**In AR** (`ctx.ar`): scale × `arScale`; speed × `lerp(arScale, 1, 0.5)`; bob × 0.5; radius `clamp(radius*0.45, 0.9, 2.4)`;
height `clamp(height*0.8, 0, 1.9)`; planets become a tabletop solar system: centre 0.85 m ahead at 1.05 m height with
radii × 0.3.

**Touching and learning** (`Scripts/Worlds/Creature.cs`):

- Learn fires when a controller comes within 0.06 m of the creature's box, when the head looks at it for 2 s
  (`GazeSeconds`; a ray 12 m from the head), or when a pointer ray is on it and the trigger is pulled.
- On learn: 4 s cooldown; glow for 5 s; `Sfx.Chirp(pitch)` at volume 0.8 and `Sfx.Chime` at 0.5; fact card; the id is
  added to the session's learned set; haptic 0.5 for 0.08 s on a touch.
- Glow value (shader `_Glow`): 0.25 while pointed at; rises to 0.4 as the gaze builds; `0.55 + sin(t*6) * 0.15` while
  lit; eased at 3 per second.
- In AR only, kinds with `addCount > 1` that do not walk (clownfish, jellyfish, pterosaur, parrot, butterfly, balloon,
  bird) shy away from a hand closer than 0.4 m (`ScatterRange`): offset up to 0.45 m away, fading back at 0.35 m/s.
- Colour wishes: `SetTint(colour)` sets `_Tint` and `_TintAmount = 1` (shader, section 4.3). Values: red `#eb3833`, blue `#3873f2`, purple `#9e4de0`, gold `#ffc72e` (`CommandParser.ColorValues`).
  "rainbow" gives each member `HSV(i / count, 0.75, 1)`.
- Size wishes change the entry scale: bigger × 1.4, smaller × 0.7, giant = 2.5, tiny = 0.4, clamped 0.3 to 3.
- Amount wishes: more = `+max(2, count/2)`, lots = `max(count*3, 12)`, fewer = `max(1, count/2)`, clamped 1 to 30.

### 1.5 What the guide says about each creature

The fact is shown on the fact card and read aloud (`FactCardPanel.Display` → `GuideVoice.ReadNow(def.fact)`). The arrival
line is said when a wish adds the creature (`CommandRouter.Execute`). All are in the voice bank (appendix A).

| id | Name | Fact (card text, read aloud) | Quiz question | Arrival line |
|---|---|---|---|---|
| `clownfish` | Clownfish | Clownfish live among the stinging arms of sea anemones, which do not hurt them. | Which fish makes its home in a sea anemone? | Here comes the clownfish! |
| `turtle` | Sea Turtle | Sea turtles swim back to the beach where they hatched to lay their own eggs. | Which animal returns to the beach where it hatched to lay its eggs? | Here comes the sea turtle! |
| `shark` | Shark | A shark has no bones. Its skeleton is made of cartilage, the bendy stuff in your ears. | Which animal has a skeleton of cartilage and no bones? | Here comes the shark! |
| `jellyfish` | Jellyfish | Jellyfish have no brain, no heart and no bones. | Which sea animal has no brain and no heart? | Here comes the jellyfish! |
| `ray` | Ray | Rays swim by flapping their wide fins like wings. | Which sea animal swims by flapping its fins like wings? | Here comes the ray! |
| `elephant` | Elephant | An elephant's trunk has no bones in it. It is all muscle. | Which animal has a long nose with no bones in it? | Here comes the elephant! |
| `giraffe` | Giraffe | A giraffe's long neck has seven bones, the same number as your neck. | Which animal's long neck has seven bones, just like yours? | Here comes the giraffe! |
| `zebra` | Zebra | Every zebra has its own stripe pattern. No two are the same. | Which animal has stripes that are different on every one? | Here comes the zebra! |
| `lion` | Lion | A lion's roar can be heard from several kilometres away. | Whose roar can be heard from kilometres away? | Here comes the lion! |
| `flamingo` | Flamingo | Flamingos are pink because of the food they eat. | Which bird turns pink because of its food? | Here comes the flamingo! |
| `saturn` | Saturn | Saturn's rings are made mostly of pieces of ice. | Which planet has rings made mostly of ice? | Here comes the saturn! |
| `earth` | Earth | More than two thirds of the Earth is covered by ocean. | Which planet is mostly covered by ocean? | Here comes the earth! |
| `venus` | Venus | A day on Venus is longer than its year. | On which planet is a day longer than a year? | Here comes the venus! |
| `astronaut` | Astronaut | Astronauts in orbit float because they are falling around the Earth all the time. | Who floats while circling the Earth? | Here comes the astronaut! |
| `rocket` | Rocket | To stay in orbit, a rocket has to reach about 28,000 kilometres an hour. | What must reach about 28,000 kilometres an hour to stay in orbit? | Here comes the rocket! |
| `satellite` | Satellite | Satellites circle the Earth. Some help phones and maps know where you are. | What circles the Earth and helps maps know where you are? | Here comes the satellite! |
| `comet` | Comet | A comet is a ball of ice and dust. Its tail always points away from the Sun. | What is a ball of ice and dust with a long tail? | Here comes the comet! |
| `trex` | T. rex | T. rex lived closer in time to you than to Stegosaurus. | Which dinosaur lived closer in time to you than to Stegosaurus? | Here comes the t. rex! |
| `triceratops` | Triceratops | The name Triceratops means three-horned face. | Which dinosaur's name means three-horned face? | Here comes the triceratops! |
| `stegosaurus` | Stegosaurus | Stegosaurus had two rows of bony plates along its back. | Which dinosaur had bony plates along its back? | Here comes the stegosaurus! |
| `pterosaur` | Pterosaur | Pterosaurs were flying reptiles. They were not dinosaurs. | Which flying reptile was not really a dinosaur? | Here comes the pterosaur! |
| `penguin` | Penguin | Penguins live in the south and polar bears in the north, so they never meet in the wild. | Which bird lives in the south and never meets a polar bear? | Here comes the penguin! |
| `polarbear` | Polar Bear | Under its white fur, a polar bear's skin is black. | Which animal has black skin under white fur? | Here comes the polar bear! |
| `seal` | Seal | Seals have a thick layer of fat called blubber that keeps them warm. | Which animal keeps warm with a layer of blubber? | Here comes the seal! |
| `whale` | Blue Whale | The blue whale is the largest animal that has ever lived. | Which is the largest animal that has ever lived? | Here comes the blue whale! |
| `snowyowl` | Snowy Owl | Unlike most owls, snowy owls often hunt in the daytime. | Which owl often hunts in the daytime? | Here comes the snowy owl! |
| `parrot` | Parrot | Parrots can copy sounds, even human words. | Which bird can copy human words? | Here comes the parrot! |
| `monkey` | Monkey | Some monkeys, like spider monkeys, can hang from a branch by their tails. | Which animal can hang from a branch by its tail? | Here comes the monkey! |
| `frog` | Tree Frog | Poison dart frogs wear bright colours to warn that they are poisonous. | Which animal uses bright colours as a warning? | Here comes the tree frog! |
| `butterfly` | Butterfly | Butterflies taste with their feet. | Which insect tastes with its feet? | Here comes the butterfly! |
| `sloth` | Sloth | Sloths move so slowly that green algae grows in their fur. | Which animal moves so slowly that algae grows in its fur? | Here comes the sloth! |
| `cow` | Cow | A cow's stomach has four parts. | Which farm animal has a stomach with four parts? | Here comes the cow! |
| `sheep` | Sheep | A sheep's wool never stops growing. | Which animal has wool that never stops growing? | Here comes the sheep! |
| `horse` | Horse | Horses can sleep standing up. | Which animal can sleep standing up? | Here comes the horse! |
| `chicken` | Chicken | Birds, including chickens, are living relatives of the dinosaurs. | Which farm bird is a living relative of the dinosaurs? | Here comes the chicken! |
| `pig` | Pig | Pigs roll in mud to cool down, because they can hardly sweat. | Which animal rolls in mud to cool down? | Here comes the pig! |
| `balloon` | Hot-Air Balloon | Hot air is lighter than cool air. That is what lifts a hot-air balloon. | What rises because hot air is lighter than cool air? | Here comes the hot-air balloon! |
| `bird` | Bird | Many birds have hollow bones, which helps them fly. | Which animals have hollow bones that help them fly? | Here comes the bird! |
| `kite` | Kite | Kites were invented in China more than two thousand years ago. | What flying toy was invented in China over two thousand years ago? | Here comes the kite! |
| `plane` | Plane | A plane's wings are shaped so that the air rushing past pushes them up. | What has wings shaped so that rushing air pushes them up? | Here comes the plane! |

---

## 2. Worlds

Defined in `Editor/Builder.Worlds.cs` (`Worlds` array), saved to `Assets/WishWorld/Definitions/Worlds/<id>.asset`. All worlds run
in one scene, `Assets/WishWorld/Scenes/World.unity`, driven by `Scripts/Worlds/WorldController.cs`. The values below are
the ones in the saved `.asset` files (packs on), which is what the app shows today.

### 2.1 Table of worlds

| id | Name | Keywords (first = the wish option) | In hub menu | Sky texture | Ground mode, colour | Surroundings (Resources path) | Creatures at start |
|---|---|---|---|---|---|---|---|
| `aquarium` | Aquarium | aquarium, ocean, under the sea, reef | yes | `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Aquarium.png` (painted) | Full, `#dbc794` | `Scenery/aquarium` | clownfish × 8, turtle × 1, shark × 1, jellyfish × 4, ray × 1 |
| `zoo` | Zoo | zoo, savanna, safari | yes | `Assets/ThirdParty/Skies/Sky_Zoo.jpg` (photo) | Full, `#ccad61` | `Scenery/zoo` | elephant × 1, giraffe × 1, zebra × 2, lion × 1, flamingo × 3 |
| `space` | Space | space, outer space, solar system, stars | yes | `Assets/ThirdParty/Skies/Sky_Space.jpg` (photo) | Platform, `#4d5473` | `Scenery/space` | saturn × 1, earth × 1, venus × 1, astronaut × 1, rocket × 1, satellite × 1, comet × 1 |
| `dinosaurs` | Dinosaurs | dinosaurs, dinosaur, dino, dinosaur valley | yes | `Assets/ThirdParty/Skies/Sky_Dinosaurs.jpg` (photo) | Full, `#5c8f47` | `Scenery/dinosaurs` | trex × 1, triceratops × 1, stegosaurus × 1, pterosaur × 2 |
| `arctic` | Arctic | arctic, north pole, ice | yes | `Assets/ThirdParty/Skies/Sky_Arctic.jpg` (photo) | Full, `#ebf5ff` | `Scenery/arctic` | penguin × 4, polarbear × 1, seal × 1, whale × 1, snowyowl × 1 |
| `rainforest` | Rainforest | rainforest, jungle, forest | yes | `Assets/ThirdParty/Skies/Sky_Rainforest.jpg` (photo) | Full, `#427038` | `Scenery/rainforest` | parrot × 2, monkey × 1, frog × 2, butterfly × 6, sloth × 1 |
| `farm` | Farm | farm, barn | yes | `Assets/ThirdParty/Skies/Sky_Farm.jpg` (photo) | Full, `#75b252` | `Scenery/farm` | cow × 1, sheep × 3, horse × 1, chicken × 3, pig × 1 |
| `sky` | Sky | sky, clouds, above the clouds | yes | `Assets/ThirdParty/Skies/Sky_Sky.jpg` (photo) | Platform, `#f7faff` | `Scenery/sky` | balloon × 2, bird × 6, kite × 1, plane × 1 |
| `blank` | Wish World | (none) | no | `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_WishWorld.png` (painted) | Platform, `#f5edfa` | none | (none: starts empty) |

| id | Sun colour × intensity | To sun (Unity axes) | Ambient | Fog colour, start to end | Ambient sound loop | Guide intro (spoken on arrival) | Sky prompt (only for live skybox generation, which is off) |
|---|---|---|---|---|---|---|---|
| `aquarium` | `#bfebff` × 0.95 | scene default (0.321, 0.766, -0.557) | `#75a3c7` | `#1a78ad`, 4.96 to 62 m | underwater (amb_water) | "Welcome to the aquarium! Touch a creature to learn about it." | underwater coral reef, sun rays through blue water, friendly, stylized |
| `zoo` | `#ffe5b8` × 1.1 | (0.676, 0.5, -0.541) | `#bdad94` | `#c8c4b9`, 79.2 to 660 m | outdoors (amb_outdoor) | "Welcome to the savanna. Look how tall the giraffe is!" | african savanna grassland at golden hour, acacia trees, stylized |
| `space` | `#fffaf2` × 1.1 | (0.379, 0.504, -0.776) | `#5c5e7a` | off | space hum (amb_hum) | "Welcome to space. Everything here is floating!" | deep space star field with a distant nebula, stylized |
| `dinosaurs` | `#fff7e0` × 1.05 | (0.702, 0.5, -0.507) | `#9eb89e` | `#b8bbaf`, 81.6 to 680 m | outdoors (amb_outdoor) | "Shh. The dinosaurs are walking by." | prehistoric jungle valley with ferns and a volcano far away, stylized |
| `arctic` | `#cce5ff` × 0.85 | (0.649, 0.5, -0.574) | `#708abd` | `#385ca9`, 84 to 700 m | wind (amb_wind) | "Brr! Welcome to the ice, under the northern lights." | arctic ice field at night under green aurora, stylized |
| `rainforest` | `#f2ffdb` × 0.95 | (0.548, 0.698, -0.461) | `#85a885` | `#afc3b2`, 9 to 150 m | outdoors (amb_outdoor) | "Listen. The rainforest is full of life." | dense rainforest canopy, shafts of light, lush green, stylized |
| `farm` | `#fffae5` × 1.1 | (0.57, 0.698, -0.433) | `#b2bfb2` | `#aab0ab`, 81.6 to 680 m | outdoors (amb_outdoor) | "Welcome to the farm. Say hello to the animals!" | rolling green farm fields with a red barn, blue sky, stylized |
| `sky` | `#ffffff` × 1.1 | (0.558, 0.5, -0.663) | `#bfcce5` | `#b3b2b3`, 237 to 790 m | wind (amb_wind) | "We are above the clouds. Look who is flying by!" | above a sea of white clouds, bright blue sky, stylized |
| `blank` | `#fffaf5` × 1.05 | scene default (0.321, 0.766, -0.557) | `#b8b8cc` | off | wind (amb_wind) | (none) | soft pastel dream sky |

Notes on the columns:

- **Sky.** A photo is an equirectangular 4096 × 2048 JPEG in `Assets/ThirdParty/Skies/` (sources and licences in
  `THIRD_PARTY.md`: Poly Haven CC0, NASA public domain for space). The aquarium and the Wish World have no photo and
  use a painted 1024 × 512 PNG from `Assets/WishWorld/Generated/Textures/`. Every world also has a painted
  fallback there (`PLACEHOLDER_Sky_<Name>.png`), used when `WISHWORLD_MODELS=generated`.
- **Sun.** "To sun" is the unit vector from the scene toward the sun (the negative of `WorldDefinition.sunDirection`),
  measured from the photo by `Tools/bake_skies.py` and lifted to at least 30° elevation
  (`Editor/Builder.SceneryWorlds.cs` `SunDirection`). Worlds without a photo keep the scene's own sun: rotation
  `Euler(50, -30, 0)`, which is to-sun `(0.321, 0.766, -0.557)`.
- **Fog** is linear: it starts at `fogEnd * fogStart` and is complete at `fogEnd`. With a photo the fog colour is the
  photo's measured horizon colour (`skies.json`), not the colour written in `Builder.Worlds.cs`.
- **Ground mode.** `Full` = a ground everywhere, `Platform` = a small floating disc, `None`. With surroundings loaded
  (every world except the Wish World) the plain disc and the platform are hidden, because the surroundings bring their own
  ground (`WorldController.ApplyEnvironment` lines 255 to 258). The ground colour then only matters as a fallback.

### 2.2 Painted sky colours (gradient fallback, and the real sky for `aquarium` and `blank`)

From the `SkySpec` of each world. The painter is `BuildSky` in `Editor/Builder.Core.cs` (lines 323 to 371): above the
horizon `lerp(horizon, top, sin(elevation)^0.6)`, below it `lerp(horizon, bottom, (-sin(elevation))^0.5)`, then stars,
aurora, light rays, a sun glow `glow * max(0, dot(dir, sun))^10` and noise clouds.

| World | Top | Horizon | Bottom | Extras painted on | Fog when there are no surroundings (colour, end; starts at 20% of the end, hub 30%) |
|---|---|---|---|---|---|
| `aquarium` | `#1a75b8` | `#1f8fbd` | `#082e5c` | light rays (rays = true) | `#1a78ad` to 24 m |
| `zoo` | `#8099db` | `#ffcc85` | `#bd9e5c` | clouds 0.3 in #ffe5cc; sun glow (1, 0.6, 0.25) x 0.7 at 0.14 rad elevation | `#ffd999` to 60 m |
| `space` | `#03030d` | `#0f0a24` | `#03030a` | stars 1.0; glow (0.5, 0.35, 0.9) x 0.45 at 0.35 rad | off |
| `dinosaurs` | `#73b2d1` | `#cce5c2` | `#336633` | clouds 0.4 in #faf7eb; glow (1, 0.9, 0.6) x 0.4 at 0.5 rad | `#c2e0c2` to 55 m |
| `arctic` | `#080f33` | `#3d6699` | `#cce0f2` | stars 0.5; aurora in (0.25, 0.95, 0.65) | `#80a3cc` to 60 m |
| `rainforest` | `#529461` | `#8cc780` | `#1a401f` | clouds 0.6 in #296633 (canopy); light rays | `#73ad73` to 30 m |
| `farm` | `#66a6f2` | `#cce5fa` | `#66a64d` | clouds 0.45 in #fafafa; glow (1, 0.95, 0.8) x 0.35 at 0.6 rad | `#cce5fa` to 70 m |
| `sky` | `#4080f2` | `#bfe0ff` | `#f2f7ff` | clouds 0.7 in #fcfcfc | off |
| `blank` | `#b2bdf0` | `#fce0db` | `#f2edf7` | clouds 0.3 in #ffffff | off |
| `hub` | `#80a1c9` | `#dbe5f2` | `#f2f7fc` | clouds 0.5 in #fafafa; glow (1, 0.85, 0.7) x 0.22 at 0.45 rad | `#e5edf7` to 70 m |

### 2.3 Surroundings (scenery)

One prefab per world under `Assets/WishWorld/Generated/Resources/Scenery/<id>.prefab` (loaded with
`Resources.Load("Scenery/<id>")`, only while that world is shown, and placed at the world origin). Each prefab is 8 static
meshes, `Sector0` … `Sector7`, cut by compass direction around the player (`Assets/WishWorld/Generated/Meshes/Scenery_<id>_<n>.asset`).
They are built by `Editor/Builder.SceneryWorlds.cs` and `Editor/Builder.SceneryWorlds2.cs` from: a faceted terrain
(`Scenery.Terrain`), kit models from `Assets/ThirdParty/Baked/Scenery~/<kit>/<name>.bytes`, and hand-built props in
`Editor/SceneryProps.cs`. **Scenery meshes have positions, vertex colours and triangles only: no normals and no UVs**
(`MeshBuilder.BuildWelded`); the shader makes its own facet normals.

| World | Builder | Prefab | Vertices (8 sectors) | Triangles | Mesh files on disk |
|---|---|---|---|---|---|
| `aquarium` | `SceneryReef` in `Editor/Builder.SceneryWorlds2.cs` | `Assets/WishWorld/Generated/Resources/Scenery/aquarium.prefab` | 157,133 | 178,874 | 10.47 MB |
| `zoo` | `ScenerySavanna` in `Editor/Builder.SceneryWorlds.cs` | `Assets/WishWorld/Generated/Resources/Scenery/zoo.prefab` | 86,453 | 103,982 | 5.83 MB |
| `space` | `SceneryMoon` in `Editor/Builder.SceneryWorlds2.cs` | `Assets/WishWorld/Generated/Resources/Scenery/space.prefab` | 85,356 | 109,554 | 5.84 MB |
| `dinosaurs` | `SceneryDinosaurs` in `Editor/Builder.SceneryWorlds.cs` | `Assets/WishWorld/Generated/Resources/Scenery/dinosaurs.prefab` | 139,037 | 143,518 | 9.09 MB |
| `arctic` | `SceneryArctic` in `Editor/Builder.SceneryWorlds.cs` | `Assets/WishWorld/Generated/Resources/Scenery/arctic.prefab` | 100,311 | 68,382 | 6.17 MB |
| `rainforest` | `SceneryRainforest` in `Editor/Builder.SceneryWorlds2.cs` | `Assets/WishWorld/Generated/Resources/Scenery/rainforest.prefab` | 158,805 | 201,511 | 10.81 MB |
| `farm` | `SceneryFarm` in `Editor/Builder.SceneryWorlds.cs` | `Assets/WishWorld/Generated/Resources/Scenery/farm.prefab` | 125,316 | 177,377 | 8.75 MB |
| `sky` | `ScenerySummit` in `Editor/Builder.SceneryWorlds2.cs` | `Assets/WishWorld/Generated/Resources/Scenery/sky.prefab` | 87,705 | 60,624 | 5.40 MB |
| `race` | `SceneryRace` in `Editor/Builder.SceneryRace.cs` | `Assets/WishWorld/Generated/Resources/Scenery/race.prefab` | 270,343 | 238,272 | 17.19 MB |

(`race` is the valley around the Snow Circuit track, listed for completeness.)

What is in each (distances in metres from the player at the origin, +Z ahead):

- **aquarium** (`SceneryReef`): sand sea bed 150 m radius in `#e0cc99` with ripple bands, reef mounds in `#756b80`,
  a drop-off into deep blue `#335780` behind the player (z < -34); the sea surface seen from below at y ≈ 15 m
  (`#6bccf0` to `#ccf7ff`); a shipwreck (`pirate/ship-wreck`, 17 m tall, at (-17, 27)) with chests, barrels, a cannon,
  a crate and cannon balls; an anchor at (8.5, 13.5); three rock arches; 380 corals from 8.5 to 110 m plus 46 low ones
  at 3.4 to 9 m; 9 anemones in a ring 4.2 to 7.2 m away; 110 kelp plants; 14 clams; 50 starfish; 60 rocks; 70 pebbles;
  16 columns of 10 bubbles. Coral colours: `#fa7361`, `#fa9e40`, `#eb5c9e`, `#9e66db`, `#fad652`, `#4dc7b8`
  (`SceneryProps.CoralColors`). Six coral shapes: branching, brain, tube sponges, table, sea fan, anemone
  (`SceneryProps.Coral`, lines 269 to 314); kelp is 2 to 4 stalks of 5 to 10 tilted flat boxes in three greens.
- **zoo** (`ScenerySavanna`): golden plain 640 m radius, one great mountain 240 m high at (90, 520) with a snow cap,
  a waterhole at (-14, 16); 95 acacias, 8 baobabs, 16 termite mounds, 12 dead trees, six piles of boulders, dry grass,
  bushes, reeds; a safari camp (two tents, campfire, jeep) around (21, 25); distant herds: 12 zebras, 4 elephants,
  4 giraffes standing still.
- **dinosaurs** (`SceneryDinosaurs`): lush valley 660 m radius, a volcano 250 m high at (60, 380) with lava streaks and a
  smoke plume, a river, a swamp at (-21, -15); a dinosaur skeleton at (13.5, 14.5), two nests; 150 palms, 110 pines,
  cycads, ferns, rocks, logs, mushrooms; 3 stegosaurs and 4 triceratops far up the valley.
- **arctic** (`SceneryArctic`): ice sheet with mountains behind and to the sides, open sea ahead (z > 25) with 42
  icebergs and 90 ice floes; two igloos at (-11.5, 8.5) and (-17, 2.5); a research camp around (15, 11) (tents, crates,
  two snowmobiles, flag, satellite dish); a fishing hole at (-4.2, 9.4); a ship held in the ice at (46, 74); 60 ice
  spikes; a colony of 34 penguins on the shore, 5 seals, one polar bear far out.
- **rainforest** (`SceneryRainforest`): forest floor 190 m radius, a river crossing ahead (z ≈ 15) with a wooden bridge at
  (-6, 14.5) and a canoe, a waterfall at (27, 40) dropping 15 m over boulders into a pool; overgrown ruins around
  (-13, 23) (stone head, obelisk, columns, ring, a stone path); 330 tall trees (14 to 27 m), 16 giants (34 to 46 m),
  70 palms, bamboo, 320 bushes, ferns, 130 flowers, mushrooms, logs, 150 strands of hanging moss.
- **farm** (`SceneryFarm`): rolling fields 600 m radius in a patchwork of wheat `#e5c75c`, soil `#856142`, green and
  yellow crops, a dirt road, a pond at (15, -17); a barn and silo at (-17, 27), a farmhouse at (18, 21), a windmill at
  (30, 44), tractor, cart, market stall, hay bales; a paddock fence in a 9.2 m circle around the player with a gateway
  straight ahead; corn, wheat and pumpkin plots; 9 cows, 14 sheep and 4 horses grazing 42 to 120 m off; a village with a
  church at (-150, 190); 300 oaks, bushes, flowers, grass, rocks.
- **space** (`SceneryMoon`): grey moon surface `#99999e` 700 m radius with 70 craters and mountains; a moon base ahead and
  to the right (geodesic dome at (21, 30), habitats, connectors, 10 solar panels, radar, antenna, two stations); a landing
  pad at (-22, 15) with a spaceship; a rover at (5.2, 11.5) and its tracks; two astronauts; a flag; 190 rocks; the Earth
  150 m across, low over the mountains at (-190, 250, 640).
- **sky** (`ScenerySummit`): the player stands on a snowy mountain top that falls away on all sides; a sea of cloud at
  about y = -46 m out to 780 m; 34 cloud towers, 14 loose clouds, eight other peaks breaking through; on the summit a
  cairn at (-3.3, 2.6), a flagpole at (3.4, 2.4), a tent at (-1.5, -6.5); 9 hot-air balloons and one airship in the
  distance.
- **blank** (Wish World): no surroundings. A white floating platform: cylinder 3.4 m across, 0.12 m thick, top at
  y = 0, with a smaller tapered one below (2.6 m, tinted `#ccccd9`), both multiplied by the world's ground colour
  (`WorldPlatform.asset`, `Builder.Worlds.cs` lines 258 to 260).

### 2.4 What `WorldController` does (`Scripts/Worlds/WorldController.cs`)

**Start.** Recentres the player on the world origin, builds the panels, then by mode (`AppState.pendingMode`):

- `VR` (hub → Worlds → a world): loads that world and its creatures; the guide says the world's intro.
- `AR` (hub → "AR Worlds"): no world (`worldId = ""`), `ar = true`; the guide says "This is your room. Say or pick what
  should visit!"; then runs the pending command `flying fish`, which adds 8 clownfish.
- `Wish` (hub → "Wish"): world `blank`, not AR; the guide says "What do you wish for? Say it, or pick from the menu."

**When AR is on** (`State.ar`, set by AR mode or by the wish "in my room"; `ApplyEnvironment`, lines 211 to 273):

- Passthrough is switched on: the camera clears to transparent black instead of drawing the skybox
  (`Scripts/Core/PassthroughToggle.cs`). In the editor with no headset the backdrop is plain grey `#6b6e73`.
- Light is forced to white, intensity 1, in the scene's default direction; ambient is forced to `#9e9e9e` (0.62).
- Surroundings are removed, fog is off, the ground disc and platform are hidden, the ambient sound loop stops.
- Creatures are re-placed with the AR rules in section 1.4 (smaller, closer, slower) and always get blob shadows on the floor.
- The info panel title reads "My room" (when no menu world is loaded).
- "take me there" turns AR off again and everything above comes back.

**Night** ("make it night"): sun intensity × 0.3, ambient × 0.45, sky exposure 0.28, fog colour × 0.3.
**Sunny** ("make it sunny"): night off and snow off. **Snow** ("make it snow"): `Snowfall` prefab 3.2 m above the floor.
**Clear**: removes all creatures and the snow. **Undo**: restores the previous state (every command pushes a copy first).
Loading a world resets its creature list, snow and night.

**Panels built at start** (`BuildHud`; sizes in metres, all face the head):

- Info panel 0.62 × 0.40 at `floor + forward*1.15 - right*0.95 + up*1.12`, tilted back 12°. Title (font Title, 0.06) =
  the world name, or "My room" in AR, or "Wish world"; counter (0.04) = "N of M found" or "Nothing here yet";
  buttons "Home" (0.24 × 0.11, goes to the hub) and "Finish" (peach, opens the quiz).
- Wish menu (not in VR mode) at `floor + forward*1.15 + right*1.0 + up*1.2`: section 6.6.
- Penguin guide at `floor + forward*1.5 - right*1.55`, scale 0.6, facing the player.
- Fact card (`Scripts/Worlds/FactCardPanel.cs`): 0.74 × 0.36 panel 1.15 m from the head toward the creature, 0.22 m to
  the side and 0.18 m below eye level; name on a peach ribbon (0.46 × 0.09) across the top edge, fact text (0.036) typed
  out, a "New!" badge that pulses the first time; hides after `clamp(3.5 + chars*0.05, 5, 10)` seconds.
- Quiz (`Scripts/Worlds/QuizPanel.cs`): 1.0 × 0.62 panel at `floor + forward*1.25 + up*1.55`. Header "You found N of M!",
  then up to 3 questions "Question i of n" with three answer buttons (0.29 × 0.13: the right creature and two others
  from the same world), "Yes! <Name>." or "It was the <Name>.", 2.2 s between questions, then "Quiz finished" and
  "You got N of M right!"; buttons "Close" and "Home" (peach). With nothing to ask: "Add some creatures and learn their
  facts, then try the quiz."
- When every kind in the world has been learned: "You found them all! Press Finish for a quiz."

---

## 3. Hub scene

Scene `Assets/WishWorld/Scenes/Hub.unity`, built by `Editor/Builder.Hub.cs`, run by `Scripts/Hub/HubController.cs`.
The player is recentred on the origin facing +Z.

### 3.1 Menu layout

All three menus hang from a root at **(0, 1.38, 1.8)** (`HubController.MenuRoot`, `MenuDistance = 1.8`). Only one shows at a time.

**Main menu**

| Piece | Text | Size (m) | Position (world) | Style |
|---|---|---|---|---|
| Banner | `WishWorld` | 0.95 × 0.18, letters 0.125 (Title font) | (0, 1.77, 1.8) | Ribbon in `#45618c`, text `#f2f7fc`; drops in, then bobs ±0.01 m at speed 0.9 |
| Card 1 | `Games` / `Slice fruit, race cars` | 0.44 × 0.32 | (-0.689, 1.38, 1.663), yaw -22.5° | Frame, fill `#d1e0f0` |
| Card 2 | `Worlds` / `Visit far places` | 0.44 × 0.32 | (-0.235, 1.38, 1.785), yaw -7.5° | Frame, fill `#d1e0f0` |
| Card 3 | `AR Worlds` / `Bring them to you` | 0.44 × 0.32 | (0.235, 1.38, 1.785), yaw 7.5° | Frame, fill `#d1e0f0` |
| Card 4 | `Wish` / `Say what you wish for` | 0.44 × 0.32 | (0.689, 1.38, 1.663), yaw 22.5° | Frame, fill `#ffb88c` (peach) |

The four cards sit on a circle of radius 1.8 m around the player at angles -22.5°, -7.5°, 7.5°, 22.5°, each turned to
face the player (`HubController.BuildMenus` lines 52 to 60). On a card the title is 0.066 high (Heading font) at
+0.13 × height above the centre, the subtitle 0.036 (Body font) at -0.24 × height (`HubController.Card`).
What each does: Games and Worlds open the sub-menus; AR Worlds opens the World scene in AR with the command
"flying fish"; Wish opens the World scene in wish mode.

**Games menu**: ribbon `Games` (0.6 × 0.14, letters 0.09) at local (0, 0.36, 0); cards `Frost Slice` / `Slice the flying fruit`
at local (-0.28, 0, 0) and `Snow Circuit` / `Race a snowy track` at (0.28, 0, 0), each 0.5 × 0.32; button `Back` 0.3 × 0.11 at (0, -0.3, 0).

**Worlds menu**: ribbon `Worlds` (0.6 × 0.14) at local (0, 0.43, 0); one pill button per menu world, 0.4 × 0.17, letters
0.05, four per row at local `((n % 4 - 1.5) * 0.43, 0.16 - floor(n / 4) * 0.2, 0)`, in this order: `Aquarium`, `Zoo`,
`Space`, `Dinosaurs`, `Arctic`, `Rainforest`, `Farm`, `Sky`; button `Back` at (0, -0.3, 0).

**Spoken strings**: on arrival the guide says and captions "Welcome to WishWorld! Pick a card to begin." Opening a
sub-menu reads "Games. Slice fruit, or race a car." or "Worlds. Where would you like to go?". Pointing at a card for
0.45 s reads its name: "Games. Slice fruit, race cars.", "Worlds. Visit far places.", "AR Worlds. Bring them to you.",
"Wish. Say what you wish for.", "Frost Slice. Slice the flying fruit.", "Snow Circuit. Race a snowy track."; other
buttons read their label.

### 3.2 Mascots

- **Penguin guide** (`Generated/Prefabs/PLACEHOLDER_PenguinGuide.prefab`; generated in `Builder.Core.cs` `BuildPenguin`,
  lines 251 to 285). An original character 1.06 m tall: slate-blue body `#384a66`, white belly and face `#fafafa`, peach
  beak, scarf, feet and a small hat `#ffb88c` with a white bobble, black cube eyes `#14141a`. Three meshes: `Body`
  (`PLACEHOLDER_PenguinBody.asset`, 312 vertices) and two wings (`PLACEHOLDER_PenguinWing.asset`) pivoted at
  (-0.25, 0.6, 0) and (0.25, 0.6, 0), resting at -14° (left) and +14° (right) about Z. In the hub it stands at **(-1.3, 0, 2.15)**, scale 1, facing the player.
  Behaviour (`Scripts/Hub/PenguinGuide.cs`): turns to face the head (slerp rate 2); bobs `abs(sin(t*2.2)) * 0.015 m`;
  the right wing waves for 3 s whenever the guide starts a new line (raised 105° ± 22° at `sin(t*9)`); the left wing
  sways ±5°; blob shadow of radius 0.3 m.
- **Reindeer**: a static Kenney Holiday Kit model (`Assets/ThirdParty/Baked/Reindeer.bytes`, 870 triangles, 1.5 m tall,
  browns `#c6724f` / `#be6c4b`) at **(-3.4, 0, 3.6)**, turned to face the player plus 30°, with a painted shadow
  disc of radius 0.6 m. It does not move and is part of the terrain mesh.

### 3.3 Scenery (all merged into `Generated/Meshes/HubTerrain.asset` except the clouds)

- Snow plain: disc 140 m across in snow `#f2f7fc`; 16 low hills 24 to 34 m out (alternating snow and shade `#d6e3f2`);
  9 small mounds 6 to 13 m out; with the sky photo also a 1300 m disc at y = -0.4, 26 mountains 430 to 640 m out
  (50 to 125 m high, snow with grey rock `#70707a`), 150 snowy trees 20 to 230 m out, a hamlet of 7 chalets and a church
  around (-70, 95).
- 12 snowy trees near the menu at (angle rad, distance m, height m): (0.9, 9, 3.2), (1.25, 12, 4), (2.2, 8, 2.6),
  (2.5, 13, 3.6), (0.2, 14, 3.8), (-0.5, 10, 3), (-1.2, 15, 4.2), (3.6, 11, 3.4), (4.3, 9, 2.8), (1.75, 16, 4.4),
  (0.55, 6.5, 2.4), (2.75, 6.8, 2.6); position = `(cos(a)*d, 0, sin(a)*d)`; models `TreeSnowA/B/C` in turn, scaled to
  height × 1.15.
- Winter camp (Kenney Holiday Kit), each turned to face the player plus the offset given:

| Model (`Assets/ThirdParty/Baked/`) | Position | Scale | Size as placed x × y × z (m) | Yaw about Y (Unity degrees; 0 = model faces +Z) | Shadow radius (m) | Triangles |
|---|---|---|---|---|---|---|
| `Snowman.bytes` | (2.45, 0, 2.9) | 1 | 1.07 × 1.35 × 0.68 | -139.8° | 0.5 | 555 |
| `Lantern.bytes` | (-1.75, 0, 2.7) | 1.15 | 0.38 × 1.26 × 0.33 | 147.1° | 0.2 | 172 |
| `Lantern.bytes` | (1.75, 0, 2.7) | 1.15 | 0.38 × 1.26 × 0.33 | -147.1° | 0.2 | 172 |
| `Sled.bytes` | (2.5, 0, 1.3) | 1 | 0.75 × 0.45 × 1.2 | -47.5° | 0.55 | 236 |
| `PresentA.bytes` | (2.15, 0, 1.75) | 1 | 0.33 × 0.42 × 0.33 | -109.1° | 0.28 | 238 |
| `PresentB.bytes` | (2.6, 0, 2.05) | 1 | 0.42 × 0.36 × 0.42 | -158.3° | 0.28 | 238 |
| `PresentC.bytes` | (2.9, 0, 1.6) | 1 | 0.46 × 0.3 × 0.32 | -73.9° | 0.3 | 238 |
| `Bench.bytes` | (-2.7, 0, 0.9) | 1 | 1.5 × 0.98 × 0.85 | 108.4° | 0.7 | 160 |
| `Reindeer.bytes` | (-3.4, 0, 3.6) | 1 | 0.84 × 1.5 × 1.43 | 166.6° | 0.6 | 870 |
| `TreeDecorated.bytes` | (3.3, 0, 4.4) | 1.2 | 1.96 × 3.6 × 1.96 | -143.1° | 1 | 810 |
| `CandyCane.bytes` | (-2.3, 0, 3.3) | 1 | 0.66 × 1 × 0.22 | 145.1° | 0.18 | 84 |
| `CandyCane.bytes` | (3.1, 0, 3.2) | 1 | 0.66 × 1 × 0.22 | 44.1° | 0.18 | 84 |
| `RocksLarge.bytes` | (-5.5, 0, 5.5) | 1.2 | 2.88 × 1.57 × 2.46 | 135° | 1.3 | 696 |
| `RocksLarge.bytes` | (6.5, 0, 3) | 1 | 2.4 × 1.31 × 2.05 | -24.8° | 1.1 | 696 |
| `SnowPile.bytes` | (-3.6, 0, 1.9) | 0.9 | 1.77 × 0.36 × 1.98 | 117.8° | none | 132 |
| `SnowPile.bytes` | (4.2, 0, 2.6) | 1.1 | 2.16 × 0.43 × 2.42 | -61.8° | none | 132 |

- Painted shadows under props are flat discs in `#b8c9e5` (`ShadowSnow`), 2 × radius wide and 1.7 × radius deep, offset
  (0.12, 0.012, -0.10) × radius.
- **Clouds**: 9 separate meshes `HubCloud0` … `HubCloud8` (3 to 5 white `#fafafa` ellipsoid puffs each, 9 to 15 m long), at
  angle `i/9 * 2π`, distance 28 to 46 m, height 11 to 19 m, each circling the origin at 0.6 to 1.4 degrees per second
  (`Scripts/Hub/Drift.cs`). Start positions saved in `Hub.unity` (position; yaw in degrees; degrees per second):
  0 (41.11, 12.25, 0) 90° 0.91; 1 (30.76, 15.79, 25.81) 50° 1.39; 2 (7.11, 18.44, 40.34) 10° 0.69; 3 (-16.05, 11.07, 27.8) -30° 0.81; 4 (-38.57, 13.49, 14.04) -70° 0.99; 5 (-40.42, 12.07, -14.71) -110° 0.77; 6 (-22.1, 17.28, -38.28) 210° 0.71; 7 (6.84, 11.06, -38.79) 170° 0.75; 8 (27.52, 12.95, -23.09) 130° 0.9.

### 3.4 Snow

`Generated/Prefabs/Snowfall.prefab` (`Builder.Core.cs` `BuildSnow`, lines 220 to 249), placed at **(0, 4.5, 2)** in the hub:
emits from a box 12 × 0.1 × 12 m at 44 flakes per second, lifetime 7 s, prewarmed, at most 320 alive; size 0.02 to
0.045 m; colour white at alpha 0.9; no gravity, velocity x and z each -0.12 to 0.12 m/s, y -0.62 to -0.40 m/s, in world
space; billboards drawn with the soft dot texture (`T_Dot.png`: alpha = `1 - d²` from the centre) and the Particle
shader (alpha blended, no depth write).

### 3.5 Sky, light, fog (read from `Hub.unity`)

Sky photo `Assets/ThirdParty/Skies/Sky_Hub.jpg` (Poly Haven `snow_field_puresky`) on `M_Sky_Hub.mat`. Sun colour `#fff7eb`,
intensity 1.0, to-sun (0.627, 0.616, -0.477). Flat ambient `#bdc7d9`. Linear fog `#979793` from 45 m to 620 m.
Painted fallback sky: top `#80a1c9`, horizon `#dbe5f2`, bottom `#f2f7fc`.

---

## 4. Look

### 4.1 Theme colours (`Assets/WishWorld/Resources/WWTheme.asset`, class `Scripts/Core/WWTheme.cs`)

The asset values are what the app uses; two differ from the defaults written in `WWTheme.cs` (snow and peach), because
the builder overwrites them with its own palette (`Builder.Core.cs` lines 25 to 31, 162).

| Name | Hex | Unity floats | Used for |
|---|---|---|---|
| `sky` | `#b8cce0` | (0.72, 0.8, 0.88) | palette colour (race marker flags); not a sky colour in any scene |
| `snow` | `#f2f7fc` | (0.95, 0.97, 0.99) | ribbon text, snow ground, camera background |
| `slate` | `#334052` | (0.2, 0.25, 0.32) | all text, outlines, controller handles |
| `peach` | `#ffb88c` | (1, 0.72, 0.55) | accent buttons (Wish card, Finish, Start, Home in the quiz), pointer rays, controller ball, fact-card ribbon |
| `panel` | `#edf2f7` | (0.93, 0.95, 0.97) | panel fill (info panel, fact card, quiz, wish menu, caption bubble) |
| `button` | `#d1e0f0` | (0.82, 0.88, 0.94) | default button and card fill |
| `ice` | `#8fb0d4` | (0.56, 0.69, 0.83) | thin inner frame line, snowflakes, icicle tips |
| `ribbon` | `#45618c` | (0.27, 0.38, 0.55) | title ribbons |
| `shade` | `#788ca8` | (0.47, 0.55, 0.66) | drop shadows under panels |

Other fixed colours: UI snow white `#fbfcff`, snow underside `#c2d6ed`, frost blue `#ccdef2` (`Scripts/Core/WWUI.Styles.cs`
lines 110 to 112); button hover halo `#ffedb2` (`WWUI.cs` line 96); builder white `#fafafa`, black `#14141a`, snow
shade `#d6e3f2` (`Builder.Core.cs`); blob shadow `#0a0f1f` at 46% alpha; ice `#bde5ff` (blades, ghost car).

### 4.2 Fonts

| Role (`WWFont`) | Font | File | Licence | Used for |
|---|---|---|---|---|
| Title | Mountains of Christmas Bold | `Assets/ThirdParty/Fonts/MountainsofChristmas-Bold.ttf` | Apache 2.0 | ribbons, menu titles, the countdown |
| Heading | Berkshire Swash Regular | `Assets/ThirdParty/Fonts/BerkshireSwash-Regular.ttf` | SIL OFL 1.1 | card titles, every button label, quiz header, score pop-ups |
| Body | Almendra Regular | `Assets/ThirdParty/Fonts/Almendra-Regular.ttf` | SIL OFL 1.1 | captions, facts, subtitles, status lines |
| Plain | Liberation Sans (TextMesh Pro default) | `Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset` | SIL OFL | numbers on the race dashboard and the score panel |

TextMesh Pro SDF atlases (1024 × 1024, 72 pt sampling, padding 8) are in `Assets/WishWorld/Generated/Fonts/F_Title.asset`,
`F_Heading.asset`, `F_Body.asset` (`Editor/Builder.Fonts.cs`). Characters included: ASCII 32 to 126 plus `‘’“”–—…°×éèñç`.
For the web, load the three `.ttf` files directly (all three are Google Fonts).

Text sizing (`WWUI.Label`, `Scripts/Core/WWUI.cs` lines 59 to 85): `height` is the letter size in metres; Title text is
drawn 1.22 × and Body 1.08 × the stated height; text auto-shrinks down to half size to fit its box; it wraps and
truncates; text sits 4 mm in front of its panel (local z = -0.004). Default text colour is slate `#334052`.

### 4.3 The object shader: `WishWorld/VertexColorLit` (`Assets/WishWorld/Shaders/VertexColorLit.shader`)

One opaque forward pass, used by every creature, prop, terrain and controller through the single material
`Generated/Materials/M_VertexLit.mat` (`_BaseColor` white, `_Ambient` 0.35, `_Flat` 1, `_GlowColor` `#ffd999`, GPU
instancing on). No textures, no specular, no shadows.

```glsl
// Exactly what the Unity fragment does, written as GLSL. All colours are linear.
vec3 albedo = vColor.rgb * uBaseColor;                         // vColor = mesh vertex colour (stored linear)
float luma  = dot(albedo, vec3(0.299, 0.587, 0.114));
albedo = mix(albedo, uTint * clamp(luma * 1.2 + 0.3, 0.0, 1.0), uTintAmount * vColor.a);   // alpha 1 = "body"
// Faceted look: one normal per triangle from screen-space derivatives, turned toward the eye.
vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
n *= sign(dot(n, normalize(cameraPosition - vWorldPos)));
float ndl = clamp(dot(n, uToSun), 0.0, 1.0) * 0.5 + 0.5;       // half Lambert, 0.5 .. 1
vec3 lit = albedo * (uSunColor * ndl * ndl * 0.62 + uAmbient * 0.61);   // 0.61 = 0.4 + _Ambient(0.35) * 0.6
lit += uGlowColor * uGlow * (0.3 + 0.7 * albedo);              // fact-card highlight, _Glow 0 .. 0.7
lit = mix(uFogColor, lit, clamp((uFogFar - viewDepth) / (uFogFar - uFogNear), 0.0, 1.0));   // linear fog on view depth
gl_FragColor = vec4(lit, 1.0);                                 // then the usual linear -> sRGB output
```

- `uSunColor` = the main light colour (sRGB → linear) × intensity. `uToSun` = unit vector toward the sun.
- `uAmbient` = the flat ambient colour. `Scripts/Core/WWEnv.cs` writes it into the ambient probe with
  `SphericalHarmonicsL2.AddAmbientLight(color)` and the shader reads it back with `SampleSH(n)`, which for a flat probe is
  the same colour in every direction. **Not confirmed in a running editor:** whether Unity treats those numbers as linear
  or sRGB here. The project code applies no conversion, so start by using them as linear RGB; if shaded sides look too
  bright next to the reference videos in `Demos/`, convert from sRGB instead.
- Because of the half Lambert squared, a face turned away from the sun still gets `0.25 * 0.62` of the sun. Nothing is
  ever black; the look is soft and flat.
- The mesh normals are ignored (`_Flat` = 1), so a three.js material needs `flatShading` or the derivative trick above.
- Per-object values set at run time: `_Tint` + `_TintAmount` (colour wishes), `_Glow` (creatures), `_BaseColor` (the
  ground disc and platform are white meshes tinted with the world's ground colour).
- Closest stock three.js material: `MeshLambertMaterial({ vertexColors: true, flatShading: true })` with one
  `DirectionalLight` and an `AmbientLight`, but it will be darker on shaded faces (plain Lambert, not half Lambert
  squared). A small `ShaderMaterial` with the code above is the faithful route and is cheap on a Quest 2.
- Blade variant `M_VertexLit_Glow.mat`: same shader with `_Glow` 0.55 and `_GlowColor` `#bde5ff` (Frost Slice blades).

### 4.4 The other shaders (`Assets/WishWorld/Shaders/`)

| Shader | Material(s) | What it does | three.js equivalent |
|---|---|---|---|
| `WishWorld/VertexColorUnlit` | `M_UIPanel` | `vertexColour.rgb * _BaseColor.rgb`, opaque, **no lighting, no fog**, both sides drawn, queue Geometry+10 | `MeshBasicMaterial({ vertexColors: true, side: DoubleSide, fog: false })` |
| `WishWorld/Particle` | `M_Particle` (snow, juice; texture `T_Dot`), `M_Line` (pointer rays, blade trails; no texture), `M_BlobShadow` (texture `T_Dot`, colour `#0a0f1f` alpha 0.46) | `texture * vertexColour * _BaseColor`, alpha blended (`SrcAlpha OneMinusSrcAlpha`), no depth write, both sides, no lighting, no fog | `MeshBasicMaterial` / `PointsMaterial` / `SpriteMaterial` with `transparent: true, depthWrite: false` |
| `WishWorld/Overlay` | `M_Overlay` | a plain `_BaseColor` with alpha, drawn over everything (`ZTest Always`, queue Overlay+100). Used for the white scene fade: a 2 × 2 m quad 0.12 m in front of the head | a full-view quad with `depthTest: false`, or fade the canvas |
| `Skybox/Panoramic` (Unity built-in) | `M_SkyPanorama`, `M_Sky_Hub`, `M_Sky_Race` | equirectangular panorama, `_Exposure` 1 (0.28 at night), tint grey 0.5 (neutral), rotation 0 | `scene.background` = equirectangular texture (see section 10.5 for the orientation) |

### 4.5 UI style (`Scripts/Core/WWUI.cs`, `Scripts/Core/WWUI.Styles.cs`, `Scripts/Core/WWButton.cs`)

There is no Canvas. Every panel is flat vertex-coloured geometry in world space on the unlit material, facing the
viewer along its local -Z, with nearer layers at smaller z. Rounded corners use 6 segments per corner. Panel styles
(`PanelStyle`): `Auto` picks `Frame` when the smaller side is ≥ 0.18 m, else `Plain`.

**Plain**: slate rounded rectangle with the fill inset by `border` (a darker outline baked in).

**Frame** (cards, the info panel, the fact card, the quiz, game menus), back to front:

1. drop shadow in shade `#788ca8`, offset (+0.010, -0.013);
2. slate `#334052` outline;
3. white band `#fbfcff`, inset by `border` (at least 0.006);
4. thin ice line `#8fb0d4`, inset a further 0.009, 0.0028 wide;
5. the fill, shaded top to bottom from `lerp(fill, white, 0.4)` to `lerp(fill, #ccdef2, 0.3)`;
6. if the smaller side is ≥ 0.3 m: six-armed snowflakes of radius 0.021 in the corners, colour `lerp(ice, fill, 0.45)`
   (top corners only when the panel is under 0.4 m tall);
7. icicles along the bottom edge: triangles 0.012 to 0.022 wide and 0.016 to 0.05 long, white at the root to ice at the
   tip, 70% of slots filled;
8. a snow cap along the top edge: a white strip 0.016 high with rounded mounds 0.05 to 0.10 wide and 0.011 to 0.021
   high, each with a blue-grey underside `#c2d6ed` 5 mm lower.

Icicle and mound positions come from a random seed made from the panel size, so same-size panels look identical.

**Pill** (every ordinary button): corner radius `min(w, h) * 0.3`, border 0.006. Back to front: a lip
`lerp(slate, fill, 0.42)` offset 8 mm down (reads as a raised edge); slate outline; fill shaded from
`lerp(fill, white, 0.5)` at the top to the fill at the bottom; a highlight streak near the top in `lerp(fill, white, 0.85)`,
`min(h * 0.11, 0.012)` high. Default fill is button `#d1e0f0`; accent buttons use peach `#ffb88c`.

**Ribbon** (titles): fill ribbon `#45618c`, corner radius 0.006; swallow-tailed ends that reach `0.62 * h` past each side,
drop `0.2 * h` and are notched `0.3 * h`, in `lerp(fill, black, 0.22)` with a fold triangle in `lerp(fill, black, 0.5)`;
slate outline; face shaded `lerp(fill, white, 0.22)` to fill; a dashed "stitched" line inside the top and bottom edges
(dashes 0.012 long every 0.026, colour `lerp(fill, white, 0.5)`). Text in snow `#f2f7fc`.

**Bubble** (the guide's caption): 1.0 × 0.2 panel, radius 0.06, with a speech tail under the left part (at -0.28 × width),
drop shadow, slate outline, face shaded white `#fbfcff` to `lerp(fill, #ccdef2, 0.5)`. The caption sits 1.1 m in front of the
player, 0.5 m below eye level, tilted back 24°, text 0.042.

**Plate** (behind loose text such as the countdown and score pop-ups): a pill that sizes itself to the text
(`Scripts/Core/TextBackdrop.cs`, `WWUI.PlateMesh`).

**Button behaviour** (`WWButton`):

- Collider: a box the size of the button, 0.03 m deep. Layer `UI` (5); pointer rays test the UI layer before anything
  else, so a creature never blocks a button.
- Hover: a warm halo `#ffedb2` appears behind it (the button size + 0.026, 4 mm behind); the face brightens (`_BaseColor`
  1.12); it grows to 1.06 on a spring; `Sfx.Hover` at volume 0.25; after 0.45 s the guide reads its name
  (`WISHWORLD_READ_BUTTONS`, default on).
- Click: `Sfx.Click` at 0.6; a quick dip in size (-0.08, recovering in 0.25 s).
- Selected (wish menu tabs, a chosen quiz answer): face tinted (1.0, 0.86, 0.72). Disabled: face × 0.6, no hover.
- Appear: each button waits `min(0.035 * its index, 0.4) + 0.02` s, then springs from 0.6 to full size. Spring:
  `speed += (target - size) * 260 * dt; speed *= exp(-16 * dt); size += speed * dt`.
- Right answer: a hop (`speed += 3.2`). Wrong answer: a 0.4 s side-to-side shake of 14 mm at `sin(time * 55)`.

**Panel animation** (`Scripts/Core/PopIn.cs`): panels grow from 0.55 to 1 in 0.34 s with a "back" overshoot
(c1 = 1.70158); close by shrinking to 0.4 in 0.14 s; a "kick" bumps the size briefly when a number changes; the caption
breathes ±1.2% at `sin(t*9)` while the voice plays; optional bob. **Typing** (`Scripts/Core/TypeOn.cs`): captions, facts
and quiz questions reveal letter by letter, timed to the speech length.

### 4.6 Lights, shadows and render settings

- One directional light per scene, **no shadows** (`LightShadows.None`), no other lights. Ambient is a flat colour.
- **Blob shadows** (`Scripts/Core/BlobShadow.cs`) stand in for real shadows: a quad lying on the floor (12 mm above it)
  with the soft dot texture in `#0a0f1f` at alpha 0.46. Radius = 0.85 × the larger horizontal half-size of the owner;
  it shrinks and fades as the owner rises: `k = clamp01(1 - max(0, y - floorY - radius) / maxHeight)`, diameter =
  `2 * radius * (0.45 + 0.55 * k)`, hidden when `k ≤ 0.06`. `maxHeight` is 2 m for walkers and 3.5 m for the rest.
- Camera (`Builder.Core.cs` `BuildRig`): near 0.05 m, far 800 m (`FarClip`), HDR off, no post-processing, clear to skybox
  (background colour snow).
- URP asset `Assets/Settings/Mobile_RPAsset.asset`: HDR off, MSAA 4×, render scale 1, main-light shadows off, no
  additional lights. The PC (Link) route is set to use the same asset (`Editor/PcVrSetup.cs`). No tone mapping, no bloom.
- Target frame rate 72 (`Scripts/Hub/BootLoader.cs`).
- Scene changes fade to white in 0.35 s and back in 0.45 s (`Scripts/Core/SceneLoader.cs`).
- World scene defaults before a world is applied (`World.unity`): ambient `#9ea8b8`, sun white, intensity 1, rotation
  `Euler(50, -30, 0)`.

---

## 5. Player rig and input

Prefab `Assets/WishWorld/Generated/Prefabs/XRRig.prefab` (`Builder.Core.cs` `BuildRig`), scripts `Scripts/Core/XRRig.cs`,
`Scripts/Core/WWInput.cs`, `Scripts/Core/OVRInputSource.cs`.

**Rig.** `XRRig` (root, on the floor) → `Head` (camera + audio listener, default (0, 1.6, 0)), `LeftHand`, `RightHand`
(default (∓0.2, 1.2, 0.3)). Tracking origin is the floor. Poses are applied in `Update` and again just before rendering.
The player never moves through a scene: no locomotion, no teleport, no snap turn.

**What the hands look like.** There are no hand or controller models from Meta. Each controller is one small mesh
(`Generated/Meshes/Controller.asset`, 70 vertices, 0.057 × 0.083 × 0.151 m): a slate `#334052` hexagonal handle (cylinder
0.034 across, 0.11 long, tilted 70° about X, centred (0, -0.015, -0.035)) with a peach `#ffb88c` ball on the front
(0.06 × 0.05 × 0.06 at (0, 0.01, 0.03)). It is hidden while that controller is not tracked. In Frost Slice a blade is
attached to each hand (section 8).

**Pointer rays** (`XRRig.UpdatePointer`):

- One ray per controller from the controller's aim pose (OpenXR pointer pose; if none is reported, the grip pose
  tilted down 35°), 10 m long. It tests the UI layer first, then everything; triggers count.
- The ray is only **drawn while it is on something that can be pointed at**: a line from the controller to the hit point,
  6 mm wide at the hand to 3 mm at the end, peach `#ffb88c`, unlit.
- The target gets `OnHover(true/false)`; pulling the trigger past 0.55 fires `OnClick` once.
- Pointers are switched off during a scene fade and while a Frost Slice round or a race is running.

**Poke**: a sphere of radius 0.03 m, 0.04 m ahead of each controller along its aim; touching a button with it clicks it
once (until the hand leaves) with a haptic tick of 0.4 for 0.04 s.

**Gaze**: a ray 12 m from the head; looking at the same creature for 2 s plays its fact (not while a quiz is open).

**Recentre**: every scene recentres the player on its anchor two frames after loading (the head is put above the anchor
facing its forward; seated games also set eye height). **Y on the left controller repeats it** at any time.

**Button mapping** (Quest Touch controllers):

| Control | Left | Right |
|---|---|---|
| Trigger (pressed above 0.55) | click what the left ray points at; **brake** in Snow Circuit | click what the right ray points at; **accelerate** in Snow Circuit |
| A / X (primary) | X: not used | **A: hold to talk** (push-to-talk in the World scene, `Scripts/Wish/WishVoice.cs`) |
| B / Y (secondary) | **Y: recentre** | B: not used |
| Grip | read but not used anywhere | read but not used anywhere |
| Thumbstick | not used | x-axis steers in Snow Circuit when the two-handed wheel grip is not available: a hand is not tracked, or the hands are less than 6 cm apart sideways (dead zone 0.15) |
| Moving the controller | touch a creature (0.06 m), poke a button, swing a blade, steer (tilt of the line between the hands) | same |

**Haptics** (`WWInput.Haptic(left, amplitude, seconds)`):

| When | Amplitude | Seconds |
|---|---|---|
| Poking a button | 0.4 | 0.04 |
| Touching a creature | 0.5 | 0.08 |
| Slicing a fruit | 0.6 | 0.06 |
| Hitting an ice block | 1.0 | 0.25 |
| Bumping a rival car (both hands) | 0.5 | 0.12 |

**Input sources.** On the headset the default is Meta's `OVRInput` (`WISHWORLD_INPUT=ovr`), falling back to Unity's
OpenXR devices if it sees no controller for 3 s; `WISHWORLD_INPUT=openxr` uses OpenXR directly. Through Link on the
Windows PC it is OpenXR. With no headset the editor uses a keyboard-and-mouse stand-in
(`Scripts/DebugTools/DesktopInputSource.cs`): right-drag to look, WASD/QE to move the head, the mouse moves the right
controller (Left Shift for the left), left click = trigger, F = A/X, C = B/Y; while racing A/D steer, W throttle, S brake.

---

## 6. Voice and AI

Code: `Scripts/Services/Services.cs` (which service is used), `Scripts/Services/RealServices.cs` (the HTTP clients),
`Scripts/Services/MockServices.cs` (fallbacks), `Scripts/Services/VoiceBank.cs` (recorded lines),
`Scripts/Services/WishWorldServiceConfig.cs` (endpoints, models, switches), `Scripts/Core/GuideVoice.cs` (the one voice),
`Scripts/Wish/*.cs` (push-to-talk, parser, router, menu), `Editor/VoiceBaker.cs` (recording), `Editor/EnvSync.cs` (keys
from `.env` into the config asset). All calls are raw HTTPS (`UnityWebRequest`); no SDK.

Each service is real only if its switch is on **and** its key is present; otherwise the mock is used. `EnvSync` turns
the switches on when it finds `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` in `.env`.

### 6.1 ElevenLabs text-to-speech

| | Live speech (lines not in the bank, i.e. AI answers) | Baking the preset lines (editor only) |
|---|---|---|
| Code | `ElevenLabsTextToSpeech`, `RealServices.cs` lines 366 to 410 | `VoiceBaker.Bake`, `Editor/VoiceBaker.cs` lines 105 to 146 |
| Request | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=pcm_24000` | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128` |
| Headers | `xi-api-key: <key>`, `Content-Type: application/json` | same |
| Body | `{"text":"<line>","model_id":"eleven_flash_v2_5"}` | `{"text":"<line>","model_id":"<bake model>"}` |
| Response | raw 16-bit little-endian mono PCM at 24 kHz, turned into an audio clip and cached per text for the session | MP3 bytes written to `Assets/WishWorld/Generated/Voice/<hash>.mp3` |
| Timeout / failure | 30 s; on any failure a placeholder tone plays instead (`Sfx.SpeechPlaceholder`), the caption still shows | 60 s; stops at the first refusal |

- **Voice id default: `cgSgspJ2msm6clMCkdW9`** (ElevenLabs stock voice "Jessica"; `EnvSync.DefaultVoiceId`), used when
  `ELEVENLABS_VOICE_ID` is not set. The voice bank was recorded with this id (`VoiceBank.asset` `voiceName`).
- **Live model: `eleven_flash_v2_5`** (`WishWorldServiceConfig.ttsModel`).
- **Bake model:** the config default is `eleven_multilingual_v2`, overridden by `ELEVENLABS_BAKE_MODEL`. The existing
  recordings were made with `eleven_flash_v2_5` (confirmed for this document: every file name matches the hash below
  computed with that model; `THIRD_PARTY.md` says the same).
- Listing voices: `GET https://api.elevenlabs.io/v2/voices?page_size=100` with `xi-api-key`.
- File name of a baked line: the first 8 bytes, in hex, of `SHA-1( key + "|" + voiceId + "|" + bakeModel )`, where `key`
  is the line trimmed, lower-cased and with runs of whitespace collapsed to one space (`VoiceBank.Key`).
- Playback order (`BankedTextToSpeech`): the bank first (instant, no network), otherwise the live service, otherwise the
  placeholder tone. Lines spoken without a caption are skipped entirely when neither a recording nor the live service exists.

### 6.2 ElevenLabs speech recognition (push-to-talk)

`CloudSpeechRecognizer`, `RealServices.cs` lines 62 to 138.

- Hold **A** on the right controller: the microphone records at 16 kHz for up to 15 s. Release: recordings under
  0.2 s are rejected with "That was too short to hear."
- Request: `POST https://api.elevenlabs.io/v1/speech-to-text`, header `xi-api-key`, multipart form with
  `model_id` = **`scribe_v2`** and `file` = `speech.wav` (`audio/wav`, 16-bit PCM WAV built in memory). Timeout 30 s.
- Response: JSON; only the `text` field is read.
- Messages shown in the wish menu's status line: "Listening...", "Heard: <text>", "Thinking...",
  "I could not reach the speech service.", "I did not catch that.", "The microphone was not recording.",
  "That was too short to hear."

### 6.3 ElevenLabs conversational agents

**Not used.** No code reads `ELEVENLABS_AGENT_ID` or `ELEVENLABS_GUIDE_AGENT_ID`, and there is no websocket or
conversational-AI call anywhere in `Assets/WishWorld`. The only mention is `BUILD_LOG.md` line 575: "The agent ids are
not used. Both agents belong to another app". If the web build wants an agent, it is new work, not a port.

### 6.4 Anthropic API (Claude picks the wish)

`ClaudeCommandInterpreter`, `RealServices.cs` lines 210 to 360. Used when `ANTHROPIC_API_KEY` is set (it takes priority over Gemini).

**When it is called** (`CommandRouter.HandleHeard`, `Scripts/Wish/CommandRouter.cs` lines 35 to 63): only for speech,
never for menu buttons. If the heard sentence is made of nothing but preset words and filler ("purple sharks please",
`CommandParser.IsExact`), it goes straight to the keyword matcher with no network call. Otherwise the status line shows
"Thinking..." and the sentence goes to Claude.

**Request** (as written in the code; `BUILD_LOG.md` says it was run against the real API with
`claude-haiku-5-5`, replies in 0.8 to 2.1 s; check the current API reference before reusing these values):

```
POST https://api.anthropic.com/v1/messages          (WishWorldServiceConfig.claudeEndpoint)
x-api-key: <key>
Content-Type: application/json
timeout: 15 s

{
  "model": "claude-haiku-5-5",                       (claudeModel; .env ANTHROPIC_MODEL overrides it)
  "max_tokens": 4096,
  "fallbacks": "default",                            (only when the model name does not contain "haiku")
  "system": "<system prompt below>",
  "messages": [ { "role": "user", "content": "<the heard text, exactly as recognised>" } ],
  "output_config": {
    "effort": "low",                                 (claudeEffort)
    "format": { "type": "json_schema", "schema": <schema below> }
  }
}
```

**User prompt.** There is no template: the user message is the recognised speech and nothing else.

**System prompt, verbatim** (with `guideAnswersQuestions` on, the default):

```text
You are the wish-granter inside WishWorld, a calm virtual-reality playroom for young children who are in hospital. A child holds a button and says out loud what they would like to see. Their words were turned into text by speech recognition, so expect mishearings, half sentences and a small child's way of putting things.

The app cannot build anything new. It can only show what it already has: a fixed set of worlds, creatures, colours, amounts, sizes and a few extras, which are exactly the values your reply is allowed to contain. Your job is to choose the preset values that come closest to what the child meant, so that they get something delightful rather than a refusal.

How to choose (set kind to "wish"):
- world: the place they want to be, or empty to stay where they are. Pick one only when they ask for a place or for a kind of thing that belongs somewhere else ("I want to see fish" suits the aquarium).
- creatures: each creature they asked for. If they ask for something the app does not have, choose the nearest in spirit (a dragon is closest to a dinosaur, a puppy to a friendly farm animal). Leave it empty if they asked for no creature.
- color, amount, size: only when they said so ("violet" is purple, "loads" is lots of, "teeny" is tiny). Otherwise empty.
- extras: weather and time (make it snow, make it night, make it sunny), "in my room" to bring things into their real room, "take me there" to go inside the world, "clear", "undo" and "go home". Add "add" when they want another of a creature that is already there together with a change of colour, amount or size.
- say: leave empty for a wish.

If the child is asking a question or just chatting rather than wishing, set kind to "answer" and put a warm, true, simple reply of at most two short sentences for a six-year-old in say; leave the other fields empty. If you are not sure something is true, say you are not sure. Keep everything gentle: nothing about illness, danger, or anything frightening.

If the words are noise, or nothing in the presets comes close, set kind to "none" and leave the rest empty. Prefer a near match over "none": a child who asks for a unicorn would rather meet a horse than be told no.
```

When something is on show, this is appended (after a blank line): `What the child can see right now: ` followed by the
scene description from `CommandRouter.DescribeScene`: "the <World> world" (or "the child's own room" in AR, or "an empty
dream world"), then for each creature kind `; <count> <Name> (<its fact>)`, ending with a full stop. Example:
`the Aquarium world; 8 Clownfish (Clownfish live among the stinging arms of sea anemones, which do not hurt them.); 1 Sea Turtle (…).`

With `guideAnswersQuestions` off, the paragraph beginning "If the child is asking a question" is left out.

**Expected output**: one JSON object with all eight fields, constrained by this schema (the enum lists are built at run
time from the library by `CommandParser.Options`; this is the schema with the current library):

```json
{
  "type": "object",
  "properties": {
    "kind": { "type": "string", "enum": ["wish", "answer", "none"] },
    "world": { "type": "string", "enum": ["", "aquarium", "zoo", "space", "dinosaurs", "arctic", "rainforest", "farm", "sky"] },
    "creatures": { "type": "array", "items": { "type": "string", "enum": ["clownfish", "turtle", "shark", "jellyfish", "ray", "elephant", "giraffe", "zebra", "lion", "flamingo", "saturn", "earth", "venus", "astronaut", "rocket", "satellite", "comet", "t rex", "triceratops", "stegosaurus", "pterosaur", "penguin", "polar bear", "seal", "whale", "snowy owl", "parrot", "monkey", "frog", "butterfly", "sloth", "cow", "sheep", "horse", "chicken", "pig", "hot air balloon", "bird", "kite", "plane"] } },
    "color": { "type": "string", "enum": ["", "red", "blue", "purple", "gold", "rainbow"] },
    "amount": { "type": "string", "enum": ["", "more", "fewer", "lots of"] },
    "size": { "type": "string", "enum": ["", "bigger", "smaller", "giant", "tiny"] },
    "extras": { "type": "array", "items": { "type": "string", "enum": ["make it snow", "make it night", "make it sunny", "in my room", "take me there", "clear", "undo", "go home", "add"] } },
    "say": { "type": "string" }
  },
  "required": ["kind", "world", "creatures", "color", "amount", "size", "extras", "say"],
  "additionalProperties": false
}
```

**How the reply maps onto presets** (`ToCommand`, lines 347 to 359, then `CommandRouter`):

- The last `text` block of `content` is parsed as that JSON. `stop_reason` of `refusal` or `max_tokens`, an HTTP error or
  a timeout all mean "no answer".
- `kind: "answer"` → the string `say: <say>` → the guide says and captions it at once (cut to 260 characters).
- `kind: "wish"` → the chosen values are joined with spaces in this order: extras, world, amount, size, color, creatures.
  Example from `BUILD_LOG.md`: "Um, can I please see a big scary dragon, and make it night time" →
  `make it night dinosaurs giant t rex`. That string is then run through the **same keyword parser as a menu button**,
  so Claude can only ever trigger things the menu can.
- `kind: "none"`, an empty result or any failure → the keyword matcher gets the original words; if it also finds
  nothing the guide says "I can't make that yet. Want a shark instead?".

Examples recorded in `BUILD_LOG.md` (lines 635 to 644): "can I see some sea creatures that are violet" → aquarium, purple,
clownfish, turtle, jellyfish, ray; "I want a dragon" → dinosaurs, T. rex; "a unicorn in my bedroom" → in my room, horse;
"why do penguins waddle" → a two-sentence answer; "make everything really really small" → tiny.

**Gemini (only when there is no Anthropic key)**: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`
with header `x-goog-api-key`, body `{"systemInstruction":{"parts":[{"text":…}]},"contents":[{"role":"user","parts":[{"text":<heard>}]}],"generationConfig":{"temperature":0,"maxOutputTokens":300}}`.
It replies with plain preset words, `say: …`, or `none`. `RealServices.cs` says it has never been run against the real
service. Its system instruction, verbatim (`<vocabulary>` is the comma-separated list in section 6.5):

```text
You are the guide in a calm VR playroom for young children in hospital. A child has just spoken. FIRST decide if it is a wish to change the world. If it is, reply with ONLY words from this list, separated by spaces, choosing the closest matches: <vocabulary>. Example: 'can I see some sea creatures that are violet' -> 'aquarium purple'. If instead the child is asking a question or just talking, reply with 'say: ' followed by a warm, true, simple answer of at most two short sentences for a six-year-old. Never mention illness, danger or anything frightening. If you are not sure something is true, say you are not sure. If nothing fits, reply with the single word: none.
```

When something is on show, `What the child can see now: <scene description> ` is inserted before the last sentence.

**Skybox generation** (Blockade Labs, `BlockadeSkyboxGenerator`) exists but is off and untested; the mock returns the
world's stored panorama.

### 6.5 The keyword matcher (mock / fallback; `Scripts/Wish/CommandParser.cs`)

This is the whole "no AI" path, and also what executes Claude's choice.

1. **Normalise**: lower-case; every character that is not a letter or digit becomes a space; runs of spaces collapse; a
   space is added at each end.
2. **Match** a phrase if ` phrase `, ` phrases `, ` phrasees ` or (for a phrase ending in y) ` phrasies ` occurs.
3. Tables (first row that matches wins within colour, amount and size):

| Kind | Result → words that trigger it |
|---|---|
| Colour | `red` → red; `blue` → blue; `purple` → purple, violet; `gold` → gold, golden, yellow; `rainbow` → rainbow, rainbows |
| Amount | `lots` → lots of, lots, many, a lot; `more` → more; `fewer` → fewer, less |
| Size | `giant` → giant, huge, enormous; `tiny` → tiny, teeny; `bigger` → bigger, larger, big; `smaller` → smaller, small, little |
| Snow | make it snow, let it snow, snow, snowing |
| Night | make it night, night, nighttime, dark |
| Sunny | make it sunny, sunny, sunshine, daytime, make it day |
| AR | in my room, my room, in the room |
| VR | take me there, take me |
| Clear | clear, remove everything, reset |
| Undo | undo, go back |
| Home | go home, home, main menu (ignored if undo matched) |
| Add | add, give me, i want, show me, spawn |
| Creature | every creature whose keyword occurs (all of them are collected) |
| World | the first menu world, in library order, whose keyword occurs |

4. **Vocabulary** given to the AI (`CommandParser.Vocabulary`): `aquarium, zoo, space, dinosaurs, arctic, rainforest, farm, sky, clownfish, turtle, shark, jellyfish, ray, elephant, giraffe, zebra, lion, flamingo, saturn, earth, venus, astronaut, rocket, satellite, comet, t rex, triceratops, stegosaurus, pterosaur, penguin, polar bear, seal, whale, snowy owl, parrot, monkey, frog, butterfly, sloth, cow, sheep, horse, chicken, pig, hot air balloon, bird, kite, plane, red, blue, purple, gold, rainbow, more, fewer, lots of, bigger, smaller, giant, tiny, make it snow, make it night, make it sunny, in my room, take me there, clear, undo, go home, add`
5. **`IsExact`**: removes every known phrase (longest first, with plurals) and these filler words: a, an, the, some,
   please, and, with, i, want, me, give, show, add, of, to, it, make, let, lets, s. If at least one phrase was found and
   nothing is left, the sentence is "exact" and skips the AI.

**Executing a parsed wish** (`CommandRouter.Execute`, lines 75 to 142), in this order:

- home → load the hub and stop. undo → restore; the guide says "Okay, I put it back." or "There is nothing to undo."
- clear → "All clear."; in my room → AR on, "Here it is, in your room."; take me there → AR off, "Off we go!".
- world → load it; the line becomes the world's intro (said at once, replacing anything queued).
- each creature: added if it is not present, or if an add word was said, or if there is no colour/amount/size word
  (so "purple shark" recolours an existing shark rather than adding one); first one sets the line
  "Here comes the <name>!".
- colour → applied to the named creatures, or to everything if none were named: "Ooh, <colour>!".
- amount → "A few less." for fewer, otherwise "More and more!". size → "So small!" for tiny/smaller, otherwise "So big!".
- snow → "Let it snow!"; night → "Goodnight, world."; sunny → "Hello, sunshine!".
- Only the first line set is spoken. Nothing matched → "I can't make that yet. Want a shark instead?".

### 6.6 The wish menu (`Scripts/Wish/WishMenu.cs`)

Shown in AR and wish modes, to the right of the player. Panel 0.92 × 0.74; five tab buttons 0.168 × 0.075 across the top
(`Worlds`, `Creatures`, `Change`, `Sky`, `Control`); a grid of 3 columns × 4 rows of buttons 0.27 × 0.105 spaced
0.285 × 0.12; a status line at the bottom that starts as "Hold A and speak, or pick". Each button sends a command string
to the same router:

| Tab | Buttons (label → command) |
|---|---|
| Worlds | each menu world → its first keyword (aquarium, zoo, space, dinosaurs, arctic, rainforest, farm, sky) |
| Creatures | each creature → `add <first keyword>`; 40 items over 4 pages of 11 with a peach "More 1/4" button in the last slot |
| Change | Red, Blue, Purple, Gold, Rainbow, More, Fewer, Lots (`lots of`), Bigger, Smaller, Giant, Tiny |
| Sky | Make it snow, Make it night, Make it sunny, In my room, Take me there |
| Control | Undo, Clear, Go home |

### 6.7 How the guide speaks (`Scripts/Core/GuideVoice.cs`)

- `Say(line)`: caption bubble plus voice, queued (at most 4 waiting). `SayNow`: drops the queue and speaks at once.
- `Read(line)` / `ReadNow`: voice only, for words already on a panel (facts, quiz, menus).
- `Hint(line)`: a button's name; only when nothing else is being said.
- Caption time is first guessed as `clamp(1.8 + chars * 0.055, 2.5, 8)` s, then set to the clip length + 0.7 s once the
  audio arrives; the text types out over 90% of the clip length.
- The audio is 2D (not positional).

### 6.8 Every guide and dialog string

**Guide lines written in code** (all recorded in the bank unless marked):

| String | Where it is said |
|---|---|
| "Welcome to WishWorld! Pick a card to begin." | hub arrival (`HubController`) |
| "Games. Slice fruit, or race a car." / "Worlds. Where would you like to go?" | opening the hub sub-menus |
| "This is your room. Say or pick what should visit!" | entering AR mode |
| "What do you wish for? Say it, or pick from the menu." | entering wish mode |
| the world intro (section 2.1), or "Welcome to the <World>!" if a world has none | entering a world |
| "Here comes the <name>!" | a creature is added by a wish |
| "Ooh, red!" / "Ooh, blue!" / "Ooh, purple!" / "Ooh, gold!" / "Ooh, rainbow!" | colour wish |
| "A few less." / "More and more!" | amount wish |
| "So small!" / "So big!" | size wish |
| "Let it snow!" / "Goodnight, world." / "Hello, sunshine!" | weather wishes |
| "All clear." / "Here it is, in your room." / "Off we go!" | clear / AR / VR |
| "Okay, I put it back." / "There is nothing to undo." | undo |
| "I can't make that yet. Want a shark instead?" | nothing matched |
| "You found them all! Press Finish for a quiz." | every kind in the world learned |
| "Yes! <Name>." / "It was the <Name>." | quiz verdict |
| "You got N of M right!" (N ≤ M ≤ 3) | quiz score |
| "Add some creatures and learn their facts, then try the quiz." | quiz with nothing to ask |
| "Perfect score! You are a real explorer." / "Nice exploring! Want to look around some more?" | after the quiz |
| "Frost Slice. Swing the controllers to slice the fruit. Leave the ice blocks alone!" | Frost Slice menu |
| "Slice the fruit! Leave the ice alone." (or "Slice the fruit!") | round start |
| "What a swing!" | a 3-fruit combo |
| "A new best score! Amazing slicing." / "Nice slicing! Want another go?" | round end |
| "<Title> Score N. Best M." (not in the bank: spoken live) | round end read-out |
| "Snow Circuit. Hold both controllers like a steering wheel. Right trigger to go, left trigger to brake." | race menu |
| "Three." "Two." "One." "Go!" | race countdown |
| "Lap 2!" … "Lap 5!" / "Last lap!" | crossing the line |
| "You finished first!" … "fifth!" | race end with rivals |
| "A new best lap! Great driving." / "Great driving! Want another race?" | race end without rivals |
| the AI's own answer (not in the bank: spoken live) | a child's question |

**Panel and button text**: hub strings in section 3.1; world panels in section 2.4; wish menu in section 6.6; status
lines in section 6.2. Button labels read aloud: Home, Finish, Close, Back, Start, Hub, Play again, Race again, Worlds,
Creatures, Change, Sky, Control, Red, Blue, Purple, Gold, Rainbow, More, Fewer, Lots, Bigger, Smaller, Giant, Tiny,
Make it snow, Make it night, Make it sunny, In my room, Take me there, Undo, Clear, Go home, each world name and each
creature name (`VoiceLines.ButtonLabels`, `Scripts/Services/VoiceBank.cs`).

**Baked voice lines**: all 354 are listed with their audio file in **appendix A**.

---

## 7. Audio

**There are no sound-effect or music files.** Everything except the voice is generated at run time by
`Scripts/Core/Sfx.cs` as mono clips at 22,050 Hz and cached. `Env(t, len)` below is a linear envelope: attack over
`min(0.008, len * 0.2)` s, then a straight decay to zero at `len`. There is no music.

| Sound | Formula (t in seconds) | Length | Triggered by (volume) |
|---|---|---|---|
| `Hover` | `sin(2π·1300·t) · Env · 0.4` | 0.04 s | pointer enters a button (0.25) |
| `Click` | sine sweeping 650 → 980 Hz `· Env · 0.6` | 0.08 s | button click (0.6); race countdown 3-2-1 (0.7); bumping a rival (0.8) |
| `Chime` | `(sin(2π·660·t)·Env(t, 0.5) + [t > 0.12] sin(2π·990·t)·Env(t - 0.12, 0.38)) · 0.45` | 0.5 s | creature learned (0.5); "Go!" and each lap (0.7) |
| `Chirp(pitch)` | `sin(2π · 440·p · (1 + 2t) · t) · Env · 0.5`, `p` = pitch rounded to 0.05, clamped 0.3 to 3 (an upward sweep from `440·p` Hz) | 0.22 s | creature learned (0.8), per-creature pitch in section 1.3 |
| `Success` | notes 523, 659, 784, 1047 Hz, 0.15 s each (last 0.25 s), `· 0.45` | 0.7 s | right quiz answer (0.6); Frost Slice round end (0.6); race finish (0.7) |
| `Buzz` | 140 Hz square wave `· Env · 0.35` | 0.3 s | wrong quiz answer (0.4); slicing an ice block (0.7) |
| `Slice` | `(noise·0.5 + sine sweeping 1800 → 500 Hz · 0.4) · Env` | 0.18 s | a fruit is cut (0.8) |
| `Pop` | sine sweeping 300 → 90 Hz `· Env` | 0.14 s | a fruit is launched (0.35) |
| `Engine` (loop) | `(saw(70t)·0.5 + saw(105t)·0.25 + noise·0.05) · 0.5` | 1 s loop | Snow Circuit; pitch `0.6 + speed/topSpeed · 1.3`, volume 0.22 racing, 0.06 idle |
| `Ambient(0)` underwater (loop) | low-passed noise (one-pole, α 0.02) × `(0.8 + 0.2·sin(1.57t))` × 6 | 4 s loop | worlds with `ambientKind` 0: aquarium |
| `Ambient(1)` wind (loop) | low-passed noise (α 0.06) × `(0.6 + 0.4·sin(1.57t))` × 2.5 | 4 s loop | arctic, sky, blank |
| `Ambient(2)` space hum (loop) | `(sin(2π·55t) + 0.6·sin(2π·82.5t)) · 0.25 · (0.8 + 0.2·sin(1.57t))` | 4 s loop | space |
| `Ambient(3)` outdoors (loop) | low-passed noise (α 0.12) × `(0.5 + 0.2·sin(3.14t))` × 2.5 | 4 s loop | zoo, dinosaurs, rainforest, farm |
| `SpeechPlaceholder(text)` | one soft blip per word (up to 12), 0.16 s apart, 330 to 510 Hz | words × 0.16 s | stands in for speech when there is no recording and no live voice |

The web export already holds these sounds as WAV files rendered by the same code (`public/audio/sfx/*.wav`, one
chirp file per pitch, index `public/audio/audio.json`), so the formulas are only needed to check or regenerate them.

Ambient loops play at volume 0.22, 2D, and stop in AR (`WorldController` lines 54 to 57, 260 to 266). Loops are
cross-faded over their first tenth of a second so they repeat cleanly. Effects are played at a point in space
(`AudioSource.PlayClipAtPoint`), so they are positional; the guide's voice is not.

**Voice**: `Assets/WishWorld/Generated/Voice/*.mp3`, 354 files, 8.58 MB in all, MP3 44.1 kHz 128 kbps mono-ised on
import. Index: `Assets/WishWorld/Generated/Resources/VoiceBank.asset` (text → clip). Credit required by the ElevenLabs free
plan, non-commercial use (`THIRD_PARTY.md`).

---

## 8. Games (brief)

### 8.1 Frost Slice (`Scripts/Games/FrostSliceGame.cs`, scene `Game_FrostSlice.unity`, builder `Editor/Builder.Games.cs`)

- Standing, in passthrough (the scene starts with the real room showing). Each controller holds a blade 0.64 m long
  (`PLACEHOLDER_Blade.prefab`: slate handle, peach guard, ice-blue glowing blade with a short fading trail).
- A 60 s round, 3 lives. Fruit is thrown in waves of 1 to 4 (0.28 s apart) with a pause shrinking from 2.6 s to 1.7 s. Each
  starts 1.5 to 2 m ahead at 0.35 m height and arcs to a peak 0.45 to 0.62 m in front of the player at 1.1 to 1.55 m,
  reached in 1.0 to 1.25 s under gentle custom gravity, then falls away.
- A cut counts only when the blade tip moves faster than 1.6 m/s and the blade (or its swept path) passes within the
  fruit radius + 0.025 m. The fruit is replaced by two pre-made halves that fly apart, with a 14-particle juice burst.
- Fruit (points, radius): Apple 10, Orange 10, Watermelon 10 (large), Lemon 15, Pear 15, Coconut 20. Several fruit in
  one swing (within 0.3 s) multiply the points by the combo count; pop-ups read "+10" or "Combo x2  +20".
- From 8 s in, 16% of throws are an **ice block** (hazard): cutting it costs a life ("Ouch!"); none left ends the round
  ("Out of lives"); time up shows "Time!". End panel: "Score N / Best M (new best!)", buttons "Play again" and "Hub".
- Score panel behind the fruit: time left ("42s"), score, "Lives 3". Best score is stored locally.
- Props: a snow mound where the fruit pops out (z ≈ 1.8) and a peach ring on the floor marking where to stand.

### 8.2 Snow Circuit (`Scripts/Games/SnowCircuitGame.cs`, `Scripts/Games/RaceRivals.cs`, scene `Game_SnowCircuit.unity`)

- Seated in an open-wheel car cockpit (eye height 1.05 m); the view is full VR in an alpine valley
  (`Resources/Scenery/race.prefab`), or the real room with `WISHWORLD_RACE_VIEW=room`.
- Steering: hold both controllers like a wheel; the tilt of the line between the hands steers (45° = full lock, 3° dead
  zone). Right trigger accelerates, left trigger brakes.
- 3 laps of a closed track about 7 m wide (320 centre-line samples; snow banks, peach and white kerbs, a start gantry,
  marker flags). Top speed 13 m/s (shown as km/h), acceleration 5.5, braking 11 m/s², 4.5 m/s off the track; the car can
  never leave the corridor (track half-width + 1.2 m).
- Four computer cars by default (`WISHWORLD_RACE_RIVALS`, 0 to 5; names Pip, Juno, Rex, Skye, Bo) that keep lanes,
  overtake, and ease off or push on to keep the race close. Touching one is a gentle knock, never a crash. With 0 rivals a
  ghost car replays the session's best lap.
- Countdown "3", "2", "1", "Go!" 0.8 s apart; dashboard shows speed, "L1/3  P4/5" and lap time; end panel "You won!" or
  "Finished second!" with the time and best lap; buttons "Race again" and "Hub".

---

## 9. Asset inventory

Sizes are the files on disk in the repo (Unity text-format `.asset` files are much larger than the binary a web export
would be: roughly 100 bytes of YAML per vertex). Vertex and triangle counts were read from the mesh headers.
**Needed for** uses these tags: `reef` = sea creatures and reef scenery, `hub`, `world:<id>`, `ui`, `games`, `all`.

### 9.1 Creature models (40)

| id | Prefab | Mesh | Type | Mesh file size | Vertices / triangles | Source / licence | Needed for |
|---|---|---|---|---|---|---|---|
| `clownfish` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Clownfish.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Clownfish.asset` | generated mesh | 27.6 KB | 288 / 144 | generated by this project (`CreatureMeshes.cs`) | reef, world:aquarium |
| `turtle` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_SeaTurtle.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_SeaTurtle.asset` | generated mesh | 25.6 KB | 264 / 132 | generated by this project (`CreatureMeshes.cs`) | reef, world:aquarium |
| `shark` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Shark.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Shark.asset` | generated mesh | 39.7 KB | 432 / 216 | generated by this project (`CreatureMeshes.cs`) | reef, world:aquarium |
| `jellyfish` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Jellyfish.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Jellyfish.asset` | generated mesh | 25.6 KB | 264 / 132 | generated by this project (`CreatureMeshes.cs`) | reef, world:aquarium |
| `ray` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Ray.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Ray.asset` | generated mesh | 25.6 KB | 264 / 132 | generated by this project (`CreatureMeshes.cs`) | reef, world:aquarium |
| `elephant` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Elephant.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Elephant.asset` | generated mesh | 44.9 KB | 478 / 352 | generated by this project (`CreatureMeshes.cs`) | world:zoo |
| `giraffe` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Giraffe.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Giraffe.asset` | generated mesh | 56.5 KB | 599 / 540 | generated by this project (`CreatureMeshes.cs`) | world:zoo |
| `zebra` | `Assets/WishWorld/Generated/Prefabs/Model_Zebra.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Zebra.asset` | pack mesh | 336.6 KB | 4062 / 1354 | Quaternius Farm Animals Pack (CC0 1.0), baked to vertex colours | world:zoo |
| `lion` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Lion.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Lion.asset` | generated mesh | 39.6 KB | 414 / 324 | generated by this project (`CreatureMeshes.cs`) | world:zoo |
| `flamingo` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Flamingo.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Flamingo.asset` | generated mesh | 35.9 KB | 354 / 410 | generated by this project (`CreatureMeshes.cs`) | world:zoo |
| `saturn` | `Assets/WishWorld/Generated/Prefabs/Model_Saturn.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Saturn.asset` | pack mesh | 498.0 KB | 6030 / 2010 | Quaternius Ultimate Space Kit (CC0 1.0), baked to vertex colours | world:space |
| `earth` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Earth.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Earth.asset` | generated mesh | 42.1 KB | 405 / 604 | generated by this project (`CreatureMeshes.cs`) | world:space |
| `venus` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Venus.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Venus.asset` | generated mesh | 47.4 KB | 450 / 756 | generated by this project (`CreatureMeshes.cs`) | world:space |
| `astronaut` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Astronaut.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Astronaut.asset` | generated mesh | 27.3 KB | 280 / 176 | generated by this project (`CreatureMeshes.cs`) | world:space |
| `rocket` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Rocket.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Rocket.asset` | generated mesh | 23.5 KB | 228 / 194 | generated by this project (`CreatureMeshes.cs`) | world:space |
| `satellite` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Satellite.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Satellite.asset` | generated mesh | 22.5 KB | 218 / 178 | generated by this project (`CreatureMeshes.cs`) | world:space |
| `comet` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Comet.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Comet.asset` | generated mesh | 20.1 KB | 179 / 230 | generated by this project (`CreatureMeshes.cs`) | world:space |
| `trex` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Trex.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Trex.asset` | generated mesh | 72.9 KB | 747 / 954 | generated by this project (`CreatureMeshes.cs`) | world:dinosaurs |
| `triceratops` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Triceratops.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Triceratops.asset` | generated mesh | 45.8 KB | 481 / 408 | generated by this project (`CreatureMeshes.cs`) | world:dinosaurs |
| `stegosaurus` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Stegosaurus.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Stegosaurus.asset` | generated mesh | 46.6 KB | 510 / 282 | generated by this project (`CreatureMeshes.cs`) | world:dinosaurs |
| `pterosaur` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Pterosaur.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Pterosaur.asset` | generated mesh | 31.9 KB | 308 / 376 | generated by this project (`CreatureMeshes.cs`) | world:dinosaurs |
| `penguin` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Penguin.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Penguin.asset` | generated mesh | 25.6 KB | 264 / 132 | generated by this project (`CreatureMeshes.cs`) | world:arctic |
| `polarbear` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_PolarBear.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_PolarBear.asset` | generated mesh | 40.7 KB | 424 / 356 | generated by this project (`CreatureMeshes.cs`) | world:arctic |
| `seal` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Seal.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Seal.asset` | generated mesh | 25.6 KB | 264 / 132 | generated by this project (`CreatureMeshes.cs`) | world:arctic |
| `whale` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_BlueWhale.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_BlueWhale.asset` | generated mesh | 37.7 KB | 408 / 204 | generated by this project (`CreatureMeshes.cs`) | world:arctic (a sea creature) |
| `snowyowl` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_SnowyOwl.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_SnowyOwl.asset` | generated mesh | 36.8 KB | 382 / 306 | generated by this project (`CreatureMeshes.cs`) | world:arctic |
| `parrot` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Parrot.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Parrot.asset` | generated mesh | 25.5 KB | 262 / 138 | generated by this project (`CreatureMeshes.cs`) | world:rainforest |
| `monkey` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Monkey.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Monkey.asset` | generated mesh | 49.3 KB | 512 / 504 | generated by this project (`CreatureMeshes.cs`) | world:rainforest |
| `frog` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_TreeFrog.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_TreeFrog.asset` | generated mesh | 40.3 KB | 390 / 544 | generated by this project (`CreatureMeshes.cs`) | world:rainforest |
| `butterfly` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Butterfly.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Butterfly.asset` | generated mesh | 32.9 KB | 312 / 436 | generated by this project (`CreatureMeshes.cs`) | world:rainforest |
| `sloth` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Sloth.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Sloth.asset` | generated mesh | 34.5 KB | 340 / 384 | generated by this project (`CreatureMeshes.cs`) | world:rainforest |
| `cow` | `Assets/WishWorld/Generated/Prefabs/Model_Cow.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Cow.asset` | pack mesh | 199.3 KB | 2388 / 796 | Quaternius Farm Animals Pack (CC0 1.0), baked to vertex colours | world:farm |
| `sheep` | `Assets/WishWorld/Generated/Prefabs/Model_Sheep.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Sheep.asset` | pack mesh | 154.0 KB | 1836 / 612 | Quaternius Farm Animals Pack (CC0 1.0), baked to vertex colours | world:farm |
| `horse` | `Assets/WishWorld/Generated/Prefabs/Model_Horse.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Horse.asset` | pack mesh | 173.2 KB | 2070 / 690 | Quaternius Farm Animals Pack (CC0 1.0), baked to vertex colours | world:farm |
| `chicken` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Chicken.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Chicken.asset` | generated mesh | 35.1 KB | 368 / 256 | generated by this project (`CreatureMeshes.cs`) | world:farm |
| `pig` | `Assets/WishWorld/Generated/Prefabs/Model_Pig.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Pig.asset` | pack mesh | 141.7 KB | 1686 / 562 | Quaternius Farm Animals Pack (CC0 1.0), baked to vertex colours | world:farm |
| `balloon` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_HotAirBalloon.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_HotAirBalloon.asset` | generated mesh | 60.6 KB | 602 / 868 | generated by this project (`CreatureMeshes.cs`) | world:sky |
| `bird` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Bird.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Bird.asset` | generated mesh | 23.6 KB | 240 / 120 | generated by this project (`CreatureMeshes.cs`) | world:sky |
| `kite` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Kite.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Kite.asset` | generated mesh | 19.4 KB | 190 / 100 | generated by this project (`CreatureMeshes.cs`) | world:sky |
| `plane` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Plane.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Plane.asset` | generated mesh | 25.7 KB | 252 / 226 | generated by this project (`CreatureMeshes.cs`) | world:sky |

### 9.2 Scenery

| Path | Type | Size on disk (8 meshes) | Vertices / triangles | Source / licence | Needed for |
|---|---|---|---|---|---|
| `Assets/WishWorld/Generated/Resources/Scenery/aquarium.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_aquarium_0.asset` … `_7.asset` | prefab of 8 static meshes | 10.47 MB | 157,133 / 178,874 | generated terrain and sea surface; hand-built corals, anemones, kelp, clams, starfish, anchor, rock arches, bubbles (`SceneryProps.cs`); Kenney Pirate Kit (wreck, chests, barrels, cannon, crate, rocks) and Nature Kit (pebbles), CC0 | reef, world:aquarium |
| `Assets/WishWorld/Generated/Resources/Scenery/zoo.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_zoo_0.asset` … `_7.asset` | prefab of 8 static meshes | 5.83 MB | 86,453 / 103,982 | generated terrain; hand-built acacias, baobabs, termite mounds, dead trees, boulders; Kenney Nature Kit (grass, bushes, reeds, tents, campfire), Car Kit (jeep), Survival Kit (box, barrel), CC0; Quaternius zebra, CC0; generated elephants and giraffes | world:zoo |
| `Assets/WishWorld/Generated/Resources/Scenery/space.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_space_0.asset` … `_7.asset` | prefab of 8 static meshes | 5.84 MB | 85,356 / 109,554 | generated terrain; Quaternius Ultimate Space Kit (base, panels, rover, spaceship, rocks) and Kenney Space Kit (stations, dishes, astronauts, craters, rocks, craft), CC0; hand-built flagpole; generated Earth | world:space |
| `Assets/WishWorld/Generated/Resources/Scenery/dinosaurs.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_dinosaurs_0.asset` … `_7.asset` | prefab of 8 static meshes | 9.09 MB | 139,037 / 143,518 | generated terrain, river; hand-built skeleton, nests, smoke plume; Kenney Nature Kit (palms, pines, plants, rocks, logs, mushrooms) and Pirate Kit (palms), CC0; generated stegosaurs and triceratops | world:dinosaurs |
| `Assets/WishWorld/Generated/Resources/Scenery/arctic.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_arctic_0.asset` … `_7.asset` | prefab of 8 static meshes | 6.17 MB | 100,311 / 68,382 | generated terrain and sea; hand-built igloos, icebergs, ice floes, ice spikes, snowmobiles, flagpole; Kenney Survival Kit (tents, crates), Holiday Kit (sled, snow piles, rocks), Space Kit (dish), Pirate Kit (ship), CC0; generated penguins, seals, polar bear | world:arctic |
| `Assets/WishWorld/Generated/Resources/Scenery/rainforest.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_rainforest_0.asset` … `_7.asset` | prefab of 8 static meshes | 10.81 MB | 158,805 / 201,511 | generated terrain, river, waterfall; hand-built boulders; Kenney Nature Kit (trees, bamboo, plants, flowers, statues, bridge, canoe, hanging moss), Fantasy Town Kit (tall trees), Pirate Kit (palms), CC0 | world:rainforest |
| `Assets/WishWorld/Generated/Resources/Scenery/farm.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_farm_0.asset` … `_7.asset` | prefab of 8 static meshes | 8.75 MB | 125,316 / 177,377 | generated terrain; hand-built barn and silo, houses, church, hay bales, scarecrow; Kenney Nature Kit (trees, crops, fences, flowers), Fantasy Town Kit (windmill, cart, stall), Car Kit (tractor), CC0; Quaternius cows, sheep, horses, CC0 | world:farm |
| `Assets/WishWorld/Generated/Resources/Scenery/sky.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_sky_0.asset` … `_7.asset` | prefab of 8 static meshes | 5.40 MB | 87,705 / 60,624 | generated summit and cloud sea; hand-built clouds, peaks, cairn, flagpole, airship; Kenney Survival Kit (tent, bedroll, box) and Holiday Kit (rocks), CC0; generated balloons | world:sky |
| `Assets/WishWorld/Generated/Resources/Scenery/race.prefab` + `Assets/WishWorld/Generated/Meshes/Scenery_race_0.asset` … `_7.asset` | prefab of 8 static meshes | 17.19 MB | 270,343 / 238,272 | generated valley; Kenney Racing Kit, Car Kit, Nature Kit and others, CC0; hand-built village, ski lift, crowd | games (Snow Circuit) |

### 9.3 Hub, rig and shared meshes

| Path | Type | Size on disk | Vertices / triangles | Source / licence | Needed for |
|---|---|---|---|---|---|
| `Assets/WishWorld/Generated/Meshes/HubTerrain.asset` | mesh (one merged terrain with every static hub prop) | 15.47 MB | 183,151 / 65,213 | generated snow, hills, mountains, hamlet (`Builder.Hub.cs`, `SceneryProps.cs`) + Kenney Holiday Kit props, CC0 | hub |
| `Assets/WishWorld/Generated/Meshes/HubCloud0.asset` … `HubCloud8.asset` | 9 meshes | 166.9 KB | 1440 / 2016 in total | generated (`Builder.Hub.cs`) | hub |
| `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_PenguinGuide.prefab` | prefab: Body + LeftWing + RightWing, script `PenguinGuide` | 9.2 KB |  | generated, original character (`Builder.Core.cs`) | hub, every world (the guide) |
| `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_PenguinBody.asset` | mesh | 29.6 KB | 312 / 156 | generated | hub, worlds |
| `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_PenguinWing.asset` | mesh (used twice) | 5.4 KB | 24 / 12 | generated | hub, worlds |
| `Assets/WishWorld/Generated/Prefabs/Snowfall.prefab` | particle system (no mesh) | 114.4 KB |  | generated (`Builder.Core.cs` `BuildSnow`) | hub; any world after "make it snow" |
| `Assets/WishWorld/Generated/Prefabs/XRRig.prefab` | prefab: head camera, two hands | 12.6 KB |  | generated (`Builder.Core.cs` `BuildRig`) | all |
| `Assets/WishWorld/Generated/Meshes/Controller.asset` | mesh (the visible controller, both hands) | 9.8 KB | 70 / 80 | generated | all |
| `Assets/WishWorld/Generated/Meshes/WorldGround.asset` | mesh: flat white disc 90 m across, 40 segments | 7.1 KB | 42 / 40 | generated | worlds without surroundings (fallback only) |
| `Assets/WishWorld/Generated/Meshes/WorldPlatform.asset` | mesh: floating platform 3.4 m across | 24.4 KB | 236 / 224 | generated | world:blank (Wish World) |
| `Assets/WishWorld/Generated/Materials/M_VertexLit.mat` | material: the one material for every model | 0.9 KB |  | generated | all |
| `Assets/WishWorld/Generated/Materials/M_UIPanel.mat` | material: all panels and buttons | 0.8 KB |  | generated | ui |
| `Assets/WishWorld/Generated/Materials/M_Particle.mat` | material: snow, juice | 0.9 KB |  | generated | hub, games |
| `Assets/WishWorld/Generated/Materials/M_Line.mat` | material: pointer rays, blade trails | 0.9 KB |  | generated | ui |
| `Assets/WishWorld/Generated/Materials/M_BlobShadow.mat` | material: blob shadows | 0.9 KB |  | generated | all |
| `Assets/WishWorld/Generated/Materials/M_Overlay.mat` | material: scene fade | 0.8 KB |  | generated | all |
| `Assets/WishWorld/Generated/Materials/M_SkyPanorama.mat` | material: world sky (texture swapped per world) | 1.0 KB |  | generated | worlds |
| `Assets/WishWorld/Generated/Materials/M_Sky_Hub.mat` | material: hub sky | 1.1 KB |  | generated | hub |

### 9.4 Skies and textures

| Path | Type | Size | Source / licence | Needed for |
|---|---|---|---|---|
| `Assets/ThirdParty/Skies/Sky_Hub.jpg` | equirectangular JPEG, 4096 × 2048 | 354.9 KB | Poly Haven `snow_field_puresky`, CC0 1.0 | hub |
| `Assets/ThirdParty/Skies/Sky_Zoo.jpg` | equirectangular JPEG, 4096 × 2048 | 362.9 KB | Poly Haven `qwantani_sunset_puresky`, CC0 1.0 | world:zoo |
| `Assets/ThirdParty/Skies/Sky_Space.jpg` | equirectangular JPEG, 4096 × 2048 | 762.2 KB | NASA Deep Star Maps, public domain; credit NASA/Goddard SVS, Gaia DR2: ESA/Gaia/DPAC | world:space |
| `Assets/ThirdParty/Skies/Sky_Dinosaurs.jpg` | equirectangular JPEG, 4096 × 2048 | 410.5 KB | Poly Haven `hilly_terrain_01_puresky`, CC0 1.0 | world:dinosaurs |
| `Assets/ThirdParty/Skies/Sky_Arctic.jpg` | equirectangular JPEG, 4096 × 2048 | 1.04 MB | Poly Haven `kloppenheim_02_puresky`, CC0 1.0, darkened to night with an aurora painted on by `Tools/bake_skies.py` | world:arctic |
| `Assets/ThirdParty/Skies/Sky_Rainforest.jpg` | equirectangular JPEG, 4096 × 2048 | 284.5 KB | Poly Haven `kloofendal_misty_morning_puresky`, CC0 1.0, tinted slightly green | world:rainforest |
| `Assets/ThirdParty/Skies/Sky_Farm.jpg` | equirectangular JPEG, 4096 × 2048 | 680.5 KB | Poly Haven `sunflowers_puresky`, CC0 1.0 | world:farm |
| `Assets/ThirdParty/Skies/Sky_Sky.jpg` | equirectangular JPEG, 4096 × 2048 | 495.3 KB | Poly Haven `rocky_ridge_puresky`, CC0 1.0 | world:sky |
| `Assets/ThirdParty/Skies/Sky_Race.jpg` | equirectangular JPEG, 4096 × 2048 | 648.9 KB | Poly Haven `kloofendal_48d_partly_cloudy_puresky`, CC0 1.0 | games (Snow Circuit) |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Aquarium.png` | painted equirectangular PNG, 1024 × 512 | 113.9 KB | generated (`Builder.Core.cs` `BuildSky`) | reef, world:aquarium (this is its real sky) |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Arctic.png` | painted equirectangular PNG, 1024 × 512 | 110.8 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Dinosaurs.png` | painted equirectangular PNG, 1024 × 512 | 64.8 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Farm.png` | painted equirectangular PNG, 1024 × 512 | 58.3 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Hub.png` | painted equirectangular PNG, 1024 × 512 | 57.3 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Rainforest.png` | painted equirectangular PNG, 1024 × 512 | 109.0 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Sky.png` | painted equirectangular PNG, 1024 × 512 | 17.3 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Space.png` | painted equirectangular PNG, 1024 × 512 | 80.9 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_WishWorld.png` | painted equirectangular PNG, 1024 × 512 | 12.8 KB | generated (`Builder.Core.cs` `BuildSky`) | world:blank (this is its real sky) |
| `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Zoo.png` | painted equirectangular PNG, 1024 × 512 | 64.4 KB | generated (`Builder.Core.cs` `BuildSky`) | fallback only |
| `Assets/ThirdParty/Skies/skies.json` | sun position and horizon colour measured from each photo | 2.8 KB | generated by `Tools/bake_skies.py` | reference |
| `Assets/WishWorld/Generated/Textures/T_Dot.png` | 64 × 64 soft white dot with alpha | 2.1 KB | generated | snow, blob shadows, juice |

### 9.5 Fonts

| Path | Type | Size | Source / licence | Needed for |
|---|---|---|---|---|
| `Assets/ThirdParty/Fonts/MountainsofChristmas-Bold.ttf` | TrueType | 120.3 KB | Tart Workshop, Apache 2.0 (Google Fonts) | ui: titles |
| `Assets/ThirdParty/Fonts/BerkshireSwash-Regular.ttf` | TrueType | 57.0 KB | Astigmatic, SIL OFL 1.1 (Google Fonts) | ui: headings, buttons |
| `Assets/ThirdParty/Fonts/Almendra-Regular.ttf` | TrueType | 67.1 KB | Ana Sanfelippo, SIL OFL 1.1 (Google Fonts) | ui: body text |
| `Assets/WishWorld/Generated/Fonts/F_Title.asset`, `F_Heading.asset`, `F_Body.asset` | TextMesh Pro SDF font assets | 6.18 MB | generated from the three files above | Unity only (not useful on the web) |
| `Assets/ThirdParty/Licences/*.txt` | licence texts |  |  | ship with the fonts and models |

### 9.6 Game assets (Frost Slice, Snow Circuit)

| Path | Type | Size on disk | Vertices / triangles | Source / licence |
|---|---|---|---|---|
| `Assets/WishWorld/Generated/Prefabs/Fruit_Apple.prefab`, `FruitHalf_Apple.prefab` | whole fruit and one cut half | 78.1 KB | 408 / 136 and 462 / 154 | Kenney Food Kit 2.0, CC0 1.0 (`Fruit_Apple.bytes`, `FruitHalf_Apple.bytes`) |
| `Assets/WishWorld/Generated/Prefabs/Fruit_Orange.prefab`, `FruitHalf_Orange.prefab` | whole fruit and one cut half | 66.3 KB | 360 / 120 and 366 / 122 | Kenney Food Kit 2.0, CC0 1.0 (`Fruit_Orange.bytes`, `FruitHalf_Orange.bytes`) |
| `Assets/WishWorld/Generated/Prefabs/Fruit_Watermelon.prefab`, `FruitHalf_Watermelon.prefab` | whole fruit and one cut half | 676.1 KB | 4128 / 1376 and 4032 / 1344 | Kenney Food Kit 2.0, CC0 1.0 (`Fruit_Watermelon.bytes`, `FruitHalf_Watermelon.bytes`) |
| `Assets/WishWorld/Generated/Prefabs/Fruit_Lemon.prefab`, `FruitHalf_Lemon.prefab` | whole fruit and one cut half | 55.5 KB | 312 / 104 and 282 / 94 | Kenney Food Kit 2.0, CC0 1.0 (`Fruit_Lemon.bytes`, `FruitHalf_Lemon.bytes`) |
| `Assets/WishWorld/Generated/Prefabs/Fruit_Pear.prefab`, `FruitHalf_Pear.prefab` | whole fruit and one cut half | 70.3 KB | 408 / 136 and 366 / 122 | Kenney Food Kit 2.0, CC0 1.0 (`Fruit_Pear.bytes`, `FruitHalf_Pear.bytes`) |
| `Assets/WishWorld/Generated/Prefabs/Fruit_Coconut.prefab`, `FruitHalf_Coconut.prefab` | whole fruit and one cut half | 48.6 KB | 228 / 76 and 282 / 94 | Kenney Food Kit 2.0, CC0 1.0 (`Fruit_Coconut.bytes`, `FruitHalf_Coconut.bytes`) |
| `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_IceBlock.asset` | the hazard | 13.5 KB | 120 / 60 | generated |
| `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Blade.asset` | blade held in each hand (prefab has a `Tip` child with a trail) | 11.9 KB | 100 / 66 | generated |
| `Assets/WishWorld/Generated/Meshes/FrostSliceProps.asset` | snow mound and standing ring | 40.5 KB | 401 / 496 | generated |
| `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_CarCockpit.asset` | the player's car | 50.8 KB | 550 / 376 | generated |
| `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_SteeringWheel.asset` | steering wheel | 17.9 KB | 164 / 140 | generated |
| `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_GhostCar.asset` | ghost car | 27.7 KB | 278 / 224 | generated |
| `Assets/WishWorld/Generated/Meshes/RivalCar_0.asset` | rival car (also `RivalCar_2`, `RivalCar_4`: same model, recoloured) | 483.7 KB | 5,856 / 1,952 | Kenney Car Kit 3.1 `car/race`, CC0 1.0 |
| `Assets/WishWorld/Generated/Meshes/RivalCar_1.asset` | rival car (also `RivalCar_3`) | 512.3 KB | 6,204 / 2,068 | Kenney Car Kit 3.1 `car/race-future`, CC0 1.0 |
| `Assets/WishWorld/Generated/Meshes/SnowCircuitTrack.asset` | track, kerbs, banks, start line, flags, gantry | 896.3 KB | 10,604 / 5,500 | generated |
| `Assets/WishWorld/Generated/Prefabs/JuiceBurst.prefab` | particle burst (no mesh) | 114.4 KB |  | generated |
| `Assets/WishWorld/Generated/Track.asset` | track centre line: 320 points, width 7 m (`TrackData`) | 12.7 KB |  | generated |

### 9.7 Baked third-party source models (`Assets/ThirdParty/Baked/*.bytes`)

These are the inputs the builder turns into the meshes above; they are the easiest thing to convert without Unity
(format in section 10.3). Colours are the three largest by surface area.

| File | Size | Triangles | Size x × y × z (m) | Main colours (share of surface) | Source / licence | Used for |
|---|---|---|---|---|---|---|
| `Bench.bytes` | 6.3 KB | 160 | 1.5 × 0.98 × 0.85 | `#b86747` 24%, `#d17c57` 24%, `#be6c4b` 10%, `#c6724f` 10%, `#b6bfe5` 8% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `CandyCane.bytes` | 3.3 KB | 84 | 0.66 × 1 × 0.22 | `#d8d8e7` 16%, `#ea5142` 10%, `#dc4b44` 9%, `#eaeaf2` 8%, `#e34e43` 8% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `Cow.bytes` | 31.1 KB | 796 | 0.64 × 1.45 × 2.58 | `#e6e6e6` 63%, `#333333` 33%, `#e6747f` 4% | Quaternius Farm Animals Pack, CC0 1.0 | creature `cow`; distant herds in the farm scenery |
| `FruitHalf_Apple.bytes` | 6.0 KB | 154 | 0.12 × 0.06 × 0.12 | `#ee6445` 35%, `#faf2cc` 31%, `#f46743` 18%, `#58c387` 6%, `#f96a42` 2% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `FruitHalf_Coconut.bytes` | 3.7 KB | 94 | 0.14 × 0.07 × 0.14 | `#fcfaf0` 31%, `#9c5a41` 23%, `#a25c41` 19%, `#a75e41` 13%, `#ab5e41` 8% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `FruitHalf_Lemon.bytes` | 3.7 KB | 94 | 0.08 × 0.05 × 0.09 | `#fff5a8` 31%, `#ffc759` 24%, `#ffb54a` 15%, `#ffbb4f` 13%, `#ffc154` 11% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `FruitHalf_Orange.bytes` | 4.8 KB | 122 | 0.11 × 0.06 × 0.11 | `#ffb84d` 33%, `#ff9244` 31%, `#ff8a44` 30%, `#53bd84` 5%, `#58c387` 1% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `FruitHalf_Pear.bytes` | 4.8 KB | 122 | 0.07 × 0.07 × 0.08 | `#f7f5c7` 27%, `#48b27f` 24%, `#3fa87a` 20%, `#53bd84` 10%, `#58c387` 10% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `FruitHalf_Watermelon.bytes` | 52.5 KB | 1344 | 0.2 × 0.1 × 0.2 | `#ee6445` 13%, `#e96147` 11%, `#53bd84` 10%, `#f46743` 9%, `#43ad7d` 8% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `Fruit_Apple.bytes` | 5.3 KB | 136 | 0.12 × 0.11 × 0.12 | `#ee6445` 26%, `#e45e48` 18%, `#d7574c` 14%, `#e15d49` 14%, `#f46743` 13% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `Fruit_Coconut.bytes` | 3.0 KB | 76 | 0.14 × 0.14 × 0.14 | `#945841` 16%, `#9c5a41` 16%, `#885541` 14%, `#8e5641` 14%, `#a25c41` 14% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `Fruit_Lemon.bytes` | 4.1 KB | 104 | 0.08 × 0.1 × 0.09 | `#ffaa41` 18%, `#ffc759` 17%, `#ffa33b` 14%, `#ffb54a` 11%, `#ffb046` 11% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `Fruit_Orange.bytes` | 4.7 KB | 120 | 0.12 × 0.11 × 0.12 | `#ff8a44` 27%, `#ff9244` 20%, `#ff8144` 15%, `#ff7a44` 14%, `#ff7e44` 12% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `Fruit_Pear.bytes` | 5.3 KB | 136 | 0.09 × 0.13 × 0.09 | `#3fa87a` 17%, `#248d6d` 14%, `#359e75` 12%, `#39a378` 11%, `#48b27f` 11% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `Fruit_Watermelon.bytes` | 53.8 KB | 1376 | 0.2 × 0.21 × 0.2 | `#e45e48` 11%, `#ee6445` 6%, `#e96147` 6%, `#e15d49` 5%, `#53bd84` 5% | Kenney Food Kit 2.0, CC0 1.0 | games: Frost Slice |
| `Horse.bytes` | 27.0 KB | 690 | 0.65 × 1.75 × 2.34 | `#734e3f` 86%, `#2b2b2b` 14% | Quaternius Farm Animals Pack, CC0 1.0 | creature `horse`; distant herds in the farm scenery |
| `Lantern.bytes` | 6.7 KB | 172 | 0.33 × 1.1 × 0.29 | `#767b92` 17%, `#5b6078` 14%, `#5f647c` 13%, `#ffac42` 8%, `#636880` 8% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `Pig.bytes` | 22.0 KB | 562 | 0.54 × 0.75 × 1.6 | `#d7a0a3` 99%, `#7b5441` 1% | Quaternius Farm Animals Pack, CC0 1.0 | creature `pig` |
| `PresentA.bytes` | 9.3 KB | 238 | 0.33 × 0.42 × 0.33 | `#cecee0` 18%, `#e6e6ef` 14%, `#d8d8e7` 10%, `#d3d3e4` 9%, `#f7f7fa` 9% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `PresentB.bytes` | 9.3 KB | 238 | 0.42 × 0.36 × 0.42 | `#1e574b` 25%, `#2a7464` 12%, `#205c4f` 12%, `#276b5d` 9%, `#1b5145` 8% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `PresentC.bytes` | 9.3 KB | 238 | 0.46 × 0.3 × 0.32 | `#cecee0` 18%, `#d3d3e4` 15%, `#f7f7fa` 13%, `#eaeaf2` 10%, `#e6e6ef` 6% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `Reindeer.bytes` | 34.0 KB | 870 | 0.84 × 1.5 × 1.43 | `#c6724f` 15%, `#be6c4b` 12%, `#d7815b` 12%, `#e48c63` 8%, `#d17c57` 6% | Kenney Holiday Kit 2.0, CC0 1.0 | hub (mascot) |
| `RocksLarge.bytes` | 27.2 KB | 696 | 2.4 × 1.31 × 2.05 | `#5b6078` 25%, `#636880` 15%, `#71768d` 13%, `#666b83` 11%, `#7a7f96` 9% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `Saturn.bytes` | 78.5 KB | 2010 | 1.25 × 0.74 × 1.16 | `#cb9157` 42%, `#9d724f` 34%, `#b67346` 14%, `#d9b174` 10% | Quaternius Ultimate Space Kit, CC0 1.0 | creature `saturn` |
| `Sheep.bytes` | 23.9 KB | 612 | 0.48 × 0.95 × 1.29 | `#e6e6e6` 83%, `#393939` 17% | Quaternius Farm Animals Pack, CC0 1.0 | creature `sheep`; distant herds in the farm scenery |
| `Sled.bytes` | 9.2 KB | 236 | 0.75 × 0.45 × 1.2 | `#c6724f` 25%, `#de875f` 17%, `#5b6078` 8%, `#be6c4b` 7%, `#cc7853` 6% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `SnowPile.bytes` | 5.2 KB | 132 | 1.96 × 0.4 × 2.2 | `#c6e3f7` 46%, `#cee7f8` 21%, `#dceefa` 12%, `#ebf6fc` 8%, `#f7fbfe` 7% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `Snowman.bytes` | 21.7 KB | 555 | 1.07 × 1.35 × 0.68 | `#dceefa` 15%, `#d5ebf9` 12%, `#cee7f8` 11%, `#e6f3fb` 10%, `#c6e3f7` 6% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `TreeDecorated.bytes` | 31.6 KB | 810 | 1.64 × 3 × 1.64 | `#248d6d` 16%, `#359e75` 9%, `#e6f3fb` 6%, `#29926f` 6%, `#42ac7c` 5% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `TreeSnowA.bytes` | 14.8 KB | 378 | 2.11 × 3.4 × 2.11 | `#248d6d` 29%, `#e1f1fb` 11%, `#ebf6fc` 10%, `#359e75` 9%, `#f7fbfe` 8% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `TreeSnowB.bytes` | 14.6 KB | 374 | 1.78 × 2.8 × 1.78 | `#248d6d` 20%, `#359e75` 12%, `#e6f3fb` 8%, `#29926f` 8%, `#42ac7c` 6% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `TreeSnowC.bytes` | 9.1 KB | 234 | 2.48 × 4 × 2.48 | `#248d6d` 28%, `#dceefa` 12%, `#cee7f8` 11%, `#d5ebf9` 11%, `#f1f8fd` 7% | Kenney Holiday Kit 2.0, CC0 1.0 | hub |
| `Zebra.bytes` | 52.9 KB | 1354 | 0.53 × 1.45 × 1.89 | `#e6e6e6` 52%, `#333333` 48% | Quaternius Farm Animals Pack, CC0 1.0 | creature `zebra`; distant herd in the zoo scenery |

Scenery kits baked at native size in `Assets/ThirdParty/Baked/Scenery~/` (a folder Unity does not import), used only
through the merged scenery meshes: `car/` Kenney Car Kit, 50 files, 2.49 MB; `holiday/` Kenney Holiday Kit, 99 files, 1.09 MB; `nature/` Kenney Nature Kit, 329 files, 1.39 MB; `pirate/` Kenney Pirate Kit, 72 files, 1.19 MB; `qspace/` Quaternius Ultimate Space Kit, 46 files, 3.78 MB; `racing/` Kenney Racing Kit, 71 files, 347.6 KB; `space/` Kenney Space Kit, 76 files, 457.9 KB; `survival/` Kenney Survival Kit, 80 files, 495.4 KB; `town/` Kenney Fantasy Town Kit, 167 files, 1.00 MB (all CC0 1.0). Index: `Assets/ThirdParty/Baked/Scenery~/index.tsv`.

### 9.8 Audio

| Path | Type | Size | Source / licence | Needed for |
|---|---|---|---|---|
| `Assets/WishWorld/Generated/Voice/*.mp3` (354 files) | MP3 44.1 kHz 128 kbps | 8.58 MB | ElevenLabs text-to-speech, voice "Jessica", model `eleven_flash_v2_5`, free plan (credit required, non-commercial) | all (guide voice); list in appendix A |
| `Assets/WishWorld/Generated/Resources/VoiceBank.asset` | index, text → clip | 39.7 KB | generated | all |
| (none) | sound effects, ambience | 0 | synthesised in `Scripts/Core/Sfx.cs` | all |

### 9.9 Present but not used by the game

- `Assets/WishWorld/Generated/Meshes/Model_Earth.asset` (4,794 vertices): no prefab uses it; Earth is the generated `PLACEHOLDER_Earth`.
- `PLACEHOLDER_Cow`, `PLACEHOLDER_Horse`, `PLACEHOLDER_Pig`, `PLACEHOLDER_Sheep`, `PLACEHOLDER_Zebra`, `PLACEHOLDER_Saturn`
  mesh assets: the generated versions of the six pack creatures, left over from before the packs; their prefabs were deleted.
  (The distant, static animals inside the scenery meshes come from the same sources as the live ones: pack cows, sheep,
  horses and zebras; generated elephants, giraffes, stegosaurs, triceratops, penguins, seals, a polar bear and balloons.)
- `Assets/Models/BasicHouse/`, `Assets/Scenes/SampleScene.unity`, `Assets/TutorialInfo/`, `Assets/_Recovery/`: template
  or recovery files, not part of WishWorld.
- Painted skies `PLACEHOLDER_Sky_*.png` for worlds that have a photo: fallback only.

---

## 10. Export notes

### 10.1 General rules for any exporter

- **Geometry only: position, (normal), vertex colour, indices. No UVs, no textures, no materials to carry over.** Every
  mesh uses `M_VertexLit`. Write vertex colour as glTF `COLOR_0`, **RGBA float, linear, unchanged** (the meshes already
  hold linear values; glTF and three.js expect linear). Keep the alpha channel: it is the tint mask (1 = body,
  0 = detail), not transparency, so mark the material `OPAQUE`.
- Creature, prop and hub meshes carry normals, but the shader ignores them; scenery sector meshes carry none.
  Everything is flat-shaded from screen-space derivatives, so normals can be left out of every export to save space.
- Unity is left-handed with clockwise front faces. Converting to glTF means negating one axis **and** reversing the
  triangle winding. Say in `manifest.json` which axis was negated, because sun directions, sky orientation and every
  position in this file depend on it (section 10.5).
- One unit = one metre; export at prefab scale 1 (all creature prefabs have scale 1).
- File names follow `docs/CONTRACT.md`: `/models/<creature id>.glb`. A first export already exists under `public/`
  (written by the Unity exporter; `public/models/manifest.json` and `public/models/layouts.json` are
  the authority for names, sizes and placements): `/models/world_<world id>.glb` and `world_<world id>_lite.glb`
  (surroundings, full and cut to about 40,000 triangles), `/models/scene_hub.glb`, `/models/penguin_guide.glb`,
  `/models/reindeer.glb` and the other hub props, `/models/controller.glb`, `/models/world_platform.glb`,
  `/textures/sky_<world id>.jpg`, `/textures/sky_hub.jpg`, `/textures/dot.png`, `/audio/voice/<hash>.mp3`,
  `/audio/sfx/<name>.wav` with the index `/audio/audio.json`. That exporter negates **X** (`layouts.json`: "Unity (x, y, z)
  is (-x, y, z) here; a Unity yaw of a degrees is -a here").

### 10.2 What to load for each model

Creatures (load the prefab and read `MeshFilter.sharedMesh`; or the mesh asset directly; or regenerate with the builder
function, which returns a `MeshBuilder` in editor code):

| Web file | Prefab to load | Mesh asset | Builder function (editor code, returns a `MeshBuilder`; `.Build(name)` gives the `Mesh`) | Relies on |
|---|---|---|---|---|
| `/models/clownfish.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Clownfish.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Clownfish.asset` | `CreatureMeshes.Clownfish()` | vertex colours |
| `/models/turtle.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_SeaTurtle.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_SeaTurtle.asset` | `CreatureMeshes.Turtle()` | vertex colours |
| `/models/shark.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Shark.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Shark.asset` | `CreatureMeshes.Shark()` | vertex colours |
| `/models/jellyfish.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Jellyfish.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Jellyfish.asset` | `CreatureMeshes.Jellyfish()` | vertex colours |
| `/models/ray.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Ray.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Ray.asset` | `CreatureMeshes.Ray()` | vertex colours |
| `/models/elephant.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Elephant.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Elephant.asset` | `CreatureMeshes.Elephant()` | vertex colours |
| `/models/giraffe.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Giraffe.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Giraffe.asset` | `CreatureMeshes.Giraffe()` | vertex colours |
| `/models/zebra.glb` | `Assets/WishWorld/Generated/Prefabs/Model_Zebra.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Zebra.asset` | `CreatureMeshes.Zebra()`; or convert `Assets/ThirdParty/Baked/Zebra.bytes` | vertex colours |
| `/models/lion.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Lion.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Lion.asset` | `CreatureMeshes.Lion()` | vertex colours |
| `/models/flamingo.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Flamingo.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Flamingo.asset` | `CreatureMeshes.Flamingo()` | vertex colours |
| `/models/saturn.glb` | `Assets/WishWorld/Generated/Prefabs/Model_Saturn.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Saturn.asset` | `CreatureMeshes.Saturn()`; or convert `Assets/ThirdParty/Baked/Saturn.bytes` | vertex colours |
| `/models/earth.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Earth.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Earth.asset` | `CreatureMeshes.Earth()` | vertex colours |
| `/models/venus.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Venus.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Venus.asset` | `CreatureMeshes.Venus()` | vertex colours |
| `/models/astronaut.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Astronaut.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Astronaut.asset` | `CreatureMeshes.Astronaut()` | vertex colours |
| `/models/rocket.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Rocket.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Rocket.asset` | `CreatureMeshes.Rocket()` | vertex colours |
| `/models/satellite.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Satellite.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Satellite.asset` | `CreatureMeshes.Satellite()` | vertex colours |
| `/models/comet.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Comet.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Comet.asset` | `CreatureMeshes.Comet()` | vertex colours |
| `/models/trex.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Trex.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Trex.asset` | `CreatureMeshes.TRex()` | vertex colours |
| `/models/triceratops.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Triceratops.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Triceratops.asset` | `CreatureMeshes.Triceratops()` | vertex colours |
| `/models/stegosaurus.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Stegosaurus.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Stegosaurus.asset` | `CreatureMeshes.Stegosaurus()` | vertex colours |
| `/models/pterosaur.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Pterosaur.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Pterosaur.asset` | `CreatureMeshes.Pterosaur()` | vertex colours |
| `/models/penguin.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Penguin.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Penguin.asset` | `CreatureMeshes.Penguin()` | vertex colours |
| `/models/polarbear.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_PolarBear.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_PolarBear.asset` | `CreatureMeshes.PolarBear()` | vertex colours |
| `/models/seal.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Seal.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Seal.asset` | `CreatureMeshes.Seal()` | vertex colours |
| `/models/whale.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_BlueWhale.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_BlueWhale.asset` | `CreatureMeshes.Whale()` | vertex colours |
| `/models/snowyowl.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_SnowyOwl.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_SnowyOwl.asset` | `CreatureMeshes.SnowyOwl()` | vertex colours |
| `/models/parrot.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Parrot.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Parrot.asset` | `CreatureMeshes.Parrot()` | vertex colours |
| `/models/monkey.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Monkey.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Monkey.asset` | `CreatureMeshes.Monkey()` | vertex colours |
| `/models/frog.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_TreeFrog.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_TreeFrog.asset` | `CreatureMeshes.Frog()` | vertex colours |
| `/models/butterfly.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Butterfly.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Butterfly.asset` | `CreatureMeshes.Butterfly()` | vertex colours |
| `/models/sloth.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Sloth.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Sloth.asset` | `CreatureMeshes.Sloth()` | vertex colours |
| `/models/cow.glb` | `Assets/WishWorld/Generated/Prefabs/Model_Cow.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Cow.asset` | `CreatureMeshes.Cow()`; or convert `Assets/ThirdParty/Baked/Cow.bytes` | vertex colours |
| `/models/sheep.glb` | `Assets/WishWorld/Generated/Prefabs/Model_Sheep.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Sheep.asset` | `CreatureMeshes.Sheep()`; or convert `Assets/ThirdParty/Baked/Sheep.bytes` | vertex colours |
| `/models/horse.glb` | `Assets/WishWorld/Generated/Prefabs/Model_Horse.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Horse.asset` | `CreatureMeshes.Horse()`; or convert `Assets/ThirdParty/Baked/Horse.bytes` | vertex colours |
| `/models/chicken.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Chicken.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Chicken.asset` | `CreatureMeshes.Chicken()` | vertex colours |
| `/models/pig.glb` | `Assets/WishWorld/Generated/Prefabs/Model_Pig.prefab` | `Assets/WishWorld/Generated/Meshes/Model_Pig.asset` | `CreatureMeshes.Pig()`; or convert `Assets/ThirdParty/Baked/Pig.bytes` | vertex colours |
| `/models/balloon.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_HotAirBalloon.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_HotAirBalloon.asset` | `CreatureMeshes.Balloon()` | vertex colours |
| `/models/bird.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Bird.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Bird.asset` | `CreatureMeshes.SkyBird()` | vertex colours |
| `/models/kite.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Kite.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Kite.asset` | `CreatureMeshes.Kite()` | vertex colours |
| `/models/plane.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_Plane.prefab` | `Assets/WishWorld/Generated/Meshes/PLACEHOLDER_Plane.asset` | `CreatureMeshes.Plane()` | vertex colours |

Everything else:

| Web file | Unity asset to load | Builder function | Relies on |
|---|---|---|---|
| `/models/world_aquarium.glb`, `world_aquarium_lite.glb` (the reef) | `Assets/WishWorld/Generated/Resources/Scenery/aquarium.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["aquarium"]` (= `SceneryReef`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/world_zoo.glb`, `world_zoo_lite.glb` | `Assets/WishWorld/Generated/Resources/Scenery/zoo.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["zoo"]` (= `ScenerySavanna`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/world_space.glb`, `world_space_lite.glb` | `Assets/WishWorld/Generated/Resources/Scenery/space.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["space"]` (= `SceneryMoon`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/world_dinosaurs.glb`, `world_dinosaurs_lite.glb` | `Assets/WishWorld/Generated/Resources/Scenery/dinosaurs.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["dinosaurs"]` (= `SceneryDinosaurs`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/world_arctic.glb`, `world_arctic_lite.glb` | `Assets/WishWorld/Generated/Resources/Scenery/arctic.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["arctic"]` (= `SceneryArctic`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/world_rainforest.glb`, `world_rainforest_lite.glb` | `Assets/WishWorld/Generated/Resources/Scenery/rainforest.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["rainforest"]` (= `SceneryRainforest`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/world_farm.glb`, `world_farm_lite.glb` | `Assets/WishWorld/Generated/Resources/Scenery/farm.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["farm"]` (= `SceneryFarm`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/world_sky.glb`, `world_sky_lite.glb` | `Assets/WishWorld/Generated/Resources/Scenery/sky.prefab` (children `Sector0` … `Sector7`) | `WishWorldBuilder.SceneryBuilders["sky"]` (= `ScenerySummit`), or menu `WishWorld > Rebuild Surroundings` | vertex colours; no normals; keep the 8 sectors as separate nodes for culling |
| `/models/scene_hub.glb`, `scene_hub_lite.glb` (terrain and the nine clouds) | `Assets/WishWorld/Generated/Meshes/HubTerrain.asset` (object `Terrain` in `Assets/WishWorld/Scenes/Hub.unity`) | `BuildHubScene` in `Editor/Builder.Hub.cs` (private; runs inside `WishWorldBuilder.BuildScenes()`) | vertex colours; 183,151 vertices, so 32-bit indices |
| (inside `scene_hub.glb`) | `Assets/WishWorld/Generated/Meshes/HubCloud0.asset` … `HubCloud8.asset` (objects under `Clouds` in `Hub.unity`, which hold their positions) | same function | vertex colours (all white) |
| `/models/penguin_guide.glb` | `Assets/WishWorld/Generated/Prefabs/PLACEHOLDER_PenguinGuide.prefab` | `BuildPenguin` in `Editor/Builder.Core.cs` (private; runs inside `WishWorldBuilder.BuildShared()`) | vertex colours; keep `Body`, `LeftWing`, `RightWing` as three nodes (wing pivots at (±0.25, 0.6, 0)) so the wings can wave |
| `/models/reindeer.glb`, `snowman.glb`, `sled.glb`, `lantern.glb`, `bench.glb`, `present_a.glb` and the other hub props | `Assets/ThirdParty/Baked/Reindeer.bytes` etc. (table 9.7). They are not separate objects in Unity | `PackMeshes.Load("Reindeer")` in editor code, or parse the file (10.3) | vertex colours (stored sRGB in the file) |
| `/models/controller.glb` | `Assets/WishWorld/Generated/Meshes/Controller.asset` (child `Visual` of each hand in `XRRig.prefab`) | `BuildRig` in `Editor/Builder.Core.cs` | vertex colours |
| `/models/world_platform.glb` | `Assets/WishWorld/Generated/Meshes/WorldPlatform.asset` | `BuildWorldSceneImpl` in `Editor/Builder.Worlds.cs` | vertex colours (white and light grey), tinted at run time by the world's ground colour |
| (not exported) reef props on their own (coral, anemone, kelp, starfish, clam, anchor, rock arch), e.g. for the AR reef | not saved as assets: they only exist merged into `Scenery_aquarium_*` | `SceneryProps.Coral(rng, kind)` (kind 0 to 5; 5 = anemone), `SceneryProps.Kelp(rng)`, `SceneryProps.Starfish(colour)`, `SceneryProps.Clam()`, `SceneryProps.Anchor()`, `SceneryProps.RockArch(rng, colour)` in `Editor/SceneryProps.cs` (public static) | vertex colours |
| (no file) snow | `Assets/WishWorld/Generated/Prefabs/Snowfall.prefab` | `BuildSnow` in `Editor/Builder.Core.cs` | no mesh: rebuild as points or sprites from the numbers in section 3.4, with `T_Dot.png` |
| `/textures/sky_<world id>.jpg`, `sky_hub.jpg`, `sky_race.jpg` | `Assets/ThirdParty/Skies/Sky_<Name>.jpg` (Zoo, Space, Dinosaurs, Arctic, Rainforest, Farm, Sky, Hub, Race); `Assets/WishWorld/Generated/Textures/PLACEHOLDER_Sky_Aquarium.png` and `PLACEHOLDER_Sky_WishWorld.png` for `aquarium` and `blank` | copy the files (photos from `Tools/bake_skies.py`; painted ones from `BuildSky`) | a texture (the only textures in the game besides the dot) |

All of the above rely on **vertex colours only**. Nothing relies on a texture.

### 10.3 The baked model format (`WWM1`), readable without Unity

`Editor/PackMeshes.cs` `LoadFile` (lines 28 to 50), written by `Tools/bake_models.py`:

| Offset | Content |
|---|---|
| 0 | 4 bytes ASCII `WWM1` |
| 4 | int32 little-endian: triangle count `T` |
| 8 | `T × 36` bytes: for each triangle, three vertices as 3 float32 (x, y, z), **already in Unity space**, metres, facing +Z, standing on y = 0 |
| 8 + 36T | `T × 4` bytes: one RGBA per triangle. RGB is **sRGB** (convert to linear for `COLOR_0`); A > 127 means tintable body |

Triangles are unindexed and flat-coloured; the face normal is `normalize(cross(b - a, c - a))` in Unity's winding. The six
pack creatures, the twelve fruit models and all hub props can be converted from these files with a short script.

### 10.4 Regenerating in Unity

`WishWorld > Rebuild All` (`WishWorldBuilder.RebuildAll`) rebuilds everything; `WishWorld > Rebuild Surroundings` only the
scenery. `.env` `WISHWORLD_MODELS=generated` swaps every pack model for the project's own and removes the sky photos.
`PackMeshes.RenderCatalog(filters, outFile)` renders a contact sheet of prefabs to `Logs/verification/models/`, which is a
quick way to check an export against Unity.

### 10.5 Orientation of skies and suns

- Unity's panoramic skybox with rotation 0 puts the **centre of the image (u = 0.5) toward +X**, and u decreases
  toward +Z (u = 0.25 is straight ahead). This is what `SunDirection` in `Editor/Builder.SceneryWorlds.cs` assumes
  (`longitude = (0.5 - sunU) * 2π`, `toSun = (cos(el)·cos(lon), sin(el), cos(el)·sin(lon))`).
- three.js maps an equirectangular background with `u = atan2(z, x) / 2π + 0.5` (`equirectUv` in the vendored three
  r187, `public/vendor/three/build/three.module.js`). So: if the export negated **Z** (three z = -Unity z), use the photo
  as `scene.background` with **no rotation**; if it negated **X** (what UnityGLTF and glTFast do), turn the background
  half a turn about Y (`scene.backgroundRotation.y = Math.PI`). This follows from the two formulas and has **not been
  checked on screen**. Quick check: in the hub the sun in the photo must sit to the right of and behind the player, about
  36° up (the light itself is lifted to 38°: Unity to-sun (0.627, 0.616, -0.477)), so the lit sides of the trees face
  that way.
- The existing export negates X (see 10.1), so the half turn applies, unless the exporter already shifted the sky
  images when it resized them to 2048 × 1024 (not checked: do the hub check above once).
- Sun vectors in section 2.1 are in Unity axes. `creatures.js` gives both: `light.toSun` in three.js axes (x negated,
  matching `layouts.json`) and `light.toSunUnity`.
- Sky photos are 4096 × 2048 JPEG, 290 KB to 1.1 MB each: usable as they are. Unity draws them at exposure 1 with no
  tone mapping, as sRGB textures.

### 10.6 Other things worth exporting

- Fonts: copy the three `.ttf` files (section 4.2).
- Voice: copy the MP3s and build a `text → file` JSON from appendix A (or recompute the file name with the hash rule in 6.1).
- `T_Dot.png` (64 × 64 white dot with a soft alpha edge) for snow, shadows and juice; trivial to regenerate:
  `alpha = clamp(1 - d², 0, 1)`, d = distance from the centre divided by 31.5.
- UI panels have no assets: they are generated geometry (section 4.5). On the web, draw them to a canvas texture or
  rebuild the layered shapes.

---

## Appendix A. The voice bank: all 354 baked lines

Folder `Assets/WishWorld/Generated/Voice/`. Voice id `cgSgspJ2msm6clMCkdW9`, model `eleven_flash_v2_5`. Order is the
order in `VoiceBank.asset`. Matching is case-insensitive and ignores extra spaces.

| # | Text | File | Size |
|---|---|---|---|
| 1 | Welcome to the aquarium! Touch a creature to learn about it. | `d81a4d9ccaf443d9.mp3` | 49.8 KB |
| 2 | Welcome to the savanna. Look how tall the giraffe is! | `0f2104e81e855e78.mp3` | 46.6 KB |
| 3 | Welcome to space. Everything here is floating! | `925d001c556b9618.mp3` | 39.6 KB |
| 4 | Shh. The dinosaurs are walking by. | `fd535113f23a1884.mp3` | 33.5 KB |
| 5 | Brr! Welcome to the ice, under the northern lights. | `10f6a8683ce079a0.mp3` | 62.1 KB |
| 6 | Listen. The rainforest is full of life. | `d781dd4ddfc4f24d.mp3` | 36.8 KB |
| 7 | Welcome to the farm. Say hello to the animals! | `3f2b8c8ab25143ee.mp3` | 36.8 KB |
| 8 | We are above the clouds. Look who is flying by! | `b9c6b76e9651479b.mp3` | 38.8 KB |
| 9 | Welcome to the Wish World! | `5cbf9f0627fe6c2a.mp3` | 23.7 KB |
| 10 | Clownfish live among the stinging arms of sea anemones, which do not hurt them. | `72453bdd95c66573.mp3` | 69.4 KB |
| 11 | Which fish makes its home in a sea anemone? | `9a07e39a937ee495.mp3` | 35.1 KB |
| 12 | Here comes the clownfish! | `a5fecc5de540175a.mp3` | 24.9 KB |
| 13 | Sea turtles swim back to the beach where they hatched to lay their own eggs. | `fbbcb04f9dbbbde1.mp3` | 54.7 KB |
| 14 | Which animal returns to the beach where it hatched to lay its eggs? | `eab3c3c33458f898.mp3` | 52.7 KB |
| 15 | Here comes the sea turtle! | `0b17f40b08a61ac4.mp3` | 23.7 KB |
| 16 | A shark has no bones. Its skeleton is made of cartilage, the bendy stuff in your ears. | `90f50e06320af945.mp3` | 75.1 KB |
| 17 | Which animal has a skeleton of cartilage and no bones? | `035420a0980fa650.mp3` | 47.4 KB |
| 18 | Here comes the shark! | `8dd02ec2855b92bb.mp3` | 19.2 KB |
| 19 | Jellyfish have no brain, no heart and no bones. | `f36ea241615d69ca.mp3` | 38.8 KB |
| 20 | Which sea animal has no brain and no heart? | `10b4295e3c77ee89.mp3` | 36.0 KB |
| 21 | Here comes the jellyfish! | `3172e467b3182368.mp3` | 24.9 KB |
| 22 | Rays swim by flapping their wide fins like wings. | `219396eef742bc50.mp3` | 47.4 KB |
| 23 | Which sea animal swims by flapping its fins like wings? | `7205770c094e2c1d.mp3` | 47.4 KB |
| 24 | Here comes the ray! | `107e4d299c1fb3df.mp3` | 17.6 KB |
| 25 | An elephant's trunk has no bones in it. It is all muscle. | `388407e80ebb1feb.mp3` | 46.2 KB |
| 26 | Which animal has a long nose with no bones in it? | `f76b084cd2fb9fa8.mp3` | 38.0 KB |
| 27 | Here comes the elephant! | `12c1502ad5fbd1bc.mp3` | 20.5 KB |
| 28 | A giraffe's long neck has seven bones, the same number as your neck. | `c534665d0f99484f.mp3` | 56.4 KB |
| 29 | Which animal's long neck has seven bones, just like yours? | `42bf382949059306.mp3` | 49.8 KB |
| 30 | Here comes the giraffe! | `d923d2b488c67db1.mp3` | 20.0 KB |
| 31 | Every zebra has its own stripe pattern. No two are the same. | `5fd0e2f452380dff.mp3` | 53.1 KB |
| 32 | Which animal has stripes that are different on every one? | `5e346a294f3ddde0.mp3` | 41.7 KB |
| 33 | Here comes the zebra! | `9c9db32bf6851461.mp3` | 20.5 KB |
| 34 | A lion's roar can be heard from several kilometres away. | `6b945c07a74349b0.mp3` | 46.2 KB |
| 35 | Whose roar can be heard from kilometres away? | `339991b7d564c043.mp3` | 34.3 KB |
| 36 | Here comes the lion! | `58f85fb5cc2eabc1.mp3` | 21.3 KB |
| 37 | Flamingos are pink because of the food they eat. | `5be908189d6eedd1.mp3` | 36.0 KB |
| 38 | Which bird turns pink because of its food? | `2ef50ced5bd1eb1b.mp3` | 33.1 KB |
| 39 | Here comes the flamingo! | `db19a8eed3246e82.mp3` | 23.7 KB |
| 40 | Saturn's rings are made mostly of pieces of ice. | `fb6232ad3a10fb6f.mp3` | 41.7 KB |
| 41 | Which planet has rings made mostly of ice? | `eb8decf86220564a.mp3` | 35.1 KB |
| 42 | Here comes the saturn! | `0263851ce8c5517a.mp3` | 20.5 KB |
| 43 | More than two thirds of the Earth is covered by ocean. | `7d7bb62f91c6fcae.mp3` | 42.5 KB |
| 44 | Which planet is mostly covered by ocean? | `9713f4a486e68fe0.mp3` | 35.1 KB |
| 45 | Here comes the earth! | `50fd85c38f2ccf81.mp3` | 20.0 KB |
| 46 | A day on Venus is longer than its year. | `1f307a402993dfc0.mp3` | 33.5 KB |
| 47 | On which planet is a day longer than a year? | `33571c8cf83c48a5.mp3` | 35.1 KB |
| 48 | Here comes the venus! | `30a9f9ce750947ee.mp3` | 22.9 KB |
| 49 | Astronauts in orbit float because they are falling around the Earth all the time. | `a1956b243c9489a0.mp3` | 62.9 KB |
| 50 | Who floats while circling the Earth? | `e5bfd5139dca0c23.mp3` | 27.0 KB |
| 51 | Here comes the astronaut! | `39fd96e4da99d6c5.mp3` | 22.9 KB |
| 52 | To stay in orbit, a rocket has to reach about 28,000 kilometres an hour. | `15e42cd46db4b968.mp3` | 63.3 KB |
| 53 | What must reach about 28,000 kilometres an hour to stay in orbit? | `06a5f3da81563e3f.mp3` | 56.4 KB |
| 54 | Here comes the rocket! | `26dcfa97bd2bba8e.mp3` | 19.2 KB |
| 55 | Satellites circle the Earth. Some help phones and maps know where you are. | `8c5bb5171baf6a48.mp3` | 60.5 KB |
| 56 | What circles the Earth and helps maps know where you are? | `cc6cc77afcccc8ba.mp3` | 40.9 KB |
| 57 | Here comes the satellite! | `175351649febcdeb.mp3` | 20.0 KB |
| 58 | A comet is a ball of ice and dust. Its tail always points away from the Sun. | `2aa276bc2c926e6f.mp3` | 70.7 KB |
| 59 | What is a ball of ice and dust with a long tail? | `d1d78ec90058522e.mp3` | 37.2 KB |
| 60 | Here comes the comet! | `371a9ca92a2442da.mp3` | 20.5 KB |
| 61 | T. rex lived closer in time to you than to Stegosaurus. | `593524a66967913a.mp3` | 50.2 KB |
| 62 | Which dinosaur lived closer in time to you than to Stegosaurus? | `901dd7b890607ffd.mp3` | 53.9 KB |
| 63 | Here comes the t. rex! | `bec44a6e850b223c.mp3` | 24.9 KB |
| 64 | The name Triceratops means three-horned face. | `abda32a796716be4.mp3` | 40.9 KB |
| 65 | Which dinosaur's name means three-horned face? | `90f4aecd1704cbc1.mp3` | 38.0 KB |
| 66 | Here comes the triceratops! | `82d59c96441d7872.mp3` | 27.0 KB |
| 67 | Stegosaurus had two rows of bony plates along its back. | `af152866c9f2a9d3.mp3` | 50.2 KB |
| 68 | Which dinosaur had bony plates along its back? | `99e058d355f09282.mp3` | 38.8 KB |
| 69 | Here comes the stegosaurus! | `fa281fa5ac60b6c5.mp3` | 25.8 KB |
| 70 | Pterosaurs were flying reptiles. They were not dinosaurs. | `77834906b6078b3d.mp3` | 49.8 KB |
| 71 | Which flying reptile was not really a dinosaur? | `93bc713128126ea5.mp3` | 37.2 KB |
| 72 | Here comes the pterosaur! | `d20798a01a834dd6.mp3` | 22.1 KB |
| 73 | Penguins live in the south and polar bears in the north, so they never meet in the wild. | `282cb4541c09af31.mp3` | 62.9 KB |
| 74 | Which bird lives in the south and never meets a polar bear? | `0ea593e9d6184988.mp3` | 43.7 KB |
| 75 | Here comes the penguin! | `32577f7a31c09a3a.mp3` | 20.5 KB |
| 76 | Under its white fur, a polar bear's skin is black. | `795a2c06f5275ef5.mp3` | 42.5 KB |
| 77 | Which animal has black skin under white fur? | `1cf687a6df702d11.mp3` | 35.1 KB |
| 78 | Here comes the polar bear! | `6806c51ee488a563.mp3` | 22.1 KB |
| 79 | Seals have a thick layer of fat called blubber that keeps them warm. | `fe23eb54f01f9e5b.mp3` | 50.2 KB |
| 80 | Which animal keeps warm with a layer of blubber? | `91fcb8525b2f9d1d.mp3` | 38.0 KB |
| 81 | Here comes the seal! | `bd5be1f7a9e81289.mp3` | 19.2 KB |
| 82 | The blue whale is the largest animal that has ever lived. | `cd0a3de8014b2793.mp3` | 43.7 KB |
| 83 | Which is the largest animal that has ever lived? | `0f3e600e9b812bc8.mp3` | 35.1 KB |
| 84 | Here comes the blue whale! | `1e95b3085989ba4b.mp3` | 21.3 KB |
| 85 | Unlike most owls, snowy owls often hunt in the daytime. | `3c96cfb17f9a4f9e.mp3` | 47.4 KB |
| 86 | Which owl often hunts in the daytime? | `6d72d64bf1e9d325.mp3` | 32.3 KB |
| 87 | Here comes the snowy owl! | `95ad726d3c9224ee.mp3` | 24.1 KB |
| 88 | Parrots can copy sounds, even human words. | `4637533a7cbffb1d.mp3` | 38.0 KB |
| 89 | Which bird can copy human words? | `b2308e31058aea2f.mp3` | 29.4 KB |
| 90 | Here comes the parrot! | `9669eff7b1b4bc08.mp3` | 20.0 KB |
| 91 | Some monkeys, like spider monkeys, can hang from a branch by their tails. | `f396186dba14a8bd.mp3` | 56.8 KB |
| 92 | Which animal can hang from a branch by its tail? | `4a88660d5b94f6d2.mp3` | 38.8 KB |
| 93 | Here comes the monkey! | `72c0b3895a8715fb.mp3` | 20.0 KB |
| 94 | Poison dart frogs wear bright colours to warn that they are poisonous. | `bb265097b40f7f05.mp3` | 54.7 KB |
| 95 | Which animal uses bright colours as a warning? | `8e9b14ffad90cbf0.mp3` | 37.2 KB |
| 96 | Here comes the tree frog! | `d45172f11b0ff22d.mp3` | 21.3 KB |
| 97 | Butterflies taste with their feet. | `0186b55cc0794c90.mp3` | 27.0 KB |
| 98 | Which insect tastes with its feet? | `047322bbb60047bd.mp3` | 29.4 KB |
| 99 | Here comes the butterfly! | `b5d8f2e2f1ddca21.mp3` | 22.1 KB |
| 100 | Sloths move so slowly that green algae grows in their fur. | `7caf39df70650c9f.mp3` | 49.8 KB |
| 101 | Which animal moves so slowly that algae grows in its fur? | `9f4fa2603e7dbff1.mp3` | 48.2 KB |
| 102 | Here comes the sloth! | `7789f48a3cf0884c.mp3` | 20.0 KB |
| 103 | A cow's stomach has four parts. | `a4a48fe7cb1303ff.mp3` | 30.2 KB |
| 104 | Which farm animal has a stomach with four parts? | `82e49d9bea761bd7.mp3` | 38.8 KB |
| 105 | Here comes the cow! | `92afaa66aadd3a17.mp3` | 18.4 KB |
| 106 | A sheep's wool never stops growing. | `0f78f329af919794.mp3` | 29.4 KB |
| 107 | Which animal has wool that never stops growing? | `30ae4fbfecbe7d61.mp3` | 38.0 KB |
| 108 | Here comes the sheep! | `01976643dd703250.mp3` | 18.4 KB |
| 109 | Horses can sleep standing up. | `93e131cf7bda038a.mp3` | 25.8 KB |
| 110 | Which animal can sleep standing up? | `4c6940afc8ec42fe.mp3` | 28.6 KB |
| 111 | Here comes the horse! | `ae61de8e35c9813d.mp3` | 17.6 KB |
| 112 | Birds, including chickens, are living relatives of the dinosaurs. | `28f6b4cf36c0a216.mp3` | 53.9 KB |
| 113 | Which farm bird is a living relative of the dinosaurs? | `25abbfc14b69c0c1.mp3` | 45.3 KB |
| 114 | Here comes the chicken! | `3531cf712195ca3d.mp3` | 19.2 KB |
| 115 | Pigs roll in mud to cool down, because they can hardly sweat. | `59e9f9b27ae60134.mp3` | 46.2 KB |
| 116 | Which animal rolls in mud to cool down? | `fa7dffe3586aa980.mp3` | 30.7 KB |
| 117 | Here comes the pig! | `dd7af72a2c1d0119.mp3` | 17.2 KB |
| 118 | Hot air is lighter than cool air. That is what lifts a hot-air balloon. | `d618f3b0b557cab6.mp3` | 58.4 KB |
| 119 | What rises because hot air is lighter than cool air? | `9c8e2230aad56972.mp3` | 42.5 KB |
| 120 | Here comes the hot-air balloon! | `5882bedb394cf527.mp3` | 25.8 KB |
| 121 | Many birds have hollow bones, which helps them fly. | `263053b3ee14d966.mp3` | 41.7 KB |
| 122 | Which animals have hollow bones that help them fly? | `782333b1e8b3ee2c.mp3` | 40.0 KB |
| 123 | Here comes the bird! | `acde0ea44ddc820e.mp3` | 20.0 KB |
| 124 | Kites were invented in China more than two thousand years ago. | `b7d70ea7147de35a.mp3` | 50.2 KB |
| 125 | What flying toy was invented in China over two thousand years ago? | `c933d414e970af2d.mp3` | 53.9 KB |
| 126 | Here comes the kite! | `ac848faa7bd16705.mp3` | 19.2 KB |
| 127 | A plane's wings are shaped so that the air rushing past pushes them up. | `bb8e03bf4987459c.mp3` | 60.5 KB |
| 128 | What has wings shaped so that rushing air pushes them up? | `6bdb86672ef2980c.mp3` | 45.3 KB |
| 129 | Here comes the plane! | `01d3f33ccbfe98d5.mp3` | 19.2 KB |
| 130 | Ooh, red! | `0288abc2fd9eea08.mp3` | 13.5 KB |
| 131 | Ooh, blue! | `c013d461c226b5fe.mp3` | 14.7 KB |
| 132 | Ooh, purple! | `339b1c2bbb3ebccd.mp3` | 11.9 KB |
| 133 | Ooh, gold! | `44c890191903700d.mp3` | 17.2 KB |
| 134 | Ooh, rainbow! | `7514d064764ae47c.mp3` | 15.6 KB |
| 135 | Lap 2! | `312ac392a20f9974.mp3` | 13.5 KB |
| 136 | Lap 3! | `f7aef1109068a631.mp3` | 13.5 KB |
| 137 | Lap 4! | `feb75be8a5de3c48.mp3` | 14.7 KB |
| 138 | Lap 5! | `d19764155fb472cb.mp3` | 13.9 KB |
| 139 | You finished first! | `ef8a5b53e7d6a726.mp3` | 17.2 KB |
| 140 | You finished second! | `8cd436d037ccd9f1.mp3` | 19.2 KB |
| 141 | You finished third! | `4bb8b7b86f25fbe2.mp3` | 17.2 KB |
| 142 | You finished fourth! | `5bc6d96cabb725d8.mp3` | 16.4 KB |
| 143 | You finished fifth! | `7e668a13a2f15678.mp3` | 17.2 KB |
| 144 | Yes! Clownfish. | `dacf92e9539ad879.mp3` | 21.3 KB |
| 145 | It was the Clownfish. | `29c2f69f0938b4f4.mp3` | 20.5 KB |
| 146 | Clownfish | `c31eb3a63f40c3d4.mp3` | 12.7 KB |
| 147 | Yes! Sea Turtle. | `a5347d682e069e09.mp3` | 20.0 KB |
| 148 | It was the Sea Turtle. | `7c1a242b287556fb.mp3` | 18.4 KB |
| 149 | Sea Turtle | `f86bad30088d3468.mp3` | 13.5 KB |
| 150 | Yes! Shark. | `ac0ce782162c10a9.mp3` | 17.6 KB |
| 151 | It was the Shark. | `34765d1c40b89fb6.mp3` | 17.2 KB |
| 152 | Shark | `c3e086580a82eb1b.mp3` | 9.0 KB |
| 153 | Yes! Jellyfish. | `eafee0a8ee83b45c.mp3` | 21.3 KB |
| 154 | It was the Jellyfish. | `4a2d25f9d5ba1408.mp3` | 20.5 KB |
| 155 | Jellyfish | `b54b8592fcb0b1e0.mp3` | 13.5 KB |
| 156 | Yes! Ray. | `97d0430873859a25.mp3` | 16.4 KB |
| 157 | It was the Ray. | `21003a200fca9874.mp3` | 16.4 KB |
| 158 | Ray | `af22c0e6ce23bdd2.mp3` | 7.4 KB |
| 159 | Yes! Elephant. | `c2ce43977bd6997b.mp3` | 18.4 KB |
| 160 | It was the Elephant. | `f35322838866e1f1.mp3` | 21.3 KB |
| 161 | Elephant | `936b3f4e836daadd.mp3` | 11.9 KB |
| 162 | Yes! Giraffe. | `318b30a84962ebd4.mp3` | 19.2 KB |
| 163 | It was the Giraffe. | `a1db1ed28eafb2c9.mp3` | 18.4 KB |
| 164 | Giraffe | `122af3134b0011f7.mp3` | 13.5 KB |
| 165 | Yes! Zebra. | `afefa45473595ec8.mp3` | 20.0 KB |
| 166 | It was the Zebra. | `e2a7242fc538ef21.mp3` | 17.6 KB |
| 167 | Zebra | `505287aae4e06f5c.mp3` | 10.7 KB |
| 168 | Yes! Lion. | `004605ad4535cd5c.mp3` | 17.6 KB |
| 169 | It was the Lion. | `3adf14ea4f35d8b5.mp3` | 16.4 KB |
| 170 | Lion | `329eb3694f421845.mp3` | 9.8 KB |
| 171 | Yes! Flamingo. | `5eab36de0233493d.mp3` | 19.2 KB |
| 172 | It was the Flamingo. | `86f6efabcd432973.mp3` | 20.0 KB |
| 173 | Flamingo | `024e113596408533.mp3` | 11.9 KB |
| 174 | Yes! Saturn. | `d47fbbeb0e786da5.mp3` | 20.0 KB |
| 175 | It was the Saturn. | `a18e264ed444e8df.mp3` | 19.2 KB |
| 176 | Saturn | `60c62a226b6f658e.mp3` | 10.7 KB |
| 177 | Yes! Earth. | `dcedebe41a4b07a1.mp3` | 15.6 KB |
| 178 | It was the Earth. | `d0076b471e730753.mp3` | 17.6 KB |
| 179 | Earth | `9d52c14ce62caf08.mp3` | 8.2 KB |
| 180 | Yes! Venus. | `06a794c55194cd1f.mp3` | 19.2 KB |
| 181 | It was the Venus. | `eef04ac2a6ddb3f0.mp3` | 20.0 KB |
| 182 | Venus | `59b17ed7bc1905de.mp3` | 10.7 KB |
| 183 | Yes! Astronaut. | `587f5162ce8a752e.mp3` | 20.0 KB |
| 184 | It was the Astronaut. | `beea1d73857bbbd8.mp3` | 20.0 KB |
| 185 | Astronaut | `7c75f7e182685b46.mp3` | 12.7 KB |
| 186 | Yes! Rocket. | `bd0926f2ff97ccb3.mp3` | 19.2 KB |
| 187 | It was the Rocket. | `f67e51026fae5326.mp3` | 17.2 KB |
| 188 | Rocket | `910f099c4af8b112.mp3` | 9.8 KB |
| 189 | Yes! Satellite. | `d577ec6aad3d6b78.mp3` | 17.2 KB |
| 190 | It was the Satellite. | `490e7c2dd3e521f0.mp3` | 20.0 KB |
| 191 | Satellite | `2f002a6c36b8150c.mp3` | 13.5 KB |
| 192 | Yes! Comet. | `b52bcf9adebfa347.mp3` | 18.4 KB |
| 193 | It was the Comet. | `2b0b6a87c67fd846.mp3` | 17.2 KB |
| 194 | Comet | `00ad652ce032d728.mp3` | 9.8 KB |
| 195 | Yes! T. rex. | `2cbcfd6fb31611d6.mp3` | 23.7 KB |
| 196 | It was the T. rex. | `2561d0051a642325.mp3` | 19.2 KB |
| 197 | T. rex | `ad6735ff49f7047c.mp3` | 11.9 KB |
| 198 | Yes! Triceratops. | `b1dadf60db603a97.mp3` | 22.9 KB |
| 199 | It was the Triceratops. | `863c61776cc30cac.mp3` | 23.7 KB |
| 200 | Triceratops | `ef29dcd9ab5018fa.mp3` | 16.4 KB |
| 201 | Yes! Stegosaurus. | `3d8ddf67a0c9d848.mp3` | 22.1 KB |
| 202 | It was the Stegosaurus. | `0feabf2ea02ca44a.mp3` | 23.7 KB |
| 203 | Stegosaurus | `753a497d951b1153.mp3` | 13.9 KB |
| 204 | Yes! Pterosaur. | `c366ea1d29a61e07.mp3` | 21.3 KB |
| 205 | It was the Pterosaur. | `4b932090c0ddc89d.mp3` | 20.0 KB |
| 206 | Pterosaur | `b20e7530c3f2776a.mp3` | 13.9 KB |
| 207 | Yes! Penguin. | `0034e8a5cb1b2e40.mp3` | 20.0 KB |
| 208 | It was the Penguin. | `6bb8c3294e1965f1.mp3` | 17.6 KB |
| 209 | Penguin | `59aba1c14e5cf920.mp3` | 10.7 KB |
| 210 | Yes! Polar Bear. | `1d4f903d62735001.mp3` | 19.2 KB |
| 211 | It was the Polar Bear. | `686666b11d5ee01b.mp3` | 18.4 KB |
| 212 | Polar Bear | `1c6d8fac5b9673bb.mp3` | 11.9 KB |
| 213 | Yes! Seal. | `19da3d013cdf1511.mp3` | 18.4 KB |
| 214 | It was the Seal. | `9155be00230ac816.mp3` | 17.2 KB |
| 215 | Seal | `48c8c949d49fb7ab.mp3` | 9.0 KB |
| 216 | Yes! Blue Whale. | `f93000e4cbb8ea45.mp3` | 20.0 KB |
| 217 | It was the Blue Whale. | `45ea8ab54b01381c.mp3` | 18.4 KB |
| 218 | Blue Whale | `d9290829465e5cf8.mp3` | 13.5 KB |
| 219 | Yes! Snowy Owl. | `5448f57eceb0bb10.mp3` | 23.7 KB |
| 220 | It was the Snowy Owl. | `71efcaef774c05b6.mp3` | 22.9 KB |
| 221 | Snowy Owl | `8a57b9825f71e39c.mp3` | 15.6 KB |
| 222 | Yes! Parrot. | `84737a668f7039cc.mp3` | 19.2 KB |
| 223 | It was the Parrot. | `d8c8ae718cfe7bf7.mp3` | 17.2 KB |
| 224 | Parrot | `0a7083cc92422e89.mp3` | 10.7 KB |
| 225 | Yes! Monkey. | `73280cbbe88772aa.mp3` | 17.2 KB |
| 226 | It was the Monkey. | `1539e4f910dd54af.mp3` | 17.6 KB |
| 227 | Monkey | `650030767b7e46db.mp3` | 9.8 KB |
| 228 | Yes! Tree Frog. | `48f9f35772c28169.mp3` | 20.5 KB |
| 229 | It was the Tree Frog. | `923e9c377d5f8af0.mp3` | 18.4 KB |
| 230 | Tree Frog | `f8cdccc5db943c5f.mp3` | 13.5 KB |
| 231 | Yes! Butterfly. | `992a3a4ccc4c4e2f.mp3` | 20.5 KB |
| 232 | It was the Butterfly. | `cc44ef4240d49cda.mp3` | 21.3 KB |
| 233 | Butterfly | `60cff93e965bf857.mp3` | 11.9 KB |
| 234 | Yes! Sloth. | `a9a88569eadbaa60.mp3` | 16.4 KB |
| 235 | It was the Sloth. | `1d1764c07989f5b9.mp3` | 17.6 KB |
| 236 | Sloth | `d1bbf2d2adde0b02.mp3` | 9.0 KB |
| 237 | Yes! Cow. | `dc63b5f53a26ac40.mp3` | 17.6 KB |
| 238 | It was the Cow. | `de0432e36785aa59.mp3` | 17.2 KB |
| 239 | Cow | `0452bbfd7ed2876b.mp3` | 9.0 KB |
| 240 | Yes! Sheep. | `8fab9c45439d201c.mp3` | 17.6 KB |
| 241 | It was the Sheep. | `e8f834cc2581b3ca.mp3` | 16.4 KB |
| 242 | Sheep | `bc66078afb34bf8f.mp3` | 8.2 KB |
| 243 | Yes! Horse. | `04d65f2af9739270.mp3` | 17.6 KB |
| 244 | It was the Horse. | `b3af36a1030d4ba0.mp3` | 17.2 KB |
| 245 | Horse | `687ad55c61495404.mp3` | 10.7 KB |
| 246 | Yes! Chicken. | `32ae5335d349c2ff.mp3` | 17.2 KB |
| 247 | It was the Chicken. | `7ffac4c0f64e8aa0.mp3` | 16.4 KB |
| 248 | Chicken | `d82ee290bfa67b6a.mp3` | 9.8 KB |
| 249 | Yes! Pig. | `50e7254fd610ff14.mp3` | 17.2 KB |
| 250 | It was the Pig. | `295963c4976b35a7.mp3` | 15.6 KB |
| 251 | Pig | `5b303717080e4c7f.mp3` | 8.2 KB |
| 252 | Yes! Hot-Air Balloon. | `b91dfe3073cfa2ec.mp3` | 22.1 KB |
| 253 | It was the Hot-Air Balloon. | `ffe87f8c7ff8446e.mp3` | 22.1 KB |
| 254 | Hot-Air Balloon | `d8a808b541e578e6.mp3` | 14.7 KB |
| 255 | Yes! Bird. | `239ab86b6383bda7.mp3` | 17.6 KB |
| 256 | It was the Bird. | `754f71aa020261c0.mp3` | 17.2 KB |
| 257 | Bird | `54547f0576154ac2.mp3` | 8.2 KB |
| 258 | Yes! Kite. | `b57fc052db54281b.mp3` | 17.2 KB |
| 259 | It was the Kite. | `20eabcef595087ad.mp3` | 15.6 KB |
| 260 | Kite | `f5a5e5101c891802.mp3` | 9.8 KB |
| 261 | Yes! Plane. | `5951693e4c6e82bd.mp3` | 17.6 KB |
| 262 | It was the Plane. | `e8e085d1bd1a5421.mp3` | 17.6 KB |
| 263 | Plane | `0737a3cbb03b86fe.mp3` | 9.8 KB |
| 264 | Aquarium | `6c770b4ee831ebd0.mp3` | 13.5 KB |
| 265 | Zoo | `aef7802e4a2a80b6.mp3` | 8.2 KB |
| 266 | Space | `13cb7416ede39846.mp3` | 9.8 KB |
| 267 | Dinosaurs | `362bb50d09857d3b.mp3` | 13.9 KB |
| 268 | Arctic | `cd48fe8e31fd4cb6.mp3` | 10.7 KB |
| 269 | Rainforest | `ea61a2c5f1b2c867.mp3` | 14.7 KB |
| 270 | Farm | `350fc9b41bd915c9.mp3` | 9.0 KB |
| 271 | Sky | `b3dba02a1bd5a502.mp3` | 9.8 KB |
| 272 | You got 0 of 1 right! | `0ce29d58bf555948.mp3` | 22.9 KB |
| 273 | You got 1 of 1 right! | `d0f956a2cd4eefbf.mp3` | 21.3 KB |
| 274 | You got 0 of 2 right! | `616eb6c55c3e526d.mp3` | 22.9 KB |
| 275 | You got 1 of 2 right! | `5e6ec86e0d71d958.mp3` | 21.3 KB |
| 276 | You got 2 of 2 right! | `5e4b165da08e612d.mp3` | 21.3 KB |
| 277 | You got 0 of 3 right! | `20d0959b76efff9c.mp3` | 23.7 KB |
| 278 | You got 1 of 3 right! | `4ba33a910f495cb7.mp3` | 22.1 KB |
| 279 | You got 2 of 3 right! | `c8ddcd64b2e7a536.mp3` | 22.1 KB |
| 280 | You got 3 of 3 right! | `d34728701f52ba92.mp3` | 23.7 KB |
| 281 | Add some creatures and learn their facts, then try the quiz. | `2915ed6fdd9daa63.mp3` | 45.3 KB |
| 282 | Home | `5d19fd124eec7fb3.mp3` | 9.0 KB |
| 283 | Finish | `ee0e2c682ed8f91c.mp3` | 10.7 KB |
| 284 | Close | `1c0b9b3e36490758.mp3` | 10.7 KB |
| 285 | Back | `2d74abbb02b18a05.mp3` | 8.2 KB |
| 286 | Start | `313560a80572790c.mp3` | 9.0 KB |
| 287 | Hub | `dc9cacf70b8a4e84.mp3` | 8.2 KB |
| 288 | Play again | `ad2e557db63727f2.mp3` | 11.9 KB |
| 289 | Race again | `eee11e38d8a44d03.mp3` | 11.9 KB |
| 290 | Worlds | `0a9fee845816b474.mp3` | 10.7 KB |
| 291 | Creatures | `3359fb91d0868b5b.mp3` | 11.9 KB |
| 292 | Change | `a2f395fca215f2e8.mp3` | 12.7 KB |
| 293 | Control | `1c389c376e9c7e84.mp3` | 11.1 KB |
| 294 | Red | `61cae32b2fab5ab8.mp3` | 8.2 KB |
| 295 | Blue | `e6870befc6468c0a.mp3` | 9.0 KB |
| 296 | Purple | `0660af10efe12821.mp3` | 10.7 KB |
| 297 | Gold | `7787495112ee7e29.mp3` | 9.8 KB |
| 298 | Rainbow | `9b0c8b92cb79f804.mp3` | 9.8 KB |
| 299 | More | `5acdc2ebed40abb0.mp3` | 8.2 KB |
| 300 | Fewer | `bd1617ccda83a65d.mp3` | 10.7 KB |
| 301 | Lots | `7b12061140c4c8eb.mp3` | 9.8 KB |
| 302 | Bigger | `596761a46eec3e5f.mp3` | 8.2 KB |
| 303 | Smaller | `3a29c4bd6092a748.mp3` | 10.7 KB |
| 304 | Giant | `dd1f8fbed437313b.mp3` | 11.1 KB |
| 305 | Tiny | `851bd2ac2102eb52.mp3` | 10.7 KB |
| 306 | Make it snow | `971eb80ca0646f7b.mp3` | 13.5 KB |
| 307 | Make it night | `6d6e187c75d4dcb9.mp3` | 11.9 KB |
| 308 | Make it sunny | `61a2ab91e4aee42b.mp3` | 12.7 KB |
| 309 | In my room | `da81e0d1a9a9a92c.mp3` | 11.9 KB |
| 310 | Take me there | `b5700237e32b02af.mp3` | 12.7 KB |
| 311 | Undo | `afe0fc013e43335a.mp3` | 9.8 KB |
| 312 | Clear | `ca5838b1ca17673e.mp3` | 9.0 KB |
| 313 | Go home | `f9a41edef25d6a15.mp3` | 11.9 KB |
| 314 | Games. Slice fruit, race cars. | `02be305497534b2c.mp3` | 38.0 KB |
| 315 | Worlds. Visit far places. | `1624cdfb6233804a.mp3` | 35.1 KB |
| 316 | AR Worlds. Bring them to you. | `3105d43cb00f06e8.mp3` | 33.5 KB |
| 317 | Wish. Say what you wish for. | `db5cbb3350c4d7fe.mp3` | 27.0 KB |
| 318 | Frost Slice. Slice the flying fruit. | `9d2aecfedf121712.mp3` | 52.7 KB |
| 319 | Snow Circuit. Race a snowy track. | `1eb2fa9bd4ef3274.mp3` | 36.8 KB |
| 320 | Three. | `889eb2dd8007df77.mp3` | 10.7 KB |
| 321 | Two. | `0ece07d8304a5109.mp3` | 9.8 KB |
| 322 | One. | `2e58dacf5c7f512c.mp3` | 9.0 KB |
| 323 | Go! | `b44dd1f47bd474d2.mp3` | 10.7 KB |
| 324 | Games. Slice fruit, or race a car. | `83f2fe4b23d65f10.mp3` | 32.3 KB |
| 325 | Worlds. Where would you like to go? | `3fcb33b8412b29b6.mp3` | 31.5 KB |
| 326 | Frost Slice. Swing the controllers to slice the fruit. Leave the ice blocks alone! | `aa436fd8b78b4bd4.mp3` | 71.5 KB |
| 327 | Snow Circuit. Hold both controllers like a steering wheel. Right trigger to go, left trigger to brake. | `9e2095a59483f3b7.mp3` | 100.5 KB |
| 328 | Slice the fruit! Leave the ice alone. | `293220c2c176030d.mp3` | 33.1 KB |
| 329 | Slice the fruit! | `32da4e149a1f9f0c.mp3` | 14.7 KB |
| 330 | A new best score! Amazing slicing. | `cefcb31756961efb.mp3` | 35.1 KB |
| 331 | Nice slicing! Want another go? | `39eb580ac4d90991.mp3` | 30.2 KB |
| 332 | What a swing! | `0b5bbda9e504741c.mp3` | 16.4 KB |
| 333 | A new best lap! Great driving. | `e0491800f4164f1e.mp3` | 31.5 KB |
| 334 | Great driving! Want another race? | `93b7f9402f2185f5.mp3` | 28.6 KB |
| 335 | Last lap! | `560c5a9737da51b7.mp3` | 13.9 KB |
| 336 | Welcome to WishWorld! Pick a card to begin. | `b52ce06a50a05888.mp3` | 36.8 KB |
| 337 | Okay, I put it back. | `d760a873631d75b4.mp3` | 20.5 KB |
| 338 | There is nothing to undo. | `99047d71fedb358f.mp3` | 22.9 KB |
| 339 | All clear. | `7556cb81775dc77a.mp3` | 13.5 KB |
| 340 | Here it is, in your room. | `743bef25cd2707c7.mp3` | 22.9 KB |
| 341 | Off we go! | `552eadc332598393.mp3` | 15.6 KB |
| 342 | A few less. | `f3b5260a426ec5fd.mp3` | 15.6 KB |
| 343 | More and more! | `230fd89c1aecef9f.mp3` | 15.6 KB |
| 344 | So small! | `bec8a8a79622bc1e.mp3` | 14.7 KB |
| 345 | So big! | `ae213749a6381c37.mp3` | 13.9 KB |
| 346 | Let it snow! | `15160cbf99992ebf.mp3` | 15.6 KB |
| 347 | Goodnight, world. | `617c4f36a2e1a560.mp3` | 17.2 KB |
| 348 | Hello, sunshine! | `05a791550269af4f.mp3` | 17.2 KB |
| 349 | I can't make that yet. Want a shark instead? | `853fd3e953307bc3.mp3` | 33.1 KB |
| 350 | Perfect score! You are a real explorer. | `8e028878da219391.mp3` | 36.0 KB |
| 351 | Nice exploring! Want to look around some more? | `4b34754c30591d69.mp3` | 33.5 KB |
| 352 | This is your room. Say or pick what should visit! | `69dd8cc6fbeea0c5.mp3` | 53.9 KB |
| 353 | What do you wish for? Say it, or pick from the menu. | `848d7f827e5ffac9.mp3` | 46.2 KB |
| 354 | You found them all! Press Finish for a quiz. | `f012d4006ae302b3.mp3` | 36.0 KB |
