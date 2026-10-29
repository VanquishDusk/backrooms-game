import * as THREE from 'three';

// WebGL renderer plus a single cheap "found footage" post pass: film grain,
// vignette, chromatic aberration and a sanity warp. Low quality skips it.

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float time;
uniform float grain;
uniform float vignette;
uniform float aberr;
uniform float warp;
uniform vec3 tint;
uniform vec2 res;
uniform float invert;
uniform float mono;
uniform float flip;
uniform float glitch;
uniform float soften;
uniform float craft;
varying vec2 vUv;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 uv = mix(vUv, 1.0 - vUv, flip);
  // Reality tearing: horizontal bands that slip sideways.
  float row = floor(uv.y * 38.0);
  float band = glitch > 0.0 ? step(1.0 - glitch * 0.4, rand(vec2(row, floor(time * 18.0)))) : 0.0;
  uv.x += band * (rand(vec2(floor(time * 23.0), row)) - 0.5) * 0.18 * glitch;
  uv += warp * vec2(sin(uv.y * 11.0 + time * 1.9), cos(uv.x * 9.0 + time * 1.6)) * 0.006;
  vec2 dir = uv - 0.5;
  float d = length(dir);
  float ab = aberr * d * 0.02;
  vec3 col;
  col.r = texture2D(tScene, uv + dir * ab).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - dir * ab).b;
  col *= tint;
  if (soften > 0.0) {
    // Cheap glow: blend in a soft blur, so bright edges bleed like a photo.
    vec3 blur = vec3(0.0);
    vec2 px = 7.0 / res;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785;
      blur += texture2D(tScene, uv + vec2(cos(a), sin(a)) * px).rgb;
      blur += texture2D(tScene, uv + vec2(cos(a + 0.39), sin(a + 0.39)) * px * 2.2).rgb;
    }
    col = mix(col, min(col, blur / 16.0), soften);
  }
  if (craft > 0.0) {
    // Handmade: ink outlines where colours change, flattened paint, and
    // paper grain that only changes twelve times a second, like stop-motion.
    vec2 px = 1.0 / res;
    float gx = lum(texture2D(tScene, uv + vec2(px.x, 0.0)).rgb) - lum(texture2D(tScene, uv - vec2(px.x, 0.0)).rgb);
    float gy = lum(texture2D(tScene, uv + vec2(0.0, px.y)).rgb) - lum(texture2D(tScene, uv - vec2(0.0, px.y)).rgb);
    float edge = smoothstep(0.06, 0.2, length(vec2(gx, gy)));
    vec3 flat_ = floor(col * 7.0 + 0.5) / 7.0;
    col = mix(col, flat_, craft * 0.55);
    col *= 1.0 - edge * 0.5 * craft;
    float frame = floor(time * 12.0);
    float paper = rand(floor(uv * res / 2.0) + frame * 7.13);
    col *= 1.0 + (paper - 0.5) * 0.16 * craft;
    col = mix(col, col * vec3(1.05, 1.0, 0.9), craft * 0.5);
  }
  // Vignette before inversion, so an inverted view glows at the edges.
  col *= mix(1.0, smoothstep(0.92, 0.22, d), vignette);
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), mono);
  // Photo-negative; tearing bands let the real colours show through.
  float inv = invert * (1.0 - band);
  col = mix(col, 1.0 - col, inv);
  col += (rand(uv * res + fract(time * 7.13) * 91.7) - 0.5) * grain;
  col *= 0.975 + 0.025 * sin(uv.y * res.y * 1.4);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Renderer {
  constructor(container) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000);
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        time: { value: 0 },
        grain: { value: 0.06 },
        vignette: { value: 0.75 },
        aberr: { value: 0.4 },
        warp: { value: 0 },
        tint: { value: new THREE.Color(1, 1, 1) },
        res: { value: new THREE.Vector2(1, 1) },
        invert: { value: 0 },
        mono: { value: 0 },
        flip: { value: 0 },
        glitch: { value: 0 },
        soften: { value: 0 },
        craft: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.setQuality('high');
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = q === 'low' ? Math.min(dpr, 1) * 0.6 : q === 'medium' ? Math.min(dpr, 1.25) * 0.8 : Math.min(dpr, 2);
    this.usePost = q !== 'low';
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, true);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.post.uniforms.res.value.copy(size);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  render(scene, camera, time) {
    this.camera = camera;
    // Some levels need the post pass (e.g. colour inversion) even on low.
    if (!this.usePost && !this.forcePost) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.post.uniforms.time.value = time;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
