// Keyboard + mouse (pointer lock) and touch controls.
//
// Touch layout: the left part of the screen is a floating joystick that
// appears wherever the thumb lands; anywhere else on the screen drags the
// camera. Buttons (run, light, ears, drink, pause) sit along the right edge
// and never steal the look gesture from another finger.

const JOY_RADIUS = 56;

export class Input {
  constructor({ canvas, touchLayer, joyBase, joyKnob, settings }) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.look = { x: 0, y: 0 };
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.joyBase = joyBase;
    this.joyKnob = joyKnob;
    this.actions = [];
    this.sprintToggle = false;
    this.earsHeld = false;
    this.enabled = false;
    this.touchMode = false;
    this.onTouchMode = null;
    this.pointerLocked = false;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      // Some browsers report huge spikes on lock; drop them.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && this.onUnlock) this.onUnlock();
    });
    canvas.addEventListener('mousedown', () => {
      if (this.enabled && !this.touchMode && !this.pointerLocked) this.lockPointer();
    });

    const opts = { passive: false };
    touchLayer.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    touchLayer.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    touchLayer.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    touchLayer.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opts);
    // Any touch anywhere switches the UI into touch mode (hybrid devices).
    window.addEventListener('touchstart', () => this.setTouchMode(true), { passive: true });
    window.addEventListener('mousemove', (e) => {
      if (e.movementX || e.movementY) {
        if (this.touchMode && !this._sawTouchRecently()) this.setTouchMode(false);
      }
    });
    window.addEventListener('touchend', () => (this._lastTouch = performance.now()), { passive: true });
    // Stop iOS pinch-zoom and double-tap zoom while playing.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  _sawTouchRecently() {
    return this._lastTouch && performance.now() - this._lastTouch < 1500;
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    if (this.onTouchMode) this.onTouchMode(on);
  }

  lockPointer() {
    if (this.touchMode || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // Lock can be refused (e.g. too soon after Esc); the next click retries.
    }
  }

  unlockPointer() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  onKey(e, down) {
    const code = e.code;
    if (down) {
      if (!this.keys.has(code)) {
        if (code === 'KeyF') this.actions.push('flashlight');
        if (code === 'KeyE' || code === 'KeyQ') this.actions.push('drink');
        if (code === 'KeyP' || code === 'Escape') this.actions.push('pause');
      }
      this.keys.add(code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
    } else {
      this.keys.delete(code);
    }
  }

  clear() {
    this.keys.clear();
    this.joy.id = null;
    this.joy.x = this.joy.y = 0;
    this.lookTouch.id = null;
    this.earsHeld = false;
    this.joyBase.classList.remove('active');
  }

  // ---- Touch -----------------------------------------------------------

  onTouchStart(e) {
    e.preventDefault();
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      const joyZone = t.clientX < window.innerWidth * 0.42;
      if (joyZone && this.joy.id === null) {
        this.joy.id = t.identifier;
        this.joy.ox = t.clientX;
        this.joy.oy = t.clientY;
        this.joy.x = this.joy.y = 0;
        this.joyBase.style.left = `${t.clientX}px`;
        this.joyBase.style.top = `${t.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
        this.joyBase.classList.add('active');
      } else if (this.lookTouch.id === null) {
        this.lookTouch.id = t.identifier;
        this.lookTouch.x = t.clientX;
        this.lookTouch.y = t.clientY;
      }
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > JOY_RADIUS) {
          // Drag the base along so the stick never "runs out".
          const over = d - JOY_RADIUS;
          this.joy.ox += (dx / d) * over;
          this.joy.oy += (dy / d) * over;
          this.joyBase.style.left = `${this.joy.ox}px`;
          this.joyBase.style.top = `${this.joy.oy}px`;
          dx = t.clientX - this.joy.ox;
          dy = t.clientY - this.joy.oy;
        }
        this.joy.x = dx / JOY_RADIUS;
        this.joy.y = dy / JOY_RADIUS;
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === this.lookTouch.id) {
        const k = 2.2 * this.settings.touchSens / this.settings.lookSens;
        this.look.x += (t.clientX - this.lookTouch.x) * k;
        this.look.y += (t.clientY - this.lookTouch.y) * k;
        this.lookTouch.x = t.clientX;
        this.lookTouch.y = t.clientY;
      }
    }
  }

  onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        this.joy.id = null;
        this.joy.x = this.joy.y = 0;
        this.joyBase.classList.remove('active');
      } else if (t.identifier === this.lookTouch.id) {
        this.lookTouch.id = null;
      }
    }
  }

  // Wire a touch button. `hold` buttons report pressed state; others fire once.
  bindButton(el, { onPress, onRelease }) {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('pressed');
      if (onPress) onPress();
    };
    const up = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('pressed');
      if (onRelease) onRelease();
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    // Mouse fallback for testing touch UI on desktop.
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', (e) => el.classList.contains('pressed') && up(e));
  }

  // ---- Queries ---------------------------------------------------------

  consumeLook() {
    const out = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    return out;
  }

  consumeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  getMove() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.joy.id !== null) {
      let jx = this.joy.x, jy = -this.joy.y;
      const m = Math.hypot(jx, jy);
      if (m < 0.14) {
        jx = jy = 0;
      } else {
        // Rescale past the dead zone so small pushes still creep.
        const s = Math.min(1, (m - 0.14) / 0.86) / m;
        jx *= s;
        jy *= s;
      }
      x += jx;
      y += jy;
    }
    return { x, y };
  }

  get sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintToggle;
  }

  get coverEars() {
    return this.keys.has('KeyC') || this.keys.has('Space') || this.earsHeld;
  }
}
