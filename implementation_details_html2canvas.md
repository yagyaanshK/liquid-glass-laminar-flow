# DOM Snapshot Implementation Details

This document explains the technical implementation of the `html2canvas` approach to creating a liquid glass effect over complex HTML DOM structures.

## Overview
Because WebGL shaders cannot natively bend DOM elements or CSS properties, applying a refractive displacement algorithm to standard HTML layouts requires a rendering bridge. 

This approach uses `html2canvas` to take a static picture ("snapshot") of the entire webpage. That static snapshot image is then uploaded to the GPU as a texture array, where our `LiquidGlassEngine` can run the exact same Signed-Distance-Field (SDF) displacement shader as the "Live Canvas" approach.

## Key Components

### 1. Generating the Snapshot
The `startSnapshot()` method in our `LiquidGlassEngine` automates the process of converting the DOM hierarchy into a WebGL-ready texture.

```typescript
import html2canvas from 'html2canvas';

// Temporarily hide elements we don't want in the refraction map (like the glass itself!)
const ignoreSelector = '[data-liquid-glass-ignore]';

// 1. Capture the DOM
const canvas = await html2canvas(document.body, {
  scale: 2.0, // Double resolution to prevent jaggies when distorted!
  useCORS: true,
  backgroundColor: null,
  ignoreElements: (element) => element.matches(ignoreSelector),
});

// 2. Upload to WebGL standard texture memory
this.gl.bindTexture(this.gl.TEXTURE_2D, this.u_tex);
this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
```

### 2. Handling Coordinate Mapping
A major challenge with DOM snapshots is coordinate alignment. If a glass element is halfway down the page, it must sample the texture at that exact scroll position, or the refracted image will not align with the literal background behind it.

Our engine tracks the absolute viewport bounding rectangles of every registered lens element:

```typescript
// Inside the WebGL render loop for each glass element
const rect = element.getBoundingClientRect();

// Pass the absolute screen coordinates to the vertex shader
this.gl.uniform2f(
  this.gl.getUniformLocation(this.program, 'u_elementPos'),
  rect.left, 
  window.innerHeight - rect.bottom // WebGL Y is flipped!
);
```

### 3. Rendering The Glass
The fragment shader logic is identical to the WebGL Live implementation. The only difference is the source of `u_tex`.

## Advantages & Trade-offs
- **Advantages:** Allows full-page refraction over arbitrary HTML DOM layouts, including text, complex flexbox layouts, other images, etc. Visually identical to true native OS glass.
- **Trade-offs:** 
  1. Capturing the DOM via `html2canvas` is a synchronous, heavy performance operation that causes a slight jitter on initialization.
  2. The texture is **static**. If the user scrolls, plays a video behind the glass, or resizes the screen, the snapshot becomes desynced from reality. The engine must either re-snapshot (extremely slow to do dynamically) or manually apply CSS translations to offset the `u_elementPos` to fake alignment while scrolling.
