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
 *
 * DOM content can sit behind the glass too. Elements registered with
 * addBackdrop() are kept as textures and composited over the source, at their
 * live position, into a "scene" texture that the glass then refracts. A
 * backdrop is either live (drawn by the browser through the HTML-in-canvas
 * API) or an html2canvas snapshot that is re-captured when it changes.
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

// Draws a texture into a rectangle of the current target (used to build the scene)
const BLIT_VERTEX_SHADER = `
  attribute vec2 a_position;
  uniform vec4 u_rect;   // x, y, w, h in clip space
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(u_rect.xy + v_uv * u_rect.zw, 0.0, 1.0);
  }
`;

const BLIT_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  void main() {
    gl_FragColor = texture2D(u_texture, v_uv);
  }
`;

// One step of the frost pyramid: halve the resolution with a 5-tap tent
// (the "dual filter" downsample). Each level is a smooth, wider blur of the
// one before it, so a few taps into a coarse level stand in for many taps
// into the full-resolution source.
const DOWNSAMPLE_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  uniform vec2 u_halfPixel;   // half a destination texel = one source texel, in UV
  void main() {
    vec4 sum = texture2D(u_texture, v_uv) * 4.0;
    sum += texture2D(u_texture, v_uv - u_halfPixel);
    sum += texture2D(u_texture, v_uv + u_halfPixel);
    sum += texture2D(u_texture, v_uv + vec2(u_halfPixel.x, -u_halfPixel.y));
    sum += texture2D(u_texture, v_uv - vec2(u_halfPixel.x, -u_halfPixel.y));
    gl_FragColor = sum / 8.0;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;

  #define MAX_SHAPES ${MAX_SHAPES}
  #define FROST_TAPS 16

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
  uniform float u_frost;           // 0 = clear glass; > 0 = frosted
  uniform sampler2D u_blurA;       // frost pyramid level just below the wanted blur
  uniform sampler2D u_blurB;       // the next coarser level
  uniform float u_blurMix;         // blend between the two levels
  uniform float u_frostRadius;     // radius of the tap disk, in source texels
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
  uniform float u_scheme;          // 0 = dark glass, 1 = light glass
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

  // One frost tap: the pre-blurred backdrop, blended between two pyramid levels
  // so the blur grows smoothly instead of stepping from level to level.
  vec4 frostTap(vec2 uv) {
    vec4 tap = texture2D(u_blurA, uv);
    if (u_blurMix > 0.0) tap = mix(tap, texture2D(u_blurB, uv), u_blurMix);
    return tap;
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

    // Sample with optional frost. The backdrop has already been blurred into
    // a pyramid, so a small golden-angle disk of taps into the right level
    // gives the full blur at a fixed cost, whatever the radius.
    vec4 refrCol;
    if (u_frost > 0.0) {
      const float GOLDEN_ANGLE = 2.39996323; // ~137.5 degrees
      vec4 sum = vec4(0.0);
      vec2 fringe = vec2(0.0);
      for (int i = 0; i < FROST_TAPS; i++) {
        float fi = float(i);
        float angle = fi * GOLDEN_ANGLE;
        float dist = sqrt((fi + 0.5) / float(FROST_TAPS)) * u_frostRadius;
        vec2 off = vec2(cos(angle), sin(angle)) * texel * dist;
        sum += frostTap(refracted + off);
        // Dispersion under frost is soft, so red and blue use every other tap
        if (split && mod(fi, 2.0) < 0.5) {
          fringe.x += frostTap(refracted + caUv + off).r;
          fringe.y += frostTap(refracted - caUv + off).b;
        }
      }
      refrCol = sum / float(FROST_TAPS);
      if (split) {
        refrCol.r = fringe.x / (float(FROST_TAPS) * 0.5);
        refrCol.b = fringe.y / (float(FROST_TAPS) * 0.5);
      }
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
      // On light glass the white share drops, or the whole bevel washes out
      col = mix(col, mix(refl, vec3(1.0), mix(0.55, 0.1, u_scheme)), f);
    }

    // Edge highlight (additive white, so it only helps on dark glass)
    if (u_edgeHighlight > 0.0) {
      col += pow(edge, 4.0) * u_edgeHighlight * (1.0 - 0.85 * u_scheme);
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

    // Light glass: a white highlight cannot define an edge against a bright
    // backdrop, so the bevel is shaded instead, most on the side facing away
    // from the light. This is what keeps the rim readable on light content.
    if (u_scheme > 0.0 && edge > 0.0) {
      float away = 0.35 + 0.65 * max(-dot(normal, u_lightDir), 0.0);
      float rimShade = 1.0 - smoothstep(0.0, u_rimPx * 1.5, inside);
      col *= 1.0 - u_scheme * (0.10 * edge * edge + 0.22 * rimShade) * away;
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

export interface EngineOptions {
  /**
   * Where the glass canvas goes in the page. By default it is appended to
   * <body> at z-index -1, under all DOM content, which is right when the glass
   * only refracts a canvas. To put glass over DOM content, give it a parent
   * inside the page's stacking context and a z-index above the backdrop
   * elements; lens elements then need a higher z-index than the canvas so
   * their own content stays on top of the glass. The canvas is
   * `position: fixed`, so no ancestor of the parent may have a transform or filter.
   */
  overlayParent?: HTMLElement;
  overlayZIndex?: number;
}

export interface BackdropOptions {
  /**
   * Live mode. Pass the `drawable` child of a `<canvas content="drawable">`
   * (and the canvas itself as the backdrop element): the browser paints the
   * child into the canvas through the HTML-in-canvas API and the engine uploads
   * it whenever it repaints. Omit it to use an html2canvas snapshot instead.
   */
  liveContent?: HTMLElement;
}

/** The parts of the experimental HTML-in-canvas API the engine uses */
interface DrawableCanvas extends HTMLCanvasElement {
  onpaint: (() => void) | null;
  requestPaint(): void;
}
interface ElementImageContext extends CanvasRenderingContext2D {
  drawElementImage(element: Element, dx: number, dy: number, dwidth: number, dheight: number): void;
}

/** True when the browser can paint DOM elements into a canvas (HTML-in-canvas). */
export function supportsHtmlInCanvas(): boolean {
  return (
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof CanvasRenderingContext2D !== 'undefined' &&
    'requestPaint' in HTMLCanvasElement.prototype &&
    'drawElementImage' in CanvasRenderingContext2D.prototype
  );
}

/** A DOM element kept as a texture and composited behind the glass */
interface BackdropState {
  element: HTMLElement;    // its client rect places the texture each frame
  texture: WebGLTexture;
  width: number;
  height: number;
  ready: boolean;
  live: boolean;
  dirty: boolean;          // live: the source canvas repainted since the last upload
  capturing: boolean;
  recaptureQueued: boolean;
  timer: number;
  clippers: HTMLElement[];   // ancestors whose overflow clips this element
  clippersAge: number;       // frames since `clippers` was last rebuilt
  detach: () => void;
}

/** One level of the frost pyramid */
interface BlurLevel {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

/** Per-lens animation and measurement state */
interface LensState extends LensRegistration {
  luma: number;            // smoothed backdrop luminance under the lens, 0–1
  contrast: number;        // smoothed backdrop busyness, 0–1
  color: [number, number, number];   // smoothed average backdrop colour, 0–1
  appliedVibrancy: string;
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

// Frost. One unit of `frost` is 6 source texels of blur radius. The pyramid
// level is chosen so its texels are about a third of that radius: fine enough
// that 16 taps overlap, coarse enough that they cover the disk.
const FROST_RADIUS_PER_UNIT = 6;
const FROST_LEVEL_SCALE = 0.35;
const FROST_MAX_LEVELS = 5;
// The pyramid's own blur adds to the tap disk, so the disk shrinks to keep the
// total close to a plain disk of the requested radius.
const FROST_DISK_COMPENSATION = 0.87;

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
  private blitProgram: WebGLProgram;
  private downsampleProgram: WebGLProgram;
  private blurLevels: BlurLevel[] = [];
  private blurLevelCount = 0;   // levels valid for the current frame
  private frameSource: WebGLTexture | null = null;   // what the glass refracts this frame
  private texture: WebGLTexture;
  private sceneTexture: WebGLTexture;
  private sceneFbo: WebGLFramebuffer;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private backdrops: BackdropState[] = [];
  private metricsTexture: WebGLTexture;
  private metricsFbo: WebGLFramebuffer;
  private metricsPixels = new Uint8Array(METRICS_MAX_LENSES * METRICS_CELLS * METRICS_CELLS * 4);
  private lenses: LensState[] = [];
  private animFrameId = 0;
  private liveSource: HTMLCanvasElement | null = null;
  private snapshotRoot: HTMLElement | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private metricsUniforms = new Map<string, WebGLUniformLocation | null>();
  private blitUniforms = new Map<string, WebGLUniformLocation | null>();
  private downsampleUniforms = new Map<string, WebGLUniformLocation | null>();
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

  constructor(snapshotRootOrCanvas: HTMLElement | HTMLCanvasElement, options: EngineOptions = {}) {
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
      z-index: ${options.overlayZIndex ?? -1};
    `;
    this.overlayCanvas.setAttribute('data-liquid-glass-overlay', '');
    (options.overlayParent ?? document.body).appendChild(this.overlayCanvas);

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
    const blitProg = createProgram(gl, BLIT_VERTEX_SHADER, BLIT_FRAGMENT_SHADER);
    const downsampleProg = createProgram(gl, VERTEX_SHADER, DOWNSAMPLE_FRAGMENT_SHADER);
    if (!prog || !metricsProg || !blitProg || !downsampleProg) throw new Error('Shader compilation failed');
    this.program = prog;
    this.metricsProgram = metricsProg;
    this.blitProgram = blitProg;
    this.downsampleProgram = downsampleProg;

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

    // Scene target: the source with DOM backdrops composited over it.
    // Allocated on first use, at the overlay's size.
    this.sceneTexture = this._createTexture();
    this.sceneFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Source texture
    this.texture = this._createTexture();

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
      color: [0, 0, 0],
      appliedVibrancy: '',
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

  /**
   * Put a DOM element behind the glass. Its rendering is kept as a texture and
   * drawn at the element's current position every frame, so it follows
   * scrolling and layout without being re-captured.
   *
   * Snapshot mode (default) captures it with html2canvas and re-captures when
   * it resizes or its text / children change; other visual changes (hover
   * states, CSS animations) need refreshBackdrops(). Live mode (see
   * BackdropOptions.liveContent) has no such limit.
   */
  addBackdrop(element: HTMLElement, options: BackdropOptions = {}) {
    if (this.backdrops.some(b => b.element === element)) return;
    const backdrop: BackdropState = {
      element,
      texture: this._createTexture(),
      width: 0,
      height: 0,
      ready: false,
      live: false,
      dirty: false,
      capturing: false,
      recaptureQueued: false,
      timer: 0,
      clippers: [],
      clippersAge: Infinity,
      detach: () => {},
    };
    const live = options.liveContent && element instanceof HTMLCanvasElement && supportsHtmlInCanvas();
    backdrop.detach = live
      ? this._attachLiveBackdrop(backdrop, element as DrawableCanvas, options.liveContent!)
      : this._attachSnapshotBackdrop(backdrop);
    this.backdrops.push(backdrop);
  }

  removeBackdrop(element: HTMLElement) {
    for (const backdrop of this.backdrops) {
      if (backdrop.element === element) this._releaseBackdrop(backdrop);
    }
    this.backdrops = this.backdrops.filter(b => b.element !== element);
  }

  /** Re-capture every snapshot backdrop (live ones update themselves). */
  refreshBackdrops() {
    for (const backdrop of this.backdrops) {
      if (!backdrop.live) void this._captureBackdrop(backdrop);
    }
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
    for (const backdrop of this.backdrops) this._releaseBackdrop(backdrop);
    this.backdrops = [];
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
    lens.element.style.removeProperty('--glass-fg');
    lens.element.style.removeProperty('--glass-fg-secondary');
    if (lens.appliedScale) lens.element.style.removeProperty('scale');
  }

  // ── Private: DOM backdrops ──

  /**
   * Live backdrop. `canvas` is a <canvas content="drawable"> and `content` its
   * `drawable` child. The browser fires `paint` whenever the child would render
   * differently; we redraw it into the canvas (which is what the user sees, and
   * what keeps the child interactive) and flag the texture for upload.
   */
  private _attachLiveBackdrop(backdrop: BackdropState, canvas: DrawableCanvas, content: HTMLElement) {
    backdrop.live = true;
    const ctx = canvas.getContext('2d') as ElementImageContext | null;
    if (!ctx) return () => {};

    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      try {
        ctx.drawElementImage(content, 0, 0, width, height);
        backdrop.dirty = true;
      } catch {
        // The browser has not recorded a snapshot of the element yet; a later paint will have one
      }
    };

    canvas.onpaint = paint;
    // A resize clears the canvas without necessarily firing `paint`
    const observer = new ResizeObserver(() => canvas.requestPaint());
    observer.observe(canvas);
    canvas.requestPaint();

    return () => {
      observer.disconnect();
      canvas.onpaint = null;
    };
  }

  /** Snapshot backdrop: capture now, and again when the element resizes or its content changes */
  private _attachSnapshotBackdrop(backdrop: BackdropState) {
    const schedule = () => {
      clearTimeout(backdrop.timer);
      backdrop.timer = window.setTimeout(() => { void this._captureBackdrop(backdrop); }, 200);
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(backdrop.element);
    // Text and structure only. Attribute changes are skipped on purpose: the
    // engine itself writes attributes and styles on lens elements every frame.
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(backdrop.element, { childList: true, characterData: true, subtree: true });
    void this._captureBackdrop(backdrop);

    return () => {
      clearTimeout(backdrop.timer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }

  private async _captureBackdrop(backdrop: BackdropState) {
    if (this.destroyed) return;
    if (backdrop.capturing) {
      backdrop.recaptureQueued = true;
      return;
    }
    backdrop.capturing = true;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(backdrop.element, {
        allowTaint: false,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        scale: Math.min(2, window.devicePixelRatio || 1),
        ignoreElements: (el: Element) =>
          el.hasAttribute('data-liquid-glass-overlay') ||
          el.hasAttribute('data-liquid-glass-ignore'),
        onclone: (clonedDoc: Document) => {
          clonedDoc.querySelectorAll<HTMLElement>('[data-liquid-glass-lens]').forEach(el => {
            el.style.visibility = 'hidden';
          });
        },
      });
      if (!this.destroyed && this.backdrops.includes(backdrop) && canvas.width > 0 && canvas.height > 0) {
        this._uploadBackdrop(backdrop, canvas);
      }
    } catch (err) {
      console.error('Liquid glass backdrop capture failed:', err);
    } finally {
      backdrop.capturing = false;
      if (backdrop.recaptureQueued && !this.destroyed) {
        backdrop.recaptureQueued = false;
        void this._captureBackdrop(backdrop);
      }
    }
  }

  private _uploadBackdrop(backdrop: BackdropState, source: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, backdrop.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // Backdrops have transparency; premultiply so they filter and blend correctly
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (source.width !== backdrop.width || source.height !== backdrop.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      backdrop.width = source.width;
      backdrop.height = source.height;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    backdrop.ready = true;
    backdrop.dirty = false;
  }

  /**
   * The ancestors that clip a backdrop: those with a non-visible overflow that
   * actually contain it. An absolutely positioned element is only clipped by
   * ancestors at or above its containing block, and a fixed one by none.
   */
  private _findClippers(element: HTMLElement) {
    const clippers: HTMLElement[] = [];
    let position = getComputedStyle(element).position;
    for (let node = element.parentElement; node && position !== 'fixed'; node = node.parentElement) {
      const style = getComputedStyle(node);
      const containsAbsolute = style.position !== 'static' || style.transform !== 'none';
      // Between an absolute element and its containing block, ancestors do not clip it
      if (position === 'absolute' && !containsAbsolute) continue;
      const clips = (value: string) => value !== 'visible';
      if (clips(style.overflowX) || clips(style.overflowY)) clippers.push(node);
      position = style.position;
    }
    return clippers;
  }

  /**
   * The part of a backdrop that is actually visible, in client px: its own rect
   * cut down by every clipping ancestor's padding box. Returns null when
   * nothing is left. Clips are rectangular; an ancestor's rounded corners are
   * not followed.
   */
  private _visibleRect(backdrop: BackdropState, rect: DOMRect) {
    // The ancestor list is cached and refreshed about twice a second
    if (backdrop.clippersAge > 30) {
      backdrop.clippers = this._findClippers(backdrop.element);
      backdrop.clippersAge = 0;
    }
    backdrop.clippersAge++;

    let left = rect.left;
    let top = rect.top;
    let right = rect.right;
    let bottom = rect.bottom;
    for (const clipper of backdrop.clippers) {
      const box = clipper.getBoundingClientRect();
      // Padding box: inside the border, excluding any scrollbar
      const boxLeft = box.left + clipper.clientLeft;
      const boxTop = box.top + clipper.clientTop;
      left = Math.max(left, boxLeft);
      top = Math.max(top, boxTop);
      right = Math.min(right, boxLeft + clipper.clientWidth);
      bottom = Math.min(bottom, boxTop + clipper.clientHeight);
    }
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom };
  }

  private _releaseBackdrop(backdrop: BackdropState) {
    backdrop.detach();
    this.gl.deleteTexture(backdrop.texture);
  }

  /**
   * Build the scene the glass refracts: the source, with every ready backdrop
   * drawn over it where its element currently is. Rows are stored top-first,
   * like an uploaded canvas, so the glass shader can sample either the same way.
   */
  private _composeScene(viewW: number, viewH: number) {
    const gl = this.gl;
    const width = this.overlayCanvas.width;
    const height = this.overlayCanvas.height;
    if (width !== this.sceneWidth || height !== this.sceneHeight) {
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.sceneWidth = width;
      this.sceneHeight = height;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.blitProgram);
    gl.uniform1i(this._blitUniform('u_texture'), 0);

    // The source fills the scene
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform4f(this._blitUniform('u_rect'), -1, -1, 2, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Backdrops, premultiplied, at their live client rects (top-first rows:
    // the top of the viewport is the bottom of clip space). Each is scissored
    // to the part its ancestors leave visible, so the glass cannot see content
    // that an `overflow: hidden` container hides from the user.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    const scaleX = width / viewW;
    const scaleY = height / viewH;
    for (const backdrop of this.backdrops) {
      if (!backdrop.ready) continue;
      const rect = backdrop.element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.top > viewH || rect.right < 0 || rect.left > viewW) continue;
      const visible = this._visibleRect(backdrop, rect);
      if (!visible) continue;
      // Scene rows run top-first, so a client y maps straight to a scene row
      const sx = Math.max(0, Math.round(visible.left * scaleX));
      const sy = Math.max(0, Math.round(visible.top * scaleY));
      const sw = Math.min(width, Math.round(visible.right * scaleX)) - sx;
      const sh = Math.min(height, Math.round(visible.bottom * scaleY)) - sy;
      if (sw <= 0 || sh <= 0) continue;
      gl.scissor(sx, sy, sw, sh);
      gl.bindTexture(gl.TEXTURE_2D, backdrop.texture);
      gl.uniform4f(
        this._blitUniform('u_rect'),
        -1 + (2 * rect.left) / viewW,
        -1 + (2 * rect.top) / viewH,
        (2 * rect.width) / viewW,
        (2 * rect.height) / viewH,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ── Private: frost pyramid ──

  /**
   * Blur the backdrop into a pyramid: level 1 is the source at half size,
   * level 2 a quarter, and so on, each filtered from the one before. Built once
   * per frame for the whole viewport, and only on frames where some lens is
   * frosted. Level 0 is the source itself.
   */
  private _buildBlurPyramid(source: WebGLTexture, sourceWidth: number, sourceHeight: number) {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.downsampleProgram);
    gl.uniform1i(this._downsampleUniform('u_texture'), 0);

    let input = source;
    let width = sourceWidth;
    let height = sourceHeight;
    let count = 0;
    for (let i = 0; i < FROST_MAX_LEVELS; i++) {
      width = Math.max(1, Math.ceil(width / 2));
      height = Math.max(1, Math.ceil(height / 2));
      if (Math.min(width, height) < 4) break;

      let level = this.blurLevels[i];
      if (!level) {
        const texture = this._createTexture();
        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        level = { texture, fbo, width: 0, height: 0 };
        this.blurLevels[i] = level;
      }
      if (level.width !== width || level.height !== height) {
        gl.bindTexture(gl.TEXTURE_2D, level.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        level.width = width;
        level.height = height;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, level.fbo);
      gl.viewport(0, 0, width, height);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform2f(this._downsampleUniform('u_halfPixel'), 0.5 / width, 0.5 / height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      input = level.texture;
      count++;
    }
    this.blurLevelCount = count;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Whether a lens will be frosted this frame, after accessibility preferences */
  private _isFrosted(config: GlassConfig, env: Environment) {
    return config.frost > 0 || env.reduceTransparency;
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

  private _createTexture() {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private _blitUniform(name: string) {
    let location = this.blitUniforms.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.blitProgram, name);
      this.blitUniforms.set(name, location);
    }
    return location;
  }

  private _downsampleUniform(name: string) {
    let location = this.downsampleUniforms.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.downsampleProgram, name);
      this.downsampleUniforms.set(name, location);
    }
    return location;
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

    // Live backdrops that repainted since the last frame
    for (const backdrop of this.backdrops) {
      if (backdrop.live && backdrop.dirty) {
        const source = backdrop.element as HTMLCanvasElement;
        if (source.width > 0 && source.height > 0) this._uploadBackdrop(backdrop, source);
      }
    }

    // With DOM backdrops the glass refracts the composed scene; without any it
    // reads the source directly and the extra pass is skipped.
    const useScene = this.backdrops.some(b => b.ready);
    if (useScene) this._composeScene(viewW, viewH);
    const sourceTexture = useScene ? this.sceneTexture : this.texture;
    const sourceWidth = useScene ? this.sceneWidth : this.textureWidth;
    const sourceHeight = useScene ? this.sceneHeight : this.textureHeight;
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

    if (this.frameCount % METRICS_INTERVAL === 1) {
      this._sampleBackdrop(frames, viewW, viewH);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    }

    // Frost pyramid, only when something on screen is frosted
    this.blurLevelCount = 0;
    if (frames.some(frame => this._isFrosted(frame.lens.config, env))) {
      this._buildBlurPyramid(sourceTexture, sourceWidth, sourceHeight);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    }
    this.frameSource = sourceTexture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (frames.length === 0) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
    gl.useProgram(this.program);
    gl.uniform1i(this._uniform('u_texture'), 0);
    gl.uniform1i(this._uniform('u_blurA'), 1);
    gl.uniform1i(this._uniform('u_blurB'), 2);
    gl.uniform2f(this._uniform('u_texResolution'), sourceWidth, sourceHeight);

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
    this._applyVibrancy(lens);

    // Materialize in
    lens.appear = env.reduceMotion ? 1 : Math.min(1, lens.appear + dt / 0.45);
  }

  /**
   * Vibrancy: foreground colours for content on the glass, derived from what is
   * behind it. `--glass-fg` is the primary colour (near white on dark glass,
   * near black on light). `--glass-fg-secondary` takes the backdrop's own hue,
   * saturates it and pushes it toward the primary, so secondary text looks
   * tinted by the content under the glass instead of flat grey.
   */
  private _applyVibrancy(lens: LensState) {
    const light = lens.schemeTarget === 1;
    const [r, g, b] = lens.color;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const toward = light ? 0 : 1;
    const channel = (value: number) => {
      const saturated = clamp(luma + (value - luma) * 2.2, 0, 1);
      // Quantized so tiny backdrop changes do not rewrite the style every frame
      return Math.round((mix(saturated, toward, 0.58) * 255) / 6) * 6;
    };
    const key = `${light ? 'l' : 'd'}:${channel(r)},${channel(g)},${channel(b)}`;
    if (key === lens.appliedVibrancy) return;
    lens.appliedVibrancy = key;
    const style = lens.element.style;
    style.setProperty('--glass-fg', light ? 'rgba(11, 15, 20, 0.92)' : 'rgba(255, 255, 255, 0.94)');
    style.setProperty('--glass-fg-secondary', `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, 0.86)`);
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
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let y = 0; y < METRICS_CELLS; y++) {
        for (let x = 0; x < METRICS_CELLS; x++) {
          const o = y * rowStride + (i * METRICS_CELLS + x) * 4;
          const luma = (0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]) / 255;
          sum += luma;
          sumSq += luma * luma;
          sumR += pixels[o];
          sumG += pixels[o + 1];
          sumB += pixels[o + 2];
        }
      }
      const mean = sum / cells;
      const average: [number, number, number] = [sumR / cells / 255, sumG / cells / 255, sumB / cells / 255];
      const deviation = Math.sqrt(Math.max(0, sumSq / cells - mean * mean));
      const contrast = clamp(deviation / 0.2, 0, 1);

      const lens = frames[i].lens;
      if (!lens.hasMetrics) {
        lens.luma = mean;
        lens.contrast = contrast;
        lens.color = average;
        lens.hasMetrics = true;
        // Start in the right scheme instead of animating in from dark
        lens.schemeTarget = lens.config.adaptive && mean > 0.52 ? 1 : 0;
        lens.scheme = lens.schemeTarget;
      } else {
        lens.luma = mix(lens.luma, mean, 0.35);
        lens.contrast = mix(lens.contrast, contrast, 0.35);
        lens.color = [
          mix(lens.color[0], average[0], 0.35),
          mix(lens.color[1], average[1], 0.35),
          mix(lens.color[2], average[2], 0.35),
        ];
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

    // Frost: pick the two pyramid levels that bracket the wanted blur. `level`
    // is fractional; below 0 the source itself is fine enough to tap directly.
    const frostRadius = frost * FROST_RADIUS_PER_UNIT;
    const level = frostRadius > 0 ? Math.log2(FROST_LEVEL_SCALE * frostRadius) : 0;
    const levelA = clamp(Math.floor(level), 0, this.blurLevelCount);
    const levelB = Math.min(levelA + 1, this.blurLevelCount);
    const levelTexture = (index: number) => (index === 0 ? this.frameSource : this.blurLevels[index - 1].texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, levelTexture(levelA));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, levelTexture(levelB));
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(this._uniform('u_frost'), frost);
    gl.uniform1f(this._uniform('u_blurMix'), levelB > levelA ? clamp(level - levelA, 0, 1) : 0);
    gl.uniform1f(
      this._uniform('u_frostRadius'),
      frostRadius * mix(1, FROST_DISK_COMPENSATION, clamp(level, 0, 1)),
    );
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
    gl.uniform1f(this._uniform('u_scheme'), scheme);

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
