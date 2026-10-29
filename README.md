# The Backrooms

A replayable 3D horror game set in the Backrooms, playable in the browser on desktop and mobile.

Playable now: **Level 0 — "The Lobby" / "The Yellow Hell"**, its sub-level **Level 0.2 — "The Remodel"**, **Level 1 — "The Habitable Zone"** and **Level 1.3**. More levels will follow.

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
- **Exit:** throw yourself through the flickering wall to reach Level 1.

Some layouts have a pocket where the buzzing quiets, the carpet dries out and the rooms look half-built. If you find the **door** there, it leads to Level 0.2.

## Level 0.2 — The Remodel (Survival Difficulty 3)

Level 0 as remodelled by the Backrooms Remodeling Co. It has dry red carpet, fresh white paint, working outlets and the odd bathroom. A few seconds after you arrive, it starts falling apart.

- A **chain reaction** spreads out from where you came in. Ceiling tiles fall, walls topple and the floor caves in to show the unfinished house underneath. Debris hurts you.
- **Dust** chokes you. Cover your mouth (same button/key as covering your ears) and get out of it.
- Find the **door back to Level 0** before the collapse reaches it. Level 0's hum leaks through it, and there's light under the door. If the collapse gets there first, there's no way back.
- **Outlets** charge your flashlight.
- Going back puts you in a fresh Level 0. Your sanity, health, battery and Almond Water carry over.

## Level 1 — The Habitable Zone (Survival Difficulty 1)

An endless, abandoned concrete complex: half underground car park, half empty warehouse.

- **Halls:** huge pillared spaces with damp floors, exposed pipes and long sightlines. This is where you explore, and where things happen.
- **Corridors:** concrete hallways with offices and infirmaries. They're safer, and red emergency lighting stays on in a blackout.
- **Storage:** shelving and crates.
- **Sectors:**
  - **Aquila:** the garage where you arrive, with an explorers' cache and a note.
  - **Gild:** warehouse, full of crates.
  - **Gothic:** vaulted round columns and a medical station.
  - **Ouroboros:** construction that never ends, with workers who never look at you.
  - **Garden:** overgrown and harmful to stay in, but with better loot.
  - **Fabled:** old wood panelling and neon.
- **Blackouts:** the lights die and something hunts the halls. It won't follow you into the corridors.
- **Impossible geometry:** halls stretch away from you, and corridor walls move when you aren't looking.
- **Crates** hold Almond Water, batteries, first aid kits, junk, or something worse. Some vanish when you look away, and new ones turn up.
- **Exit:** follow an extended hallway where pipes and dials gradually appear. Pipes on the ceiling get denser as you get closer, and you can hear steam ahead. The hallway leads on to Level 2, which is coming soon.

Near the explorers' cache, a spotless **white wall** leads to Level 1.3.

## Level 1.3 — The Ward (Survival Difficulty 0… or a Dead Zone)

One long, blinding-white tiled hallway with branching paths to 16 large rooms: Detox Zones (marked in green tape), medical supply rooms, and The Ward. Each visit rolls which Level 1.3 you get:

- **The sanctuary:** Detox Zones heal you quickly (it burns), M.E.G. doctors staff The Ward, the supply rooms are stocked, and heart monitors beep.
- **The Dead Zone:** the Decay has got in.
  - Black voids eat into the floors, walls and ceilings, and they keep spreading. Step into one and you're gone.
  - Dried blood, covered bodies, a flatlined monitor.
  - The Detox Zones heal you for a moment, then tear you apart.
  - Recovered documents tell what happened.
  - One end of the hallway is already being swallowed.
- **Exit:** noclip into either end of the main hallway to return to Level 1.

The main menu has a **Levels** section (0, 1, …) and a **Sublevels** section (0.2, 1.3, …). Each level unlocks there once you reach it.

Every run comes from a seed, which shows on the pause, death and escape screens. Type a seed on the main menu to replay a layout.

## Controls

| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | Fixed stick in the bottom-left corner |
| Look | Mouse | Drag anywhere else |
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
src/entities/                 Stalker (Level 0's dark figure), Hound (Level 1's blackout hunter)
src/levels/registry.js        list of levels + the level interface
src/levels/level0/            Level 0 generator and runtime (events, hazards, exits)
src/levels/level0_2/          Level 0.2 generator and runtime (the collapse)
src/levels/level1/            Level 1 generator and runtime (sectors, blackouts, crates, the hallway out)
src/levels/level1_3/          Level 1.3 generator and runtime (Detox Zones, The Ward, the Decay)
```

All textures and sounds are generated in code, so there are no asset files.

## Adding a level

1. Create `src/levels/levelN/LevelN.js` exporting a definition `{ id, number, name, title, difficulty, next, create(ctx) }`. `registry.js` documents the instance interface.
2. Grid-style levels can reuse `GridMap` and `GridWorld` with their own generator, textures and lighting.
3. Register the level in `src/levels/registry.js`.

Levels hand off with `ctx.onEscape(targetId, 'noclip' | 'door' | 'walk')`, and player stats carry over. An exit that targets a level that isn't built yet shows a "coming soon" screen, using the names in `UPCOMING`. Level 1's hallway already targets `level2`.
