# WebGL Live Canvas Implementation Details

This document explains the technical implementation of the "Live Canvas" WebGL approach for liquid glass refraction in this repository.

## Overview
Unlike the static DOM snapshot method, this implementation renders a highly performant custom GLSL fragment shader over an actively animating `<canvas>`. The shader reads pixels from the background canvas to perform real-time refraction and edge distortion. This is the optimal approach for full-viewport backgrounds or games where the background is naturally rendered to a canvas.

## Key Components

### 1. The Background Engine (`BackgroundCanvas.ts`)
Creates a full-screen 2D canvas that continually draws a subtle dark flow field with animated dots, lines, and rings. In a real-world scenario, this could be a Three.js scene, a WebGL video player, or any other animated canvas source.

### 2. The Liquid Glass Engine (`LiquidGlassEngine.ts`)
Manages the WebGL context and rendering cycle. It accepts the source canvas from the Background Engine as a WebGL texture. The first frame allocates the texture with `gl.texImage2D`; subsequent same-size live frames update the existing texture with `gl.texSubImage2D` to avoid reallocating GPU storage every frame.

#### The `startLive(canvas)` Loop
When initialized with `startLive()`, the engine runs a `requestAnimationFrame` loop that updates the WebGL texture from the active background canvas on every frame:

```typescript
// Inside LiquidGlassEngine.startLive()
const loop = () => {
  // Update the texture from the live background canvas
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.u_tex);
  if (canvas.width !== this.textureWidth || canvas.height !== this.textureHeight) {
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
  } else {
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
  }
  
  // Re-draw the shader quad
  this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  
  // Continue loop
  this.liveLoopId = requestAnimationFrame(loop);
};
```

### 3. The GLSL Shader
The core of the effect happens on the GPU. The fragment shader calculates a Signed Distance Field (SDF) of the glass element (a rounded rectangle) and uses the resulting gradients to simulate light bending around the edges.

**Key Visual Features in the Shader:**
- **Refraction:** Displacing the sample position along the shape's surface normal (the SDF gradient), toward the interior, like a convex bevel.
- **Dispersion (Chromatic Aberration):** Sampling red slightly less displaced and blue slightly more displaced than green, along the same direction the lens bends.
- **Rim Light:** A thin specular line where the rim faces the light, a dimmer one on the opposite side, and a soft sheen on the lit bevel.
- **Merging:** Lenses in the same group are one smooth-union SDF, so they blend into each other as they approach.
- **Adaptive Tint and Shadow:** The glass measures the backdrop behind it and flips between dark and light.
- **Gravity Lens Field:** Optional black-hole-inspired radial displacement using a weak-field `theta^2 / r` formula, clipped by the existing SDF shapes.

#### Units and Coordinate Spaces

All shader math runs in **lens-local device pixels with y up** (the space the SDFs are defined in). Offsets are converted to texture UV only when sampling:

```glsl
vec2 pxToUv = u_bounds.zw / u_resolution;                      // lens UV size / lens px size
vec2 refracted = mapped + vec2(offsetPx.x, -offsetPx.y) * pxToUv;   // texture v runs downward
```

- `refraction`, `bevelDepth` and `bevelWidth` are fractions of the lens's **shorter side**. The same config gives the same look on a lens of a given size regardless of viewport size or aspect ratio.
- The bevel width is clamped to the shape's inradius, so the normal field never crosses the medial axis (which would show as a crease).
- `u_bounds` is the lens rect divided by the viewport size. The source texture always covers the viewport, so this mapping does not depend on the texture's resolution.

`u_bounds` became `u_uvRect` once lenses started drawing in groups: it is the UV rect of the group's draw rectangle (the lenses plus a margin for the shadow), not of a single lens.

#### Gravity Lens Field Mode

The WebGL route includes an alternate field mode inspired by `s0xDk/ghostty-blackhole`: https://github.com/s0xDk/ghostty-blackhole

That project achieves smooth terminal lensing by running one full-screen fragment shader over Ghostty's terminal texture and remapping UV coordinates directly. This repo adapts the useful part of that idea as a bounded UI lens:

```glsl
vec2 p = p_px / u_resolution.y;          // lens-height units, aspect-correct
float r = length(p);
vec2 dir = p / max(r, 0.0001);

float defl = (theta * theta / max(r + softness, 0.01)) * exp(-r * r * falloff);
defl *= boundaryFade;

vec2 offsetPx = -dir * defl * u_resolution.y;   // back to px, toward the centre
vec2 refracted = mapped + vec2(offsetPx.x, -offsetPx.y) * pxToUv;
```

The important production detail is that the displacement field itself fades to zero before the SDF boundary. This avoids a visible seam at the clipped edge, which is smoother than blending warped and unwarped colors after sampling.

Controls exposed in the drawer:

- `Gravity Strength`: equivalent to the Einstein-radius term `theta`, measured in lens heights.
- `Gravity Falloff`: damps the far field with `exp(-r*r*falloff)`.
- `Gravity Softness`: clamps the center so the UI lens does not create a singular black-hole collapse.

The mode can also be opened directly with:

```text
/#/webgl?field=gravity
/#/webgl?field=gravity&controls=open
```

## Apple-Style Behaviours

These are the parts of Apple's Liquid Glass that go beyond bending pixels. All of them live in `LiquidGlassEngine.ts`; the html2canvas route inherits them because it uses the same engine.

### Groups and Merging

Each draw call covers a *group* of up to 8 lenses. The shader evaluates one signed distance field for the whole group, joining the shapes with a polynomial smooth minimum:

```glsl
float field(vec2 pos) {
  float d = 1.0e5;
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= u_count) break;
    float di = shapeDistance(pos - u_shapeBox[i].xy, u_shapeBox[i], u_shapeParams[i]);
    d = (i == 0) ? di : smin(d, di, u_blend);
  }
  return d;
}
```

The mask, the bevel, the surface normal (the gradient of `field`) and the shadow all come from this merged field, so the refraction flows continuously across the neck between two lenses. Lenses join a group by sharing `config.group`; `config.blend` is the distance in CSS px at which they start to blend. A lens without a group is a group of one. The group's optics come from its first lens.

Shape *morphing* needs nothing extra: the engine reads each lens element's client rect every frame, so a CSS transition or animation on the element's size or position animates the glass.

### Continuous Corners

`cornerSmoothing` (0–1) replaces the circular corner arc of a rectangle with a superellipse, like the continuous corners on Apple platforms. `continuousCorner()` stretches the corner along the edges (to about 1.53x the radius at 0.6) and raises the exponent `n` so that the apex stays where the circular corner had it; the shader then measures the corner with a p-norm instead of `length()`. A capsule has no room to stretch, so it stays a true semicircle.

### Adaptive Tint and Shadow

Every 6th frame the engine renders the backdrop behind each lens into an 8x8 block of a small framebuffer (16 taps per cell) and reads all blocks back with one `readPixels`. From that it keeps, per lens:

- **luminance** — drives a light/dark `scheme` with hysteresis (to light above 0.58, to dark below 0.45) and an eased transition. The tint colour is mixed between a dark and a light glass colour by `scheme`.
- **contrast** — how busy the backdrop is. The shadow deepens over busy content and eases off over bright, plain areas.

The engine writes `data-glass-scheme="light|dark"` on the lens element, so content placed on the glass can switch colour in CSS:

```css
[data-glass-scheme="light"] .label { color: #0b0f14; }
```

The shadow is the same field evaluated at a downward offset and softened; its offset and blur scale with the lens size, so larger glass reads as thicker. Set `adaptive: false` to keep dark glass and a fixed shadow.

### Rim Light

`lightAngle` is the direction the light comes from, in degrees (135 = top left). The rim brightens where the surface normal faces the light and, more dimly, on the opposite side. On devices that report orientation, left/right tilt adds up to ±36° to the angle, so the highlights travel around the rim as the device moves.

The Fresnel term mixes the rim toward the backdrop mirrored across the edge, so the bevel picks up the colour of what is just outside the glass rather than plain white.

**Light glass.** A white highlight cannot define an edge against a bright backdrop. As the scheme goes light, the white share of the Fresnel term and the additive edge highlight are pulled back, and the bevel is *shaded* instead, most on the side facing away from the light. That keeps the rim readable on light content.

**Tilt permission.** iOS Safari sends no orientation events until the page calls `DeviceOrientationEvent.requestPermission()` from a tap. `src/engine/motion.ts` probes for this without prompting (Chrome exposes the same method but grants immediately, so its existence proves nothing) and `MotionPermissionButton` renders an opt-in button only where a prompt is really required. The engine's listener is attached from the start and begins receiving events once permission is granted.

### Vibrancy

Content on the glass takes its colours from what is behind the lens. Alongside `data-glass-scheme`, the engine sets two custom properties on each lens element, from the same backdrop measurement:

- `--glass-fg` — the primary colour: near white on dark glass, near black on light glass.
- `--glass-fg-secondary` — the backdrop's average colour, saturated and pushed toward the primary, so secondary text is tinted by the content under the glass rather than flat grey.

`.glass-vibrant` and `.glass-vibrant-secondary` in `index.css` apply them. (Blend-mode vibrancy is not used: the glass is drawn on a canvas in a different stacking context from the text, so `mix-blend-mode` on the text has nothing to blend with.)

### Press Response

With `interactive: true` the engine listens for pointer events on each lens element:

- **Flex** — an underdamped spring drives the element's CSS `scale` (up to +3.5%), so the glass and the content on it swell together, overshoot slightly and settle.
- **Glow** — light spreads from the pointer position and catches the bevel; it is faint on hover and full on press.

### Materialize

A new lens does not fade in. Its refraction ramps up from zero over about 0.45 s while its opacity comes in quickly, so it appears by starting to bend light.

### Accessibility

The engine reads three media queries every frame:

| Preference | Effect |
|---|---|
| `prefers-reduced-motion: reduce` | No press flex, no tilt-driven light, no materialize ramp; refraction is reduced by 40% so content moves less as it passes behind the glass. |
| `prefers-reduced-transparency: reduce` | Frost of at least 3, tint of at least 0.72, refraction cut to 35%, no dispersion. The backdrop reads as a soft colour rather than as content. |
| `prefers-contrast: more` | Tint of at least 0.85, no dispersion or rim light, and a 1.5px outline that contrasts with the glass. |

### Glass Over DOM Content

The source canvas is not the only thing the glass can refract. `engine.addBackdrop(element)` registers a DOM element as a *backdrop*: the engine keeps its rendering as a texture and, every frame, composites it over the source at the element's current client rect into a **scene** texture. The glass shader and the backdrop metrics then read the scene instead of the raw source. Because the texture is placed from the live rect, a backdrop follows scrolling and layout without being re-captured. With no backdrops registered the scene pass is skipped entirely.

There are two ways the texture is produced. `GlassBackdrop` (`src/components/GlassBackdrop.tsx`) picks one and returns a handle to pass to `addBackdrop`:

| | Live (HTML-in-canvas) | Snapshot (fallback) |
|---|---|---|
| **How** | The content is the `drawable` child of a `<canvas content="drawable">`. On each `paint` event the engine calls `ctx.drawElementImage(content, …)` into that canvas and re-uploads it. | `html2canvas(element)` with a transparent background. |
| **Updates** | Whenever the browser would paint the content differently: text, hover states, CSS animations, focus rings. | When the element resizes or its text / children change (debounced 200 ms), or on `engine.refreshBackdrops()`. Hover states and CSS animations are frozen between captures. |
| **Interactivity** | The content stays focusable and clickable; `drawElementImage` keeps its hit-testing geometry in step with where it is drawn. | Unchanged; it is ordinary DOM. |
| **Support** | Chromium builds that expose the HTML-in-canvas API (`supportsHtmlInCanvas()`); enabled in Chrome 157 as tested here, behind `chrome://flags/#canvas-draw-element` in older versions. | Every browser. Subject to html2canvas's CSS coverage (no `backdrop-filter`, most `filter` functions, blend modes). |

Live-mode layout note: a canvas cannot size itself to its children, and its child is laid out shrink-to-fit. `GlassBackdrop` therefore pins the content's width to the wrapper's width and the canvas's height to the content's height, and the engine sizes the backing store from the canvas's CSS size. Without this the element image is stretched.

**Layering.** By default the glass canvas is appended to `<body>` at `z-index: -1`, under all DOM, which is right when the glass only refracts a canvas. For glass *over* DOM content, construct the engine with `{ overlayParent, overlayZIndex }` so the canvas sits inside the page's stacking context, above the backdrop elements, and give lens elements a higher `z-index` than the canvas so their own content stays on top (`.glass-above-dom [data-liquid-glass-lens] { z-index: 2 }`). The canvas is `position: fixed`, so no ancestor of `overlayParent` may have a transform or filter.

**Clipping.** A backdrop is drawn only where the user can see it. The engine collects the ancestors whose `overflow` is not `visible` (respecting containing blocks: an absolutely positioned backdrop is only clipped at or above its containing block, a fixed one not at all), intersects the backdrop's rect with each ancestor's padding box every frame, and scissors the composite to the result. Content hidden by an `overflow: hidden` or scrolling container therefore does not show up in the glass. The ancestor list is cached and rebuilt about twice a second.

Append `?dom=snapshot` to the WebGL route to force the fallback in a browser that supports the live path.

### Scroll Edge Effect

`PageShell` replaces the top bar's hard divider with a scroll edge: once the page has scrolled, the border fades out and a band under the bar fades in, where content blurs and dims progressively as it approaches the bar (a `backdrop-filter` blur under a gradient mask). It is a sibling of the bar rather than a child, because a nested `backdrop-filter` can only see its ancestor's backdrop, not the page. The bar and the band carry `data-liquid-glass-ignore`, so DOM snapshots do not include UI that sits above the glass.

### Frost

Frost used to be a single-pass disk blur of up to 128 taps per pixel (up to 384 texture fetches with dispersion). It is now a fixed 16 taps into a pre-blurred **pyramid**:

1. On frames where some lens is frosted, the backdrop is downsampled five times, each level half the size of the last and filtered with a 5-tap tent (`DOWNSAMPLE_FRAGMENT_SHADER`). The whole pyramid costs about as much as one extra full-screen pass, and is shared by every lens.
2. One unit of `frost` is 6 source texels of blur radius `R`. The lens samples the level whose texels are about `0.35 R` wide, where 16 golden-angle taps overlap enough to cover the disk smoothly. The level is fractional: the two neighbouring levels are bound as `u_blurA` / `u_blurB` and blended by `u_blurMix`, so the blur grows continuously instead of stepping.
3. The pyramid's own blur adds to the tap disk, so the disk radius is scaled by `0.87` to keep the total close to a plain disk of radius `R`. In a glass-only strip the result differs from the old blur by under 0.3 of 255 on average for the same slider value.

Cost per frosted pixel is 16 fetches below about 3px of radius, 32 above it (two levels), and 64 with dispersion (red and blue use every other tap), whatever the radius. That is why the Frost slider now goes to 10 (60px) instead of 5.

### Not Modelled

- **Non-rectangular clips and backdrop effects.** Backdrop clipping follows ancestors' boxes, not their rounded corners or `clip-path`. CSS opacity and transforms other than translation and scale on a backdrop are not reproduced.
- **Glass-on-glass** layering rules and per-element thickness presets.
- **Blend-mode vibrancy**; see Vibrancy above for what is done instead.

## Smoothness Notes

- WebGL and background canvas rendering use a `1.5` DPR cap to reduce full-frame texture upload cost on high-density displays.
- The background renderer pre-renders the static dark ambient layer on resize, then only redraws the animated flow field, neon lines, rings, dots, and grid each frame.
- Shape labels in `WebGLPage.tsx` are nested inside the same DOM elements registered as lenses. This keeps the visible label and the shader-rendered glass object aligned during scroll.
- The DOM/SVG background avoids animating SVG `stroke-dashoffset`; it uses transform-based motion for smoother compositor-friendly animation.
- The gravity lens mode changes only the UV offset formula; it does not add DOM capture work, extra render passes, or new textures.
- Backdrop metrics are measured on the GPU and read back as a tiny block (at most 128x8 px) every 6th frame, not by reading the full source canvas.
- The surface normal costs four extra field evaluations per pixel, but only inside the bevel; the flat centre of a lens skips it.
- The scene pass (one full-viewport blit plus one quad per backdrop) only runs when a DOM backdrop is registered.
- Frost reads a blur pyramid built once per frame (and only when something is frosted), so its per-pixel cost is fixed at 16 to 64 fetches instead of growing with the blur radius.

## Integration Example

```tsx
import { useEffect, useRef } from 'react';
import { BackgroundCanvas } from '../engine/BackgroundCanvas';
import { LiquidGlassEngine } from '../engine/LiquidGlassEngine';

export function WebGLDemo() {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Initialize background animation
    const bg = new BackgroundCanvas(document.body);
    bg.start();

    // 2. Initialize shader engine with background canvas
    const engine = new LiquidGlassEngine(bg.canvas);

    // 3. Register a DOM element to act as a "lens"
    if (panelRef.current) {
        engine.addLens(panelRef.current, { cornerRadius: 40, refraction: 0.07 });
    }

    // 4. Start the live-sync loop
    engine.startLive(bg.canvas);

    return () => {
      engine.destroy();
      bg.destroy();
    };
  }, []);

  return <div ref={panelRef} style={{ width: 400, height: 300 }} />;
}
```
