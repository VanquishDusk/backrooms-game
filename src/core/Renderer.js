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
varying vec2 vUv;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  uv += warp * vec2(sin(uv.y * 11.0 + time * 1.9), cos(uv.x * 9.0 + time * 1.6)) * 0.006;
  vec2 dir = uv - 0.5;
  float d = length(dir);
  float ab = aberr * d * 0.02;
  vec3 col;
  col.r = texture2D(tScene, uv + dir * ab).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - dir * ab).b;
  col *= tint;
  col += (rand(uv * res + fract(time * 7.13) * 91.7) - 0.5) * grain;
  col *= 0.975 + 0.025 * sin(uv.y * res.y * 1.4);
  col *= mix(1.0, smoothstep(0.92, 0.22, d), vignette);
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
    if (!this.usePost) {
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
