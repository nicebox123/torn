# TORN — Phase 1 (WebXR demo)

A free-roam, arm-movement monster-tag game for Quest, running in the browser (three.js + WebXR).

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | The game page (start menu: ENTER VR / desktop test mode) |
| `js/` | Game code, one file per system (see below) |
| `models/` | 99 `.glb` models made in Blender by script, plus `manifest.json` |
| `blender/` | The Blender scripts that build every model (`build.py` runs them all) |
| `thumbs/` | A render of every model + contact sheets (`sheet_*.png`) |
| `serve.py` | A tiny local test server (no caching) |

Code systems: `rig.js` (PlayerRig + MonsterRig), `locomotion.js` (your GorillaLocomotion, ported), `tear.js` (TearSystem),
`gore.js` (GoreSystem), `physics.js` (OrganPhysics), `decals.js` (DecalSystem), `gamemode.js` (GameModeManager),
`bots.js` (BotAI), `computer.js` (ComputerUI), `namefilter.js`, `save.js`, `shop.js` (CosmeticShop + mirror),
`loading.js`, `audio.js`, `models.js` (ModelLoader with placeholders), `network.js` (fake/local), `map.js`, `world.js`,
`player.js`, `input.js`, `main.js`. Tunable numbers and the cosmetics offset list live in `js/config.js`.

## Put it online for free (GitHub Pages) and play on your Quest

1. Make a free account at https://github.com and sign in.
2. Click **+** (top right), then **New repository**. Name it `torn`, set it to **Public**, then click **Create repository**.
3. On the new page, click **uploading an existing file**. Drag in **everything in this folder**
   (`index.html`, the `js`, `models` folders and the rest). Wait for the upload, then click **Commit changes**.
4. Go to **Settings**, then **Pages** (left menu). Under "Branch" pick **main** and **/ (root)**, then click **Save**.
5. Wait 1–2 minutes. The page shows your link, something like `https://YOURNAME.github.io/torn/`.
6. Put on your Quest, open the **Browser**, type that link, then press **ENTER VR**.
7. Optional: add it to your bookmarks so it's one tap next time.

To update the game later, upload the changed files to the same repository again. Pages updates in about a minute.

## Test on your PC first (optional)

Open a terminal in this folder and run `python serve.py`, then visit http://localhost:8124 and pick
**PLAY ON DESKTOP**. Controls: mouse to look, WASD to move, Space to jump, hold left/right mouse to reach and grab
with that hand, hold Q/E to pull your hands apart (tear), R for the monster ability, F to press the key or item
you're looking at, T to cycle monster types (test only).

## Rebuild the models

`E:\blender.exe -b --factory-startup -P blender/build.py -- .`
(add `-- . model_a,model_b` to rebuild only some). Thumbnails go to `thumbs/`.

## Notes and known limits

- **Locomotion** is a line-by-line port of GorillaLocomotion (`Player.cs`, MIT licence, (c) 2021 Another-Axiom).
  Keep the licence notice at the top of `js/locomotion.js`, and list "GorillaLocomotion by Another Axiom (MIT)"
  in the store page / credits. Unity physics calls were swapped for our box-world versions; TORN features
  (surfaces, missing arms, monster speed, stuns, chains, wall crawl) are hooks on top. Tunables: `js/config.js`.
- Bots move by GT-style hopping with planted hands. That's an animation, not real arm physics.
- Blood/claw textures are drawn in code (not Blender renders), so they need no texture files.
- Sounds are all generated in code. Voice chat is Phase 2 (the mic currently only moves your jaw).
- The Main Hall is 16 m tall (not 12) so the 15 m tower fits inside.
- Performance is not yet tuned for Quest: about 370 draw calls in a full room. Merging each character's meshes is the
  first optimisation to do.
