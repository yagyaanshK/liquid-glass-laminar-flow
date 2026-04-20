/**
 * LiquidGlassEngine — Custom WebGL refraction engine
 *
 * Two modes:
 *   1. startLive(canvas) — reads from a live canvas every frame (no snapshots)
 *   2. startSnapshot()   — takes a one-time html2canvas DOM screenshot
 */

// ─── GLSL Shaders ────────────────────────────────────────────────────────────

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;       // element size in px
  uniform vec2 u_texResolution;    // full texture size in px
  uniform vec4 u_bounds;           // (x, y, w, h) in UV space on texture
  uniform float u_radius;          // corner radius in px
  uniform float u_refraction;      // 0–1
  uniform float u_bevelDepth;      // 0–1
  uniform float u_bevelWidth;      // 0–1
  uniform float u_frost;           // blur radius in px
  uniform float u_chromAberration; // RGB split
  uniform float u_fresnel;         // 0–1
  uniform float u_edgeHighlight;   // 0–1
  uniform float u_brightness;      // -1 to 1
  uniform float u_saturation;      // -1 to 1
  uniform float u_time;
  uniform bool  u_specular;
  uniform int   u_shape;           // 0: rect, 1: circle, 2: ellipse, 3: triangle, 4: hexagon

  // Signed distance to a rounded rectangle (Inigo Quilez)
  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
  }

  // Pseudo-random hash
  float hash(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
  }
  // Signed distance to expanding circle
  float sdCircle(vec2 p, float r) {
    return length(p) - r;
  }

  // Signed distance to ellipse
  float sdEllipse( vec2 p, vec2 ab ) {
      p = abs(p); if( p.x > p.y ) {p=p.yx;ab=ab.yx;}
      float l = ab.y*ab.y - ab.x*ab.x;
      float m = ab.x*p.x/l;      float m2 = m*m; 
      float n = ab.y*p.y/l;      float n2 = n*n; 
      float c = (m2 + n2 - 1.0)/3.0; float c3 = c*c*c;
      float q = c3 + m2*n2*2.0;
      float d = c3 + m2*n2;
      float g = m + m*n2;
      float co;
      if( d<0.0 ) {
          float h = acos(q/c3)/3.0;
          float s = cos(h);
          float t = sin(h)*sqrt(3.0);
          float rx = sqrt( -c*(s + t + 2.0) + m2 );
          float ry = sqrt( -c*(s - t + 2.0) + m2 );
          co = (ry+sign(l)*rx+abs(g)/(rx*ry)- m)/2.0;
      } else {
          float h = 2.0*m*n*sqrt( d );
          float s = sign(q+h)*pow(abs(q+h), 1.0/3.0);
          float u = sign(q-h)*pow(abs(q-h), 1.0/3.0);
          float rx = -s - u - c*4.0 + 2.0*m2;
          float ry = (s - u)*sqrt(3.0);
          float rm = sqrt( rx*rx + ry*ry );
          co = (ry/sqrt(rm-rx)+2.0*g/rm-m)/2.0;
      }
      vec2 r = ab * vec2(co, sqrt(1.0-co*co));
      return length(r-p) * sign(p.y-r.y);
  }

  // Signed distance to equilateral triangle
  float sdEquilateralTriangle( vec2 p, float r ) {
      const float k = sqrt(3.0);
      p.x = abs(p.x) - r;
      p.y = p.y + r/k;
      if( p.x+k*p.y>0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
      p.x -= clamp( p.x, -2.0*r, 0.0 );
      return -length(p)*sign(p.y);
  }

  // Signed distance to hexagon
  float sdHexagon( vec2 p, float r ) {
      const vec3 k = vec3(-0.866025404,0.5,0.577350269);
      p = abs(p);
      p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
      p -= vec2(clamp(p.x, -k.z*r, k.z*r), r);
      return length(p)*sign(p.y);
  }

  float getDistance(vec2 p_px, vec2 b_px) {
    if (u_shape == 1) {
      return sdCircle(p_px, min(b_px.x, b_px.y) * 0.85);
    } else if (u_shape == 2) {
      return sdEllipse(p_px, b_px * 0.85);
    } else if (u_shape == 3) {
      // Standard SDF rounding: subtract radius from the raw SDF
      float rawSize = min(b_px.x, b_px.y) * 0.85 - u_radius;
      return sdEquilateralTriangle(p_px, rawSize) - u_radius;
    } else if (u_shape == 4) {
      float rawSize = min(b_px.x, b_px.y) * 0.85 - u_radius;
      return sdHexagon(p_px, rawSize) - u_radius;
    }
    // Default rect (shape 0)
    return sdRoundBox(p_px, b_px, u_radius);
  }

  // Edge factor: 0 = center, 1 = edge
  float edgeFactor(vec2 uv) {
    vec2 p_px = (uv - 0.5) * u_resolution;
    vec2 b_px = 0.5 * u_resolution;
    float d = -getDistance(p_px, b_px);
    float bevelPx = u_bevelWidth * min(u_resolution.x, u_resolution.y);
    return 1.0 - smoothstep(0.0, bevelPx, d);
  }

  // Shape mask (1 inside, 0 outside, AA at edge)
  float shapeMask(vec2 uv) {
    vec2 p_px = (uv - 0.5) * u_resolution;
    vec2 b_px = 0.5 * u_resolution;
    float d = getDistance(p_px, b_px);
    return 1.0 - smoothstep(-1.0, 1.0, d);
  }

  void main() {
    float mask = shapeMask(v_uv);
    if (mask < 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Refraction offset
    vec2 p = v_uv - 0.5;
    p.x *= u_resolution.x / u_resolution.y;

    float edge = edgeFactor(v_uv);
    float offsetAmt = edge * u_refraction + pow(edge, 10.0) * u_bevelDepth;
    float centreBlend = smoothstep(0.15, 0.45, length(p));
    vec2 offset = normalize(p + 0.0001) * offsetAmt * centreBlend;

    // Map local UV → texture UV
    vec2 flippedUV = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 mapped = u_bounds.xy + flippedUV * u_bounds.zw;
    vec2 refracted = mapped + offset;
    vec2 texel = 1.0 / u_texResolution;

    // Sample with optional frost (golden angle spiral disk blur)
    vec4 refrCol;
    // Pre-compute chromatic aberration direction
    float caOff = (u_chromAberration > 0.0) ? u_chromAberration * edge * 0.01 : 0.0;
    vec2 caDir = (u_chromAberration > 0.0) ? normalize(p + 0.0001) : vec2(0.0);
    vec2 caOffR = caDir * caOff;
    vec2 caOffB = -caDir * caOff;

    if (u_frost > 0.0) {
      float radius = u_frost * 6.0;
      vec4 sum = vec4(0.0);
      const float GOLDEN_ANGLE = 2.39996323; // ~137.5 degrees
      float fSamples;

      if (u_frost <= 2.0) {
        // Light frost — 32 samples is plenty
        fSamples = 32.0;
        for (int i = 0; i < 32; i++) {
          float fi = float(i);
          float angle = fi * GOLDEN_ANGLE;
          float dist = sqrt((fi + 0.5) / 32.0) * radius;
          vec2 off = vec2(cos(angle), sin(angle)) * texel * dist;
          sum.r += texture2D(u_texture, refracted + caOffR + off).r;
          sum.g += texture2D(u_texture, refracted + off).g;
          sum.b += texture2D(u_texture, refracted + caOffB + off).b;
          sum.a += texture2D(u_texture, refracted + off).a;
        }
      } else if (u_frost <= 3.5) {
        // Medium frost — 64 samples
        fSamples = 64.0;
        for (int i = 0; i < 64; i++) {
          float fi = float(i);
          float angle = fi * GOLDEN_ANGLE;
          float dist = sqrt((fi + 0.5) / 64.0) * radius;
          vec2 off = vec2(cos(angle), sin(angle)) * texel * dist;
          sum.r += texture2D(u_texture, refracted + caOffR + off).r;
          sum.g += texture2D(u_texture, refracted + off).g;
          sum.b += texture2D(u_texture, refracted + caOffB + off).b;
          sum.a += texture2D(u_texture, refracted + off).a;
        }
      } else {
        // Heavy frost — 96 samples for silky smooth blur
        fSamples = 96.0;
        for (int i = 0; i < 96; i++) {
          float fi = float(i);
          float angle = fi * GOLDEN_ANGLE;
          float dist = sqrt((fi + 0.5) / 96.0) * radius;
          vec2 off = vec2(cos(angle), sin(angle)) * texel * dist;
          sum.r += texture2D(u_texture, refracted + caOffR + off).r;
          sum.g += texture2D(u_texture, refracted + off).g;
          sum.b += texture2D(u_texture, refracted + caOffB + off).b;
          sum.a += texture2D(u_texture, refracted + off).a;
        }
      }

      refrCol = sum / fSamples;
    } else {
      refrCol  = texture2D(u_texture, refracted);
      refrCol += texture2D(u_texture, refracted + vec2( texel.x, 0.0));
      refrCol += texture2D(u_texture, refracted + vec2(-texel.x, 0.0));
      refrCol += texture2D(u_texture, refracted + vec2(0.0,  texel.y));
      refrCol += texture2D(u_texture, refracted + vec2(0.0, -texel.y));
      refrCol /= 5.0;

      // Chromatic aberration (only when NOT frosted — already integrated above)
      if (u_chromAberration > 0.0) {
        refrCol.r = texture2D(u_texture, refracted + caOffR).r;
        refrCol.b = texture2D(u_texture, refracted + caOffB).b;
      }
    }

    vec4 final = refrCol;

    // Fresnel
    if (u_fresnel > 0.0) {
      float f = pow(edge, 3.0) * u_fresnel * 0.3;
      final.rgb = mix(final.rgb, vec3(1.0), f);
    }

    // Edge highlight
    if (u_edgeHighlight > 0.0) {
      final.rgb += pow(edge, 4.0) * u_edgeHighlight;
    }

    // Specular highlights
    if (u_specular) {
      vec2 lp1 = vec2(sin(u_time * 0.2), cos(u_time * 0.3)) * 0.6 + 0.5;
      vec2 lp2 = vec2(sin(u_time * -0.4 + 1.5), cos(u_time * 0.25 - 0.5)) * 0.6 + 0.5;
      float h = 0.0;
      h += smoothstep(0.4, 0.0, distance(v_uv, lp1)) * 0.12;
      h += smoothstep(0.5, 0.0, distance(v_uv, lp2)) * 0.08;
      final.rgb += h;
    }

    // Brightness & saturation
    final.rgb += u_brightness;
    if (u_saturation != 0.0) {
      float luma = dot(final.rgb, vec3(0.2126, 0.7152, 0.0722));
      final.rgb = mix(vec3(luma), final.rgb, 1.0 + u_saturation);
    }

    final.rgb *= mask;
    final.a = mask;
    gl_FragColor = final;
  }
`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type GlassShape = 'rect' | 'circle' | 'ellipse' | 'triangle' | 'hexagon';

export interface GlassConfig {
  shape?: GlassShape;
  refraction: number;
  bevelDepth: number;
  bevelWidth: number;
  frost: number;
  cornerRadius: number;
  chromAberration: number;
  fresnel: number;
  edgeHighlight: number;
  brightness: number;
  saturation: number;
  shadowOpacity: number;
  specular: boolean;
}

export const DEFAULT_CONFIG: GlassConfig = {
  shape: 'rect',
  refraction: 0.03,
  bevelDepth: 0.08,
  bevelWidth: 0.18,
  frost: 0,
  cornerRadius: 40,
  chromAberration: 0.05,
  fresnel: 0.6,
  edgeHighlight: 0.06,
  brightness: 0.0,
  saturation: 0.0,
  shadowOpacity: 0.3,
  specular: true,
};

const SHAPE_MAP: Record<GlassShape, number> = {
  'rect': 0,
  'circle': 1,
  'ellipse': 2,
  'triangle': 3,
  'hexagon': 4,
};

export interface LensRegistration {
  element: HTMLElement;
  config: GlassConfig;
}

// ─── WebGL Helpers ───────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src.trim());
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class LiquidGlassEngine {
  private overlayCanvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private startTime = Date.now();
  private lenses: LensRegistration[] = [];
  private animFrameId = 0;
  private liveSource: HTMLCanvasElement | null = null;
  private snapshotRoot: HTMLElement | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(snapshotRootOrCanvas: HTMLElement | HTMLCanvasElement) {
    if (snapshotRootOrCanvas instanceof HTMLCanvasElement) {
      this.liveSource = snapshotRootOrCanvas;
    } else {
      this.snapshotRoot = snapshotRootOrCanvas;
    }

    // Create fullscreen overlay canvas
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: -1;
    `;
    this.overlayCanvas.setAttribute('data-liquid-glass-overlay', '');
    document.body.appendChild(this.overlayCanvas);

    // Init WebGL
    const gl = this.overlayCanvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;

    const prog = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!prog) throw new Error('Shader compilation failed');
    this.program = prog;

    // Fullscreen quad
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1,  1, 1, -1,  1, 1,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const names = [
      'u_texture', 'u_resolution', 'u_texResolution', 'u_bounds',
      'u_radius', 'u_refraction', 'u_bevelDepth', 'u_bevelWidth',
      'u_frost', 'u_chromAberration', 'u_fresnel', 'u_edgeHighlight',
      'u_brightness', 'u_saturation', 'u_time', 'u_specular', 'u_shape'
    ];
    for (const n of names) this.uniforms[n] = gl.getUniformLocation(prog, n);

    // Texture
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._resizeCanvas();
    window.addEventListener('resize', this._resizeCanvas, { passive: true });
  }

  // ── Public API ──

  addLens(element: HTMLElement, config: Partial<GlassConfig> = {}): LensRegistration {
    element.setAttribute('data-liquid-glass-lens', '');
    const lens: LensRegistration = {
      element,
      config: { ...DEFAULT_CONFIG, ...config },
    };
    this.lenses.push(lens);
    return lens;
  }

  removeLens(element: HTMLElement) {
    element.removeAttribute('data-liquid-glass-lens');
    this.lenses = this.lenses.filter(l => l.element !== element);
  }

  updateLensConfig(element: HTMLElement, config: Partial<GlassConfig>) {
    const lens = this.lenses.find(l => l.element === element);
    if (lens) Object.assign(lens.config, config);
  }

  /** Start with a live canvas source — re-reads texture every frame */
  startLive(source: HTMLCanvasElement) {
    this.liveSource = source;
    this._loop();
  }

  /** Start with a one-time html2canvas snapshot */
  async startSnapshot() {
    if (!this.snapshotRoot) return;
    const html2canvas = (await import('html2canvas')).default;

    this.overlayCanvas.style.visibility = 'hidden';

    // Hide lens elements during capture
    for (const l of this.lenses) {
      l.element.style.visibility = 'hidden';
    }

    const snapCanvas = await html2canvas(this.snapshotRoot, {
      allowTaint: false,
      useCORS: true,
      backgroundColor: null,
      scale: Math.min(2, window.devicePixelRatio || 1),
      ignoreElements: (el: Element) =>
        el.hasAttribute('data-liquid-glass-overlay') ||
        el.hasAttribute('data-liquid-glass-lens') ||
        el.hasAttribute('data-liquid-glass-ignore'),
    });

    for (const l of this.lenses) {
      l.element.style.visibility = 'visible';
    }

    // Upload once and start loop
    this._uploadTexture(snapCanvas);
    this.overlayCanvas.style.visibility = 'visible';
    this.liveSource = null; // not live — static texture
    this._loop();
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeCanvas);
    this.overlayCanvas.remove();
  }

  // ── Private ──

  private _resizeCanvas = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.overlayCanvas.width = innerWidth * dpr;
    this.overlayCanvas.height = innerHeight * dpr;
  };

  private _uploadTexture(src: HTMLCanvasElement | HTMLImageElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  private _loop = () => {
    this._render();
    this.animFrameId = requestAnimationFrame(this._loop);
  };

  private _render() {
    const gl = this.gl;
    if (this.lenses.length === 0) return;

    // If live source, re-upload texture every frame
    if (this.liveSource && this.liveSource.width > 0) {
      this._uploadTexture(this.liveSource);
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.u_texture, 0);

    const time = (Date.now() - this.startTime) / 1000;
    gl.uniform1f(this.uniforms.u_time, time);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const texW = this.liveSource?.width || this.overlayCanvas.width;
    const texH = this.liveSource?.height || this.overlayCanvas.height;

    for (const lens of this.lenses) {
      const rect = lens.element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const x = rect.left * dpr;
      const y = this.overlayCanvas.height - (rect.top + rect.height) * dpr;
      const w = rect.width * dpr;
      const h = rect.height * dpr;

      gl.viewport(x, y, w, h);
      gl.scissor(x, y, w, h);
      gl.enable(gl.SCISSOR_TEST);
      gl.uniform2f(this.uniforms.u_resolution, w, h);
      gl.uniform2f(this.uniforms.u_texResolution, texW, texH);

      // Map element bounds → texture UV
      const leftUV = (rect.left * dpr) / texW;
      const topUV = (rect.top * dpr) / texH;
      const wUV = w / texW;
      const hUV = h / texH;
      gl.uniform4f(this.uniforms.u_bounds, leftUV, topUV, wUV, hUV);

      const c = lens.config;
      gl.uniform1f(this.uniforms.u_radius, c.cornerRadius * dpr);
      gl.uniform1f(this.uniforms.u_refraction, c.refraction);
      gl.uniform1f(this.uniforms.u_bevelDepth, c.bevelDepth);
      gl.uniform1f(this.uniforms.u_bevelWidth, c.bevelWidth);
      gl.uniform1f(this.uniforms.u_frost, c.frost);
      gl.uniform1f(this.uniforms.u_chromAberration, c.chromAberration);
      gl.uniform1f(this.uniforms.u_fresnel, c.fresnel);
      gl.uniform1f(this.uniforms.u_edgeHighlight, c.edgeHighlight);
      gl.uniform1f(this.uniforms.u_brightness, c.brightness);
      gl.uniform1f(this.uniforms.u_saturation, c.saturation);
      gl.uniform1i(this.uniforms.u_specular, c.specular ? 1 : 0);
      gl.uniform1i(this.uniforms.u_shape, SHAPE_MAP[c.shape || 'rect']);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.SCISSOR_TEST);
    }
  }
}
