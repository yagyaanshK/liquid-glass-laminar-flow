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
- **Specular Highlights:** Animated light streaks simulating reflections bouncing off the glass surface.
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

## Smoothness Notes

- WebGL and background canvas rendering use a `1.5` DPR cap to reduce full-frame texture upload cost on high-density displays.
- The background renderer pre-renders the static dark ambient layer on resize, then only redraws the animated flow field, neon lines, rings, dots, and grid each frame.
- Shape labels in `WebGLPage.tsx` are nested inside the same DOM elements registered as lenses. This keeps the visible label and the shader-rendered glass object aligned during scroll.
- The DOM/SVG background avoids animating SVG `stroke-dashoffset`; it uses transform-based motion for smoother compositor-friendly animation.
- The gravity lens mode changes only the UV offset formula; it does not add DOM capture work, extra render passes, or new textures.

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
