import * as THREE from 'three';

// A simple jointed humanoid built from primitives. Every joint is a Group
// pivot, so entities animate by rotating joints procedurally. Proportions,
// materials and extra parts are up to each entity.
//
//   root
//    └ hips ─ spine ─ chest ─ neck ─ head
//       │              ├ armL: shoulder ─ elbow ─ hand
//       │              └ armR
//       ├ legL: hip ─ knee ─ foot
//       └ legR

export function buildHumanoid(o) {
  const p = {
    legLen: 0.9, torsoLen: 0.55, armLen: 0.72, headR: 0.11, headLen: 0.26,
    shoulder: 0.2, hipW: 0.1, limbR: 0.055, torsoR: 0.17, neckLen: 0.1,
    ...o,
  };
  const geos = [];
  const keep = (g) => (geos.push(g), g);
  const seg = (len, r0, r1, mat) => {
    const g = keep(new THREE.CylinderGeometry(r1, r0, len, 9));
    g.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(g, mat);
    return m;
  };
  const joint = (parent, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };

  const root = new THREE.Group();
  const hips = joint(root, 0, p.legLen, 0);
  const spine = joint(hips, 0, 0, 0);
  const torso = keep(new THREE.CylinderGeometry(p.torsoR, p.torsoR * 0.85, p.torsoLen, 10));
  torso.translate(0, p.torsoLen / 2, 0);
  const torsoMesh = new THREE.Mesh(torso, p.torsoMat || p.mat);
  torsoMesh.scale.z = p.torsoDepth ?? 0.65;
  spine.add(torsoMesh);
  const chest = joint(spine, 0, p.torsoLen, 0);
  const neck = joint(chest, 0, 0, 0);
  const neckMesh = new THREE.Mesh(keep(new THREE.CylinderGeometry(p.limbR * 0.9, p.limbR, p.neckLen, 8)), p.headMat || p.mat);
  neckMesh.position.y = p.neckLen / 2;
  neck.add(neckMesh);
  const head = joint(neck, 0, p.neckLen, 0);
  const headGeo = p.headGeo || keep(new THREE.SphereGeometry(p.headR, 16, 12));
  const headMesh = new THREE.Mesh(headGeo, p.headMat || p.mat);
  headMesh.scale.set(1, p.headLen / (2 * p.headR), 1.05);
  headMesh.position.y = p.headLen / 2;
  head.add(headMesh);

  const arm = (side) => {
    const shoulder = joint(chest, side * p.shoulder, -0.04, 0);
    const upper = p.armLen * 0.5, lower = p.armLen * 0.5;
    shoulder.add(seg(upper, p.limbR, p.limbR * 0.9, p.armMat || p.mat));
    const elbow = joint(shoulder, 0, -upper, 0);
    elbow.add(seg(lower, p.limbR * 0.85, p.limbR * 0.7, p.forearmMat || p.armMat || p.mat));
    const hand = joint(elbow, 0, -lower, 0);
    const hm = new THREE.Mesh(keep(new THREE.BoxGeometry(p.limbR * 1.6, p.handLen ?? 0.14, p.limbR * 0.8)), p.handMat || p.headMat || p.mat);
    hm.position.y = -(p.handLen ?? 0.14) / 2;
    hand.add(hm);
    return { shoulder, elbow, hand };
  };
  const leg = (side) => {
    const hip = joint(hips, side * p.hipW, 0, 0);
    const upper = p.legLen * 0.5, lower = p.legLen * 0.5;
    hip.add(seg(upper, p.limbR * 1.35, p.limbR * 1.1, p.legMat || p.mat));
    const knee = joint(hip, 0, -upper, 0);
    knee.add(seg(lower, p.limbR * 1.05, p.limbR * 0.85, p.legMat || p.mat));
    const foot = joint(knee, 0, -lower, 0);
    const fm = new THREE.Mesh(keep(new THREE.BoxGeometry(p.limbR * 1.8, 0.06, 0.24)), p.footMat || p.legMat || p.mat);
    fm.position.set(0, 0.03, 0.06);
    foot.add(fm);
    return { hip, knee, foot };
  };
  const rig = {
    root, hips, spine, chest, neck, head, headMesh, torsoMesh, p, geos,
    armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1),
  };
  rig.base = snapshot(rig);
  return rig;
}

// Remember the rest pose so animations can blend from it each frame.
function snapshot(rig) {
  const out = [];
  rig.root.traverse((o) => {
    if (o.isGroup) out.push([o, o.position.clone(), o.rotation.clone()]);
  });
  return out;
}

export function resetPose(rig) {
  for (const [o, p, r] of rig.base) {
    o.position.copy(p);
    o.rotation.copy(r);
  }
}

// Upright walk/run cycle. `amt` 0..1 scales the stride.
export function walk(rig, phase, amt, opts = {}) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const swing = 0.55 * amt * (opts.stride ?? 1);
  rig.legL.hip.rotation.x = s * swing;
  rig.legR.hip.rotation.x = -s * swing;
  rig.legL.knee.rotation.x = Math.max(0, -c) * swing * 1.4;
  rig.legR.knee.rotation.x = Math.max(0, c) * swing * 1.4;
  rig.armL.shoulder.rotation.x = -s * swing * (opts.armSwing ?? 0.8);
  rig.armR.shoulder.rotation.x = s * swing * (opts.armSwing ?? 0.8);
  rig.armL.elbow.rotation.x = -0.2 * amt;
  rig.armR.elbow.rotation.x = -0.2 * amt;
  rig.hips.position.y = rig.p.legLen - Math.abs(c) * 0.04 * amt;
  rig.spine.rotation.z = s * 0.04 * amt;
}

// Breathing and small weight shifts.
export function idle(rig, t, amt = 1) {
  rig.chest.scale.setScalar(1 + Math.sin(t * 1.6) * 0.015 * amt);
  rig.spine.rotation.z += Math.sin(t * 0.7) * 0.02 * amt;
  rig.head.rotation.y += Math.sin(t * 0.43) * 0.08 * amt;
}

// Both arms reaching forward (grab / lunge).
export function reach(rig, k) {
  for (const a of [rig.armL, rig.armR]) {
    a.shoulder.rotation.x = -1.45 * k;
    a.elbow.rotation.x = -0.2 * k;
  }
  rig.spine.rotation.x = 0.25 * k;
}

// Turn the head toward a world point (yaw/pitch, clamped).
export function lookAt(rig, root, target, limit = 1.2) {
  const p = new THREE.Vector3();
  rig.head.getWorldPosition(p);
  const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
  const yaw = Math.atan2(dx, dz) - root.rotation.y;
  let y = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  y = Math.max(-limit, Math.min(limit, y));
  rig.head.rotation.y = y;
  rig.head.rotation.x = Math.max(-0.6, Math.min(0.6, -Math.atan2(dy, Math.hypot(dx, dz))));
}
