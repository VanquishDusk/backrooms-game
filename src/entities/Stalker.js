import * as THREE from 'three';
import { DIRS } from '../world/GridMap.js';

// "Dark figures stalking them between the corridors." Nobody knows whether
// it is real. It feeds on a wanderer's slipping sanity: first glimpsed far
// away, then following, and finally coming for you.

function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 192);
  ctx.fillStyle = 'rgba(255,255,240,0.95)';
  for (const x of [42, 86]) {
    ctx.beginPath();
    ctx.ellipse(x, 70, 7, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Too-wide grin.
  ctx.strokeStyle = 'rgba(255,255,240,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, 112);
  ctx.quadraticCurveTo(64, 160, 110, 112);
  ctx.quadraticCurveTo(64, 140, 18, 112);
  ctx.stroke();
  for (let i = 0; i < 13; i++) {
    const x = 26 + i * 6.3;
    const t = (x - 18) / 92;
    const top = 112 + Math.sin(t * Math.PI) * 26;
    const bot = 112 + Math.sin(t * Math.PI) * 44;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bot);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class Stalker {
  constructor(scene, world, rng) {
    this.world = world;
    this.map = world.map;
    this.rng = rng;
    this.state = 'hidden'; // hidden | watching | hunting | vanishing
    this.timer = 0;
    this.cooldown = 20;
    this.stare = 0;
    this.pos = new THREE.Vector3();
    this.flow = null;
    this.flowTimer = 0;
    this.seen = false;
    this.opacity = 0;

    const g = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true });
    this.bodyMat = dark;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.65, 8), dark);
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), dark);
    head.scale.set(1, 1.35, 1);
    head.position.y = 2.05;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), dark);
    neck.position.y = 1.85;
    g.add(body, head, neck);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.45, 6), dark);
      arm.position.set(s * 0.25, 1.1, 0);
      arm.rotation.z = s * 0.06;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.55, 6), dark);
      leg.position.set(s * 0.1, 0.18, 0);
      g.add(arm, leg);
    }
    this.faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, fog: false, depthWrite: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), this.faceMat);
    face.position.set(0, 2.05, 0.205);
    g.add(face);
    g.visible = false;
    this.mesh = g;
    scene.add(g);
  }

  setOpacity(a) {
    this.opacity = a;
    this.bodyMat.opacity = a;
    this.faceMat.opacity = a;
    this.mesh.visible = a > 0.01;
  }

  // Is the figure inside the player's view and not behind a wall?
  isSeenBy(player) {
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const cos = (dx * fx + dz * fz) / Math.max(d, 0.001);
    return cos > 0.62 && this.map.hasLineOfSight(player.pos.x, player.pos.z, this.pos.x, this.pos.z);
  }

  // Pick a cell `minD..maxD` steps from the player, preferring ones in or out of view.
  findSpawn(player, minD, maxD, wantVisible) {
    const [px, py] = this.map.cellAt(player.pos.x, player.pos.z);
    const dist = this.map.bfs(px, py);
    const cands = [];
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < minD || dist[i] > maxD) continue;
      const x = i % this.map.cols, y = (i / this.map.cols) | 0;
      const [wx, wz] = this.map.cellCenter(x, y);
      if (this.world.pitAt(wx, wz)) continue;
      this.pos.set(wx, 0, wz);
      if (this.isSeenBy(player) === wantVisible) cands.push([wx, wz]);
    }
    if (!cands.length) return false;
    const [x, z] = this.rng.pick(cands);
    this.pos.set(x, 0, z);
    return true;
  }

  vanish() {
    if (this.state === 'hidden' || this.state === 'vanishing') return false;
    this.state = 'vanishing';
    this.timer = 0;
    this.cooldown = this.rng.range(12, 30);
    return true;
  }

  // Returns events: 'appear' | 'vanish' | 'caught'.
  update(dt, player, sanity) {
    const events = [];
    this.cooldown -= dt;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    switch (this.state) {
      case 'hidden': {
        if (this.cooldown > 0 || sanity > 70) break;
        if (sanity < 25 && this.findSpawn(player, 7, 11, false)) {
          this.state = 'hunting';
          this.flowTimer = 0;
          events.push('hunt');
        } else if (this.findSpawn(player, 4, 7, true)) {
          this.state = 'watching';
          this.timer = 0;
          this.stare = 0;
          events.push('appear');
        } else {
          this.cooldown = 3;
        }
        break;
      }
      case 'watching': {
        this.timer += dt;
        this.setOpacity(Math.min(0.92, this.timer * 2));
        const seen = this.isSeenBy(player);
        if (seen) this.stare += dt;
        // It never lets you get close, and never lets you stare for long.
        if (dist < 7 || this.stare > 2.2 || this.timer > 12) {
          this.vanish();
          events.push('vanish');
        } else if (sanity < 25 && !seen) {
          this.state = 'hunting';
          events.push('hunt');
        }
        break;
      }
      case 'hunting': {
        this.setOpacity(Math.min(0.95, this.opacity + dt * 1.5));
        if (sanity > 40) {
          this.vanish();
          events.push('vanish');
          break;
        }
        this.flowTimer -= dt;
        if (this.flowTimer <= 0 || !this.flow) {
          const [px, py] = this.map.cellAt(player.pos.x, player.pos.z);
          this.flow = this.map.bfs(px, py, this.flow);
          this.flowTimer = 0.35;
        }
        this.seen = this.isSeenBy(player);
        const speed = this.seen ? 1.6 : 3.7;
        let tx = player.pos.x, tz = player.pos.z;
        const [cx, cy] = this.map.cellAt(this.pos.x, this.pos.z);
        const here = this.flow[this.map.idx(cx, cy)];
        if (here > 0) {
          for (let d = 0; d < 4; d++) {
            if (!this.map.canMove(cx, cy, d)) continue;
            const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
            if (this.flow[this.map.idx(nx, ny)] === here - 1) {
              [tx, tz] = this.map.cellCenter(nx, ny);
              break;
            }
          }
        }
        const mx = tx - this.pos.x, mz = tz - this.pos.z;
        const ml = Math.hypot(mx, mz);
        if (ml > 0.01) {
          const step = Math.min(ml, speed * dt);
          this.pos.x += (mx / ml) * step;
          this.pos.z += (mz / ml) * step;
        }
        if (dist < 0.85 && !player.dead) events.push('caught');
        break;
      }
      case 'vanishing': {
        this.timer += dt;
        this.setOpacity(Math.max(0, this.opacity - dt * 3));
        if (this.opacity <= 0.01) this.state = 'hidden';
        break;
      }
    }

    // Always face the player; a little sway so it never looks quite still.
    this.mesh.position.set(this.pos.x, Math.sin(performance.now() * 0.002) * 0.02, this.pos.z);
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.mesh.rotation.z = Math.sin(performance.now() * 0.0013) * 0.03;
    return events;
  }

  distanceTo(player) {
    if (this.state === 'hidden') return Infinity;
    return Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse((o) => o.geometry && o.geometry.dispose());
    this.bodyMat.dispose();
    this.faceMat.map.dispose();
    this.faceMat.dispose();
  }
}
