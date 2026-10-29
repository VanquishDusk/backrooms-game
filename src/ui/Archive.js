import { LEVELS, FIRST_LEVEL } from '../levels/registry.js';
import { listPhotos, deletePhoto } from '../core/photos.js';
import { randomSeedString } from '../core/rng.js';
import { LEVEL_INFO } from './levelInfo.js';

// The main menu's archive: every level as a VHS tape on a shelf, with your
// newest photo of it as the cover. Levels you haven't found are blank
// tapes marked ???. Pick a tape to watch your footage and play the level.

const $ = (id) => document.getElementById(id);

export class Archive {
  constructor(game) {
    this.game = game;
    this.urls = [];
    this.byLevel = new Map();
    this.def = null;
    this.list = [];
    this.index = 0;
    document.documentElement.style.setProperty('--static', `url(${staticTile()})`);
    const tap = (id, fn) => $(id).addEventListener('click', (e) => {
      e.preventDefault();
      game.audio.unlock();
      game.audio.click();
      fn();
    });
    tap('tv-prev', () => this.step(-1));
    tap('tv-next', () => this.step(1));
    tap('tv-del', () => this.erase());
    tap('tv-save', () => this.save());
    tap('tape-back', () => game.showScreen('menu'));
    tap('tape-play', () => this.def && game.startRun(randomSeedString(), this.def.id));
    window.addEventListener('keydown', (e) => {
      if (game.screen !== 'tape') return;
      if (e.code === 'ArrowLeft') this.step(-1);
      if (e.code === 'ArrowRight') this.step(1);
      if (e.code === 'Escape') game.showScreen('menu');
    });
  }

  reached(id) {
    return id === FIRST_LEVEL || this.game.stats.unlocked.includes(id);
  }

  async refresh() {
    let photos = [];
    try {
      photos = await listPhotos();
    } catch {
      photos = [];
    }
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    this.byLevel = new Map();
    for (const p of photos) {
      p.url = URL.createObjectURL(p.blob);
      this.urls.push(p.url);
      if (!this.byLevel.has(p.level)) this.byLevel.set(p.level, []);
      this.byLevel.get(p.level).push(p);
    }
    this.render();
    if (this.game.screen === 'tape' && this.def) this.open(this.def, this.index);
  }

  render() {
    const shelf = $('unlocked-levels');
    shelf.textContent = '';
    const defs = Object.values(LEVELS).sort((a, b) => a.number - b.number);
    let found = 0;
    defs.forEach((def, k) => {
      const open = this.reached(def.id);
      if (open) found++;
      const shots = this.byLevel.get(def.id) || [];
      const b = document.createElement('button');
      b.className = `tape${open ? '' : ' locked'}`;
      b.style.setProperty('--tilt', `${((k * 37) % 7 - 3) * 0.4}deg`);
      b.style.setProperty('--hue', `${(k * 53) % 360}`);
      const cover = open && shots.length
        ? `<img src="${shots[0].url}" alt="">`
        : `<span class="static"></span><span class="nosig">${open ? 'NO FOOTAGE' : 'NO SIGNAL'}</span>`;
      const cls = def.difficulty != null ? `CLASS ${def.difficulty}` : 'CLASS ?';
      b.innerHTML = `
        <span class="tape-window">${cover}</span>
        <span class="tape-label">
          <b>${open ? def.name.toUpperCase() : 'LEVEL ???'}</b>
          <em>${open ? def.title : '???'}</em>
        </span>
        <span class="tape-foot"><i>${open ? cls : 'UNDISCOVERED'}</i><i>${open ? `${shots.length} PHOTO${shots.length === 1 ? '' : 'S'}` : ''}</i></span>
        <span class="tape-reels"><i></i><i></i></span>`;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        this.game.audio.unlock();
        if (!open) {
          this.game.audio.click();
          b.classList.remove('nope');
          void b.offsetWidth;
          b.classList.add('nope');
          return;
        }
        this.game.audio.clank?.(0, 0.25);
        this.open(def);
      });
      shelf.appendChild(b);
    });
    $('archive-count').textContent = `${found} / ${defs.length} FOUND`;
  }

  open(def, index = 0) {
    this.def = def;
    this.list = this.byLevel.get(def.id) || [];
    this.index = Math.max(0, Math.min(index, this.list.length - 1));
    const st = this.game.stats;
    $('tape-num').textContent = def.name.toUpperCase();
    $('tape-title').textContent = def.title.toUpperCase();
    $('tape-class').textContent = def.difficulty != null ? `SURVIVAL DIFFICULTY ${def.difficulty}` : '';
    $('tape-blurb').textContent = LEVEL_INFO[def.id] || '';
    const visits = st.visits?.[def.id] || 0;
    $('tape-stats').textContent = `VISITED ${visits} TIME${visits === 1 ? '' : 'S'} · ${this.list.length} PHOTO${this.list.length === 1 ? '' : 'S'} ON TAPE`;
    this.game.showScreen('tape');
    this.show();
  }

  show() {
    const p = this.list[this.index];
    const img = $('tv-img');
    img.style.display = p ? 'block' : 'none';
    if (p) img.src = p.url;
    $('tv-static').style.display = p ? 'none' : 'block';
    $('tv-msg').textContent = p ? '' : 'NO FOOTAGE · PRESS V (OR THE CAMERA BUTTON) IN THIS LEVEL';
    $('tv-count').textContent = p ? `${this.index + 1} / ${this.list.length}` : '0 / 0';
    for (const id of ['tv-prev', 'tv-next', 'tv-del', 'tv-save']) $(id).disabled = !p;
    const scr = $('tv-screen');
    scr.classList.remove('roll');
    void scr.offsetWidth;
    scr.classList.add('roll');
  }

  step(k) {
    if (!this.list.length) return;
    this.index = (this.index + k + this.list.length) % this.list.length;
    this.show();
  }

  async erase() {
    const p = this.list[this.index];
    if (!p) return;
    await deletePhoto(p.id);
    await this.refresh();
  }

  save() {
    const p = this.list[this.index];
    if (!p) return;
    const a = document.createElement('a');
    a.href = p.url;
    const d = new Date(p.time);
    a.download = `backrooms-${p.level}-${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

// A tile of TV static, animated in CSS by sliding it about.
function staticTile() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
