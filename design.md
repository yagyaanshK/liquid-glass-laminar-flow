# Liquid Glass — Design & Implementation Reference

> A comprehensive compilation of techniques, tunable parameters, and architectural patterns from the leading open-source liquid glass implementations on the web.

---

## Table of Contents

1. [Core Concept](#1-core-concept)
2. [Implementation Approaches](#2-implementation-approaches)
3. [Library Comparison](#3-library-comparison)
4. [Tunable Parameters Reference](#4-tunable-parameters-reference)
5. [GLSL Shader Architecture](#5-glsl-shader-architecture)
6. [Integration Patterns](#6-integration-patterns)
7. [Performance Considerations](#7-performance-considerations)
8. [Community Insights](#8-community-insights)
9. [Sources](#9-sources)

---

## 1. Core Concept

Apple's "Liquid Glass" (introduced in iOS/macOS 26) is a UI design language where interface elements behave as if they are shaped from **thick, curved glass**. The effect involves:

- **Refraction** — background pixels are displaced through the curved surface
- **Bevel/Edge distortion** — edges bend light more aggressively than the center (like a real lens)
- **Fresnel reflection** — brighter reflections at glancing angles
- **Chromatic aberration** — RGB channels split along refracted edges
- **Specular highlights** — animated light reflections sweeping across the glass surface
- **Drop shadows** — soft shadows beneath the glass to ground it

> **Why CSS `backdrop-filter` fails:** CSS blur only averages pixels in a flat kernel. It cannot *displace* pixels sideways. A real glass lens bends light directionally based on surface curvature — this requires per-pixel UV offset computation, which is a shader operation.

---

## 2. Implementation Approaches

### Approach A: WebGL Shader over DOM Snapshot / Live Canvas

> 📖 **Read the deep dive:** 
> - [WebGL Live Canvas Implementation](./implementation_details_webgl.md)
> - [DOM Snapshot (html2canvas) Implementation](./implementation_details_html2canvas.md)

Used by: **liquidGL (NaughtyDuk)**, **@ybouane/liquidglass**, **liquid-glass-studio (iyinchao)**

**How it works:**
1. Capture the backend pixels (either via a live WebGL `<canvas>` or `html2canvas` DOM snapshot)
2. Upload that texture to WebGL
3. For each glass element, render a fullscreen quad with a custom fragment shader that:
   - Computes a signed distance field (SDF) from the element's rounded-rect boundary
   - Uses the SDF to derive the edge factor and normal direction
   - Offsets UV coordinates based on the edge factor to simulate refraction
   - Optionally applies Gaussian blur, chromatic aberration, specular highlights
4. Render the output onto a `<canvas>` overlaid on the DOM element

**Pros:** True pixel displacement, works cross-browser, dynamic content support
**Cons:** Requires DOM snapshot (expensive), WebGL context limits (~16 per page)

### Approach B: CSS + SVG Displacement Maps

> 📖 **Read the deep dive:** 
> - [CSS + SVG Filters Implementation](./implementation_details_css_svg.md)

Used by: **kube.io blog post**

**How it works:**
1. Pre-generate an SVG `<feDisplacementMap>` that encodes the refraction normal map
2. Apply it via `backdrop-filter: url(#svg-filter)` in CSS

**Pros:** No JavaScript needed, can pre-render at build time
**Cons:** Chrome-only (SVG filters as `backdrop-filter`), no dynamic content, limited control

### Approach C: React Three Fiber (`MeshTransmissionMaterial`)

Used by: **@react-three/drei**

**How it works:**
1. Render UI entirely inside a WebGL canvas using `<Html>` overlays
2. Use Three.js `MeshTransmissionMaterial` with IOR, transmission, thickness properties
3. The material physically ray-traces refraction through mesh geometry

**Pros:** Physically accurate, supports complex 3D shapes
**Cons:** Cannot refract real DOM elements (only WebGL scene objects), heavy GPU cost, not suitable for traditional UI

---

## 3. Library Comparison

| Feature | liquidGL (NaughtyDuk) | @ybouane/liquidglass | liquid-glass-studio (iyinchao) |
|---|---|---|---|
| **Stars** | 431 ⭐ | 91 ⭐ | 392 ⭐ |
| **Renderer** | WebGL 1/2 | WebGL 2 | WebGL2 + WebGPU |
| **DOM Snapshot** | html2canvas | html-to-image | Custom |
| **Glass-on-glass** | ❌ | ✅ (layered compositing) | ✅ |
| **Dynamic content** | ✅ (video auto-detect) | ✅ (`data-dynamic` + `markChanged()`) | ✅ |
| **Blob merging** | ❌ | ❌ | ✅ (SDF smooth merge) |
| **Superellipse** | ❌ | ❌ | ✅ |
| **Dispersion** | ❌ | ✅ (chromatic aberration) | ✅ |
| **Button mode** | ❌ | ✅ (hover/press states) | ❌ |
| **Floating/drag** | ❌ | ✅ | ✅ |
| **Fresnel** | ❌ | ✅ | ✅ |
| **Tilt on hover** | ✅ | ❌ | ❌ |
| **Smooth scroll sync** | ✅ (Lenis/Locomotive) | ❌ | ❌ |
| **NPM package** | ❌ (script tag) | ✅ `@ybouane/liquidglass` | ❌ (clone repo) |
| **License** | MIT | Not specified | MIT |

---

## 4. Tunable Parameters Reference

### 4.1 liquidGL (NaughtyDuk)

| Parameter | Type | Default | Range | Description |
|---|---|---|---|---|
| `target` | `string` | `'.liquidGL'` | CSS selector | Element(s) to apply glass effect |
| `snapshot` | `string` | `'body'` | CSS selector | Area used for refraction source |
| `resolution` | `number` | `2.0` | 0.1–3.0 | Snapshot quality multiplier |
| `refraction` | `number` | `0.01` | 0–1 | Base refraction strength |
| `bevelDepth` | `number` | `0.08` | 0–1 | Intensity of the edge bevel |
| `bevelWidth` | `number` | `0.15` | 0–1 | Width of bevel as proportion of element |
| `frost` | `number` | `0` | 0+ | Blur radius in px (0 = crystal clear) |
| `shadow` | `boolean` | `true` | — | Adds a soft drop-shadow |
| `specular` | `boolean` | `true` | — | Animated sweeping light highlights |
| `reveal` | `string` | `'fade'` | `'none'` \| `'fade'` | Entry animation type |
| `tilt` | `boolean` | `false` | — | Tilt on hover enabled |
| `tiltFactor` | `number` | `5` | 0+ | Tilt intensity |
| `magnify` | `number` | `1` | 0.001–3.0 | Magnification of lens content |

**Presets from liquidGL:**
```js
// Frosted
{ refraction: 0, bevelDepth: 0.052, bevelWidth: 0.211, frost: 2, shadow: true, specular: true }

// Heavy Bevel  
{ refraction: 0.073, bevelDepth: 0.2, bevelWidth: 0.156, frost: 2, shadow: true, specular: false }

// Crystal Clear Edge
{ refraction: 0.03, bevelDepth: 0, bevelWidth: 0.273, frost: 0, shadow: false, specular: false }

// Subtle Frost
{ refraction: 0, bevelDepth: 0.035, bevelWidth: 0.119, frost: 0.9, shadow: true, specular: true }

// Deep Refraction
{ refraction: 0.047, bevelDepth: 0.136, bevelWidth: 0.076, frost: 2, shadow: true, specular: false }
```

---

### 4.2 @ybouane/liquidglass

| Parameter | Type | Default | Description |
|---|---|---|---|
| `blurAmount` | `number` | `0.00` | Gaussian blur intensity (0 = sharp, 1 = full frosted) |
| `refraction` | `number` | `0.69` | Refraction displacement strength |
| `chromAberration` | `number` | `0.05` | RGB channel split at refracting edges |
| `edgeHighlight` | `number` | `0.05` | Inner-stroke rim light intensity |
| `specular` | `number` | `0.00` | Specular highlight intensity |
| `fresnel` | `number` | `1.00` | Fresnel reflection strength (brighter at glancing angles) |
| `distortion` | `number` | `0.00` | Additional distortion amount |
| `cornerRadius` | `number` | `65` | Border radius in px |
| `zRadius` | `number` | `40` | Depth/thickness of the glass bevel in px |
| `opacity` | `number` | `1.00` | Overall glass opacity |
| `saturation` | `number` | `0.00` | Color saturation boost |
| `tintStrength` | `number` | `0.00` | Tint overlay strength |
| `brightness` | `number` | `0.00` | Brightness adjustment (-1 to 1) |
| `shadowOpacity` | `number` | `0.30` | Drop shadow opacity |
| `shadowSpread` | `number` | `10` | Shadow blur radius |
| `shadowOffsetY` | `number` | `1` | Shadow vertical offset |
| `floating` | `boolean` | `false` | Makes element draggable |
| `button` | `boolean` | `false` | Adds hover/press interaction (brighten on hover, flatten on press) |
| `bevelMode` | `0 \| 1` | `0` | 0 = standard flat bevel, 1 = dome/magnifier (half-sphere lens when `cornerRadius === zRadius`) |

**Example Configurations:**
```js
// Frosted Panel
{ blurAmount: 0.25, cornerRadius: 30 }

// Dark Glass
{ brightness: -0.3, blurAmount: 0.25, cornerRadius: 50 }

// Button
{ button: true, cornerRadius: 24 }

// Dome Magnifier
{ bevelMode: 1, cornerRadius: 50, zRadius: 50, floating: true, blurAmount: 0, refraction: 1.2 }
```

---

### 4.3 liquid-glass-studio (iyinchao)

This project provides the most advanced feature set with:

| Feature | Description |
|---|---|
| **Refraction** | SDF-based UV displacement with configurable strength |
| **Dispersion** | Chromatic aberration / rainbow fringe at edges |
| **Fresnel reflection** | View-angle-dependent surface reflection |
| **Superellipse shapes** | iOS-style rounded rectangles (not just CSS border-radius) |
| **Blob effect** | Multiple glass shapes smoothly merge using SDF `smin()` |
| **Glare** | Customizable angle and intensity of specular glare |
| **Gaussian blur masking** | Multi-pass blur for performance |
| **Anti-aliasing** | SDF-based edge AA |
| **Spring animations** | Configurable spring-based shape transitions |
| **Dual backend** | WebGL2 with WebGPU fallback |

**Technical highlights:**
- Uses Inigo Quilez SDF functions for shape definitions
- Smooth merge via `smin()` polynomial smoothing
- Multi-pass rendering pipeline for performant Gaussian blur
- Custom GLSL/WGSL shader implementations
- Written in TypeScript (59.2%), GLSL (24.4%), WGSL (9.6%), SCSS (6.2%)

---

## 5. GLSL Shader Architecture

### Core Algorithm (from liquidGL source)

The shader uses a signed distance field to compute per-pixel refraction:

```glsl
// 1. Compute signed distance to rounded rect boundary
float udRoundBox(vec2 p, vec2 b, float r) {
    return length(max(abs(p) - b + r, 0.0)) - r;
}

// 2. Compute edge factor (0 at center, 1 at edge)
float edgeFactor(vec2 uv, float radius_px) {
    vec2 p_px = (uv - 0.5) * u_resolution;
    vec2 b_px = 0.5 * u_resolution;
    float d = -udRoundBox(p_px, b_px, radius_px);
    float bevel_px = u_bevelWidth * min(u_resolution.x, u_resolution.y);
    return 1.0 - smoothstep(0.0, bevel_px, d);
}

// 3. Calculate refraction offset
float edge = edgeFactor(v_uv, u_radius);
float offsetAmt = edge * u_refraction + pow(edge, 10.0) * u_bevelDepth;
float centreBlend = smoothstep(0.15, 0.45, length(p));
vec2 offset = normalize(p) * offsetAmt * centreBlend;

// 4. Apply offset to UV coordinates
vec2 refracted = mapped + offset;
vec4 refrCol = texture2D(u_tex, refracted);
```

**Key insight:** The `pow(edge, 10.0)` raises the edge factor to the 10th power, creating a very sharp edge-only bevel effect — this is what makes the distortion concentrate at the glass boundary rather than being spread across the entire surface.

### Frost (Gaussian Blur)
```glsl
if (u_frost > 0.0) {
    float radius = u_frost * 4.0;
    vec4 sum = vec4(0.0);
    const int SAMPLES = 16;
    for (int i = 0; i < SAMPLES; i++) {
        float angle = random(v_uv + float(i)) * 6.283185;
        float dist = sqrt(random(v_uv - float(i))) * radius;
        vec2 off = vec2(cos(angle), sin(angle)) * texel * dist;
        sum += texture2D(u_tex, sampleUV + off);
    }
    refrCol = sum / float(SAMPLES);
}
```

### Specular Highlights
```glsl
if (u_specular) {
    vec2 lp1 = vec2(sin(u_time*0.2), cos(u_time*0.3))*0.6 + 0.5;
    vec2 lp2 = vec2(sin(u_time*-0.4+1.5), cos(u_time*0.25-0.5))*0.6 + 0.5;
    float h = 0.0;
    h += smoothstep(0.4, 0.0, distance(v_uv, lp1)) * 0.1;
    h += smoothstep(0.5, 0.0, distance(v_uv, lp2)) * 0.08;
    final.rgb += h;
}
```

---

## 6. Integration Patterns

### Pattern A: Script Tag (liquidGL)
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" defer></script>
<script src="/scripts/liquidGL.js" defer></script>
<script>
document.addEventListener("DOMContentLoaded", () => {
    liquidGL({
        target: ".my-glass",
        snapshot: "body",
        resolution: 2.0,
        refraction: 0.03,
        bevelDepth: 0.08,
        bevelWidth: 0.15,
        frost: 0,
        shadow: true,
        specular: true,
    });
});
</script>
```

### Pattern B: NPM Module (@ybouane/liquidglass)
```ts
import { LiquidGlass } from '@ybouane/liquidglass';

const glassEl = document.querySelector('.my-glass');
glassEl.dataset.config = JSON.stringify({
    blurAmount: 0.25,
    refraction: 0.69,
    cornerRadius: 40,
    button: true,
});

const instance = await LiquidGlass.init({
    root: document.querySelector('#root'),
    glassElements: [glassEl],
});

// Cleanup
instance.destroy();
```

### Pattern C: CDN Import
```html
<script type="module">
import { LiquidGlass } from 'https://cdn.jsdelivr.net/npm/@ybouane/liquidglass/dist/index.js';
// ...
</script>
```

---

## 7. Performance Considerations

### From HN Discussion & Library Authors

| Concern | Mitigation |
|---|---|
| DOM snapshot is expensive | Use `resolution: 1.0` (not 2.0) for large pages; cache static content |
| WebGL context limits | Browsers cap at ~16 simultaneous contexts. Use one renderer instance per page |
| `data-dynamic` re-captures per frame | Apply only to genuinely changing elements (animations, video). For one-shot changes, use `markChanged()` instead |
| Window resize triggers recapture | Debounce resize handlers (250ms+) |
| Safari SVG filter rendering | Safari is slow with SVG backdrop-filters; prefer WebGL approach |
| Mobile GPU | Reduce `resolution`, limit `samples` (frost), disable `specular` on mobile |
| Glass-on-glass (layered) | Each layer requires a full compositing pass. Limit to 2-3 layers |

### From kube.io (CSS/SVG approach):
> "WebGL comes with drawbacks: shaders can't directly manipulate the DOM render. To make refraction work, you'd have to re-render everything into a canvas—which isn't really 'the web' anymore."

> "With the SVG/CSS approach, you can pre-render the displacement map (at build time or on the backend) and get the refraction visible on the very first frame."

---

## 8. Community Insights

### From Hacker News (HN thread #45174297)

- **Anti-aliasing matters:** "Even on a 4K display, the jaggies are visible, especially because of the extreme contrast of the caustics behind the dark background." — *delta_p_delta_x*
- **Chromatic aberration adds realism:** "I would love to see chromatic aberration along displaced areas and higher resolution in the refraction." — *seanw265*
- **Performance varies by device:** "It ran perfectly smoothly on M1 MBA" vs reports of stutter on older hardware
- **CSS can leverage GPU:** CSS `backdrop-filter` does use GPU compositing, but cannot do per-pixel displacement
- **Apple likely has silicon support:** "Apple has almost certainly baked something into the silicon to help handle the UI" — *StrangeDoctor*

### Other notable libraries from the thread:
- `nkzw-tech/liquid-glass` — referenced by cpojer (ex-Meta)
- `dashersw/liquid-glass-js` — vanilla JS implementation
- `real-glass.vercel.app` — WebGL demo

---

## 9. Sources

### Primary Repositories
| Repository | Author | URL |
|---|---|---|
| liquidGL | NaughtyDuk | https://github.com/naughtyduk/liquidGL |
| liquidglass | ybouane | https://github.com/ybouane/liquidglass |
| liquid-glass-studio | iyinchao | https://github.com/iyinchao/liquid-glass-studio |

### Live Demos
| Demo | URL |
|---|---|
| liquidGL demo | https://liquidgl.naughtyduk.com |
| @ybouane/liquidglass playground | https://liquid-glass.ybouane.com/ |
| liquid-glass-studio | https://liquid-glass-studio.vercel.app/ |

### Articles & Discussions
| Title | URL |
|---|---|
| Liquid Glass in the Browser: Refraction with CSS and SVG (kube.io) | https://kube.io/blog/liquid-glass-css-svg/ |
| HN Discussion: Liquid Glass in the Browser | https://news.ycombinator.com/item?id=45174297 |
| Reddit r/webdev: Liquid Glass Studio discussion | https://www.reddit.com/r/webdev/comments/1lhfro0/liquid_glass_studio_yet_another_liquid_glass/ |

### Related Resources
| Resource | URL |
|---|---|
| Inigo Quilez — SDF functions | https://iquilezles.org/articles/distfunctions2d/ |
| Inigo Quilez — Smooth merge (smin) | https://iquilezles.org/articles/smin/ |
| GPU-accelerated CSS animations (Smashing Magazine) | https://www.smashingmagazine.com/2016/12/gpu-animation-doing-it-right/ |
| nkzw-tech/liquid-glass | https://github.com/nkzw-tech/liquid-glass |
| SVG backdrop-filter spec | https://drafts.fxtf.org/filter-effects-2/#BackdropFilterProperty |
| WebKit bug for SVG filter backdrop | https://bugs.webkit.org/show_bug.cgi?id=127102 |

---

*Last updated: April 19, 2026*


https://dribbble.com/shots/26149756-Liquid-Glass-macOS-Tahoe-26
