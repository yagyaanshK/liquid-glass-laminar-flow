# WebGL Live Canvas Implementation Details

This document explains the technical implementation of the "Live Canvas" WebGL approach for liquid glass refraction in this repository.

## Overview
Unlike the static DOM snapshot method, this implementation renders a highly performant custom GLSL fragment shader over an actively animating `<canvas>`. The shader reads pixels from the background canvas to perform real-time refraction and edge distortion. This is the optimal approach for full-viewport backgrounds or games where the background is naturally rendered to a canvas.

## Key Components

### 1. The Background Engine (`BackgroundCanvas.ts`)
Creates a full-screen 2D canvas that continually draws the `bg.jpg` photo. In a real-world scenario, this could be a Three.js scene, a WebGL video player, or an animated gradient generator. 

### 2. The Liquid Glass Engine (`LiquidGlassEngine.ts`)
Manages the WebGL context and rendering cycle. It accepts the source canvas from the Background Engine as a WebGL texture (`gl.texImage2D`).

#### The `startLive(canvas)` Loop
When initialized with `startLive()`, the engine runs a `requestAnimationFrame` loop that efficiently updates the WebGL texture from the active background canvas on every frame:

```typescript
// Inside LiquidGlassEngine.startLive()
const loop = () => {
  // Update the texture from the live background canvas
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.u_tex);
  this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
  
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
