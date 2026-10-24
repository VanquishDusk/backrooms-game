# The Backrooms

A replayable 3D horror game set in the Backrooms, playable in the browser on desktop and mobile.

Playable now: **Level 0 — "The Lobby" / "The Yellow Hell"** and its sub-level **Level 0.2 — "The Remodel"**. More levels will follow.

## Play

You can serve the folder with any static file server. There's no build step.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

It also works on GitHub Pages: enable Pages for the branch and open the site URL.

## Level 0

You've noclipped out of reality into endless mono-yellow halls, damp carpet and buzzing fluorescent lights.

- **Find the flickering wall** and throw yourself through it. It's in a different place every run. Listen for its static.
- **Sanity** drains in the hum. Darkness, the red rooms and things you shouldn't see drain it faster.
- **Almond Water** steadies your mind.
- **Buzzing spikes:** the lights get painfully loud. Cover your ears and keep moving until you're out of it.
- **The maze shifts** where you aren't looking.
- **Whispers, distant voices, scratching behind the walls, footsteps that aren't yours.**
- **A dark figure** watches from the end of the corridors. If your sanity slips far enough, it stops watching.
- **The Pitfalls:** a room full of holes in the floor. Watch your step.
- **Dark zones** where the lights died (use your flashlight), and a **red room**.

Some layouts have a pocket where the buzzing quiets, the carpet dries out and the rooms look half-built. If you find the **door** there, it leads to Level 0.2.

## Level 0.2 — The Remodel (Survival Difficulty 3)

Level 0 as remodelled by the Backrooms Remodeling Co. It has dry red carpet, fresh white paint, working outlets and the odd bathroom. A few seconds after you arrive, it starts falling apart.

- A **chain reaction** spreads out from where you came in. Ceiling tiles fall, walls topple and the floor caves in to show the unfinished house underneath. Debris hurts you.
- **Dust** chokes you. Cover your mouth (same button/key as covering your ears) and get out of it.
- Find the **door back to Level 0** before the collapse reaches it. Level 0's hum leaks through it, and there's light under the door. If the collapse gets there first, there's no way back.
- **Outlets** charge your flashlight.
- Going back puts you in a fresh Level 0. Your sanity, health, battery and Almond Water carry over.

Once you've reached Level 0.2, you can start a run there from the main menu.

Every run comes from a seed, which shows on the pause, death and escape screens. Type a seed on the main menu to replay a layout.

## Controls

| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | Left side of the screen: a floating joystick |
| Look | Mouse | Drag anywhere on the right side |
| Run | Shift | RUN (toggle) |
| Cover ears / mouth | C / Space (hold) | EARS / MOUTH (hold) |
| Flashlight | F | LIGHT |
| Drink Almond Water | E | Bottle button |
| Pause | Esc | Pause button |

The Settings screen has mouse and touch sensitivity, FOV, volume, invert Y, graphics quality and an FPS counter. On "Auto", graphics quality steps down if the device can't keep up.

## Project layout

```
index.html, css/style.css     UI shell, menus, HUD, touch controls
vendor/three.module.min.js    three.js r169 (MIT, vendored, no CDN needed)
src/main.js                   entry point
src/core/                     engine: Game loop/state, Input, Player, AudioEngine (procedural), Renderer (+post FX), rng, storage
src/world/                    reusable grid-level toolkit: GridMap (layout + pathing + line of sight),
                              GridWorld (meshes, collision, baked lightmap, destructible cells),
                              materials (shaders), textures (procedural), props (doors, clutter, fixtures)
src/entities/Stalker.js       the dark figure
src/levels/registry.js        list of levels + the level interface
src/levels/level0/            Level 0 generator and runtime (events, hazards, exits)
src/levels/level0_2/          Level 0.2 generator and runtime (the collapse)
```

All textures and sounds are generated in code, so there are no asset files.

## Adding a level

1. Create `src/levels/levelN/LevelN.js` exporting a definition `{ id, number, name, title, difficulty, next, create(ctx) }`. `registry.js` documents the instance interface.
2. Grid-style levels can reuse `GridMap` and `GridWorld` with their own generator, textures and lighting.
3. Register the level in `src/levels/registry.js`.

Levels hand off with `ctx.onEscape(targetId, 'noclip' | 'door')`, and player stats carry over. Level 0's flickering wall already targets `level1`. Once a level with that id is registered, walking through the flickering wall loads it.
