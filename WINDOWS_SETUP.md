# WishWorld on Windows: setup

Written for the ThinkPad P14s Gen 6 AMD booted into Windows, with the project copied to
`C:\Users\thiru\tamu2\ecs\repos\andrea_tidal`. Nothing in this file has been tried on Windows yet.

What is in that folder: the whole project as a git clone of `github.com/SuryaThirukonda/andrea_tidal` (branch `main`),
plus `.env` with the ElevenLabs and Anthropic keys. Not copied, because they are rebuilt or downloaded: Unity's
`Library` cache, the APK, the demo videos, and the original third-party downloads (those are on the GitHub release
`v0.1.0-tidalbyte` if you ever need to re-bake models or skies).

There are two goals, and they need different things:

- **A. Play WishWorld in the headset through Link.** No developer mode needed. Works on a second Meta account.
- **B. Build the APK and install it on the headset.** Needs the headset's owner to approve USB debugging.

---

## 0. Will this laptop run Link?

From Meta's page "Windows PC requirements for Meta Horizon Link", checked:

| | Meta minimum | Meta recommended | This laptop |
|---|---|---|---|
| Processor | Intel i5-4590 / AMD Ryzen 5 1500X | Intel i7 / AMD Ryzen 7 | AMD Ryzen AI 7 PRO 350, 8 cores: **meets it** |
| Memory | 8 GB | 16 GB | about 23 GB usable (part is reserved for graphics): **meets it** |
| USB | 1 port | 1 USB-C port | USB-C at 10 Gbps: **meets it** |
| OS | Windows 10 or 11 | | Windows: **meets it** |
| Graphics | a GPU on Meta's list | NVIDIA RTX 20 series / AMD Radeon RX 6000 | **AMD Radeon 860M, built into the processor. Not on Meta's list.** |

Meta's supported list is all separate graphics cards (NVIDIA GTX/RTX, AMD RX and Vega). The Radeon 860M is not named
anywhere on it, so **Link is not officially supported on this laptop**. Expect the Link app to warn that the graphics
card is not compatible. It may still run, at lower quality and frame rate, or it may refuse; the only way to know is to
try, which costs about 15 minutes (step A1). If it refuses, Goal A needs another Windows laptop with an NVIDIA RTX or
AMD RX card; everything below applies to that laptop the same way.

---

## A. Play in the headset through Link

### A1. Meta Horizon Link (try this first: it decides whether the rest is worth doing)

1. Download and install **Meta Horizon Link** from meta.com (the Windows PC app for Quest).
2. Sign in. A second Meta account on the headset is fine for Link; only automatic connection is owner-only.
3. Plug the headset in with a USB-C data cable. In the headset: **Quick Settings > Link**, pick this PC, **Launch**.
   You should end up in Link's grey home space. If the PC app says the graphics card is not supported and will not
   continue, stop here and use another laptop.
4. In the PC app: **Settings > General > OpenXR Runtime**, set Meta Horizon Link as the active runtime.
5. Optional, only to see your real room in Frost Slice and AR mode: **Settings > Developer** (older versions of the
   app call this tab **Beta**), turn on **Developer Runtime Features**, then **Passthrough over Meta Horizon Link**,
   and restart Unity. The tab only appears for a Meta developer account, signed in on both the PC app and the
   headset. Also set `WISHWORLD_LINK_PASSTHROUGH=on` in `.env`. Without it those two modes use a grey background;
   nothing else changes.

### A2. Unity

1. Install **Unity Hub** from unity.com and sign in (a free personal licence is enough).
2. Install Unity **6000.3.29f1** exactly (Hub > Installs > Install Editor > Archive, or
   `unityhub://6000.3.29f1` from the download archive). For Goal A no extra modules are needed.
   For Goal B tick **Android Build Support** with **OpenJDK** and **Android SDK & NDK Tools**.
3. Hub > Projects > **Add** > choose `C:\Users\thiru\tamu2\ecs\repos\andrea_tidal`. Open it.
   The first import takes a long time (around 20 to 40 minutes): it rebuilds the `Library` cache.
4. If Unity asks to switch the platform, leave it on **Windows** for Goal A.

### A3. Check the XR settings (they are already in the project)

**Edit > Project Settings > XR Plug-in Management**, the Windows (monitor icon) tab:

- **OpenXR** ticked.
- Under OpenXR, **Interaction Profiles** contains **Oculus Touch Controller Profile**.

If either is missing, run **WishWorld > Set Up PC VR (Link)** from the menu bar; it sets both.

### A4. Play

1. Headset on, in Link's grey space.
2. In Unity open `Assets/WishWorld/Scenes/Hub.unity` and press **Play**.
3. Put the headset on: you should be in the snow hub. Point and pull the trigger to pick a card.
4. Hold **A** and speak to make a wish (in Wish mode). Set the headset as Windows' default microphone and speaker
   (Sound settings), or the laptop's microphone is used.
5. Press Play again in Unity to stop.

If you get a flat window that responds to the mouse instead of a picture in the headset, Link was not running or not
the active OpenXR runtime when Play started. Stop, fix it, press Play again.

The keys come from `.env`: on opening the project and on each Play, they are copied into
`Assets/WishWorld/Config/Resources/WishWorldServiceConfig.asset` (not in git). With no `.env` the app runs with a
placeholder voice and keyword matching only.

---

## B. Build the APK and put it on the headset

Only possible once the headset's **owner** account approves USB debugging (a second account cannot turn developer mode
on). See `SETUP_UNITY_MCP_AND_QUEST.md`, Part 2, for the whole story and the fixes to try.

1. In Unity: **File > Build Profiles > Android > Switch Platform** (Android must be the selected platform, not only
   the build target, or Meta's build step is skipped and the build fails on a duplicate `libopenxr_loader.so`).
2. **Build**, save as `Builds\Android\WishWorld.apk` (the `Builds` folder is ignored by git).
3. Install over USB. Unity's own adb is at
   `C:\Program Files\Unity\Hub\Editor\6000.3.29f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe`:

```powershell
$adb = "C:\Program Files\Unity\Hub\Editor\6000.3.29f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe"
& $adb devices -l
& $adb install -r Builds\Android\WishWorld.apk
& $adb shell am start -n com.wishworld.app/com.unity3d.player.UnityPlayerGameActivity
```

`devices` must say `device`, not `unauthorized`. Windows may also need Meta's ADB driver (from the Meta developer site)
before the headset shows up at all.

**The APK contains the API keys.** Revoke them before sharing the APK.

---

## C. Optional: Unity CLI and Unity MCP on Windows

For driving the editor from Claude Code, as was done on Linux. Full detail in `SETUP_UNITY_MCP_AND_QUEST.md`, Part 1.

```powershell
irm https://unity.com/install.ps1 | iex
unity --version
unity mcp configure claude
unity status
```

The project already contains the Pipeline package the MCP server needs.

---

## Things that may come up

- **"detected dubious ownership" from git.** The folder was written from Linux, so Windows sees a different owner.
  Run once: `git config --global --add safe.directory C:/Users/thiru/tamu2/ecs/repos/andrea_tidal`
- **Line endings.** The clone has `core.autocrlf false` so git does not report every file as changed. Leave it.
- **Pulling later changes:** `git pull` in the folder (it is linked to GitHub).
- **Compile errors on first open** about Meta or OpenXR types usually clear after the import finishes and Unity
  reloads; if not, close and reopen the project once.
- **Microphone permission:** Windows Settings > Privacy > Microphone must allow desktop apps (Unity).
- **Fast Startup / hibernation:** shut Windows down fully (not hibernate) before switching back to Linux, or Linux can
  only open the Windows drive read-only.
