# Setting up Unity MCP and Meta Quest debugging

How this project's tooling was set up, written from what is on the development laptop (Ubuntu, Unity
6000.3.29f1, Quest 2) and from Unity's and Meta's documentation. Where a step comes from documentation rather than
from something done on this machine, it says so.

Part 1 gets an AI coding agent (Claude Code here) driving the Unity Editor.
Part 2 gets a build from the laptop onto the headset.
Part 3 runs the app from a Windows laptop through Link, for when the headset will not accept a build.

---

## Part 1: Unity MCP

"Unity MCP" here means the MCP server built into Unity's own command line tool, `unity`. Unity's documentation says
the older MCP server in the AI Assistant package (`com.unity.ai.assistant`) is deprecated and `unity mcp` replaces it.
There are also unrelated community projects with similar names (UnityMCP.Server, IvanMurzak's Unity-MCP and others);
their commands do not apply here.

### What you need

- Unity 6.0 LTS or later to drive a running Editor (Unity's documentation). This project uses 6000.3.29f1.
- Windows 10 21H1 or newer, macOS 14 or newer, or Linux (Ubuntu 22.04 or later, RHEL 9; glibc 2.34 or newer).
- An MCP client. This project used Claude Code.

### 1. Install the Unity command line tool

From Unity's install page:

macOS or Linux:

```bash
curl -fsSL https://unity.com/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://unity.com/install.ps1 | iex
```

Package managers also work: `brew install --cask unity-cli` (macOS, Linux), `winget install Unity.CLI` (Windows), or
`unity-cli` from Unity's apt/dnf repository.

Check it:

```bash
unity --version
```

On this laptop it is version 1.0.1 at `~/.local/bin/unity`.

### 2. Add the Pipeline package to the project

The MCP server talks to the Editor through Unity's Pipeline package. From the project folder:

```bash
unity pipeline install
```

This project already has it: `Packages/manifest.json` lists `"com.unity.pipeline": "1.0.0"`, so a fresh clone needs
nothing here.

### 3. Point your MCP client at it

```bash
unity mcp configure claude
```

Replace `claude` with your client (`cursor`, `vscode`, `windsurf`, ...). To see every supported client and whether it
is configured:

```bash
unity mcp configure --list
```

On this laptop the entry it produced for Claude Code is:

```json
"unity-editor-mcp": {
  "type": "stdio",
  "command": "unity",
  "args": ["mcp", "--tool-groups"]
}
```

`--tool-groups` gives the agent one tool per group of Editor commands instead of one per command, which keeps the tool
list short. Useful options from `unity mcp --help`: `--project-path` pins the server to one project, `--tools` and
`--exclude-tools` limit what is exposed.

Optionally install Unity's agent skill, which teaches the agent the command line tool:

```bash
unity skill install <agent-name>
```

### 4. Check that it works

Open the project in the Editor, then:

```bash
unity status
```

It should list the running Editor with its project and state. Restart the MCP client so it picks up the new server.

### Using the command line directly

The same Editor commands are available without MCP, which is what most of this project's automation used:

```bash
# recompile scripts and report errors
unity command script recompile --project-path . --format json

# run a line of C# in the Editor
unity command script eval --project-path . --format json -- --code 'return UnityEngine.Application.unityVersion;'

# enter Play mode
unity command editor.playmode start --project-path .

# capture the game view
unity command capture game_view --project-path . --format json -- --width 1280 --height 720 --output-path shot.png

# build the Android APK, then poll for the result
unity command build run --project-path . --format json -- --target Android --output-path Builds/Android/WishWorld.apk --confirm true
unity command build status --project-path . --format json
```

### Things that cost time on this laptop

- **Memory.** An Android build once ran the 22 GB laptop out of memory. The Editor is now started under a cap:
  `systemd-run --user --scope -p MemoryMax=13G -p MemorySwapMax=3G env vblank_mode=0 <Unity> -projectPath <project>`.
- **Background speed.** Without `vblank_mode=0` the Editor runs at about one frame a second when its window is not in
  front, which breaks scripted Play-mode checks.
- **Platform.** Android must be the selected platform in Build Profiles, not just the build target, or Meta's build step
  is skipped and Gradle fails on a duplicate `libopenxr_loader.so`.
- **Keys.** `.env` and `Assets/WishWorld/Config/Resources/WishWorldServiceConfig.asset` are not in the repository. A
  fresh clone runs every service on its mock until you copy `.env.example` to `.env` and fill it in.

---

## Part 2: Meta Quest debugging

Installing a build needs two things: developer mode on the headset, and the headset trusting your computer for USB
debugging. Meta's Link app is not involved (it streams PC VR games and only runs on Windows).

### 1. Turn on developer mode

From Meta's documentation. You must be 18 or over and the headset must not have restrictions that block developer mode.

1. Open the Meta Horizon app on the phone paired with the headset. The headset must be on and near the phone.
2. Tap the headset icon in the toolbar (on some versions: the menu next to the search bar, then **Devices**).
3. Tap your headset, then **Headset Settings** below its picture.
4. Tap **Developer Mode** and switch it on.
5. Restart the headset.

### 2. Find adb

Unity ships adb with its Android module. On this laptop:

```bash
ADB=~/Unity/Hub/Editor/6000.3.29f1/Editor/Data/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb
```

Any recent Android platform-tools adb works the same way.

### 3. Connect and approve

1. Use a data cable (a charge-only cable will not work) and plug the headset into the computer.
2. Put the headset on. A pop-up titled **Allow USB debugging?** shows your computer's key fingerprint.
3. Tick **Always allow from this computer**, then **Allow**. Without the tick, the approval is lost when the headset
   restarts.
4. Check from the computer:

```bash
$ADB devices -l
```

`device` means ready. `unauthorized` means the headset has not approved yet. Nothing listed means the cable, the port
or developer mode.

A second pop-up, "Allow access to data" (or a "USB plugged in for file transfer" notification), is about copying
files. Allowing it does not approve debugging.

### 4. Install, launch and watch

```bash
# install over the top of the existing build
$ADB install -r Builds/Android/WishWorld.apk

# start it
$ADB shell am start -n com.wishworld.app/com.unity3d.player.UnityPlayerGameActivity

# stop it
$ADB shell am force-stop com.wishworld.app

# Unity's log lines from the headset
$ADB logcat -s Unity

# is it running, and when was it last installed
$ADB shell pidof com.wishworld.app
$ADB shell dumpsys package com.wishworld.app | grep lastUpdateTime
```

Once USB debugging works, Meta's documentation gives a cable-free option: with the headset still on the cable run
`$ADB tcpip 5555`, then `$ADB connect <headset-ip>:5555`, and unplug. Both must be on the same Wi-Fi.

### Troubleshooting

**The app is installed but does not start.** The headset log said
`Launch is blocked because: a Reprojected OS dialog is currently showing`. A system dialog (a power-off confirmation in
our case) was open inside the headset. Put the headset on and dismiss it. A Back key sent over adb did not close it.

**`unauthorized`, and no "Allow USB debugging?" pop-up.** This is what stopped us. The headset had approved the
computer earlier; after it powered off and came back, it refused both that key and a new one, and never showed
the pop-up again. Meta's feedback centre has an open report of exactly this, and forum threads describe it after
system updates. What the threads report as fixes, most common first:

1. In the phone app, turn Developer Mode **off**, restart the headset, turn it **on** again, then plug in while wearing
   the headset. This also clears the headset's list of trusted computers.
2. Use the headset's owner account. A second account can block the pop-up.
3. Try another cable and another USB port.
4. Make sure only one adb is running (Unity, Meta's developer hub and SideQuest each bring their own).
5. A factory reset is the last resort. It erases the headset and needs the phone app to set it up again.

What we tried from the computer, none of which brought the pop-up back:

- `adb kill-server` then `adb start-server`, several times.
- A new key: move `~/.android/adbkey` and `adbkey.pub` aside and restart adb, which generates fresh ones. (The old
  pair is in `~/.android/key-backup/` on the laptop.)
- Offering old and new keys together with `ADB_VENDOR_KEYS`.
- `ADB_TRACE=auth adb start-server`, then reading `/tmp/adb.<uid>.log`. This is worth doing: it showed the computer
  signing with its key, the headset refusing, and the computer sending its public key, which proves the missing step
  is on the headset.
- Resetting the USB link from the computer. **Do not do this:** the headset's debugging channel stopped answering
  until the cable was unplugged and plugged back in.

One route we could not test: a forum post describes **Settings > System > Developer > Wireless Debugging > Pair with
pairing code** on a Quest 3. If your headset has it, `adb pair <ip>:<port> <code>` then `adb connect <ip>:<port>`
would avoid the USB pop-up. Meta's documentation does not describe this, and we do not know whether a Quest 2 has it.

**The headset still had the earlier build installed** (surroundings and race rivals,
without the recorded voice, Claude wish picking or the pop-up animations). The newer build had not been installed.

---

## Part 3: Running from a Windows laptop through Link (no USB debugging needed)

Meta Horizon Link streams a PC app to the headset. It needs neither developer mode nor the USB debugging approval, so
it is the way round a headset that will not authorise a computer. The app then runs as a Play session in the Unity
editor on the laptop, not as an app installed on the headset.

**Not tested.** The project settings below were made and checked on the Linux laptop, where there is no VR runtime.
Nobody has yet pressed Play on Windows with a headset attached.

### What the laptop needs

- Windows 10 or 11 with a dedicated NVIDIA or AMD graphics card that Meta lists as supported for Link. Laptops with
  only integrated Intel graphics will not run it.
- A USB-C data cable to the headset (or Air Link on a good 5 GHz network).
- About 15 GB free for Unity and the project's import cache.

### Steps

1. Install **Meta Horizon Link** (Meta's PC app) and sign in with the same Meta account as the headset.
2. In Link's settings, under General, set **Meta Horizon Link as the active OpenXR runtime**.
3. Install **Unity Hub**, then Unity **6000.3.29f1**. No extra build modules are needed for Play mode.
4. Clone the project: `git clone https://github.com/SuryaThirukonda/andrea_tidal.git`
5. Copy your `.env` into the project folder (it is not in the repository). Without it the app runs with a placeholder
   voice and keyword matching only.
6. Open the project in Unity. The first import takes a while. Leave the platform as Windows.
7. Connect the headset and start Link from inside it (Quick Settings > Link). You should be standing in Link's grey
   home space.
8. In Unity open `Assets/WishWorld/Scenes/Hub.unity` and press **Play**. Put the headset on.

To end, press Play again in Unity. Each scene can also be opened and played directly.

### What is already set up in the project

- The PC platform has the OpenXR loader, XR starts with the player, and the **Oculus Touch Controller Profile** is on.
  `WishWorld > Set Up PC VR (Link)` in Unity's menu repairs these if they are ever lost
  (`Assets/WishWorld/Editor/PcVrSetup.cs`).
- When the editor sees a headset, the app uses the OpenXR controller path. With no headset it falls back to mouse and
  keyboard, so if you get a flat window that responds to the mouse, Link was not active when Play started.
- The Android (headset build) settings are unchanged.

### Differences from the headset build

- **Your room is not shown by default.** Frost Slice and AR mode use a grey backdrop. To show the real room, switch on
  Developer Runtime Features and then passthrough over Link in the Link app's settings, add
  `WISHWORLD_LINK_PASSTHROUGH=on` to `.env`, and restart Play. This path has never been run.
- **Microphone and sound** go through Windows. Set the headset as the default recording and playback device, or
  hold-A-to-speak records from the laptop's microphone.
- **Looks and speed** come from the laptop's graphics card and will not match the Quest.
- On Linux, where there is no VR runtime, pressing Play now logs one `DllNotFoundException: UnityOpenXR` error and
  carries on with mouse and keyboard. It is harmless.

### If it does not work

- **Flat window, no picture in the headset:** Link was not running, or it is not the active OpenXR runtime (step 2).
  Stop Play, fix it, press Play again.
- **Picture but no controllers:** open Project Settings > XR Plug-in Management > OpenXR, PC tab, and check that Oculus
  Touch Controller Profile is listed; or run `WishWorld > Set Up PC VR (Link)`.
- **Link refuses to start:** check the graphics card against Meta's Link requirements, and try a different cable or port.

---

## Sources

- Unity: [Use the Unity CLI (install)](https://docs.unity.com/en-us/unity-cli/use-unity-cli)
- Unity: [Unity CLI as the replacement for the in-Editor MCP server](https://docs.unity.com/en-us/unity-cli/replace-mcp-server-unity-cli)
- Meta: [Use Link for App Development](https://developers.meta.com/vr/documentation/unity/unity-link/)
- Meta: [Use Passthrough Over Link](https://developers.meta.com/vr/documentation/unity/unity-passthrough-use-over-link/)
- Meta: [Enable developer mode](https://developers.meta.com/vr/documentation/android-apps/enable-developer-mode/)
- Meta: [ADB](https://developers.meta.com/horizon/documentation/native/android/mobile-adb/)
- Meta feedback centre: [Quest devices fail to show the ADB authorization prompt](https://developers.meta.com/horizon/feedback/vr/investigations/2186447861845305/)
- Meta forum: [Quest doesn't ask to give USB permissions in dev mode](https://communityforums.atmeta.com/discussions/dev-quest/quest-doesnt-ask-to-give-usb-permissions-in-dev-mode/746540)
- Meta forum: [Wireless adb pair device on Quest 3 v83](https://communityforums.atmeta.com/pairing-connection-12/how-do-i-get-wireless-adb-pair-device-working-in-quest-3-v83-174218)
- SideQuest: [adb authorization prompt not appearing](https://sidequestvr.com/space/142/p/704958/adb-authorization-prompt-not-appearing-on-oculus-quest(leave:overlay))
