# WishWorld: Unity implementation plan

Headset: Meta Quest 2. Engine: Unity, driven by Claude through Unity MCP.

Decisions this plan is built on (from your answers):

| Decision | Choice |
|---|---|
| Build order | 1) mixed-reality games, 2) standard VR worlds, 3) AR world mode, 4) wish-to-world by voice (last) |
| World input | Voice commands from a fixed list, with a controller menu as fallback |
| Racing form | Cockpit view |
| Snow theme | Hub scene and guide only; each world keeps its own look |
| Descriptions | Hard-coded fact cards, no live AI needed for facts |

## 1. Read this first: scope warning

This is four products: two games, a set of VR worlds, an AR mode, and voice world-building. At equal priority, none will be polished. The plan therefore gives every feature a **floor** (the smallest version that demos) and a **ceiling** (what to add only if the floor of everything before it works).

Two consequences of the chosen order that you should accept knowingly:

- **Wish-to-world is last, so it is the most likely to be cut.** It is also the part that made the hospitalized-kids pitch distinctive. If it is cut, the pitch becomes "a calm VR and mixed-reality playroom for kids in hospital" and must not claim that AI builds the world.
- **Mixed reality on a Quest 2 is grayscale and grainy.** The games will look like colorful objects over a grey room. That is acceptable for games; it is why worlds default to full VR.

Rule for the day: do not start a stage until the floor of the previous stage runs on the headset.

## 2. Product shape

One Unity app with a hub and five destinations.

```
Snow hub (VR)
 ├─ Games (mixed reality)
 │   ├─ Frost Slice      3D fruit slicing with both controllers
 │   └─ Snow Circuit     cockpit racing, controllers as a steering wheel
 ├─ Worlds (VR)          aquarium, zoo, space, dinosaurs, arctic, ...
 ├─ Worlds (AR)          same creatures in the real room, "flying fish" style
 └─ Wish mode            say or pick commands to build and change a world
```

Naming and likeness, to stay original:

- The slicing game is your own game, not a clone of a branded one. Use your own name, sounds, and scoring style.
- The racer is a generic open-wheel car. No real racing series names, team liveries, or logos.
- The guide is your own penguin character, not the event's mascot.

## 3. Architecture

### Scenes

| Scene | Mode | Purpose |
|---|---|---|
| `Boot` | none | Loads settings, then the hub |
| `Hub` | VR | Snowy home, menu, penguin guide |
| `Game_FrostSlice` | passthrough | Fruit slicing |
| `Game_SnowCircuit` | passthrough | Cockpit racing |
| `World` | VR or passthrough | One scene that loads any world definition |

Use one `World` scene for every world. Each world is data (a definition file), not a separate scene. This is what makes the AR mode and wish mode cheap later: they are the same spawner with a different background.

### Shared systems (build once, reuse everywhere)

| System | What it does |
|---|---|
| `XRRig` prefab | Meta camera rig with controllers and hands |
| `PassthroughToggle` | Turns the real-room view on or off, and hides or shows the skybox |
| `SceneLoader` | Fades to white, loads a scene, fades back |
| `WorldDefinition` (ScriptableObject) | A world's skybox, ambient sound, creature list, counts |
| `CreatureDefinition` (ScriptableObject) | Model, size, movement type, fact card text, sound |
| `Spawner` | Places creatures from a definition around the player |
| `Mover` behaviours | `Swim`, `Fly`, `Walk`, `Float`, `Orbit`: movement in code, so models need no rigging |
| `CommandRouter` | Turns a recognized command into an action; fed by voice or by the menu |
| `GuideVoice` | Plays a clip or text-to-speech line and shows a caption |
| `FactCard` | Glow on touch or 2-second gaze, then plays the creature's fact |
| `Collection` | Counts creatures learned, "6 of 10 found" |

What a ScriptableObject is: a data file inside the Unity project that you edit in the Inspector. Example: an `Aquarium` world asset lists `Clownfish x8`, `Turtle x1`, `Shark x1`, so adding a world means making a new asset, not writing code.

### Packages

| Need | Package | Note |
|---|---|---|
| Headset, controllers, hands, passthrough | Meta XR SDK (Core and Interaction) on OpenXR | Confirm the version that still supports Quest 2 |
| Rendering | Universal Render Pipeline | Mobile-friendly renderer |
| Voice commands | Meta Voice SDK, or a cloud speech-to-text call | Test both early; needs internet |
| Guide speech | Pre-recorded clips first; ElevenLabs only for wish mode | Clips cannot fail on bad Wi-Fi |
| Runtime model loading | Not needed | All models ship inside the app |

## 4. Snow hub and guide

Look, taken from the event site: soft grey-blue sky, off-white ground, dark slate outlines, a warm peach accent, rounded cloud shapes, small four-point sparkles.

Floor:
- A flat snowy plain with a ring of low hills, a pale sky gradient, drifting cloud shapes, and a light snowfall particle effect.
- A floating menu of four rounded cards: Games, Worlds, AR Worlds, Wish.
- A small original penguin guide beside the menu who waves and says one welcome line.

Ceiling:
- Footprints or a soft snow puff when the controller touches the ground.
- The menu cards styled like the site's quest-log panels.
- The guide follows you into worlds as a small companion.

Performance note: snowfall should be one particle system with a few hundred particles. Transparent particles are expensive on a Quest 2.

## 5. Stage 1: mixed-reality games

### 5.1 Frost Slice (3D fruit slicing)

Player stands in the real room. Fruit arcs up in front of them. Each controller is a blade.

| Piece | Design |
|---|---|
| Blades | A short glowing blade attached to each controller, with a trail |
| Launcher | Spawns fruit 1.5 to 2 m ahead, launched upward in arcs toward the player, in waves |
| Slice test | A hit counts only if the blade tip is moving faster than a set speed, so resting a blade on fruit does nothing |
| Cut | Swap the whole fruit for two pre-made halves that fly apart along the swing direction, plus a juice burst |
| Hazard | Snowballs or ice blocks: slicing one costs a life |
| Scoring | Points per fruit, combo for several in one swing, three lives, 60-second round |
| Feedback | Controller vibration on each cut, a slice sound, a score panel floating in the room |

Floor: one fruit type, both blades, score, 60-second round, passthrough on.
Ceiling: five fruit types, hazards, combos, high score saved, guide commentary.

Why pre-made halves and not real mesh cutting: true cutting at the blade's angle is a large feature. Halves that fly apart along the swing look nearly the same in motion.

Comfort and safety: fruit must arrive inside arm's reach from the front only. Show the Quest boundary and keep a clear 2 m space, because people swing hard.

### 5.2 Snow Circuit (cockpit racing)

Player sits in a real chair. A virtual cockpit surrounds them and a track runs ahead.

| Piece | Design |
|---|---|
| Steering | Hold both controllers like a wheel. Steering angle is the tilt of the line between the two hands. Example: right hand lower than left turns right |
| Throttle and brake | Right trigger accelerates, left trigger brakes |
| Car | Simple arcade physics: speed, turn rate that drops at high speed, slow down off track. No realistic tire model |
| Track | One closed loop built from a spline with snowy banks, checkpoints, and a lap timer |
| Cockpit | A fixed frame, wheel, and dashboard with speed and lap time |
| Passthrough | The real room shows through the floor and far sides; the track and cockpit are drawn on top |

Floor: one loop, steering and throttle, lap timer, one lap to finish.
Ceiling: ghost car of your best lap, three laps, a second track, engine sound that follows speed.

Honest notes on the cockpit choice:
- **Motion sickness is the main risk.** The eyes see fast motion while the body sits still. Keep the cockpit frame always visible, cap top speed, avoid sharp camera roll, and keep rounds under 90 seconds.
- **It is mixed reality in name more than effect.** At speed the track fills the view, so little of the room is seen. If a judge asks, say the room stays visible at the edges to keep the player grounded.
- **It weakens the hospital pitch.** A fast racer is the opposite of "calm and safe for sick kids". Either frame it as an option for older, well-enough kids, or tune it slow and scenic.

## 6. Stage 2: standard VR worlds

All worlds run in the single `World` scene. A world is a skybox, an ambient sound, and a creature list.

### World catalog

| World | Backdrop | Creatures (movement) | Example fact card |
|---|---|---|---|
| Aquarium | Underwater reef panorama | Clownfish, turtle, shark, jellyfish, ray (swim, float) | "Jellyfish have no brain or heart." |
| Zoo / savanna | Grassland at golden hour | Elephant, giraffe, zebra, lion, flamingo (walk) | "A giraffe's neck has seven bones, the same as yours." |
| Space | Star field with a planet | Planets, astronaut, rocket, satellite, comet (orbit, float) | "A day on Venus is longer than its year." |
| Dinosaur valley | Prehistoric jungle | T. rex, triceratops, stegosaurus, pterosaur (walk, fly) | "T. rex lived closer in time to us than to Stegosaurus." |
| Arctic | Ice field under aurora | Penguin, polar bear, seal, whale, snowy owl (walk, swim, fly) | "Penguins live in the south and polar bears in the north, so they never meet." |
| Rainforest | Dense canopy | Parrot, monkey, frog, butterfly, sloth (fly, walk) | "Sloths can take a month to digest one meal." |
| Farm | Rolling fields and a barn | Cow, sheep, horse, chicken, pig (walk) | "Cows have best friends." |
| Sky / clouds | Above the clouds | Hot-air balloons, birds, kites, planes (fly, float) | "Clouds can weigh as much as a hundred elephants." |

These example facts are written from memory and are not yet verified. Check every fact against a reliable source before it goes in; a wrong fact told to a child is the easiest criticism for a judge to make.

Floor: aquarium, with five creatures, fact cards, and the collection counter.
Next: arctic (it matches the hub and the event), then space.
Ceiling: the remaining worlds, each about 30 to 45 minutes once the system exists.

### World behaviour

- The player does not move through the world. They look and reach. This is the motion-sickness answer for judges.
- Creatures stay within a ring 1 to 6 m from the player and avoid the head.
- Touch or 2-second gaze triggers glow, a sound, and the fact card.
- Ending a world shows the collection count and a 3-question quiz from that world's facts.

## 7. Stage 3: AR world mode

Same spawner, passthrough on, skybox off. Creatures appear in the real room.

Commands that work here:

| Command | Result |
|---|---|
| "flying fish" | A school of fish swims through the air around the player |
| "butterflies" | Butterflies drift around the room |
| "space" | Planets float at arm's length as a tabletop solar system |
| "make it snow" | Snow falls in the real room |
| "bigger" / "smaller" | Scales the current creatures |
| "more" / "fewer" | Changes the count |
| "clear" | Removes everything |

Floor: flying fish and "make it snow".
Ceiling: creatures that scatter from a reaching hand; a tabletop diorama placed on a real surface.

## 8. Stage 4: wish mode (last priority)

Voice and menu both feed the same `CommandRouter`, so the menu is the fallback and the test tool.

### Command list

A command is a world, an add-on, or a modifier.

| Type | Words |
|---|---|
| World | aquarium, zoo, space, dinosaurs, arctic, rainforest, farm, sky |
| Add creature | add + any creature name in the library ("add a shark") |
| Color | red, blue, purple, gold, rainbow + creature ("purple shark") |
| Amount | more, fewer, lots of |
| Size | bigger, smaller, giant, tiny |
| Weather | make it snow, make it night, make it sunny |
| Mode | in my room (AR), take me there (VR) |
| Control | clear, undo, go home |

Matching: lowercase the recognized text, then look for known words. Example: "I want an aquarium with purple sharks" contains `aquarium`, `purple`, `shark`, so the router loads the aquarium and tints the sharks purple. No AI is needed for this.

Floor: menu buttons that fire the same commands, plus voice for world names only.
Ceiling: full voice grammar; an optional Gemini step that maps free speech onto this list when keywords fail; a graceful miss line from the guide ("I can't make that yet. Want a shark instead?").

Push-to-talk: hold a controller button while speaking and show the heard text. A loud hall will otherwise trigger commands by accident.

## 9. Assets

"As high detail as possible" has a hard limit on a Quest 2. A rough working budget, to be confirmed against Meta's current guidance:

| Budget | Target |
|---|---|
| Triangles visible at once | Stay well under a few hundred thousand |
| Draw calls | Roughly 100 or fewer |
| Textures | 1024 px for creatures, 2048 px at most for hero objects, compressed |
| Frame rate | 72 frames per second, steady |

So the rule is: make each asset as detailed as it can be within its share of that budget, and put the detail where the player looks closely.

### Sourcing

| Asset | Source | Notes |
|---|---|---|
| Basic shapes, particles, UI | Unity built-ins | Blades, track pieces, snow, menus |
| Fruit, animals, vehicles, props | Unity Asset Store free packs | Search "low poly animals", "fruit pack", "stylized fish"; check each license and that it is mobile-ready |
| Hands, controllers, interactions | Meta XR sample assets | Ships with the SDK |
| Skybox panoramas | Generated 360 images | One per world, made ahead of time |
| Missing creatures and hero objects | Generated 3D models | Text-to-3D or image-to-3D tool, then cleaned up |
| Fruit halves | Made from the whole fruit | Cut once in a modeling tool and saved as two meshes |
| Sounds and music | Free sound libraries | Check licenses |
| Guide voice lines | Recorded or generated ahead of time | About 30 short clips |

### Pipeline for generated models

1. Generate at high detail.
2. Reduce the triangle count to the budget for that object (hero creature higher, background lower).
3. Bake the fine detail into textures so the low version still looks rich.
4. Import, set the scale in meters, and assign a `Mover` behaviour.
5. Test on the headset, not just in the editor.

One art style across everything matters more than detail. Stylized low-poly animals next to a photoreal shark will look broken.

## 10. Working with Claude through Unity MCP

- Give it one system at a time with a clear exit test. Example: "Create a `Spawner` that reads a `WorldDefinition` and places creatures in a ring 1 to 6 m from the origin."
- Keep scenes and prefabs owned by one person each. Two people editing one scene causes merge conflicts that are painful in Unity.
- Commit after every working step. A broken scene with no commit is the usual way these projects die.
- Build to the headset often. Things that work in the editor often fail on the device.

## 11. Demo script (about 3 minutes)

1. **Hook (20 s).** Who it is for and what they are missing.
2. **Hub (15 s).** Put the headset on a judge in the snowy hub; the guide greets them.
3. **World (45 s).** "Say aquarium." Fish surround them. They touch one and hear a fact.
4. **AR (30 s).** "In my room." The fish now swim around the real table.
5. **Game (45 s).** Thirty seconds of Frost Slice, score on the cast screen.
6. **Close (25 s).** What exists today in hospitals and what yours adds.

Use Frost Slice for the judge, not the racer. It is standing, short, and cannot make them queasy. Offer the racer to judges who ask.

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Too many features, none polished | High | Floors and the cut order above |
| First headset build is slow to set up | Medium | Do it first, before any feature work |
| Voice fails in a loud hall | High | Push-to-talk and the menu fallback |
| Venue Wi-Fi blocks casting or voice | Medium | Phone hotspot, tested beforehand |
| Racer makes a judge sick | Medium | Slow tuning, short rounds, do not lead with it |
| Frame rate drops with many creatures | Medium | Budget above; test on device often |
| Grayscale passthrough looks dull | Certain | Bright, saturated game objects; worlds default to VR |
| Asset rules forbid prepared content | Unknown | `WISHWORLD_MODELS=generated` builds without them |
