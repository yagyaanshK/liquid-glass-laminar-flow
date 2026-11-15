/**
 * LiquidGlassEngine — Custom WebGL refraction engine
 *
 * Two modes:
 *   1. startLive(canvas) — reads from a live canvas every frame (no snapshots)
 *   2. startSnapshot()   — captures the visible viewport with html2canvas and
 *                          re-captures after scroll / resize settles
 *
 * In both modes the source texture covers exactly the viewport, so a point on
 * screen maps to texture UV as (client position / viewport size).
 *
 * Lenses are drawn in groups. A group is one draw call whose shapes are joined
 * with a smooth union, so lenses that share a `group` melt into each other when
 * they get close. A lens without a group is a group of one.
 */

// ─── GLSL Shaders ────────────────────────────────────────────────────────────

const MAX_SHAPES = 8;

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

  #define MAX_SHAPES ${MAX_SHAPES}

  uniform sampler2D u_texture;
  uniform vec2 u_rectSize;         // draw rect size in device px
  uniform vec4 u_uvRect;           // draw rect (x, y, w, h) in texture UV space
  uniform vec2 u_texResolution;    // source texture size in px

  // Shapes, in px relative to the draw rect centre with y up
  uniform int   u_count;
  uniform vec4  u_shapeBox[MAX_SHAPES];     // centre.xy, half size.xy
  uniform vec4  u_shapeParams[MAX_SHAPES];  // corner radius, corner exponent, shape kind, unused
  uniform float u_blend;           // smooth-union radius in px

  uniform float u_minSide;         // shorter side of the smallest lens in the group, px
  uniform float u_bevelPx;         // bevel width in px (already clamped to the inradius)
  uniform float u_refraction;      // broad edge bend, fraction of the shorter side
  uniform float u_bevelDepth;      // extra bend at the rim, fraction of the shorter side
  uniform float u_frost;           // blur radius
  uniform float u_chromAberration; // RGB split
  uniform float u_fresnel;         // 0–2
  uniform float u_edgeHighlight;   // 0–1
  uniform float u_brightness;      // -1 to 1
  uniform float u_saturation;      // -1 to 1
  uniform float u_gravityStrength; // Einstein-radius style radial bend
  uniform float u_gravityFalloff;  // far-field damping
  uniform float u_gravitySoftness; // center clamp to avoid singularity
  uniform int   u_lensField;       // 0: SDF edge glass, 1: gravity field

  uniform vec3  u_tintColor;       // adapts between dark and light with the backdrop
  uniform float u_tintAmount;
  uniform float u_specular;        // rim light strength
  uniform vec2  u_lightDir;        // unit vector toward the light, y up
  uniform float u_rimPx;           // rim light thickness in px
  uniform float u_glow;            // pointer glow strength
  uniform vec2  u_pointer;         // pointer position, same space as the shapes
  uniform float u_glowRadius;      // px
  uniform float u_shadow;          // drop shadow opacity
  uniform float u_shadowOffset;    // px, downward
  uniform float u_shadowBlur;      // px
  uniform float u_borderPx;        // high-contrast outline width (0 = off)
  uniform vec3  u_borderColor;
  uniform float u_opacity;         // materialize-in progress

  // p-norm: n = 2 is a circle, larger n is a superellipse (continuous corner)
  float pnorm(vec2 v, float n) {
    return pow(pow(v.x, n) + pow(v.y, n), 1.0 / n);
  }

  // Signed distance to a rounded rectangle (Inigo Quilez), with the corner
  // drawn as a superellipse of exponent n instead of a circular arc.
  float sdRoundBox(vec2 p, vec2 b, float r, float n) {
    vec2 d = abs(p) - b + r;
    vec2 m = max(d, 0.0);
    float outside = (n <= 2.001) ? length(m) : pnorm(m, n);
    return outside + min(max(d.x, d.y), 0.0) - r;
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

  // kind: 0 rect, 1 circle, 2 ellipse, 3 triangle, 4 hexagon
  float shapeDistance(vec2 p, vec4 box, vec4 prm) {
    vec2 b = box.zw;
    float r = prm.x;
    float kind = prm.z;
    float m = min(b.x, b.y) * 0.85;
    if (kind < 0.5) return sdRoundBox(p, b, r, prm.y);
    if (kind < 1.5) return length(p) - m;
    if (kind < 2.5) {
      // The ellipse formula divides by (b.y^2 - b.x^2); fall back to a circle when it degenerates
      if (abs(b.x - b.y) < 0.5) return length(p) - m;
      return sdEllipse(p, b * 0.85);
    }
    // Standard SDF rounding: subtract the radius from the raw SDF
    if (kind < 3.5) return sdEquilateralTriangle(p, m - r) - r;
    return sdHexagon(p, m - r) - r;
  }

  // Polynomial smooth minimum: the two surfaces blend over a band of width k
  float smin(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }

  // Signed distance to the whole group: negative inside, positive outside
  float field(vec2 pos) {
    float d = 1.0e5;
    for (int i = 0; i < MAX_SHAPES; i++) {
      if (i >= u_count) break;
      float di = shapeDistance(pos - u_shapeBox[i].xy, u_shapeBox[i], u_shapeParams[i]);
      d = (i == 0) ? di : smin(d, di, u_blend);
    }
    return d;
  }

  // Box of the shape nearest to pos (used as the centre of the gravity field)
  vec4 nearestBox(vec2 pos) {
    float best = 1.0e5;
    vec4 box = u_shapeBox[0];
    for (int i = 0; i < MAX_SHAPES; i++) {
      if (i >= u_count) break;
      float di = shapeDistance(pos - u_shapeBox[i].xy, u_shapeBox[i], u_shapeParams[i]);
      if (di < best) { best = di; box = u_shapeBox[i]; }
    }
    return box;
  }

  void main() {
    // Everything works in device px with y up, relative to the draw rect centre
    // (the SDF space). Offsets are converted to texture UV (y down) when sampling.
    vec2 pos = (v_uv - 0.5) * u_rectSize;
    float d = field(pos);
    float mask = (1.0 - smoothstep(-1.0, 1.0, d)) * u_opacity;

    // Drop shadow: the same field, shifted down and softened. Only needed
    // where the glass itself does not fully cover the pixel.
    float shadowA = 0.0;
    if (u_shadow > 0.0 && d > -2.0) {
      float ds = field(pos + vec2(0.0, u_shadowOffset));
      float s = 1.0 - smoothstep(-u_shadowBlur * 0.35, u_shadowBlur, ds);
      shadowA = u_shadow * s * s * u_opacity;
    }

    if (mask < 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, shadowA);
      return;
    }

    float inside = -d;
    float edge = 1.0 - smoothstep(0.0, u_bevelPx, inside);   // 1 at the rim, 0 in the flat centre

    // Outward surface normal: the gradient of the (merged) field
    vec2 normal = vec2(0.0);
    if (edge > 0.0) {
      vec2 e = vec2(1.0, 0.0);
      vec2 g = vec2(
        field(pos + e.xy) - field(pos - e.xy),
        field(pos + e.yx) - field(pos - e.yx)
      );
      normal = g / max(length(g), 0.0001);
    }

    vec2 offsetPx = vec2(0.0);
    vec2 caDir = normal;
    float chromaField = edge;

    if (u_lensField == 1) {
      // Radial field around the nearest lens centre, in lens-height units
      vec4 box = nearestBox(pos);
      float lensH = max(box.w * 2.0, 1.0);
      vec2 p = (pos - box.xy) / lensH;
      float r = length(p);
      vec2 dir = p / max(r, 0.0001);
      float theta = max(u_gravityStrength, 0.0);
      float defl = (theta * theta / max(r + u_gravitySoftness, 0.01)) * exp(-r * r * u_gravityFalloff);
      float boundaryFade = 1.0 - smoothstep(0.38, 1.0, edge);
      defl *= boundaryFade;
      offsetPx = -dir * defl * lensH;
      caDir = dir;
      chromaField = clamp(defl / max(theta * 0.65, 0.001), 0.0, 1.0) * boundaryFade;
    } else {
      // Convex bevel: rays bend toward the interior, so sample against the outward normal
      float amount = (edge * u_refraction + pow(edge, 10.0) * u_bevelDepth) * u_minSide;
      offsetPx = -normal * amount;
    }

    // px (y up) -> texture UV (v runs downward)
    vec2 pxToUv = u_uvRect.zw / u_rectSize;
    vec2 baseUv = u_uvRect.xy + vec2(v_uv.x, 1.0 - v_uv.y) * u_uvRect.zw;
    vec2 refracted = baseUv + vec2(offsetPx.x, -offsetPx.y) * pxToUv;
    vec2 texel = 1.0 / u_texResolution;

    // Dispersion: red bends a little less than green, blue a little more,
    // along the same direction the lens displaces.
    float caPx = u_chromAberration * chromaField * 0.05 * u_minSide;
    vec2 caUv = vec2(caDir.x, -caDir.y) * caPx * pxToUv;
    bool split = u_chromAberration > 0.0;

    // Sample with optional frost (golden angle spiral disk blur)
    vec4 refrCol;
    if (u_frost > 0.0) {
      float radius = u_frost * 6.0;
      const float GOLDEN_ANGLE = 2.39996323; // ~137.5 degrees

      // Sample count scales with blur radius: 32 / 64 / 96 / 128
      int samples = 128;
      if (u_frost <= 1.0) samples = 32;
      else if (u_frost <= 2.5) samples = 64;
      else if (u_frost <= 4.0) samples = 96;
      float fSamples = float(samples);

      vec4 sum = vec4(0.0);
      for (int i = 0; i < 128; i++) {
        if (i >= samples) break;
        float fi = float(i);
        float angle = fi * GOLDEN_ANGLE;
        float dist = sqrt((fi + 0.5) / fSamples) * radius;
        vec2 off = vec2(cos(angle), sin(angle)) * texel * dist;
        vec4 tap = texture2D(u_texture, refracted + off);
        if (split) {
          tap.r = texture2D(u_texture, refracted + caUv + off).r;
          tap.b = texture2D(u_texture, refracted - caUv + off).b;
        }
        sum += tap;
      }
      refrCol = sum / fSamples;
    } else {
      refrCol  = texture2D(u_texture, refracted);
      refrCol += texture2D(u_texture, refracted + vec2( texel.x, 0.0));
      refrCol += texture2D(u_texture, refracted + vec2(-texel.x, 0.0));
      refrCol += texture2D(u_texture, refracted + vec2(0.0,  texel.y));
      refrCol += texture2D(u_texture, refracted + vec2(0.0, -texel.y));
      refrCol /= 5.0;

      if (split) {
        refrCol.r = texture2D(u_texture, refracted + caUv).r;
        refrCol.b = texture2D(u_texture, refracted - caUv).b;
      }
    }

    vec3 col = refrCol.rgb;

    // Adaptive tint: pulls the backdrop toward a dark or light glass colour
    col = mix(col, u_tintColor, u_tintAmount);

    // Fresnel: toward the rim the glass reflects what is just outside it
    // (the backdrop mirrored across the edge), mixed with white.
    if (u_fresnel > 0.0 && edge > 0.0) {
      float f = pow(edge, 3.0) * u_fresnel * 0.3;
      vec2 mirrorPx = normal * (2.0 * inside + 2.0);
      vec3 refl = texture2D(u_texture, baseUv + vec2(mirrorPx.x, -mirrorPx.y) * pxToUv).rgb;
      col = mix(col, mix(refl, vec3(1.0), 0.55), f);
    }

    // Edge highlight
    if (u_edgeHighlight > 0.0) {
      col += pow(edge, 4.0) * u_edgeHighlight;
    }

    // Rim light: a thin specular line where the rim faces the light, a dimmer
    // one on the opposite side, plus a soft sheen across the lit bevel.
    if (u_specular > 0.0 && edge > 0.0) {
      float facing = dot(normal, u_lightDir);
      float lit = max(facing, 0.0) + 0.45 * max(-facing, 0.0);
      float rim = 1.0 - smoothstep(0.0, u_rimPx, inside);
      float sheen = pow(edge, 3.0) * 0.18 * pow(max(facing, 0.0), 1.5);
      col += u_specular * (rim * 0.85 * lit * lit + sheen);
    }

    // Pointer glow: light spreads from the touch point and catches the bevel
    if (u_glow > 0.0) {
      float gd = length(pos - u_pointer) / max(u_glowRadius, 1.0);
      float g = exp(-gd * gd * 2.5);
      col += u_glow * g * (0.10 + 0.55 * edge * edge);
    }

    // Brightness & saturation
    col += u_brightness;
    if (u_saturation != 0.0) {
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.0 + u_saturation);
    }

    // High-contrast outline
    if (u_borderPx > 0.0) {
      float b = 1.0 - smoothstep(u_borderPx - 0.75, u_borderPx + 0.75, inside);
      col = mix(col, u_borderColor, b);
    }

    col = clamp(col, 0.0, 1.0);

    // Premultiplied output: glass over its own shadow
    gl_FragColor = vec4(col * mask, mask + shadowA * (1.0 - mask));
  }
`;

// Averages the backdrop under one lens into an 8x8 block of cells
const METRICS_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  uniform vec4 u_uvRect;   // lens rect (x, y, w, h) in texture UV space
  uniform vec2 u_cell;     // UV size of one output cell

  void main() {
    vec2 uv = u_uvRect.xy + vec2(v_uv.x, 1.0 - v_uv.y) * u_uvRect.zw;
    vec3 sum = vec3(0.0);
    for (int j = 0; j < 4; j++) {
      for (int i = 0; i < 4; i++) {
        vec2 o = (vec2(float(i), float(j)) + 0.5) / 4.0 - 0.5;
        sum += texture2D(u_texture, uv + o * u_cell).rgb;
      }
    }
    gl_FragColor = vec4(sum / 16.0, 1.0);
  }
`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type GlassShape = 'rect' | 'circle' | 'ellipse' | 'triangle' | 'hexagon';
export type LensFieldMode = 'sdf' | 'gravity';

/**
 * Lengths are relative to the lens, not the viewport: `refraction`,
 * `bevelDepth` and `bevelWidth` are fractions of the lens's shorter side, and
 * the gravity field is measured in lens heights.
 */
export interface GlassConfig {
  shape?: GlassShape;
  lensField: LensFieldMode;
  refraction: number;
  bevelDepth: number;
  bevelWidth: number;
  frost: number;
  cornerRadius: number;
  /** 0 = circular corners, 1 = fully continuous (superellipse) corners. Rect only. */
  cornerSmoothing: number;
  chromAberration: number;
  fresnel: number;
  edgeHighlight: number;
  brightness: number;
  saturation: number;
  gravityStrength: number;
  gravityFalloff: number;
  gravitySoftness: number;
  /** Rim light and bevel sheen. */
  specular: boolean;
  /** Direction the light comes from, in degrees (0 = right, 90 = top, 135 = top-left). */
  lightAngle: number;
  /** Strength of the glass tint over the backdrop, 0–1. */
  tint: number;
  /** Flip the tint between dark and light, and scale the shadow, from the backdrop behind the lens. */
  adaptive: boolean;
  /** Drop shadow opacity, 0–1. */
  shadow: number;
  /** Flex on press and glow from the pointer. */
  interactive: boolean;
  /** Lenses with the same group are drawn as one merged surface. */
  group?: string;
  /** How far apart (CSS px) grouped lenses start to blend into each other. */
  blend: number;
}

export const DEFAULT_CONFIG: GlassConfig = {
  shape: 'rect',
  lensField: 'sdf',
  refraction: 0.07,
  bevelDepth: 0.18,
  bevelWidth: 0.18,
  frost: 0,
  cornerRadius: 40,
  cornerSmoothing: 0.6,
  chromAberration: 0.05,
  fresnel: 0.6,
  edgeHighlight: 0.06,
  brightness: 0.0,
  saturation: 0.0,
  gravityStrength: 0.14,
  gravityFalloff: 4.0,
  gravitySoftness: 0.05,
  specular: true,
  lightAngle: 135,
  tint: 0.1,
  adaptive: true,
  shadow: 0.35,
  interactive: true,
  blend: 28,
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

/** Per-lens animation and measurement state */
interface LensState extends LensRegistration {
  luma: number;            // smoothed backdrop luminance under the lens, 0–1
  contrast: number;        // smoothed backdrop busyness, 0–1
  hasMetrics: boolean;
  scheme: number;          // 0 = dark glass, 1 = light glass (animated)
  schemeTarget: 0 | 1;
  appliedScheme: string;
  press: number;           // spring value, ~0–1 with overshoot
  pressVelocity: number;
  pressed: boolean;
  hover: boolean;
  glow: number;
  pointerX: number;        // client coordinates
  pointerY: number;
  appear: number;          // 0 → 1 materialize-in
  appliedScale: boolean;
  detach: () => void;
}

interface LensFrame {
  lens: LensState;
  rect: DOMRect;
}

/** User accessibility preferences, read once per frame */
interface Environment {
  reduceMotion: boolean;
  reduceTransparency: boolean;
  moreContrast: boolean;
}

const DARK_GLASS: [number, number, number] = [0.07, 0.08, 0.1];
const LIGHT_GLASS: [number, number, number] = [0.97, 0.98, 1.0];

// Backdrop metrics: one 8x8 block per lens in a small atlas, read back every few frames
const METRICS_CELLS = 8;
const METRICS_MAX_LENSES = 16;
const METRICS_INTERVAL = 6;

// Press spring: underdamped so the glass overshoots slightly and settles
const PRESS_STIFFNESS = 320;
const PRESS_DAMPING = 18;
const PRESS_FLEX = 0.035;

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
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  // Both programs share one quad, so pin its attribute to the same slot
  gl.bindAttribLocation(prog, 0, 'a_position');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Continuous ("squircle") corner. Smoothing stretches the corner along the
 * edges (up to ~1.53x the radius at 0.6, like iOS) and raises the superellipse
 * exponent so the corner's apex stays where the circular corner had it.
 */
function continuousCorner(radius: number, smoothing: number, minHalf: number) {
  const r = clamp(radius, 0, minHalf);
  if (r <= 0.5 || smoothing <= 0) return { radius: r, exponent: 2 };
  const stretched = Math.min(r * (1 + 0.88 * clamp(smoothing, 0, 1)), minHalf);
  const ratio = stretched / r;
  if (ratio <= 1.001) return { radius: r, exponent: 2 };
  const exponent = -Math.LN2 / Math.log(1 - (1 - Math.SQRT1_2) / ratio);
  return { radius: stretched, exponent };
}

/** Largest inscribed distance of a shape, matching the shader's SDFs (px). */
function shapeInradius(shape: GlassShape, halfW: number, halfH: number, radius: number) {
  const m = Math.min(halfW, halfH);
  switch (shape) {
    case 'rect': return m;
    case 'triangle': return Math.max(1, (m * 0.85 - radius) / Math.sqrt(3) + radius);
    default: return m * 0.85;
  }
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class LiquidGlassEngine {
  private overlayCanvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private metricsProgram: WebGLProgram;
  private texture: WebGLTexture;
  private metricsTexture: WebGLTexture;
  private metricsFbo: WebGLFramebuffer;
  private metricsPixels = new Uint8Array(METRICS_MAX_LENSES * METRICS_CELLS * METRICS_CELLS * 4);
  private lenses: LensState[] = [];
  private animFrameId = 0;
  private liveSource: HTMLCanvasElement | null = null;
  private snapshotRoot: HTMLElement | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private metricsUniforms = new Map<string, WebGLUniformLocation | null>();
  private shapeBoxes = new Float32Array(MAX_SHAPES * 4);
  private shapeParams = new Float32Array(MAX_SHAPES * 4);
  private textureWidth = 0;
  private textureHeight = 0;
  private destroyed = false;
  private capturing = false;
  private recaptureQueued = false;
  private recaptureTimer = 0;
  private lastFrameTime = 0;
  private frameCount = 0;
  private tiltTarget = 0;   // degrees added to the light angle from device tilt
  private tilt = 0;
  private media = {
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)'),
    reduceTransparency: window.matchMedia('(prefers-reduced-transparency: reduce)'),
    moreContrast: window.matchMedia('(prefers-contrast: more)'),
  };

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
    const metricsProg = createProgram(gl, VERTEX_SHADER, METRICS_FRAGMENT_SHADER);
    if (!prog || !metricsProg) throw new Error('Shader compilation failed');
    this.program = prog;
    this.metricsProgram = metricsProg;

    // Fullscreen quad
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1,  1, 1, -1,  1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Backdrop metrics target
    this.metricsTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.metricsTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      METRICS_MAX_LENSES * METRICS_CELLS, METRICS_CELLS, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.metricsFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.metricsFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.metricsTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Source texture
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._resizeCanvas();
    window.addEventListener('resize', this._resizeCanvas, { passive: true });
    window.addEventListener('deviceorientation', this._onTilt, { passive: true });
  }

  // ── Public API ──

  addLens(element: HTMLElement, config: Partial<GlassConfig> = {}): LensRegistration {
    element.setAttribute('data-liquid-glass-lens', '');
    const lens: LensState = {
      element,
      config: { ...DEFAULT_CONFIG, ...config },
      luma: 0,
      contrast: 0,
      hasMetrics: false,
      scheme: 0,
      schemeTarget: 0,
      appliedScheme: '',
      press: 0,
      pressVelocity: 0,
      pressed: false,
      hover: false,
      glow: 0,
      pointerX: 0,
      pointerY: 0,
      appear: 0,
      appliedScale: false,
      detach: () => {},
    };
    lens.detach = this._attachPointer(lens);
    this.lenses.push(lens);
    return lens;
  }

  removeLens(element: HTMLElement) {
    for (const lens of this.lenses) {
      if (lens.element === element) this._releaseLens(lens);
    }
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

  /** Start with an html2canvas snapshot of the visible viewport */
  async startSnapshot() {
    if (!this.snapshotRoot) return;

    // First capture: keep the glass hidden until there is a texture to show
    this.overlayCanvas.style.visibility = 'hidden';
    await this._capture();
    if (this.destroyed) return;
    this.overlayCanvas.style.visibility = 'visible';

    this.liveSource = null; // not live — static texture
    window.addEventListener('scroll', this._scheduleRecapture, { passive: true });
    window.addEventListener('resize', this._scheduleRecapture, { passive: true });
    this._loop();
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    clearTimeout(this.recaptureTimer);
    window.removeEventListener('resize', this._resizeCanvas);
    window.removeEventListener('deviceorientation', this._onTilt);
    window.removeEventListener('scroll', this._scheduleRecapture);
    window.removeEventListener('resize', this._scheduleRecapture);
    for (const lens of this.lenses) this._releaseLens(lens);
    this.lenses = [];
    this.overlayCanvas.remove();
  }

  // ── Private: lens lifecycle ──

  /** Track the pointer over a lens for press flex and glow */
  private _attachPointer(lens: LensState) {
    const el = lens.element;
    const track = (event: PointerEvent) => {
      lens.pointerX = event.clientX;
      lens.pointerY = event.clientY;
    };
    const onEnter = (event: PointerEvent) => { lens.hover = true; track(event); };
    const onMove = (event: PointerEvent) => { lens.hover = true; track(event); };
    const onDown = (event: PointerEvent) => { lens.pressed = true; track(event); };
    const onUp = () => { lens.pressed = false; };
    const onLeave = () => { lens.pressed = false; lens.hover = false; };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onLeave);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onLeave);
      el.removeEventListener('pointerleave', onLeave);
    };
  }

  /** Undo everything the engine put on a lens element */
  private _releaseLens(lens: LensState) {
    lens.detach();
    lens.element.removeAttribute('data-liquid-glass-lens');
    lens.element.removeAttribute('data-glass-scheme');
    if (lens.appliedScale) lens.element.style.removeProperty('scale');
  }

  // ── Private: resources ──

  private _resizeCanvas = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.overlayCanvas.width = innerWidth * dpr;
    this.overlayCanvas.height = innerHeight * dpr;
  };

  /** Device tilt nudges the light direction, so highlights move with the device */
  private _onTilt = (event: DeviceOrientationEvent) => {
    if (event.gamma == null) return;
    this.tiltTarget = clamp(event.gamma, -40, 40) * 0.9;
  };

  /**
   * Capture only the visible viewport. The snapshot then lines up 1:1 with the
   * overlay canvas, whatever the document height or scroll position is.
   * html2canvas renders a clone of the document, so nothing has to be hidden in
   * the real page. Lens elements are made invisible in the clone rather than
   * ignored: ignoring removes them from layout, which shifts everything around
   * them and leaves the snapshot misaligned with the page.
   */
  private async _capture() {
    if (!this.snapshotRoot || this.capturing) {
      this.recaptureQueued = this.capturing;
      return;
    }
    this.capturing = true;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const snapCanvas = await html2canvas(this.snapshotRoot, {
        allowTaint: false,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        scale: Math.min(1.5, window.devicePixelRatio || 1),
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        ignoreElements: (el: Element) =>
          el.hasAttribute('data-liquid-glass-overlay') ||
          el.hasAttribute('data-liquid-glass-ignore'),
        onclone: (clonedDoc: Document) => {
          clonedDoc.querySelectorAll<HTMLElement>('[data-liquid-glass-lens]').forEach(el => {
            el.style.visibility = 'hidden';
          });
        },
      });
      if (!this.destroyed && snapCanvas.width > 0 && snapCanvas.height > 0) {
        this._uploadTexture(snapCanvas);
      }
    } catch (err) {
      console.error('Liquid glass snapshot failed:', err);
    } finally {
      this.capturing = false;
      if (this.recaptureQueued && !this.destroyed) {
        this.recaptureQueued = false;
        this._scheduleRecapture();
      }
    }
  }

  /** The snapshot is viewport-sized, so it goes stale on scroll or resize. */
  private _scheduleRecapture = () => {
    clearTimeout(this.recaptureTimer);
    this.recaptureTimer = window.setTimeout(() => { void this._capture(); }, 180);
  };

  private _uploadTexture(src: HTMLCanvasElement | HTMLImageElement) {
    const gl = this.gl;
    const width = src instanceof HTMLCanvasElement ? src.width : src.naturalWidth;
    const height = src instanceof HTMLCanvasElement ? src.height : src.naturalHeight;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    if (width !== this.textureWidth || height !== this.textureHeight) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      this.textureWidth = width;
      this.textureHeight = height;
      return;
    }

    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  private _uniform(name: string) {
    let location = this.uniforms.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.program, name);
      this.uniforms.set(name, location);
    }
    return location;
  }

  private _metricsUniform(name: string) {
    let location = this.metricsUniforms.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.metricsProgram, name);
      this.metricsUniforms.set(name, location);
    }
    return location;
  }

  // ── Private: frame loop ──

  private _loop = (time?: number) => {
    this._render(time ?? performance.now());
    this.animFrameId = requestAnimationFrame(this._loop);
  };

  private _render(time: number) {
    const gl = this.gl;
    const dt = this.lastFrameTime ? Math.min(0.05, Math.max(0, (time - this.lastFrameTime) / 1000)) : 0;
    this.lastFrameTime = time;
    this.frameCount++;
    if (this.lenses.length === 0) return;

    // If live source, re-upload texture every frame
    if (this.liveSource && this.liveSource.width > 0) {
      this._uploadTexture(this.liveSource);
    }
    if (this.textureWidth === 0 || this.textureHeight === 0) return;

    const env: Environment = {
      reduceMotion: this.media.reduceMotion.matches,
      reduceTransparency: this.media.reduceTransparency.matches,
      moreContrast: this.media.moreContrast.matches,
    };
    this.tilt = env.reduceMotion ? 0 : mix(this.tilt, this.tiltTarget, 1 - Math.exp(-dt * 6));

    // Animate, then measure: the press flex changes the element's own rect
    const frames: LensFrame[] = [];
    for (const lens of this.lenses) {
      this._animateLens(lens, dt, env);
      const rect = lens.element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      frames.push({ lens, rect });
    }

    const viewW = Math.max(1, window.innerWidth);
    const viewH = Math.max(1, window.innerHeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    if (this.frameCount % METRICS_INTERVAL === 1) {
      this._sampleBackdrop(frames, viewW, viewH);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (frames.length === 0) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
    gl.useProgram(this.program);
    gl.uniform1i(this._uniform('u_texture'), 0);
    gl.uniform2f(this._uniform('u_texResolution'), this.textureWidth, this.textureHeight);

    // Lenses that share a group draw together; everything else draws alone
    const groups: LensFrame[][] = [];
    const named = new Map<string, LensFrame[]>();
    for (const frame of frames) {
      const name = frame.lens.config.group;
      if (!name) {
        groups.push([frame]);
        continue;
      }
      let members = named.get(name);
      if (!members) {
        members = [];
        named.set(name, members);
        groups.push(members);
      }
      if (members.length < MAX_SHAPES) members.push(frame);
    }

    gl.enable(gl.SCISSOR_TEST);
    for (const group of groups) this._drawGroup(group, env, viewW, viewH);
    gl.disable(gl.SCISSOR_TEST);
  }

  /** Advance one lens's springs and adaptive state by dt seconds */
  private _animateLens(lens: LensState, dt: number, env: Environment) {
    const config = lens.config;
    const interactive = config.interactive;

    // Press: a bouncy spring, or an instant step when motion is reduced
    const pressTarget = interactive && lens.pressed ? 1 : 0;
    if (env.reduceMotion || dt === 0) {
      lens.press = pressTarget;
      lens.pressVelocity = 0;
    } else {
      const accel = PRESS_STIFFNESS * (pressTarget - lens.press) - PRESS_DAMPING * lens.pressVelocity;
      lens.pressVelocity += accel * dt;
      lens.press += lens.pressVelocity * dt;
    }

    const glowTarget = !interactive ? 0 : lens.pressed ? 1 : lens.hover ? 0.3 : 0;
    lens.glow = mix(lens.glow, glowTarget, 1 - Math.exp(-dt * 10));

    // Flex the element itself, so its content scales with the glass
    const flex = interactive && !env.reduceMotion ? 1 + PRESS_FLEX * lens.press : 1;
    if (Math.abs(flex - 1) > 0.0005) {
      lens.element.style.scale = flex.toFixed(4);
      lens.appliedScale = true;
    } else if (lens.appliedScale) {
      lens.element.style.removeProperty('scale');
      lens.appliedScale = false;
    }

    // Light / dark flip, with hysteresis so it does not flicker near the threshold
    if (config.adaptive && lens.hasMetrics) {
      if (lens.luma > 0.58) lens.schemeTarget = 1;
      else if (lens.luma < 0.45) lens.schemeTarget = 0;
    } else {
      lens.schemeTarget = 0;
    }
    lens.scheme = mix(lens.scheme, lens.schemeTarget, 1 - Math.exp(-dt * 8));

    // Tell the page which way the glass went, so content on top can stay legible
    const schemeName = lens.schemeTarget === 1 ? 'light' : 'dark';
    if (schemeName !== lens.appliedScheme) {
      lens.element.setAttribute('data-glass-scheme', schemeName);
      lens.appliedScheme = schemeName;
    }

    // Materialize in
    lens.appear = env.reduceMotion ? 1 : Math.min(1, lens.appear + dt / 0.45);
  }

  /**
   * Measure the backdrop behind each lens: average luminance (drives the
   * light / dark flip) and how busy it is (drives the shadow). Each lens is
   * averaged on the GPU into an 8x8 block, and one small readback fetches them all.
   */
  private _sampleBackdrop(frames: LensFrame[], viewW: number, viewH: number) {
    const count = Math.min(frames.length, METRICS_MAX_LENSES);
    if (count === 0) return;
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.metricsFbo);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.metricsProgram);
    gl.uniform1i(this._metricsUniform('u_texture'), 0);

    for (let i = 0; i < count; i++) {
      const rect = frames[i].rect;
      const w = rect.width / viewW;
      const h = rect.height / viewH;
      gl.viewport(i * METRICS_CELLS, 0, METRICS_CELLS, METRICS_CELLS);
      gl.uniform4f(this._metricsUniform('u_uvRect'), rect.left / viewW, rect.top / viewH, w, h);
      gl.uniform2f(this._metricsUniform('u_cell'), w / METRICS_CELLS, h / METRICS_CELLS);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    const pixels = this.metricsPixels;
    gl.readPixels(0, 0, count * METRICS_CELLS, METRICS_CELLS, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const rowStride = count * METRICS_CELLS * 4;
    const cells = METRICS_CELLS * METRICS_CELLS;
    for (let i = 0; i < count; i++) {
      let sum = 0;
      let sumSq = 0;
      for (let y = 0; y < METRICS_CELLS; y++) {
        for (let x = 0; x < METRICS_CELLS; x++) {
          const o = y * rowStride + (i * METRICS_CELLS + x) * 4;
          const luma = (0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]) / 255;
          sum += luma;
          sumSq += luma * luma;
        }
      }
      const mean = sum / cells;
      const deviation = Math.sqrt(Math.max(0, sumSq / cells - mean * mean));
      const contrast = clamp(deviation / 0.2, 0, 1);

      const lens = frames[i].lens;
      if (!lens.hasMetrics) {
        lens.luma = mean;
        lens.contrast = contrast;
        lens.hasMetrics = true;
        // Start in the right scheme instead of animating in from dark
        lens.schemeTarget = lens.config.adaptive && mean > 0.52 ? 1 : 0;
        lens.scheme = lens.schemeTarget;
      } else {
        lens.luma = mix(lens.luma, mean, 0.35);
        lens.contrast = mix(lens.contrast, contrast, 0.35);
      }
    }
  }

  /** Draw one group of lenses as a single merged surface */
  private _drawGroup(group: LensFrame[], env: Environment, viewW: number, viewH: number) {
    const gl = this.gl;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const lead = group[0].lens;
    const c = lead.config;

    // Group extents (CSS px) and the lens that sets the scale of the effect
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    let minSideCss = Infinity;
    for (const { rect } of group) {
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
      minSideCss = Math.min(minSideCss, rect.width, rect.height);
    }

    // Group-level animation state
    let appear = 0;
    let glowLens = lead;
    let scheme = 0;
    let luma = 0;
    let contrast = 0;
    for (const { lens } of group) {
      appear = Math.max(appear, lens.appear);
      if (lens.glow > glowLens.glow) glowLens = lens;
      scheme += lens.scheme / group.length;
      luma += lens.luma / group.length;
      contrast += lens.contrast / group.length;
    }

    // ── Effective optics, after accessibility preferences ──
    let refraction = c.refraction;
    let bevelDepth = c.bevelDepth;
    let gravity = c.gravityStrength;
    let frost = c.frost;
    let chroma = c.chromAberration;
    let tint = c.tint;
    let specular = c.specular ? 1 : 0;
    let borderPx = 0;

    if (env.reduceMotion) {
      // Less optical movement as content passes behind the glass
      refraction *= 0.6;
      bevelDepth *= 0.6;
      gravity *= 0.75;
    }
    if (env.reduceTransparency) {
      // Frostier and more opaque: the backdrop reads as a soft colour, not as content
      frost = Math.max(frost, 3);
      tint = Math.max(tint, 0.72);
      refraction *= 0.35;
      bevelDepth *= 0.35;
      gravity *= 0.5;
      chroma = 0;
    }
    if (env.moreContrast) {
      // Near-solid surface with a defined outline
      tint = Math.max(tint, 0.85);
      chroma = 0;
      specular = 0;
      borderPx = 1.5 * dpr;
    }

    // Materialize by ramping the light bending in, rather than a plain fade
    const lensing = appear * appear * (3 - 2 * appear);
    refraction *= lensing;
    bevelDepth *= lensing;
    gravity *= Math.sqrt(lensing);
    const opacity = clamp(appear / 0.4, 0, 1);

    // Shadow: scaled to the lens so bigger glass reads as thicker. With
    // adaptive on it deepens over busy content and eases off over bright, plain areas.
    let shadow = c.shadow;
    if (c.adaptive && lead.hasMetrics) {
      shadow *= mix(0.75, 1.35, contrast) * mix(1, 0.7, luma);
    }
    shadow = clamp(shadow, 0, 0.9);
    const shadowOffsetCss = clamp(minSideCss * 0.04, 3, 14);
    const shadowBlurCss = clamp(minSideCss * 0.12, 10, 40);
    const blendCss = group.length > 1 ? Math.max(0, c.blend) : 0;

    // Draw rect: the group plus room for the shadow and the blend bulge,
    // snapped to device pixels so UV and geometry agree exactly.
    const margin = (shadow > 0 ? shadowBlurCss + shadowOffsetCss : 0) + blendCss * 0.25 + 2;
    const x0 = Math.floor((left - margin) * dpr);
    const x1 = Math.ceil((right + margin) * dpr);
    const yTop0 = Math.floor((top - margin) * dpr);
    const yTop1 = Math.ceil((bottom + margin) * dpr);
    const w = x1 - x0;
    const h = yTop1 - yTop0;
    if (w <= 0 || h <= 0) return;
    const centerX = x0 + w / 2;
    const centerY = yTop0 + h / 2;

    const glY = this.overlayCanvas.height - yTop1;
    gl.viewport(x0, glY, w, h);
    gl.scissor(x0, glY, w, h);
    gl.uniform2f(this._uniform('u_rectSize'), w, h);
    gl.uniform4f(
      this._uniform('u_uvRect'),
      x0 / dpr / viewW,
      yTop0 / dpr / viewH,
      w / dpr / viewW,
      h / dpr / viewH,
    );

    // Shapes, relative to the draw rect centre with y up
    let inradius = Infinity;
    group.forEach(({ lens, rect }, i) => {
      const shape = lens.config.shape || 'rect';
      const halfW = (rect.width * dpr) / 2;
      const halfH = (rect.height * dpr) / 2;
      const minHalf = Math.min(halfW, halfH);
      let radius = lens.config.cornerRadius * dpr;
      let exponent = 2;
      if (shape === 'rect') {
        const corner = continuousCorner(radius, lens.config.cornerSmoothing, minHalf);
        radius = corner.radius;
        exponent = corner.exponent;
      }
      inradius = Math.min(inradius, shapeInradius(shape, halfW, halfH, radius));

      const o = i * 4;
      this.shapeBoxes[o] = (rect.left + rect.width / 2) * dpr - centerX;
      this.shapeBoxes[o + 1] = centerY - (rect.top + rect.height / 2) * dpr;
      this.shapeBoxes[o + 2] = halfW;
      this.shapeBoxes[o + 3] = halfH;
      this.shapeParams[o] = radius;
      this.shapeParams[o + 1] = exponent;
      this.shapeParams[o + 2] = SHAPE_MAP[shape];
      this.shapeParams[o + 3] = 0;
    });
    gl.uniform1i(this._uniform('u_count'), group.length);
    gl.uniform4fv(this._uniform('u_shapeBox[0]'), this.shapeBoxes);
    gl.uniform4fv(this._uniform('u_shapeParams[0]'), this.shapeParams);
    gl.uniform1f(this._uniform('u_blend'), blendCss * dpr);

    const minSide = minSideCss * dpr;
    gl.uniform1f(this._uniform('u_minSide'), minSide);
    // Clamp the bevel to the inradius so the normal field never crosses the medial axis
    gl.uniform1f(this._uniform('u_bevelPx'), Math.max(0.001, Math.min(c.bevelWidth * minSide, inradius)));

    gl.uniform1f(this._uniform('u_refraction'), refraction);
    gl.uniform1f(this._uniform('u_bevelDepth'), bevelDepth);
    gl.uniform1f(this._uniform('u_frost'), frost);
    gl.uniform1f(this._uniform('u_chromAberration'), chroma);
    gl.uniform1f(this._uniform('u_fresnel'), c.fresnel);
    gl.uniform1f(this._uniform('u_edgeHighlight'), c.edgeHighlight);
    gl.uniform1f(this._uniform('u_brightness'), c.brightness);
    gl.uniform1f(this._uniform('u_saturation'), c.saturation);
    gl.uniform1f(this._uniform('u_gravityStrength'), gravity);
    gl.uniform1f(this._uniform('u_gravityFalloff'), c.gravityFalloff);
    gl.uniform1f(this._uniform('u_gravitySoftness'), c.gravitySoftness);
    gl.uniform1i(this._uniform('u_lensField'), c.lensField === 'gravity' ? 1 : 0);

    // Tint follows the backdrop: dark glass over dark content, light over light
    gl.uniform3f(
      this._uniform('u_tintColor'),
      mix(DARK_GLASS[0], LIGHT_GLASS[0], scheme),
      mix(DARK_GLASS[1], LIGHT_GLASS[1], scheme),
      mix(DARK_GLASS[2], LIGHT_GLASS[2], scheme),
    );
    gl.uniform1f(this._uniform('u_tintAmount'), clamp(tint, 0, 1));

    // Rim light
    const lightAngle = ((c.lightAngle + this.tilt) * Math.PI) / 180;
    gl.uniform1f(this._uniform('u_specular'), specular);
    gl.uniform2f(this._uniform('u_lightDir'), Math.cos(lightAngle), Math.sin(lightAngle));
    gl.uniform1f(this._uniform('u_rimPx'), 1.75 * dpr);

    // Pointer glow, from whichever lens in the group is being touched
    gl.uniform1f(this._uniform('u_glow'), glowLens.glow);
    gl.uniform2f(
      this._uniform('u_pointer'),
      glowLens.pointerX * dpr - centerX,
      centerY - glowLens.pointerY * dpr,
    );
    gl.uniform1f(this._uniform('u_glowRadius'), clamp(minSideCss * 0.9, 70, 260) * dpr);

    gl.uniform1f(this._uniform('u_shadow'), shadow);
    gl.uniform1f(this._uniform('u_shadowOffset'), shadowOffsetCss * dpr);
    gl.uniform1f(this._uniform('u_shadowBlur'), shadowBlurCss * dpr);

    // Outline contrasts with the glass: light on dark glass, dark on light glass
    const outline = scheme > 0.5 ? 0.05 : 0.96;
    gl.uniform1f(this._uniform('u_borderPx'), borderPx);
    gl.uniform3f(this._uniform('u_borderColor'), outline, outline, outline);
    gl.uniform1f(this._uniform('u_opacity'), opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
