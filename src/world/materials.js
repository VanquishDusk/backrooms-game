import * as THREE from 'three';

// World surfaces use a small custom shader instead of three's lit materials:
// light from hundreds of fixtures is baked into a lightmap on the CPU, and
// only the flashlight and a handful of flickering fixtures are dynamic. This
// keeps the level cheap enough for phones.

export const MAX_DYN_LIGHTS = 4;
export const MAX_DECAY = 12;

export const SURFACE = { WALL: 0, FLOOR: 1, CEILING: 2, PLAIN: 3 };

// Uniform objects shared by every world material, so one write per frame
// updates all of them.
export function createSharedUniforms(fog) {
  const dynPos = [], dynCol = [], decay = [];
  for (let i = 0; i < MAX_DECAY; i++) decay.push(new THREE.Vector4(0, 0, 0, 0));
  for (let i = 0; i < MAX_DYN_LIGHTS; i++) {
    dynPos.push(new THREE.Vector4(0, -100, 0, 0));
    dynCol.push(new THREE.Color(0, 0, 0));
  }
  return {
    lightMap: { value: null },
    lightMap2: { value: null },
    emergency: { value: 0 },
    lmScale: { value: new THREE.Vector2(1, 1) },
    globalLight: { value: 1 },
    ambient: { value: new THREE.Color(0.05, 0.045, 0.035) },
    ceilH: { value: 2.7 },
    time: { value: 0 },
    flPos: { value: new THREE.Vector3() },
    flDir: { value: new THREE.Vector3(0, 0, -1) },
    flOn: { value: 0 },
    dynPos: { value: dynPos },
    dynCol: { value: dynCol },
    decay: { value: decay },
    fogColor: { value: fog.color },
    fogDensity: { value: fog.density },
    fogNear: { value: 1 },
    fogFar: { value: 100 },
  };
}

const WORLD_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normal;
  vUv = uv;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const LIGHTING_GLSL = /* glsl */ `
uniform sampler2D lightMap;
uniform sampler2D lightMap2;
uniform float emergency;
uniform vec2 lmScale;
uniform float globalLight;
uniform vec3 ambient;
uniform float ceilH;
uniform float time;
uniform vec3 flPos;
uniform vec3 flDir;
uniform float flOn;
uniform vec4 dynPos[${MAX_DYN_LIGHTS}];
uniform vec3 dynCol[${MAX_DYN_LIGHTS}];

vec3 sceneLight(vec3 P, vec3 N, float surface) {
  // Sample slightly in front of the surface so walls read the room they face.
  vec2 lmUv = (P.xz + N.xz * 0.3) * lmScale;
  vec3 baked = texture2D(lightMap, lmUv).rgb * 1.3 * globalLight
    + texture2D(lightMap2, lmUv).rgb * 1.3 * emergency;
  float h = clamp(P.y / ceilH, 0.0, 1.0);
  if (surface < 0.5) baked *= mix(0.55, 1.08, h * h);
  else if (surface > 1.5 && surface < 2.5) baked *= 0.78;
  // Exposed joist space above a broken ceiling is dim.
  if (P.y > ceilH + 0.01) baked *= 0.35;
  // Pits fall off into darkness.
  if (P.y < -0.01) baked *= exp(P.y * 1.7);
  // Props (pipes, crates, shelving) get simple directional shading so
  // their shape reads under flat baked light.
  if (surface > 2.5) baked *= 0.62 + 0.38 * abs(dot(N, vec3(0.32, -0.82, 0.47)));
  vec3 light = ambient + baked;

  for (int i = 0; i < ${MAX_DYN_LIGHTS}; i++) {
    vec3 L = dynPos[i].xyz - P;
    float d2 = dot(L, L);
    float ndl = max(dot(N, L * inversesqrt(d2 + 0.0001)), 0.0) * 0.7 + 0.3;
    light += dynCol[i] * (ndl * dynPos[i].w / (1.0 + d2 * 0.22));
  }

  vec3 toF = P - flPos;
  float fd = length(toF);
  vec3 fdir = toF / max(fd, 0.001);
  float spot = smoothstep(0.86, 0.975, dot(fdir, flDir));
  float fl = flOn * (spot * 0.92 + 0.08) * max(dot(N, -fdir), 0.0) * 2.4 / (1.0 + fd * fd * 0.07);
  light += vec3(1.0, 0.96, 0.86) * fl;
  return light;
}
`;

const WORLD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 texScale;
uniform float surface;
uniform vec4 decay[${MAX_DECAY}];
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
${LIGHTING_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 albedo = texture2D(map, vUv * texScale).rgb;
  if (surface > 0.5 && surface < 1.5) {
    // Damp patches in the carpet (wetness lives in the lightmap's alpha).
    float wet = texture2D(lightMap, vWorld.xz * lmScale).a;
    float n = vnoise(vWorld.xz * 0.32) * 0.65 + vnoise(vWorld.xz * 1.4) * 0.35;
    albedo *= mix(1.0, 0.7, smoothstep(0.56, 0.82, n) * wet);
  } else if (surface < 0.5) {
    // Water stains creeping up from the floor.
    float along = dot(vWorld.xz, vec2(1.0 - abs(N.x), 1.0 - abs(N.z)));
    float n = vnoise(vec2(along * 0.7, 0.0)) * 0.6 + vnoise(vec2(along * 2.3, 1.7)) * 0.4;
    float stain = smoothstep(0.55, 0.85, n) * (1.0 - smoothstep(0.0, 0.9, vWorld.y));
    albedo *= 1.0 - stain * 0.25;
  }
  vec3 col = albedo * sceneLight(vWorld, N, surface);
  // Decay: irregular spots of pure blackness eating into every surface.
  // Each spot is (x, z, radius, strength); strength 0 = unused.
  float rot = 0.0;
  for (int i = 0; i < ${MAX_DECAY}; i++) {
    vec4 s = decay[i];
    if (s.w <= 0.0) continue;
    float d = length(vWorld.xz - s.xy);
    if (d > s.z + 2.5) continue;
    float n = vnoise(vWorld.xz * 1.6 + vWorld.y * 0.8) * 0.6 + vnoise(vWorld.xz * 5.0 - vWorld.y * 2.0) * 0.3;
    float edge = s.z + n * 0.8;
    rot = max(rot, (1.0 - smoothstep(edge - 0.08, edge + 1.3, d)) * s.w);
    rot = max(rot, step(d, edge - 0.08) * s.w);
  }
  col *= 1.0 - clamp(rot, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

const scaleVec = (s) => (Array.isArray(s) ? new THREE.Vector2(s[0], s[1]) : new THREE.Vector2(s, s));

// texScale: UV repeats per metre, either one number or [u, v].
export function createWorldMaterial(shared, map, surface, texScale) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      texScale: { value: scaleVec(texScale) },
      surface: { value: surface },
    },
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
    fog: true,
  });
}

// The exit: a patch of wall that does not quite render correctly.
const GLITCH_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 texScale;
uniform float prox;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
${LIGHTING_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec2 uv = vUv * texScale;
  // Mostly an ordinary wall whose light keeps stuttering, with the odd
  // tear where reality doesn't line up.
  float t = floor(time * 18.0);
  float row = floor(vUv.y * 10.0);
  float band = step(0.93 - prox * 0.12, hash12(vec2(row, t)));
  uv.x += band * (hash12(vec2(t, row + 3.1)) - 0.5) * 0.25;
  vec2 sh = vec2(0.004 + prox * 0.012 + band * 0.02, 0.0);
  vec3 c = vec3(texture2D(map, uv + sh).r, texture2D(map, uv).g, texture2D(map, uv - sh).b);
  float flick = hash12(vec2(t * 0.37, 7.0));
  float level = flick < 0.18 ? 0.35 : flick < 0.3 ? 1.45 : 1.0;
  vec3 col = c * sceneLight(vWorld, N, 0.0) * level;
  float n = hash12(vUv * 300.0 + time * 61.0);
  col = mix(col, vec3(n) * 0.8, band * 0.25 + prox * 0.04);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export function createGlitchMaterial(shared, map, texScale) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: map },
      texScale: { value: scaleVec(texScale) },
      prox: { value: 0 },
    },
    vertexShader: WORLD_VERT,
    fragmentShader: GLITCH_FRAG,
    fog: true,
  });
}
