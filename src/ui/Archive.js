import { LEVELS, FIRST_LEVEL } from '../levels/registry.js';
import { listPhotos, deletePhoto } from '../core/photos.js';
import { randomSeedString } from '../core/rng.js';
import { LEVEL_INFO } from './levelInfo.js';
import { STICKERS, ALL_SUBJECTS, subjectInfo } from '../core/extras.js';

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
    tap('tape-back', () => {
      game.showScreen('menu');
      if (this.lastPane) this.modal(this.lastPane);
    });
    // The wiki-style menu: everything opens in its own window.
    for (const b of document.querySelectorAll('[data-modal]')) {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        game.audio.unlock();
        game.audio.click();
        this.drawer(false);
        this.modal(b.dataset.modal);
      });
    }
    for (const b of document.querySelectorAll('[data-go]')) {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        game.audio.unlock();
        game.audio.click();
        this.modal(null);
        game.returnTo = 'menu';
        game.showScreen(b.dataset.go);
      });
    }
    tap('wm-close', () => this.modal(null));
    tap('btn-seedopen', () => this.modal('seed'));
    tap('wnav-burger', () => this.drawer());
    $('wiki-modal').addEventListener('click', (e) => {
      if (e.target.id === 'wiki-modal') this.modal(null);
    });
    for (const id of ['btn-howto', 'btn-settings', 'btn-fullscreen']) $(id).addEventListener('click', () => this.drawer(false));
    tap('tape-play', () => this.def && game.startRun(randomSeedString(), this.def.id));
    window.addEventListener('keydown', (e) => {
      if (game.screen !== 'tape') return;
      if (e.code === 'ArrowLeft') this.step(-1);
      if (e.code === 'ArrowRight') this.step(1);
      if (e.code === 'Escape') {
        game.showScreen('menu');
        if (this.lastPane) this.modal(this.lastPane);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (game.screen === 'menu' && e.code === 'Escape' && this.pane) this.modal(null);
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

  modal(name) {
    const m = $('wiki-modal');
    this.pane = name;
    if (!name) {
      m.classList.add('hidden');
      return;
    }
    if (name !== 'seed' && name !== 'info') this.lastPane = name;
    const titles = { levels: 'Level Archive', sub: 'Sub-Levels', guide: 'Field Guide', stickers: 'Stickers', info: 'Info Pages', seed: 'Play a Seed' };
    $('wm-title').textContent = titles[name];
    $('wm-meta').textContent = { levels: this.counts?.main, sub: this.counts?.sub, guide: this.counts?.guide, stickers: this.counts?.stickers }[name] || '';
    for (const p of document.querySelectorAll('.wm-pane')) p.classList.toggle('hidden', p.dataset.pane !== name);
    m.classList.remove('hidden');
    m.querySelector('.wm-body').scrollTop = 0;
    if (name === 'seed') setTimeout(() => $('seed-input').focus(), 50);
  }

  drawer(on) {
    const d = $('wiki-drawer');
    d.classList.toggle('hidden', on === undefined ? !d.classList.contains('hidden') : !on);
  }

  render() {
    $('unlocked-levels').textContent = '';
    $('sub-levels').textContent = '';
    const defs = Object.values(LEVELS).sort((a, b) => a.number - b.number);
    let found = 0, foundSub = 0, nMain = 0, nSub = 0;
    defs.forEach((def, k) => {
      const sub = !Number.isInteger(def.number);
      const shelf = $(sub ? 'sub-levels' : 'unlocked-levels');
      const open = this.reached(def.id);
      if (sub) {
        nSub++;
        if (open) foundSub++;
      } else {
        nMain++;
        if (open) found++;
      }
      const shots = this.byLevel.get(def.id) || [];
      const b = document.createElement('button');
      b.className = `tape${open ? '' : ' locked'}`;
      b.style.setProperty('--tilt', `${((k * 37) % 7 - 3) * 0.4}deg`);
      b.style.setProperty('--hue', `${(k * 53) % 360}`);
      const cover = open && shots.length
        ? `<img src="${shots[0].url}" alt="">`
        : `<span class="static"></span><span class="nosig">${open ? 'NO FOOTAGE' : 'NO SIGNAL'}</span>`;
      const st = this.game.stats;
      const stamp = open && st.survived?.[def.id] ? '<span class="stamp">SURVIVED</span>' : '';
      const deaths = open ? st.deathsAt?.[def.id] || 0 : 0;
      const cls = def.difficulty != null ? `CLASS ${def.difficulty}` : 'CLASS ?';
      b.innerHTML = `
        <span class="tape-window">${cover}${stamp}</span>
        <span class="tape-label">
          <b>${open ? def.name.toUpperCase() : 'LEVEL ???'}</b>
          <em>${open ? def.title : '???'}</em>
        </span>
        <span class="tape-foot"><i>${open ? cls : 'UNDISCOVERED'}</i><i>${open ? `${deaths ? `<span class="skulls">☠${deaths}</span> · ` : ''}${shots.length} PHOTO${shots.length === 1 ? '' : 'S'}` : ''}</i></span>
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
    this.counts = this.counts || {};
    this.counts.main = `${found} / ${nMain} FOUND`;
    this.counts.sub = `${foundSub} / ${nSub} FOUND`;
    $('archive-count').textContent = this.counts.main;
    $('sub-count').textContent = this.counts.sub;
    this.renderGuide();
    this.renderStickers();
  }

  renderGuide() {
    const guide = this.game.extras.guide;
    const el = $('guide');
    el.textContent = '';
    let n = 0;
    ALL_SUBJECTS.forEach((type, k) => {
      const g = guide[type];
      const info = subjectInfo(type);
      const c = document.createElement('div');
      c.className = `gcard${g ? '' : ' unknown'}`;
      c.style.setProperty('--tilt', `${((k * 37) % 7 - 3) * 0.5}deg`);
      if (g) {
        n++;
        c.innerHTML = `<div class="gpic"><img src="${g.thumb}" alt=""></div><b></b><p></p><small></small>`;
        c.querySelector('b').textContent = info.name;
        c.querySelector('p').textContent = info.blurb;
        c.querySelector('small').textContent = `SEEN IN ${g.level.toUpperCase()}`;
      } else {
        c.innerHTML = '<div class="gpic"><span class="static"></span></div><b>???</b><p>Not documented yet.</p>';
      }
      el.appendChild(c);
    });
    this.counts = this.counts || {};
    this.counts.guide = `${n} / ${ALL_SUBJECTS.length} DOCUMENTED`;
    $('guide-count').textContent = this.counts.guide;
  }

  renderStickers() {
    const got = this.game.extras.got;
    const el = $('stickers');
    el.textContent = '';
    let n = 0;
    for (const s of STICKERS) {
      const has = !!got[s.id];
      if (has) n++;
      const d = document.createElement('div');
      d.className = `sticker${has ? ' got' : ''}`;
      d.innerHTML = '<span class="sicon"></span><span class="stext"><b></b><span></span></span>';
      d.querySelector('.sicon').textContent = s.icon;
      d.querySelector('b').textContent = has ? s.name : '???';
      d.querySelector('.stext span').textContent = s.desc;
      el.appendChild(d);
    }
    this.counts.stickers = `${n} / ${STICKERS.length} EARNED`;
    $('sticker-count').textContent = this.counts.stickers;
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
    $('wiki-modal').classList.add('hidden');
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
