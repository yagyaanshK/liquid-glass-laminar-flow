# DOM Snapshot Implementation Details

This document explains the technical implementation of the `html2canvas` approach to creating a liquid glass effect over complex HTML DOM structures.

## Overview
Because WebGL shaders cannot natively bend DOM elements or CSS properties, applying a refractive displacement algorithm to standard HTML layouts requires a rendering bridge. 

This approach uses `html2canvas` to take a static picture ("snapshot") of the visible viewport. That snapshot is uploaded to the GPU as a texture, where our `LiquidGlassEngine` runs the exact same Signed-Distance-Field (SDF) displacement shader as the "Live Canvas" approach.

## Key Components

### 1. Generating the Snapshot
The `startSnapshot()` method in our `LiquidGlassEngine` converts the DOM into a WebGL-ready texture.

```typescript
const snapCanvas = await html2canvas(snapshotRoot, {
  useCORS: true,
  backgroundColor: null,
  scale: Math.min(1.5, window.devicePixelRatio || 1),

  // Capture only the visible viewport, so the texture lines up 1:1 with the
  // fixed overlay canvas whatever the document height or scroll position is.
  x: window.scrollX,
  y: window.scrollY,
  width: window.innerWidth,
  height: window.innerHeight,

  // Keep the overlay canvas (and anything opted out) out of the snapshot.
  ignoreElements: el =>
    el.hasAttribute('data-liquid-glass-overlay') ||
    el.hasAttribute('data-liquid-glass-ignore'),

  // Lens elements are hidden in the clone, NOT ignored. Ignoring removes them
  // from layout, which shifts their neighbours and misaligns the snapshot.
  onclone: doc => {
    doc.querySelectorAll('[data-liquid-glass-lens]').forEach(el => {
      el.style.visibility = 'hidden';
    });
  },
});

gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snapCanvas);
```

`html2canvas` renders a clone of the document, so nothing in the real page has to be hidden while it runs.

### 2. Handling Coordinate Mapping
The glass must sample the texture at exactly the pixels behind it. Because the snapshot covers the viewport, a lens maps to texture UV directly from its client rect, independent of the texture's own resolution:

```typescript
// Inside the WebGL render loop for each glass element
const rect = element.getBoundingClientRect();

gl.uniform4f(
  uniforms.u_bounds,
  rect.left / window.innerWidth,
  rect.top / window.innerHeight,
  rect.width / window.innerWidth,
  rect.height / window.innerHeight,
);
```

A viewport-sized snapshot goes stale when the page scrolls or resizes, so the engine listens for both and re-captures about 180 ms after they settle.

### 3. Rendering The Glass
The fragment shader logic is identical to the WebGL Live implementation. The only difference is the source of `u_tex`.

## Advantages & Trade-offs
- **Advantages:** Allows full-page refraction over arbitrary HTML DOM layouts, including text, complex flexbox layouts, other images, etc. Visually identical to true native OS glass.
- **Trade-offs:** 
  1. Capturing the DOM via `html2canvas` is a heavy operation (hundreds of milliseconds) that causes a slight jitter on initialization and after each re-capture.
  2. The texture is **static between captures**. While the user is scrolling, and for anything that animates behind the glass (video, CSS animation), the glass shows a stale image until the next capture.
  3. `html2canvas` re-implements CSS rendering and does not support everything (for example `backdrop-filter`, most `filter` functions, and blend modes), so the snapshot can differ from what the browser painted.
