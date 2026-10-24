import { Game } from './core/Game.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  document.body.innerHTML = '<p style="padding:24px;font-size:22px;color:#ece3b0">The Backrooms needs WebGL. Try another browser or device.</p>';
} else {
  window.game = new Game();
}
