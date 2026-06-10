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
- **Refraction:** Displacing UV coordinates based on the SDF normal vector.
- **Dispersion (Chromatic Aberration):** Sampling the red, green, and blue channels of the texture at slightly different offset vectors.
- **Specular Highlights:** Animated light streaks simulating reflections bouncing off the glass surface.

## Smoothness Notes

- WebGL and background canvas rendering use a `1.5` DPR cap to reduce full-frame texture upload cost on high-density displays.
- The background renderer pre-renders the static dark ambient layer on resize, then only redraws the animated flow field, neon lines, rings, dots, and grid each frame.
- Shape labels in `WebGLPage.tsx` are nested inside the same DOM elements registered as lenses. This keeps the visible label and the shader-rendered glass object aligned during scroll.
- The DOM/SVG background avoids animating SVG `stroke-dashoffset`; it uses transform-based motion for smoother compositor-friendly animation.

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
        engine.addLens(panelRef.current, { cornerRadius: 40, refraction: 0.1 });
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
