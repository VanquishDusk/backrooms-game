import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { AudioEngine } from './core/AudioEngine.js';
import { createRng } from './core/rng.js';
import { GridMap, EDGE_WALL } from './world/GridMap.js';
import { GridWorld } from './world/GridWorld.js';
import { createSharedUniforms } from './world/materials.js';
import { wallpaperTexture, carpetTexture, ceilingTexture } from './world/textures.js';
import { ENTITY_TYPES, EntityManager } from './entities/lib/index.js';

// Entity viewer: inspect each library entity in a small Level 0-style room.
// Pose buttons force an animation state; "Live AI" lets the entity act
// against you (the camera) instead. Drag to orbit, scroll/pinch to zoom.

const $ = (id) => document.getElementById(id);
const VARIANTS = { faceling: ['passive', 'hostile', 'child'], deathmoth: ['drone', 'soldier'] };

const renderer = new Renderer($('view'));
renderer.setQuality(window.matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
const scene = new THREE.Scene();
const fog = new THREE.FogExp2(0x3a3520, 0.03);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 80);
const shared = createSharedUniforms(fog);
const audio = new AudioEngine();

// A room: open middle, a short wall and a dark alcove on the right.
const map = new GridMap(10, 7, 3, 2.8);
map.addBoundary();
for (let y = 0; y < 4; y++) map.setV(7, y, EDGE_WALL);
map.setH(2, 2, EDGE_WALL);
map.setH(3, 2, EDGE_WALL);
const lights = [];
for (let y = 0; y < 7; y++) for (let x = 0; x < 10; x += 2) {
  const [lx, lz] = map.cellCenter(x, y);
  lights.push({ x: lx, z: lz, color: [1, 0.96, 0.78], power: 1, state: x >= 8 && y < 4 ? 'off' : 'on' });
}
const world = new GridWorld({
  map, lights, shared,
  textures: { wall: wallpaperTexture(renderer.renderer), floor: carpetTexture(renderer.renderer), ceiling: ceilingTexture(renderer.renderer) },
});
scene.add(world.group);

const rng = createRng('viewer');
const manager = new EntityManager({ scene, world, audio, rng, shared });
const [cx0, cz0] = map.cellCenter(4, 4);
const center = new THREE.Vector3(cx0, 0, cz0);

// The "player" the entities perceive: it rides on the camera.
const player = {
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, sprinting: false, flashlight: false,
  coveringEars: false, dead: false, health: 100, sanity: 100, hurtAgo: 0,
  damage(n) { this.health -= n; },
};

let current = 'smiler', variant = null, pose = 'idle', live = false, lightsOn = true;
let entity = null;
let orbit = { yaw: 0.6, pitch: 0.12, dist: 4.2 };

function spawn() {
  manager.dispose();
  const opts = { x: center.x, z: center.z, heading: 0 };
  if (variant) opts.variant = variant;
  if (live) {
    // Start it across the room and let it come to you.
    opts.x = map.cellCenter(8, 5)[0];
    opts.z = map.cellCenter(8, 5)[1];
  }
  entity = manager.spawn(current, opts);
  entity.preview = live ? null : pose;
  $('name').textContent = ENTITY_TYPES[current].name.toUpperCase() + (variant ? ` · ${variant.toUpperCase()}` : '');
  $('blurb').textContent = ENTITY_TYPES[current].blurb;
}

function buttons(el, items, onPick, isOn) {
  el.textContent = '';
  for (const [key, label] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('on', isOn(key));
    b.addEventListener('click', () => {
      audio.unlock();
      onPick(key);
      refreshUi();
    });
    el.appendChild(b);
  }
}

function refreshUi() {
  buttons($('types'), Object.entries(ENTITY_TYPES).map(([k, v]) => [k, v.name]), (k) => {
    current = k;
    variant = VARIANTS[k]?.[0] ?? null;
    spawn();
  }, (k) => k === current);
  const poseItems = [['idle', 'IDLE'], ['move', 'MOVE'], ['detect', 'DETECT'], ['attack', 'ATTACK']];
  buttons($('poses'), [...poseItems, ...(VARIANTS[current] || []).map((v) => ['v:' + v, v.toUpperCase()])], (k) => {
    if (k.startsWith('v:')) {
      variant = k.slice(2);
      spawn();
      return;
    }
    pose = k;
    live = false;
    spawn();
  }, (k) => (k.startsWith('v:') ? variant === k.slice(2) : !live && pose === k));
  buttons($('toggles'), [['live', 'LIVE AI'], ['lights', 'LIGHTS'], ['torch', 'FLASHLIGHT']], (k) => {
    if (k === 'live') {
      live = !live;
      player.health = 100;
      spawn();
    }
    if (k === 'lights') lightsOn = !lightsOn;
    if (k === 'torch') player.flashlight = !player.flashlight;
  }, (k) => (k === 'live' ? live : k === 'lights' ? lightsOn : player.flashlight));
}

// Orbit controls (mouse + touch).
let drag = null, pinch = null;
addEventListener('pointerdown', (e) => {
  if (e.target.tagName === 'BUTTON') return;
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('pointermove', (e) => {
  if (!drag || pinch) return;
  orbit.yaw -= (e.clientX - drag.x) * 0.006;
  orbit.pitch = Math.max(-0.3, Math.min(1.2, orbit.pitch + (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', () => (drag = null));
addEventListener('wheel', (e) => (orbit.dist = Math.max(1.5, Math.min(12, orbit.dist * (1 + e.deltaY * 0.001)))));
addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2) return;
  const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  if (pinch) orbit.dist = Math.max(1.5, Math.min(12, orbit.dist * (pinch / d)));
  pinch = d;
}, { passive: true });
addEventListener('touchend', () => (pinch = null));
addEventListener('resize', () => {
  renderer.resize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let last = performance.now(), t = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  if (!drag && !live) orbit.yaw += dt * 0.25;

  // Camera orbits the entity (or the room centre in live mode).
  const focus = live ? center : new THREE.Vector3(entity.pos.x, 0, entity.pos.z);
  const h = live ? 1.6 : (current === 'clump' ? 0.6 : current === 'hound' ? 0.8 : 1.2);
  camera.position.set(
    focus.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
    h + Math.sin(orbit.pitch) * orbit.dist,
    focus.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
  );
  world.collide(camera.position, 0.3);
  camera.lookAt(focus.x, h, focus.z);
  player.pos.set(camera.position.x, 0, camera.position.z);
  player.yaw = Math.atan2(-(focus.x - camera.position.x), -(focus.z - camera.position.z));

  shared.globalLight.value += ((lightsOn ? 1 : 0.03) - shared.globalLight.value) * Math.min(1, dt * 6);
  world.panelMat.color.setScalar(0.15 + 0.85 * shared.globalLight.value);
  shared.time.value = t;
  shared.flPos.value.copy(camera.position);
  camera.getWorldDirection(shared.flDir.value);
  shared.flOn.value = player.flashlight ? 1 : 0;
  const k = shared.globalLight.value;
  fog.color.setRGB(0.25 * k + 0.01, 0.23 * k + 0.01, 0.14 * k + 0.01);
  renderer.renderer.setClearColor(fog.color);

  if (entity && !entity.preview) {
    const res = manager.update(dt, player);
    for (const ev of res.events) {
      if (ev.type === 'attack') {
        const f = $('flash');
        f.style.transition = 'none';
        f.style.opacity = '0.8';
        requestAnimationFrame(() => {
          f.style.transition = 'opacity 0.8s';
          f.style.opacity = '0';
        });
        $('state').textContent = `ATTACK — ${ev.cause}`;
      }
    }
    if (!res.events.some((e) => e.type === 'attack')) $('state').textContent = `STATE: ${entity.state.toUpperCase()}`;
  } else if (entity) {
    entity.update(dt, player);
    $('state').textContent = `POSE: ${pose.toUpperCase()}`;
  }
  renderer.render(scene, camera, t);
}

spawn();
refreshUi();
requestAnimationFrame(frame);
window.viewer = { manager, player, get entity() { return entity; }, orbit, set: (type, p, v) => { current = type; pose = p || 'idle'; variant = v ?? VARIANTS[type]?.[0] ?? null; live = false; spawn(); refreshUi(); }, setLive: (on) => { live = on; spawn(); refreshUi(); }, setLights: (on) => (lightsOn = on), shared };
