# WishWorld build log

Running record of what was built, how it was checked, what could not be checked, and where the
build departs from `WishWorld_Unity_Plan.md`. Newest stage last.

How things were checked: everything below was run in the Unity editor (6000.3.29f1, Linux) with no
headset. Play mode was driven through the editor-only desktop controls (see "Desktop debug controls"),
using simulated mouse and key input, and judged from Game view screenshots saved under
`Logs/verification/<stage>/`. Nothing here has been seen on a Quest 2.

## Setup and shared systems

Built
- Packages: Unity OpenXR Plugin 1.19.0 (with XR Management). Universal Render Pipeline was already in the template.
- `Assets/WishWorld/Scripts/Core`: `WWInput` (one input layer: XR devices on the headset, desktop fallback in the editor),
  `XRRig` (head, two controllers, pointer rays, poke, gaze, fade quad, recentering), `PassthroughToggle`,
  `SceneLoader` (fade to white, load, fade back), `GuideVoice` (caption plus speech), `WWUI` (world-space panels,
  buttons and TextMesh Pro text with no Canvas), `WWButton`, `Sfx` (placeholder sounds made in code), `WWTheme`.
- Four shaders in `Assets/WishWorld/Shaders`. One vertex-colour lit shader draws every placeholder mesh, so all
  creatures and props share a single material.
- `Assets/WishWorld/Editor`: `WishWorldBuilder` generates meshes, materials, sky images, prefabs, definitions and the
  scenes. Menu: WishWorld > Rebuild All. Generated assets are in `Assets/WishWorld/Generated`.
- Editor-only desktop controls in `Scripts/DebugTools` (wrapped in `#if UNITY_EDITOR`, never in a device build).

Departures from the plan
- Meta XR Core SDK 209.0.0 is installed (it still lists Quest 2 as a target device). The Meta Interaction SDK is not:
  pointing, poking and gaze are the project's own small scripts, which keeps the desktop fallback identical to the
  headset path.
- Head and controller tracking read Unity's XR input devices through OpenXR, not Meta's OVRInput. Only passthrough uses
  Meta's SDK (`MetaPassthroughProvider.cs`, compiled when `WISHWORLD_META_XR` is defined, which it now is).
- The Meta SDK and Android Build Support were installed part-way through, after the owner accepted their licences.

## Snow hub and guide

Built: snowy plain, ring of hills, pines, drifting clouds, snowfall (one particle system, 320 particles), sky panorama,
a floating menu of four cards (Games, Worlds, AR Worlds, Wish) with Games and Worlds sub-menus, and an original penguin
guide that turns to the player, waves, and speaks a welcome line.

Checked in the editor (`Logs/verification/hub/`): menu cards visible, readable and facing the player at 1.8 m; clicking
"Games" with the mouse-driven controller opens the sub-menu; the caption shows the welcome line.
Not checked: anything on the headset.

## Stage 1: mixed-reality games

Frost Slice (floor and ceiling items built): two blades with trails, fruit launched in waves from 1.5 to 2 m ahead that
peak inside arm's reach, slice test on blade-tip speed, pre-made halves that fly apart across the cut, juice burst,
five fruit types, ice-block hazard that costs a life, combo for several fruit in one swing, three lives, 60 second round,
score panel, controller vibration call on each cut, saved high score, guide commentary.

Checked in the editor (`Logs/verification/stage1_frost_slice/`):
- Fruit launches and reaches the player; a fast swing of the mouse-driven blade cuts it, the two halves and the "+10"
  appear, the score rises, the vibration call fires.
- A blade held still where the fruit arrives does not cut it (fruit passed through the blade, sliced count stayed 0).
- Left-hand blade cuts. Cutting an ice block shows "Ouch!" and takes a life. The round ends, shows score and best,
  and the best score is saved.
Not checked: blade feel and angle on real controllers (`bladeEuler` on the game object is the knob), real vibration,
arm's-reach distances for a child, appearance over grey passthrough.

Snow Circuit (floor and most ceiling items built): closed 201 m loop built from a spline with kerbs, snow banks, start
line and marker flags; cockpit with a frame that stays in view, steering wheel and dashboard (lap, speed, lap time);
steering from the tilt of the line between the two hands; right trigger throttle, left trigger brake; arcade handling;
three laps; lap timer; saved best lap; ghost car of the fastest lap this session; engine tone that follows speed.

Checked in the editor (`Logs/verification/stage1_snow_circuit/`): an autopilot pressing the desktop keys (A/D/W/S,
which tilt the two virtual controllers like a wheel) completed 3 laps in about 60 s, best lap 19.4 s, top speed
13 m/s (47 km/h), with the car held inside the banks. Countdown, finish panel, saved best lap and ghost car all appeared.
Not checked: steering feel and comfort (the main risk in the plan), seated head height (`seatEyeHeight`), engine sound.
Not built: the second track.

Departures
- Fruit uses a gentle custom gravity so it hangs near its peak; this is easier for children than real gravity.
- Top speed is capped at 13 m/s for comfort. Raise `topSpeed` on the SnowCircuit object if it feels too slow.

## Stage 2: standard VR worlds

Built
- One `World` scene for every world. A world is a `WorldDefinition` asset (sky panorama, ground, fog, light, ambient
  sound, creature list); a creature is a `CreatureDefinition` asset (model, movement type, ring distances, fact, quiz
  question). Both live in `Assets/WishWorld/Definitions`, and `Resources/WorldLibrary.asset` lists them all.
- All eight worlds from the plan: aquarium, zoo, space, dinosaurs, arctic, rainforest, farm, sky (40 creatures in total),
  plus a hidden "blank" world that wish mode starts in.
- `Spawner` places creatures on a ring 1 to 6 m from the player. `Mover` gives Swim, Fly, Walk, Float and Orbit in code.
- `Creature` + `FactCardPanel`: touch with a controller, look for 2 seconds, or point and pull the trigger; the creature
  glows, plays a sound, and its fact card appears and is spoken. `WorldController` shows "N of M found".
- "Finish" shows the collection count and a 3-question quiz drawn from that world's facts.
- The penguin guide stands beside the info panel in every world.

Checked in the editor (`Logs/verification/stage2_worlds/`)
- Aquarium: creatures visible, moving, sensibly sized; fact card by pointer click and by 2-second gaze; counter went
  0 -> 1 -> 2 of 5; quiz asked 3 questions, accepted clicked answers, showed "3 of 3".
- The other seven worlds were each loaded with its debug key and looked at in a screenshot.
- Full navigation: Boot -> Hub -> Worlds -> Arctic -> Home -> Games -> Frost Slice -> Hub -> Snow Circuit -> Esc -> Hub.
Not checked: touching a creature with a controller (the desktop fallback can only point and gaze), reach, legibility
in the headset, frame rate.

Departures and notes
- Walkers pace back and forth inside their own slice of the circle instead of circling the player. The first version
  let an elephant walk through a giraffe.
- Space has seven entries (Saturn, Earth, Venus, astronaut, rocket, satellite, comet) so "planets" means something.
- The blue whale drifts through the arctic sky; there is no water for it yet.
- Facts and quiz questions were written from general knowledge and NOT checked against a source. Every creature asset
  has `factChecked = false`. Two plan examples were swapped for safer ones (sloth digestion, cows' best friends).
- Sky panoramas, creature models, ambient loops and all sounds are generated placeholders (see the placeholder list).

## Stage 3: AR world mode

Built: the same `World` scene and spawner with passthrough on, skybox, ground, fog and ambient sound off. Creatures use
their `arScale` and a tighter ring. Commands that work here: "flying fish", "butterflies", "space" (a tabletop solar
system 0.85 m ahead at 0.3 scale), "make it snow", "bigger" / "smaller", "more" / "fewer", "clear", plus everything in
the wish list. Stretch item built: small schooling creatures dart away from a reaching hand (AR only).

Checked in the editor (`Logs/verification/stage3_ar/`), with a plain grey backdrop standing in for the room: hub ->
"AR Worlds" opens the room with a school of 8 fish; each command above was fired with its debug key and its effect read
back from the world state and seen in a screenshot; a fish held on its path moved 0.18 m away from the desktop hand.
Not checked: real passthrough (the Meta code path compiles but has never run), how creatures sit in a real room, hand
scatter with real controllers.
Not built: the tabletop diorama placed on a real surface.

## Stage 4: wish mode

Built
- `CommandParser`: the plan's keyword matcher (lowercase, look for known words, plurals handled). No AI.
- `CommandRouter`: one entry point for voice, the wish menu and the debug keys. World, add creature, colour (red, blue,
  purple, gold, rainbow), amount (more, fewer, lots of), size (bigger, smaller, giant, tiny), weather (snow, night,
  sunny), mode (in my room, take me there), control (clear, undo, go home). Unknown requests get the guide's miss line.
- `WishMenu`: tabbed controller menu (Worlds, Creatures, Change, Sky, Control) whose buttons send the same text.
- `WishVoice`: push-to-talk on the right controller's A button; shows "Listening..." then "Heard: ...".
- Four service interfaces with a mock (default) and a real client each, chosen in one config asset. See "Switching on
  the services" in the final report. No network request was made at any point in this build.

Checked in the editor (`Logs/verification/stage4_wish/`, `debug_controls/`)
- Hub -> "Wish" opens the blank world with the menu.
- Text sent through the speech path (mock recogniser) "I want an aquarium with purple sharks" loaded the aquarium and
  tinted only the shark purple. "please make me a sandwich" produced the miss line.
- Holding the desktop A-button key showed "Listening...", and on release "add a red rocket" added one red rocket.
- Every menu tab and these buttons were clicked with the mouse-driven controller and their effect read back:
  a creature, rainbow, gold, giant, tiny, bigger, lots, fewer, snow, night, sunny, in my room, take me there, undo,
  clear, go home.
Not checked: the real speech, interpretation, speech-output and skybox clients (never run, by instruction), the
microphone, the A button on a real controller.

Bug found and fixed here: a giant creature drifting in front of the menu swallowed the pointer ray, so "Tiny" could not
be pressed. Menus now take priority over creatures for pointing.

## Project settings and build checks

- `WishWorld > Apply Quest Project Settings` sets: package id `com.wishworld.app`, IL2CPP (size-optimised code
  generation), ARM64, Vulkan, Android API 32 to 34, GameActivity entry, no Unity splash; OpenXR as the Android XR
  loader with Meta Quest Support, Oculus Touch profile and Meta XR Feature on, single-pass rendering; Meta project
  config (Quest 2 target, passthrough supported, passthrough loading screen) and Meta's Android manifest; and on the
  Mobile render asset HDR off, MSAA 4x, render scale 1, shadows off. Meta's Project Setup Tool then reports no
  outstanding Required fixes. Its Recommended ones were left alone (hand tracking, XR simulator, and similar).
- `WishWorld > Enable Meta XR Passthrough` adds the `WISHWORLD_META_XR` define (already done).
- **Android build: succeeded.** `Builds/Android/WishWorld.apk`, 47 MB, 0 errors, built in under 3 minutes. Checked
  with aapt: package `com.wishworld.app`, arm64-v8a only, target SDK 34, `UnityPlayerGameActivity`, features
  `android.hardware.vr.headtracking` and (optional) `com.oculus.feature.PASSTHROUGH`, permission `RECORD_AUDIO`, and
  exactly one `libopenxr_loader.so` (Meta's). It has NOT been installed or run on a device.
- A Linux desktop player build also succeeded earlier and, run headless, booted to
  "Boot. Services: speech=mock interpreter=mock tts=mock skybox=mock" with no exceptions.
- After the Meta SDK went in and the platform was switched to Android, every mode was run again in the editor
  (`Logs/verification/final_android_platform/`): hub, aquarium fact card, a slice, a full 3-lap race, AR, and a wish
  sentence. The console stayed clean.

Things that went wrong on the way, so they are not a surprise later
- The first Android build failed with two copies of `libopenxr_loader.so`. Meta's build step that removes Unity's copy
  only runs when Android is the SELECTED platform in Build Profiles, not just the build target. The project is now
  left switched to Android; keep it there when building.
- The second attempt ran the laptop out of memory (22 GB, with 17 GB already used by other apps) and the machine
  restarted. Close other heavy apps before an Android build. The size-optimised IL2CPP setting was added to cut the
  build's memory use, and the successful build was run with the Editor started under a 13 GB memory cap:
  `systemd-run --user --scope -p MemoryMax=13G -p MemorySwapMax=3G <Unity> -projectPath <project>`.
- Adding the Meta SDK before Android Build Support was installed froze the Editor on an "Android SDK not Found" dialog.
- When the Editor window is in the background on this machine it drops to about one frame a second. Starting it with
  `vblank_mode=0` fixes that; it matters only for scripted checks, not for normal use.
- Unity logs a warning about a Screen Space Ambient Occlusion feature. It is on the PC renderer, which Android does
  not use (the Mobile quality level is the Android default).

## Desktop debug controls (editor only)

Active only in the Unity editor when no headset is running. Files are in `Assets/WishWorld/Scripts/DebugTools`, all
inside `#if UNITY_EDITOR`, and the device input (`XRInputSource`) never references them.

| Input | Does |
|---|---|
| Right mouse drag | Look around |
| W A S D, Q E | Move the head |
| Mouse | Moves the right controller along the cursor ray (hold Left Shift for the left one) |
| Left click | Trigger: press buttons, point at creatures |
| F / C | A button (push-to-talk) / B button |
| PageUp / PageDown | Reach further / nearer |
| While racing: A D, W, S | Tilt the two controllers like a wheel, throttle, brake |
| P | Toggle VR / passthrough presentation (grey backdrop stands in for the room) |
| F1 | Show every key, including one per command in the command list |
| F2 | Type a sentence and send it through the speech path (mock recogniser) |
| F10, Esc | Start the quiz, return to the hub |

`DebugDriver` and `DebugChecks` drive these same controls by script; that is how the checks in this log were run.

## Placeholder assets to replace

Everything below is generated by `WishWorld > Rebuild All` and carries a `PLACEHOLDER_` prefix (in
`Assets/WishWorld/Generated`). Replace the prefab or texture and keep the name, or point the definition at the new asset.

- Creature models (40): `Prefabs/PLACEHOLDER_<Name>.prefab`, one per creature in `Definitions/Creatures`.
- Sky panoramas (10): `Textures/PLACEHOLDER_Sky_<World>.png` for Hub, the eight worlds and Wish World.
- Guide: `PLACEHOLDER_PenguinGuide.prefab` (original penguin; needs a real model, and waving is code-driven).
- Frost Slice: `PLACEHOLDER_IceBlock`, `PLACEHOLDER_Blade` (the fruit are now pack models, see the art upgrade below).
- Since the art upgrade, pack models are named `Model_<Name>` / `Fruit_<Name>` / `FruitHalf_<Name>` instead; with
  `WISHWORLD_MODELS=generated` the `PLACEHOLDER_` versions come back.
- Snow Circuit: `PLACEHOLDER_CarCockpit` and `PLACEHOLDER_SteeringWheel` meshes, `PLACEHOLDER_GhostCar`.
- All audio: every sound is made in code by `Sfx.cs` (clicks, slice, chime, engine tone, four ambient loops,
  creature chirps). There are no audio files. Guide voice lines (about 30) are captions plus a placeholder tone.
- Not placeholders but worth a designer's eye: hub scenery, the track, the controller model, UI panels.
- Missing entirely: fact-checked facts (see Stage 2) and the second race track.

## Not built, and why

- Second race track; hub footprints or snow puff; fact checking: time.
- Tabletop diorama placed on a real surface: needs the headset's scene understanding, which cannot be developed blind.
- Meta Interaction SDK and hand tracking: not needed by anything in the plan's floors; controllers only.

## Switching on the services

All four are OFF (mocks) and no request has ever been sent. The real clients are in
`Assets/WishWorld/Scripts/Services/RealServices.cs`. They were written from each provider's public API documentation
from memory and have never run, so expect to adjust a field name or two on first use.

The switch for each is in one asset: `Assets/WishWorld/Config/Resources/WishWorldServiceConfig.asset`
(git-ignored; `WishWorld > Create Service Config` makes it on a fresh clone). A service uses its real client only when
its box is ticked AND its key is filled in; otherwise it logs a warning and stays on the mock.

| Service | Tick | Fill in | Default endpoint / model | Mock does |
|---|---|---|---|---|
| Speech recognition | `useRealSpeechRecognition` | `speechApiKey` | ElevenLabs speech-to-text, `scribe_v1` | Returns text typed in the F2 debug field |
| Command interpretation | `useRealCommandInterpreter` | `interpreterApiKey` | Gemini `generateContent`, `gemini-2.5-flash` | Passes the text to the keyword matcher |
| Text to speech | `useRealTextToSpeech` | `ttsApiKey`, `ttsVoiceId` | ElevenLabs text-to-speech, `eleven_flash_v2_5`, 16 kHz PCM | Caption plus a placeholder tone |
| Skybox generation | `useRealSkyboxGenerator` | `skyboxApiKey` | Blockade Labs Skybox | Returns the world's pre-made panorama |

Notes
- Speech recognition records the headset microphone while A is held. Android asks for microphone permission the
  first time; the first press only triggers the permission prompt.
- Command interpretation is only called when the keyword matcher finds nothing, as the plan describes.
- Text to speech covers the guide's lines and fact cards; each distinct line is fetched once and cached for the session.
- Skybox generation is called once per world load and can take a minute; the pre-made panorama shows until it arrives.
- Model names and endpoints are editable in the same asset. Check them against the providers' current docs.
- Keys in this asset ship inside the app. That is fine for a hackathon demo; do not publish a build with real keys.

## Headset test checklist (Quest 2), in order

Nothing below has been checked. Each line is something only the headset can show.

Build and launch
1. Install `Builds/Android/WishWorld.apk` (or Build and Run; the project is already on the Android platform). The app starts in the snowy hub.
2. Head tracking: looking around moves the view smoothly, with no judder or swimming.
3. Both controllers appear as small grey-and-peach models where your hands are. A peach ray appears when one points at a card.
4. If you start facing the wrong way, press Y on the left controller: the menu should come round in front of you.

Hub
5. The four cards sit at a comfortable distance (about 1.8 m), level with your chest, and their text is sharp.
6. Trigger on "Games" opens the sub-menu. Pushing a controller into a card also presses it, with a small buzz.
7. The penguin turns to face you and waves; the welcome caption is readable and you hear a short tone.
8. Snow falls without the frame rate dropping (turn on the performance overlay; target 72 fps).
9. Scene changes fade to white and back with no black flash.

Frost Slice (stand up, clear 2 m)
10. Passthrough: you see your room in grey behind the menu. If the background is black, passthrough is not working.
11. Start. Fruit pops up from the snow mound ahead and peaks within arm's reach, in front of you only.
12. Blade direction: each blade should extend from the controller like a sword. If it points the wrong way, change
    `bladeEuler` on the FrostSlice object.
13. A fast swing cuts fruit: two halves, juice, a sound, a buzz, "+10". A blade held still under falling fruit does not cut.
14. Cutting an ice block costs a life ("Ouch!", long buzz). Two fruit in one swing shows "Combo x2".
15. The score panel above the mound is readable. After 60 s the result panel shows score and best.
16. Fruit colours and the ice block's shape are easy to tell apart against the grey room.

Snow Circuit (sit down)
17. Seat height: your eyes should be just above the dashboard hood with the two frame pillars in view. Adjust
    `seatEyeHeight` on the SnowCircuit object if you sit too high or low. Press Y to re-seat.
18. Start, 3-2-1-Go. Hold the controllers like a wheel: lowering the right hand turns right. Right trigger goes, left brakes.
19. Steering feel: is 45 degrees of tilt for full lock comfortable (`fullLockDegrees`)? Is 13 m/s too slow or too fast (`topSpeed`)?
20. Comfort: any queasiness in corners? This is the plan's top risk. Stop if so, and lower `topSpeed`.
21. Dashboard text (lap, km/h, lap time) is readable. Engine tone rises with speed. Three laps end with the result panel.
22. Race again: a pale ghost car replays your fastest lap.

Worlds (VR)
23. Worlds > Aquarium. Creatures circle 1 to 6 m away and never pass through your head.
24. Reach out and touch a fish: it glows, chirps, buzzes the controller, and its fact card appears and is read out (tone).
25. Look steadily at the turtle for 2 seconds: same result. Point and pull the trigger at the shark: same result.
26. The fact card text is readable and sits beside the creature, not over it. The counter on the left goes up.
27. Finish: quiz of three questions; answering with the trigger works; the result shows.
28. Frame rate with the fullest worlds: Rainforest (12 creatures) and, in wish mode, "lots of" (up to 60).
29. Visit each of the other worlds once. Check sizes feel right (the giraffe and T. rex are meant to be big, about 5 m away).
30. Ambient sound plays in each world and changes between them.

AR Worlds
31. Hub > AR Worlds: a school of fish swims in your real room, in passthrough.
32. From the menu on your right: Make it snow, More, Bigger, Butterflies, Space (a tabletop solar system in front of you), Clear.
33. Reach toward the fish: they dart away from your hand.

Wish mode
34. Hub > Wish. Every menu tab works with the trigger; the status line at the bottom is readable.
35. Hold A on the right controller: the status shows "Listening...". Release: with mocks it reports that nothing was typed.
    After switching speech on: say "aquarium", then "purple shark", "make it snow", "in my room", "undo", "go home".
36. Microphone: does it hear a child's voice at arm's length in a noisy hall?
37. Say something it cannot do: the guide answers "I can't make that yet. Want a shark instead?"

General
38. Text legibility everywhere, especially the wish menu buttons (the smallest text in the app) and the body text in
    the new Almendra font. If it is hard to read, see "Switching the fonts off" in `THIRD_PARTY.md`.
39. Battery and heat after 15 minutes; any hitch when loading a world.

Controller input (added with the art upgrade; neither path has run on a headset)
40. With the default `.env` (`WISHWORLD_INPUT=ovr`): `adb logcat -s Unity | grep "Input:"` should print
    `Input: OVRInput`. Repeat steps 3 to 8 (pointer, trigger, A/B/Y, thumbstick) and feel for vibration on a slice.
41. If the log says `OVRInput reported no controllers while OpenXR did. Switching to the OpenXR input path.`, the Meta path is not working on this
    device: note it and carry on, the app keeps working on the original path.
42. Set `WISHWORLD_INPUT=openxr` in `.env`, rebuild, and repeat step 40: the log should print `Input: XR`.
43. Blade and steering feel: both paths read the same grip pose, so they should feel identical. If the blade sits at a
    different angle in one of them, that is a bug to report, not a setting.
44. Frame rate with the faceted shading and blob shadows on: arctic and zoo are the heaviest worlds.

## Demo videos

`Demos/` holds one captioned 1280x720, 30 fps MP4 per part of the app, plus `00_wishworld_all_parts.mp4` (all seven
joined, 5.3 minutes). They were re-recorded after the surroundings upgrade. They are Unity editor captures driven by the desktop stand-in controls: not headset footage, and
silent (audio is not captured).

| File | Length | Shows |
|---|---|---|
| `01_hub.mp4` | 22 s | Boot fade, guide greeting, Games and Worlds sub-menus, the four cards |
| `02_frost_slice.mp4` | 32 s | Start, slicing with both blades, a two-fruit combo, an ice block costing a life, round end |
| `03_snow_circuit.mp4` | 90 s | Countdown, a full three-lap race through the alpine valley, finish panel, the ghost car on a second race |
| `04_worlds_aquarium.mp4` | 43 s | Fact card by pointing and by 2-second gaze, the found counter, the quiz |
| `05_worlds_tour.mp4` | 34 s | The other seven worlds with their surroundings |
| `06_ar_mode.mp4` | 39 s | Fish in the room, snow, more and bigger, fish darting from a hand, tabletop space, clear |
| `07_wish_mode.mp4` | 61 s | Push-to-talk on the mock recogniser, colour / size / weather / mode commands, a miss, undo, go home |

How they are made (editor-only, `Assets/WishWorld/Scripts/DebugTools`): `DemoDirector` scripts each demo through the
desktop controls (head turns, the mouse-driven controller points and pulls its trigger, keys are held); `DemoRecorder`
advances game time 1/30 s per frame and saves the player camera as numbered JPEGs under `Logs/demo_frames/`; ffmpeg
joins them and burns in the captions. To re-record: enter Play mode and evaluate `DemoDirector.RunAll()`.

What is staged rather than played: in Frost Slice the automatic waves are paused to throw two fruit side by side and
one ice block, and the round clock is skipped to its end; in wish mode the "speech" is text handed to the mock
recogniser. For the demos the pointing controller is held low and aims a ray (`DesktopInputSource.pointerMode`) so it
does not cover what it points at; the checks earlier in this log used the default, where it rides on the cursor ray.

Two product changes came out of recording: the slice test now checks five points along the blade between frames (a
fast swing could otherwise pass through fruit at a low frame rate), and arriving in a new world replaces whatever the
guide still had queued. Both are in the current `Builds/Android/WishWorld.apk` (rebuilt after the art upgrade, see below).

## Art and input upgrade

Asked for: the faceted retro low-poly look, small shadows, better models (free packs where they exist, own builds
otherwise), Meta's `OVRInput` as the default controller path behind a `.env` switch, and a storybook winter UI.
All of it was checked in the editor by screenshot (`Logs/verification/upgrade/`, `Logs/verification/models/`).
**None of it has run on a headset.**

### `.env` switches
- `.env.example` is committed; copy it to `.env` (git-ignored). `EnvSync` (editor) copies the `WISHWORLD_` keys into
  `Assets/WishWorld/Resources/WishWorldEnv.txt` on load, on Play and before every build, so a build carries them.
- `WISHWORLD_INPUT=ovr` (default) or `openxr`. `WISHWORLD_MODELS=packs` (default) or `generated`.

### OVRInput
- `Scripts/Core/OVRInputSource.cs` implements the same `IInputSource` as before: poses, trigger, grip, A/B/X/Y,
  thumbstick and vibration from `OVRInput` (`LTouch` / `RTouch`). The head pose and the pointer's aim pose still come
  from Unity's XR devices, because OVRInput has no aim pose.
- The original `XRInputSource` is untouched and is what `openxr` selects.
- It is compiled only for Android device builds with the Meta define on. Meta ships no plugin for the Linux editor,
  so **this path has never executed**: it compiles and is in the APK, nothing more.
- Safety net: if OVRInput reports no controller for 3 s while Unity's XR devices do, the app switches to the original
  path by itself and logs it. `BootLoader` logs which path is active at start.
- An `OVRManager` is created if the scene has none (OVRInput does nothing without one); shared with passthrough.

### Faceted shading and shadows
- `VertexColorLit.shader` has `_Flat` (on by default): the normal comes from screen-space derivatives of world
  position, so every mesh is faceted without changing the meshes.
- `BlobShadow`: one soft dark disc under each creature, the guide, the fruit and hub props (painted into the hub
  terrain), shrinking with height. Used where there is a floor: AR mode and worlds with full ground. No shadow maps.

### Models
- From packs (see `THIRD_PARTY.md`): farm animals and zebra, Saturn, all six fruit with halves, and the hub props
  (trees, snowman, lanterns, sled, presents, bench, reindeer, candy canes, rocks).
- Rebuilt by this project in the blocky faceted style: every other creature, the penguin guide and the ice block.
- Frost Slice fruit are now apple, orange, watermelon, lemon, pear, coconut (plum dropped: the pack has no plum).
- `WishWorld > Rebuild All` re-creates everything. Model sheet: `Logs/verification/models/creatures_all.png`.

### UI
- Fonts: Mountains of Christmas Bold (titles), Berkshire Swash (headings, buttons), Almendra (body). Dashboard and
  score numbers stay in Liberation Sans. Font assets have fixed atlases (`WishWorld > Rebuild Fonts`).
- `WWUI` panel styles, all flat vertex-coloured geometry with no textures: framed panel (double line, frosted
  gradient, corner snowflakes, snow along the top, icicles below, drop shadow), raised pill button with a warm halo
  when pointed at, swallow-tail ribbon for titles, speech bubble for the guide, and a plate that sizes itself behind
  loose text (countdown, score pop-ups).
- Applied to: hub title and cards, both sub-menus, world info panel, fact card, quiz, wish menu, guide caption,
  both game menus, the Frost Slice score panel, pop-ups and the race countdown.

### Departures from the plan for this upgrade
- Quaternius fish, shark, ray, whale, dinosaurs and sports car were not obtained (Google Drive quota error; the other
  mirror asked for a bot check, which was not worked around). Those are own builds.
- Kenney Cube Pets and Space Kit were downloaded and not used (toy-cube animals did not suit; own space models kept).
- The pack Earth model is 10,700 triangles, so Earth stays generated.
- Not restyled: the blade, the car cockpit and wheel, and the controller model are as they were, only faceted.
- Pack models are static: there is no walk or swim animation beyond the existing code-driven movement.

### Checks re-run after the upgrade (editor)
- Frost Slice: two slices scored 0 -> 40 -> 50, an ice block took a life (3 -> 2), a resting blade sliced nothing.
- Snow Circuit: auto-drive finished three laps in 59.2 s (best lap 18.8 s).
- Hub sub-menus, three worlds, fact card, quiz, wish menu and guide caption opened and were screenshotted.
- All seven demos were re-recorded end to end with a clean console (`Demos/`, sheets in `Logs/verification/upgrade/demos/`).

### Android build after the upgrade
- **Succeeded**: `Builds/Android/WishWorld.apk`, 47.7 MB, 0 errors, 125 s. Checked with aapt as before: package
  `com.wishworld.app`, arm64-v8a only, target SDK 34, `UnityPlayerGameActivity`, head tracking required, passthrough
  optional, one `libopenxr_loader.so`, and `libOVRPlugin.so` present (what OVRInput calls into). The build carries
  `WISHWORLD_INPUT=ovr`. It has NOT been installed or run on a device.
- Memory: the laptop had about 5.5 GB free with other apps open, so the Editor's cap was lowered to 10 GB for the build
  (`systemctl --user set-property --runtime <scope> MemoryMax=10G`) and put back to 13 GB afterwards. That way a build
  that runs out of memory kills the Editor, not the machine. It did not come close this time.

## Surroundings upgrade

Asked for: larger, more detailed worlds that look like the real place, a real environment around the race track
instead of emptiness, stock assets where possible and hand-built ones otherwise, and a real background.
Checked in the editor by picture (`Logs/verification/scenery/`). **None of it has run on a headset.**

### What every world now has
Each VR world, the hub and the race circuit used to be a painted sky over a flat disc. Each now has terrain and
props out to the horizon, under a real sky photograph, with the sun's light coming from where the sun is in the photo.

| Place | Surroundings | Triangles |
|---|---|---|
| Farm | Rolling hills in a patchwork of fields, red barn and silo, farmhouse, windmill, tractor, paddock fence, corn, wheat and pumpkins, hay bales, scarecrow, pond, dirt road, woods, grazing herds, a village with a church | 177,000 |
| Zoo (savanna) | Golden grassland, one great snow-capped mountain, acacias, baobabs, termite mounds, boulder kopjes, a waterhole, a safari camp with a jeep, distant zebra, elephants and giraffes | 104,000 |
| Dinosaurs | A valley under a smoking volcano with lava, a river, a swamp, palms, cycads, giant conifers, ferns, a dinosaur skeleton, nests with eggs, distant herds | 144,000 |
| Arctic | Ice shelf and open sea with icebergs and floes, glacier mountains, igloos, a research camp with snowmobiles, a fishing hole, a ship held in the ice, a penguin colony, seals | 68,000 |
| Rainforest | Dense forest with giants over it, a river with a bridge and canoe, a waterfall over boulders, overgrown ruins, bamboo, ferns, flowers, mushrooms, hanging vines, mist | 201,000 |
| Aquarium (reef) | Sand and reef mounds, about 400 corals of six kinds, anemones, kelp forest, a shipwreck with chests, barrels and cannon, an anchor, rock arches, clams, starfish, bubbles, the sea surface overhead, a drop-off into deep water | 179,000 |
| Space | The Moon: cratered ground and mountains, a base (dome, habitats, solar panels, radar, towers, dishes), a landing pad with a ship, a rover and its tracks, the Earth in the sky | 110,000 |
| Sky | A snowy summit above a sea of cloud, other peaks breaking through, cloud towers, balloons and an airship, a cairn, a flag and a camp | about 61,000 |
| Snow Circuit | An alpine valley: mountains, about 600 trees, a village with a church, a ski lift, a frozen lake, cabins; three grandstands with crowds and a fourth at the hairpin, pit garages and paddock with race cars and trucks, start lights and two more gantries, barriers on every corner, tyre stacks, billboards, flags, lights, a car park | 238,000 |
| Hub | Real winter sky, a ring of mountains, 150 more snowy trees, a hamlet with a church | (in the hub terrain mesh) |

### How it is built
- `Editor/Builder.Scenery.cs`: `Scenery` builds terrain as a web of triangles (fine near the player, coarse far away) from
  a height function, colours each triangle, stands props on it, scatters them with rules (not in water, not on the
  track), and saves eight compass-sector meshes per place so what is behind the player is culled.
- `Editor/Builder.SceneryWorlds.cs`, `Builder.SceneryWorlds2.cs`, `Builder.SceneryRace.cs`: what stands where.
- `Editor/SceneryProps.cs`: the hand-built pieces. Kit models come from `Assets/ThirdParty/Baked/Scenery~`.
- Meshes share vertices and carry no normals (the faceted shader makes its own): the farm is 125,000 vertices instead
  of the 530,000 it would be with three per triangle.
- Runtime: `WorldDefinition.scenery` names a prefab under `Generated/Resources/Scenery`; `WorldController` loads it when
  the world is shown and unloads it when it changes, so only one world's surroundings are in memory. AR mode and the
  empty Wish World never load any. The plain ground disc and platform are hidden while surroundings are shown.
- The centre is kept clear: nothing taller than grass within about 9 m, so the creatures still walk and swim freely.
- Camera far plane is now 800 m (was 300 m). Fog starts further out and takes its colour from the photograph's horizon.
- Menus: `WishWorld > Rebuild Surroundings` rebuilds only these; `Rebuild All` includes them.

### Snow Circuit is now full VR by default
The plan had the race in passthrough (the real room behind the track). You asked for a real environment around the
track, so it now starts in VR inside the valley. `WISHWORLD_RACE_VIEW=room` in `.env` brings the passthrough version
back (the valley is hidden). Worth knowing: the plan chose passthrough partly as a comfort measure for seated racing;
the cockpit frame is still there as the fixed reference, but motion comfort in full VR is untested.

### Departures and limits
- The aquarium sky is still painted, and the arctic aurora is painted onto a real night-sky photograph.
- The Nature kit's colours were changed to natural ones; the kit's own look is teal and orange.
- Billboards are blank. The grandstand crowd is coloured blocks and does not move.
- Distant animals, the ship, balloons and vehicles are part of the static scenery; only the creatures near you move.
- There are no colliders on the scenery: pointing passes through it, and the race car is kept on the road by the
  existing track logic, not by the barriers.
- Triangle counts are much higher than before (the worlds were under 15,000). In the editor the race draws about
  246,000 triangles in 15 draw calls. Whether the Quest 2 holds 72 fps on the 180,000 to 240,000 triangle places
  (rainforest, reef, farm, race) is the main thing to test; the scatter counts in the three `Builder.Scenery*` files
  are the knob to turn if it does not.
- Repository size: the generated scenery meshes are about 95 MB as text assets.

### Checks re-run (editor)
- Frost Slice slice and ice-block checks pass. Snow Circuit auto-drive finished three laps in 61.7 s with 0 frames off
  the track, inside the valley.
- Surroundings appear in VR and in wish mode, disappear for "in my room", return for "take me there", swap on a world
  change and come back on undo.
- All seven demos were re-recorded end to end with a clean console (`Demos/`; sheets of the race and the world tour
  are in `Logs/verification/scenery/demos/`).

### Android build after the surroundings upgrade
- **Succeeded**: `Builds/Android/WishWorld.apk`, 83.2 MB (was 47.7 MB), 0 errors, 72 s. aapt shows the same package,
  arm64-v8a only, head tracking required, passthrough optional, one `libopenxr_loader.so`. The build carries
  `WISHWORLD_INPUT=ovr`, `WISHWORLD_MODELS=packs`, `WISHWORLD_RACE_VIEW=world`. NOT installed or run on a device.
- The extra 35 MB is the nine sky photographs (4096 x 2048, ASTC 6x6 on Android) and the scenery meshes.
- Built with the Editor's memory cap lowered to 12 GB for the build and restored to 13 GB after, as before.

### Added to the headset checklist
45. Every world: look all the way round and up. Is the horizon convincing, is anything floating, cut off or flickering
    where the ground meets water, the track or a building?
46. Frame rate in the rainforest, the reef, the farm and during a race lap. Note any world that stutters when it loads.
47. Snow Circuit in full VR: is three laps comfortable? If not, try `WISHWORLD_RACE_VIEW=room`.
48. The sky photographs: does the sun sit where the light on the scenery says it should? Any visible seam?

## Voice, AI and race rivals

Asked for: ElevenLabs, then AI, on the preset world choices; real opponents in the race; and two plans (more games,
games that use scanned real objects).
**No real service has been called: there are no keys in the project.** The clients were checked against each provider's
current API reference and run against a local stand-in server in the editor.

### How I read "ElevenLabs, then AI, on the preset choices"
- ElevenLabs: the guide speaks the preset lines in a real voice, and push-to-talk is recognised (both are ElevenLabs).
- AI (Gemini): a free-form wish is mapped onto the preset worlds, creatures, colours and so on; and the guide can answer a
  child's question about the world on show. If you meant something else, say so.

### Voice: recorded once, played with no network
- `WishWorld > Voice > Bake Preset Lines (ElevenLabs)` sends every preset line to ElevenLabs once and stores the audio in the
  app (`Generated/Voice`, `Generated/Resources/VoiceBank`). There are 158 lines, 6,258 characters: world greetings, 40 creature
  facts, 40 quiz questions, "Here comes the ...!" for each creature, and every fixed line the guide says.
- At run time `BankedTextToSpeech` plays a recorded line at once. Only text that is not in the bank (the AI's answers) goes to
  ElevenLabs live. With no key, those fall back to the placeholder tone, as before.
- Running the bake again only sends lines that are new or changed. It stops at the first refusal (bad key, empty quota).
- `WishWorld > Voice > List My ElevenLabs Voices` prints the voice ids on the account; `Count Preset Lines` shows what a bake would send.

### AI on the preset choices
- With the AI on, a short plain command ("aquarium", "purple shark") still goes straight to the keyword matcher. A question or a
  longer sentence goes to Gemini first, with the list of preset words and a description of what the child can see (world,
  creatures, the facts on their cards). It replies with preset words, or with `say:` and an answer of at most two short
  sentences, or `none`. If it fails or finds nothing, the keyword matcher gets a turn before the guide gives up.
- Answers are spoken and captioned. **They come from the AI and are not fact-checked.** `guideAnswersQuestions` in the service
  config turns answering off and leaves only the mapping.
- Found by testing: before this change the keyword matcher took "why are flamingos pink" and added a flamingo.

### Switching it on
Put the keys in `.env` (see `.env.example`): `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `GEMINI_API_KEY`. On the next editor
load, Play or build they are copied into the service config asset and the matching services are switched on. Then run the
bake once. This replaces the hand-editing described under "Switching on the services" above (that still works).
- The config asset is part of the app, so **the keys ship inside the APK**. Use keys you can revoke.
- Model names were updated: speech-to-text `scribe_v2`; Gemini `gemini-3.5-flash-lite` (Google's page says `gemini-2.5-flash`
  is deprecated and is rerouted). The live voice model is still `eleven_flash_v2_5`, which the
  ElevenLabs page I read does not list; if the first live answer fails, change `ttsModel` in the config asset.

### What the stand-in test showed (editor, local server, no real service)
- Bake: listed two voices, recorded 158 lines, recorded 0 on a second run, stopped at line 1 with a wrong key.
- Play: preset lines came from the bank (no misses). "Can I see some sea creatures that are violet" went to the AI and loaded
  the aquarium with purple. "Why are flamingos pink" was answered and the answer went to live text-to-speech. A nonsense wish
  got the guide's miss line. A recorded clip sent to speech-to-text came back as text and was acted on.
- Not tested: the real services' replies, accents and children's voices, latency, and what Gemini actually says to a child.

### Race rivals
- Four computer-driven cars (`RaceRivals`), set by `WISHWORLD_RACE_RIVALS` in `.env` (0 to 5; 0 brings back the ghost car).
- Each slows for corners by how tight they are, keeps a lane, pulls out to pass and cannot overlap another car or drive
  through the player. Running into the back of one costs speed and gives a knock (sound and vibration); there is no crash.
- They ease off when far ahead of the player and push on when far behind, so a child stays in the race.
- The dashboard shows lap and place (`L1/3  P4/5`); the finish panel and the guide give the finishing place.
- Editor check: the auto-driver started last, was 3rd by lap 2 and finished 1st of 5 in 66.7 s; no two rivals came closer
  than 3.4 m centre to centre. How hard they are for a real child is untested.
- These are not human opponents.

### Added to the headset checklist
49. Race: do the four cars look and behave like a race? Is finishing first possible but not automatic? Does a knock feel fair?
50. After keys and a bake: do the guide's lines play in the recorded voice with no delay, with Wi-Fi off?
51. Hold A and ask a question about a creature. Is the answer short, kind and true? Try five, and note any that are wrong.
52. Hold A and say a long wish ("could I have lots of tiny blue penguins"). Does the right thing happen within about two seconds?

### Android build with voice, AI and rivals
- **Succeeded**: `Builds/Android/WishWorld.apk`, 82.8 MB, 0 errors, 91 s. It carries `WISHWORLD_RACE_RIVALS=4`; every service
  is still on its mock because there are no keys. NOT installed: the headset still has the earlier build.

## ElevenLabs switched on with real keys

Asked for: reload the Quest, add the ElevenLabs keys from `.env`, reload again.

### What was in `.env`, and what was done with it
- Two sets: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_GUIDE_AGENT_ID`, the same three ending in `2`, and
  `ELEVENLABS_ACCOUNT=2` choosing between them. `EnvSync` now honours that switch (`2` picks `ELEVENLABS_API_KEY2`).
- **Account 2's key is rejected by ElevenLabs** ("Invalid API key", HTTP 401, on every call). Account 1's key works: free
  plan, 10,000 characters a month, none used before this. `ELEVENLABS_ACCOUNT` in `.env` was changed from 2 to 1, with a
  comment saying why. Change it back once account 2 has a working key.
- **The agent ids are not used.** Both agents belong to another app ("Poise", an interview coach: an interviewer and a
  voice guide for a web app). WishWorld uses plain text-to-speech and speech-to-text, which need only the key and a voice.
- **No voice was named**, so a stock voice was chosen: "Jessica" (playful, bright, warm), id `cgSgspJ2msm6clMCkdW9`, written
  to `.env` as `ELEVENLABS_VOICE_ID`. With a key and no voice, `EnvSync` falls back to that same voice. The agents' own
  voice ("Eric", smooth and trustworthy) was set up for interviews and was not used.
- **There is no Gemini key**, so the AI is still off: a wish goes to the keyword matcher, and questions are not answered.

### Recording
- New switch `ELEVENLABS_BAKE_MODEL`. It is set to `eleven_flash_v2_5`, which ElevenLabs bills at half a character per
  character (measured: 28 for a 55-character line, against 55 for `eleven_multilingual_v2`). That leaves room on the free
  plan to record again in another voice, or in the richer model (about 6,300), within the same month.
- `WishWorld > Voice > Bake Preset Lines`: **158 of 158 lines recorded**, 6,258 characters sent, 345 s of speech, 6.3 MB of
  mp3 in `Assets/WishWorld/Generated/Voice`. The account shows 3,227 of 10,000 used after the bake and the tests below.

### Checked against the real service
- Four recordings were sent back through ElevenLabs speech-to-text and came back word for word.
- Play mode, hub: the greeting came from the bank (1 hit, 0 misses). A sentence that is not in the bank was spoken live
  (2.6 s clip at 24 kHz), so the live path and its audio format work. A 16 kHz recording pushed through the app's own
  upload code came back as "Welcome to the aquarium. Touch a creature to learn about it".
- Not checked: the Quest's microphone and its permission prompt, recognition of a child's voice in a noisy room, the delay
  over the venue's Wi-Fi, and how the voice sounds through the headset speakers. Nobody has listened to the recordings.

### Things to know
- The key is inside the APK (see "Switching it on" above). Anyone with the file can read it.
- ElevenLabs' free plan asks for attribution and does not allow commercial use, as far as I know; check their terms before
  showing this anywhere beyond the event. `THIRD_PARTY.md` carries the credit.
- Speech-to-text has its own allowance on the account; it was not measured.


### Android build with the key and the recorded voice
- **Succeeded**: `Builds/Android/WishWorld.apk`, 85.5 MB, 0 errors, 50 s. It has the internet and microphone permissions,
  the ElevenLabs key, and the 158 recordings. The APK is not in version control.
- On the headset: the build before this one (rivals, no key) was installed. Its launch was held back by a
  power-off confirmation showing inside the headset, and the headset then dropped off USB, so **the keyed build is not
  installed yet**.

## Claude picks the wish, every dialog is spoken, popups move

Asked for: ElevenLabs speech-to-text, then the Anthropic API to select one of the precoded options for the wish world;
ElevenLabs text-to-speech everywhere during text dialog; more animation on text popups. Then, mid-way: "use haiku 5.5 low".

### Speech, then Claude, then the preset choices
- Hold A and speak: the recording goes to ElevenLabs speech-to-text (as before), and the text goes to
  `ClaudeCommandInterpreter` (new, in `RealServices.cs`): the Anthropic Messages API, model `claude-haiku-5-5`, effort `low`.
- **Claude can only answer with presets.** The request carries a JSON schema whose fields are lists of the app's own
  worlds (8), creatures (40), colours, amounts, sizes and extras (snow, night, sunny, in my room, take me there, clear,
  undo, go home), so the reply cannot contain anything the app cannot do. The chosen values are turned back into the
  command words the menu buttons send, and run through the same code.
- A sentence made only of preset words ("purple sharks please") still goes straight through with no network. Everything
  else goes to Claude. If Claude fails, times out (15 s) or declines, the keyword matcher gets the original words.
- It may also answer a question in one or two sentences (`guideAnswersQuestions`, on). **Those answers are not fact-checked.**
- While waiting, the wish menu shows "Thinking..." with counting dots.
- Settings: `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in `.env`; `claudeModel`, `claudeEffort` in the config asset. With the
  Claude key present it is used instead of Gemini. **The key ships inside the APK**, like the ElevenLabs one.
- Raw HTTP through `UnityWebRequest`, like the other services, not Anthropic's C# SDK: the app runs on a Quest under
  IL2CPP and the brief said no new packages. Refusal fallbacks are sent for Opus, Sonnet and
  Fable models only; Haiku has none.

Checked in Play mode against the real API (Haiku 5.5, low):

| Said | Claude chose | Time |
|---|---|---|
| can I see some sea creatures that are violet | aquarium, purple, clownfish, turtle, jellyfish, ray | 2.1 s |
| I want a dragon | dinosaurs, T. rex | 1.3 s |
| a unicorn in my bedroom | in my room, horse | 1.4 s |
| why do penguins waddle | a two-sentence answer | 1.6 s |
| blah gurgle fff | none (the guide's "I can't make that yet" line) | 1.2 s |
| make everything really really small | tiny | 0.8 s |
| it is too dark can it be daytime | make it sunny | 0.8 s |
| purple sharks please | not sent: keywords, at once | 0 s |

End to end with sound: a 3 s recording of "Um, can I please see a big scary dragon, and make it night time" (made with a
different ElevenLabs voice) went through the app's own upload code, came back as text, and Claude chose
"make it night, dinosaurs, giant, T. rex" in 1.4 s; the world changed to the dinosaurs at night.

### Every dialog is spoken
`GuideVoice` is now the one voice for the whole app, with a queue, so lines no longer talk over each other (the fact card
used to have its own speaker).
- `Say`: caption and voice (as before). `Read`: voice only, for words already on a panel. `Hint`: the name of the button
  being pointed at, after 0.45 s, and only when nothing else is being said.
- Newly spoken: quiz questions, "Yes! Shark." / "It was the Ray.", the quiz score, the Games and Worlds menus, both game
  menus (what to do), the end-of-round score in Frost Slice, the race countdown ("Three. Two. One. Go!"), and the name of
  every button and card when pointed at. `WISHWORLD_READ_BUTTONS=off` in `.env` turns the button names off.
- Not spoken, on purpose: score pop-ups during play ("+10"), the dashboard numbers, and the "Listening / Heard" status line.
- The recorder now also finds guide lines split over several code lines or kept in a variable; twelve had been missed and
  were being fetched live ("All clear.", "Let it snow!", the wish and AR greetings).
- **The bank now holds 354 of 354 preset lines** (8,997 characters, 11 MB of mp3; the account shows 4,827 of 10,000 characters used). Only AI answers and the Frost Slice
  score line still need the network.

### Popup animation
- `PopIn` (new): a panel grows in with a small overshoot each time it appears, shrinks away when closed, can bob gently,
  and can "kick" when its number changes. On: the guide's caption (also breathes while the voice plays), fact card, quiz,
  world info panel, wish menu, both game menus, the score panel, the hub's ribbons, the countdown.
- `TypeOn` (new): captions, facts and quiz questions write themselves out at about the pace they are read.
- Buttons arrive one after another on a soft spring, hop on a right answer and shake on a wrong one (the right one hops too).
- Frost Slice score pop-ups burst in at a tilt before drifting up; the score number kicks with each slice. The fact
  card's "New!" badge beats. "Listening..." and "Thinking..." count their dots.

### Checked in the editor (Play mode)
- Hub: 4 buttons settle at full size; the Games menu line and a card's name are spoken; no bank misses.
- Aquarium: fact card speaks; a three-question quiz spoke each question, each verdict, the score, then the guide's line.
- Race: the menu line, then "Three." to "Go!" in step with the numbers. Frost Slice: menu line; two slices scored (30).
- Pictures in `Logs/verification/dialogs/`.
- **Not checked:** how any of this looks, sounds or feels in the headset; whether button names get tiresome; animation
  smoothness at 72 fps on the Quest; Claude and ElevenLabs over the venue's Wi-Fi.


### Android build with Claude, the full voice bank and the animations
- **Succeeded**: `Builds/Android/WishWorld.apk`, 87.2 MB, 0 errors. It carries both keys (ElevenLabs, Anthropic) and all 354 recordings.

## PC route through Link prepared

The headset stopped approving USB debugging (see `SETUP_UNITY_MCP_AND_QUEST.md`), so the project was prepared to run
from a Windows laptop through Meta Horizon Link, which needs no debugging approval.
- The PC platform had no XR loader and its Oculus Touch controller profile was off. `PcVrSetup` (menu:
  `WishWorld > Set Up PC VR (Link)`) added the OpenXR loader, start-with-player, and the profile. Android settings unchanged.
- `PassthroughToggle` can use Meta's passthrough on Windows when `WISHWORLD_LINK_PASSTHROUGH=on`; default is the grey backdrop.
- Checked here: the settings read back as intended; Play mode on Linux still runs (one harmless OpenXR library error).
- **Not checked: anything on Windows or through Link.** No Windows build module is installed in this Unity, so no
  Windows player was built; the route is Play mode in the editor on the Windows laptop.

## Demo of the new features, with sound

- `Demos/08_new_features.mp4` (2 min 25 s): spoken menus and button names, three spoken wishes sent through ElevenLabs
  speech-to-text and Claude (a dragon, violet sea creatures, a question about jellyfish), the fact card, the quiz, the
  spoken race countdown and the Frost Slice pop-ups. It is the first demo with sound.
- The recorder now builds a soundtrack: `Sfx.Tap`, `Sfx.VoiceStart` and `Sfx.VoiceStop` tell `DemoRecorder` when each
  sound starts and when the guide is cut off, and the encoder mixes them at those frames. The wishes are spoken by a
  second ElevenLabs voice standing in for a child; only the microphone is replaced, the rest is the real pipeline.
- Recording sped up game time, so the waits for ElevenLabs and Claude look shorter than they are.
- Fixes found while recording: a button's name no longer restarts while the pointer rests on it; looking at a creature
  no longer opens its fact card while the quiz is on screen (it used to cut off the score); starting Frost Slice cuts
  off the menu being read. The APK was rebuilt with these (83.2 MB, 0 errors).
