# CSS + SVG Filters Implementation Details

This document outlines the pure DOM (HTML/CSS/SVG) approach to creating the liquid glass effect without WebGL or JavaScript rendering loops.

## Overview
This approach leverages the CSS `backdrop-filter` property combined with an inline SVG `<filter>`. By utilizing SVG filter primitives like `feDisplacementMap` and `feSpecularLighting`, we can instruct the browser's compositing engine to physically bend and light the pixels sitting "behind" our DOM element.

> **Note:** As of currently, combining `backdrop-filter` with an SVG `url(#filter)` is only fully supported in Chromium-based browsers (Chrome, Edge). Firefox and Safari will gracefully fallback to ignoring the precise SVG filter and rendering the CSS rules (blur/colors).

## Key Components

### 1. The SVG Filter Definitions
We define a hidden SVG block in the DOM containing our filter definitions. This SVG doesn't render anything visually itself, but creates a reusable asset referenced by CSS.

```xml
<svg width="0" height="0" style="position: absolute;">
  <defs>
    <!-- Displacement map filter — bends pixels -->
    <filter id="glass-displacement" x="-10%" y="-10%" width="120%" height="120%">
      
      <!-- 1. Generate a noisy normal map using turbulence -->
      <feTurbulence
        type="turbulence"
        baseFrequency="0.01 0.01"
        numOctaves="1"
        seed="2"
        result="noise"
      />
      
      <!-- 2. Displace the backdrop pixels using the noise normal map -->
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="8"          <!-- Distortion intensity -->
        xChannelSelector="R"
        yChannelSelector="G"
        result="displaced"
      />
      
      <feBlend in="displaced" in2="SourceGraphic" mode="normal" />
    </filter>
  </defs>
</svg>
```

### 2. The CSS Classes
The visual attributes like the bevel lighting, drop shadows, and the actual reference pointing to the SVG filter are handled purely in CSS.

```css
.css-glass-refract {
  border-radius: 40px;
  background: rgba(255, 255, 255, 0.05);
  
  /* Apply a basic gaussian blur, and then our SVG pixel displacement */
  backdrop-filter: blur(12px) url(#glass-displacement);
  -webkit-backdrop-filter: blur(12px) url(#glass-displacement);
  
  /* Create the illusion of thick rounded edges */
  box-shadow: 
    inset 0  1px 1px   rgba(255, 255, 255, 0.3),  /* Top highlight */
    inset 0 -1px 1px   rgba(255, 255, 255, 0.1),  /* Bottom inner edge */
    inset 0  8px 24px  rgba(255, 255, 255, 0.08), /* Upper inner curve */
    inset 0 -8px 24px  rgba(0, 0, 0, 0.15),       /* Bottom inner shadow */
          0  16px 32px rgba(0, 0, 0, 0.2);        /* Outer drop shadow */

  position: relative;
  overflow: hidden;
}

/* Pseudo-element for the angled specular highlight over the top corner */
.css-glass-refract::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255,255,255, 0.4) 0%,
    rgba(255,255,255, 0.0) 30%
  );
  pointer-events: none;
}
```

## Advantages & Trade-offs
- **Advantages:** Performance is generally excellent since it's hardware-accelerated by the browser's compositor. Requires zero JavaScript loop overhead. Easy to pre-render.
- **Trade-offs:** Browser support for `backdrop-filter: url(#xxx)` is fragmented. The displacement pattern is uniformly determined by the `feTurbulence` noise rather than computing a true physical Signed Distance Field calculation at the borders.
