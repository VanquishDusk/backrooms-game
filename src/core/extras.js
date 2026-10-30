import * as THREE from 'three';
import { load, save } from './storage.js';
import { ENTITY_TYPES } from '../entities/lib/index.js';

// Little things that make another run worth it:
//   - Stickers: small goals, each with a sticker for the archive
//   - The Field Guide: photograph an entity to document it, and your photo
//     becomes its picture in the guide
//   - The route: every run remembers which levels it went through
//   - Tonight's tape: one seed a day, the same for everyone

const $ = (id) => document.getElementById(id);

export const STICKERS = [
  { id: 'out0', icon: '🚪', name: 'NOCLIPPED', desc: 'Get out of Level 0.' },
  { id: 'fast0', icon: '⏱', name: 'IN A HURRY', desc: 'Get out of Level 0 in under a minute.' },
  { id: 'deep5', icon: '🏨', name: 'CHECKED IN', desc: 'Reach Level 5 in one run.' },
  { id: 'dark6', icon: '🌑', name: 'LIGHTS OUT', desc: 'Reach Level 6.' },
  { id: 'sea7', icon: '🌊', name: 'SEA LEGS', desc: 'Reach Level 7.' },
  { id: 'thing', icon: '🐍', name: 'MONSTER HUNTER', desc: 'Sink the Thing on Level 7.' },
  { id: 'sky63', icon: '☁', name: 'HEAD IN THE CLOUDS', desc: 'Find Level 63.' },
  { id: 'medi', icon: '🧘', name: 'BREATHE', desc: 'Sit at a Meditation Point.' },
  { id: 'end601', icon: '📚', name: 'THE END?', desc: 'Find Level 601.' },
  { id: 'home94', icon: '🏡', name: 'WELCOME HOME', desc: 'Escape Level 601.' },
  { id: 'night94', icon: '🌙', name: 'NIGHT OWL', desc: 'Make it to dawn in Level 94.' },
  { id: 'king', icon: '👑', name: 'ROYAL AUDIENCE', desc: 'Pass the Animated King\'s test.' },
  { id: 'red14', icon: '🍁', name: 'PARADISE', desc: 'Find Level 14. (Then leave.)' },
  { id: 'enric', icon: '🤝', name: 'COMPANY', desc: 'Meet Enric in Level 15.' },
  { id: 'out', icon: '☀', name: 'YOU MADE IT', desc: 'Leave the Backrooms.' },
  { id: 'tour5', icon: '🧳', name: 'TOURIST', desc: 'Pass through 5 levels in one run.' },
  { id: 'tour8', icon: '🗺', name: 'FREQUENT FLYER', desc: 'Pass through 8 levels in one run.' },
  { id: 'found10', icon: '📼', name: 'COLLECTOR', desc: 'Find 10 levels.' },
  { id: 'time15', icon: '⌛', name: 'STILL HERE', desc: 'Last 15 minutes in one run.' },
  { id: 'photo10', icon: '📷', name: 'CAMERAMAN', desc: 'Take 10 photos.' },
  { id: 'guide3', icon: '🔎', name: 'FIELD RESEARCH', desc: 'Document 3 entities.' },
  { id: 'guide8', icon: '📓', name: 'NATURALIST', desc: 'Document 8 entities.' },
  { id: 'bag', icon: '🎒', name: 'PACKED', desc: 'Fill all four backpack slots.' },
  { id: 'drink10', icon: '💧', name: 'HYDRATED', desc: 'Have 10 drinks.' },
  { id: 'stun', icon: '🔧', name: 'BONK', desc: 'Stun something.' },
  { id: 'die10', icon: '💀', name: 'FREQUENT VISITOR', desc: 'Get lost 10 times.' },
  { id: 'daily', icon: '📅', name: 'TONIGHT\'S TAPE', desc: 'Play tonight\'s tape.' },
];

// Things you can document that aren't in the entity library.
const EXTRA_SUBJECTS = {
  host: { name: 'The Host', blurb: 'Very tall, a black suit, white gloves, a grin pulled too wide. It never runs.' },
  animation: { name: 'Animation', blurb: 'A 1930s cartoon come to life, twelve frames a second. It hates anything that isn\'t animated.' },
  roboman: { name: 'Robo-Man', blurb: 'A wind-up tin robot toy. Guards the castle. Don\'t touch anything while it\'s watching.' },
  king: { name: 'The Animated King', blurb: 'On his throne at the end of the red carpet. He\'d like you to be animated too.' },
  thing: { name: 'The Thing on Level 7', blurb: 'Seventy metres of sea serpent. It comes for anything out in open water.' },
  children: { name: 'The Children', blurb: 'They stand in rows and howl at the moon, waiting to become whole.' },
  enric: { name: 'Enric', blurb: 'The only person living in Level 15. Two years and counting.' },
};

export function subjectInfo(type) {
  return EXTRA_SUBJECTS[type] || ENTITY_TYPES[type] || { name: type, blurb: '' };
}
export const ALL_SUBJECTS = [...Object.keys(ENTITY_TYPES), ...Object.keys(EXTRA_SUBJECTS)];

export function dailySeed(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return { key: `${y}-${m}-${day}`, seed: `TAPE${y}${m}${day}` };
}

export class Extras {
  constructor(game) {
    this.game = game;
    this.got = load('stickers', {});
    this.guide = load('guide', {});
    this.queue = [];
    this.showing = false;
    this.route = [];
    this.newThisRun = [];
    this.el = $('sticker-toast');
  }

  // ---- Stickers --------------------------------------------------------------------

  award(id) {
    if (this.got[id]) return false;
    const s = STICKERS.find((x) => x.id === id);
    if (!s) return false;
    this.got[id] = Date.now();
    save('stickers', this.got);
    this.newThisRun.push(id);
    this.toast(s.icon, 'NEW STICKER', s.name, s.desc);
    this.game.audio.pickup?.();
    return true;
  }

  toast(icon, kicker, title, sub) {
    this.queue.push({ icon, kicker, title, sub });
    if (!this.showing) this.next();
  }

  next() {
    const t = this.queue.shift();
    if (!t) {
      this.showing = false;
      return;
    }
    this.showing = true;
    this.el.querySelector('.st-icon').textContent = t.icon;
    this.el.querySelector('.st-kicker').textContent = t.kicker;
    this.el.querySelector('.st-title').textContent = t.title;
    this.el.querySelector('.st-sub').textContent = t.sub;
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    setTimeout(() => {
      this.el.classList.remove('show');
      setTimeout(() => this.next(), 400);
    }, 3200);
  }

  // ---- Events from the game -----------------------------------------------------------

  runStart(seed) {
    this.route = [];
    this.newThisRun = [];
    this.runSeed = seed;
    if (seed === dailySeed().seed) this.award('daily');
  }

  enter(id) {
    const from = this.route[this.route.length - 1];
    this.route.push(id);
    const g = this.game;
    if (from === 'level0' && id !== 'level0') {
      this.award('out0');
      if (g.runTime < 60) this.award('fast0');
    }
    const reach = { level5: 'deep5', level6: 'dark6', level7: 'sea7', level63: 'sky63', level601: 'end601', level14: 'red14' };
    if (reach[id]) this.award(reach[id]);
    if (id === 'level94' && from === 'level601') this.award('home94');
    const distinct = new Set(this.route).size;
    if (distinct >= 5) this.award('tour5');
    if (distinct >= 8) this.award('tour8');
    if ((g.stats.unlocked?.length || 0) + 1 >= 10) this.award('found10');
    this.recordDaily();
  }

  escaped(target) {
    if (target === 'outside') this.award('out');
    this.route.push(target);
    this.recordDaily(target === 'outside');
  }

  died() {
    if ((this.game.stats.deaths || 0) >= 10) this.award('die10');
  }

  tick(dt) {
    const g = this.game;
    if (g.runTime > 900) this.award('time15');
    if (g.player.items.length >= 4) this.award('bag');
  }

  drank() {
    const st = this.game.stats;
    st.drinks = (st.drinks || 0) + 1;
    if (st.drinks >= 10) this.award('drink10');
  }

  // How far did tonight's tape get?
  recordDaily(escaped = false) {
    const d = dailySeed();
    if (this.runSeed !== d.seed) return;
    const st = this.game.stats;
    if (!st.daily || st.daily.key !== d.key) st.daily = { key: d.key, best: 0, escaped: false };
    st.daily.best = Math.max(st.daily.best, new Set(this.route).size);
    st.daily.escaped = st.daily.escaped || escaped;
    save('stats', st);
  }

  // ---- The route, for the end screens ----------------------------------------------------

  routeText() {
    const names = this.route.map((id) => {
      const def = this.game.levelDefs[id];
      if (def) return def.name.replace('Level ', 'L').toUpperCase();
      return id === 'outside' ? 'OUTSIDE' : id.replace('level', 'L').replace('_', '.').toUpperCase();
    });
    // Collapse repeats ("L0 ×2").
    const out = [];
    for (const n of names) {
      const last = out[out.length - 1];
      if (last && last.n === n) last.k++;
      else out.push({ n, k: 1 });
    }
    return out.map((o) => (o.k > 1 ? `${o.n} ×${o.k}` : o.n)).join('  →  ');
  }

  stickersThisRun() {
    return this.newThisRun.map((id) => STICKERS.find((s) => s.id === id)?.icon).join(' ');
  }

  // ---- The Field Guide: what's in the shot? --------------------------------------------------

  documentShot(camera, canvas) {
    const g = this.game;
    const L = g.level;
    if (!L) return;
    const subjects = [];
    for (const e of L.entities?.list || []) {
      if (!e.alive || !e.type || e.type === 'ghost') continue;
      if (e.root && !e.root.visible) continue;
      subjects.push({ type: e.type, x: e.pos.x, y: (e.pos.y || 0) + 1, z: e.pos.z });
    }
    if (L.photoSubjects) subjects.push(...L.photoSubjects());
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const p = new THREE.Vector3();
    const map = L.world?.map;
    const found = [];
    for (const s of subjects) {
      p.set(s.x, s.y, s.z);
      const d = p.distanceTo(camera.position);
      if (d > (s.range || 28) || !frustum.containsPoint(p)) continue;
      if (map && map.hasLineOfSight && !s.noLos && !L.photoNoLos && !map.hasLineOfSight(camera.position.x, camera.position.z, s.x, s.z)) continue;
      if (!found.includes(s.type)) found.push(s.type);
    }
    let added = 0;
    for (const type of found) {
      if (this.guide[type]) continue;
      // A small copy of the shot for the guide.
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 120;
      c.getContext('2d').drawImage(canvas, 0, 0, 160, 120);
      this.guide[type] = { when: Date.now(), level: g.levelDef.name, thumb: c.toDataURL('image/jpeg', 0.7) };
      const info = subjectInfo(type);
      this.toast('🔎', 'DOCUMENTED', info.name.toUpperCase(), `Added to the Field Guide (${Object.keys(this.guide).length} / ${ALL_SUBJECTS.length}).`);
      added++;
    }
    if (added) {
      save('guide', this.guide);
      const n = Object.keys(this.guide).length;
      if (n >= 3) this.award('guide3');
      if (n >= 8) this.award('guide8');
    }
  }

  photoTaken() {
    const st = this.game.stats;
    st.photos = (st.photos || 0) + 1;
    save('stats', st);
    if (st.photos >= 10) this.award('photo10');
  }
}
