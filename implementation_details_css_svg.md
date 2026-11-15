# CSS + SVG Filters Implementation Details

This document outlines the DOM (HTML/CSS/SVG) approach to creating the liquid glass effect without WebGL or a JavaScript rendering loop.

## Overview
This approach leverages the CSS `backdrop-filter` property combined with an inline SVG `<filter>`. An `feDisplacementMap` primitive, driven by a generated lens map, instructs the browser's compositing engine to bend the pixels sitting "behind" our DOM element.

> **Note:** Combining `backdrop-filter` with an SVG `url(#filter)` is only supported in Chromium-based browsers (Chrome, Edge). Firefox and Safari ignore the SVG filter and render the remaining CSS rules (blur/colors).

## Key Components

### 1. The Lens Map
`createRoundedGlassDisplacementMap()` in `src/engine/displacementMap.ts` draws a PNG the same size as the panel and returns it with the matching `scale`:

- `R` / `G`: horizontal / vertical displacement, neutral at `128`.
- The bend follows the rounded rectangle's **surface normal** (the SDF gradient) and samples **toward the interior**, like a convex bevel.
- The profile matches the WebGL shader: `edge * refraction + edge^10 * bevelDepth`, where `edge` is `1` at the rim and `0` once you are `bevelWidth` inside. The centre of the panel is not displaced at all.
- `refraction`, `bevelDepth` and `bevelWidth` are fractions of the panel's shorter side.

`feDisplacementMap` moves a pixel by `scale * (channel - 0.5)`, so the returned `scale` is twice the largest displacement in px.

The map must match the element 1:1, so `CssSvgPage.tsx` measures the panel with a `ResizeObserver` and regenerates (and caches) the map when the size changes. That is the only JavaScript involved; there is no per-frame work.

### 2. The SVG Filter Definition
A hidden SVG block holds the filter. It doesn't render anything itself; CSS references it by id.

```xml
<svg width="0" height="0" style="position: absolute;">
  <defs>
    <filter id="glass-displacement" x="0" y="0" width="100%" height="100%"
            color-interpolation-filters="sRGB">
      <!-- 1. The generated lens map, in px, covering exactly the panel -->
      <feImage href="{lensMap.url}" x="0" y="0" width="{panelWidth}" height="{panelHeight}"
               preserveAspectRatio="none" result="lensMap" />

      <!-- 2. Displace the backdrop pixels using the lens map -->
      <feDisplacementMap in="SourceGraphic" in2="lensMap" scale="{lensMap.scale}"
                         xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </defs>
</svg>
```

`color-interpolation-filters="sRGB"` matters: with the default `linearRGB` the map's neutral `128` is no longer the midpoint and the whole backdrop shifts.

### 3. The CSS Classes
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
- **Advantages:** Refracts the real backdrop, whatever is behind the element. Hardware-accelerated by the browser's compositor, with no JavaScript loop. The map is generated once per panel size.
- **Trade-offs:**
  1. `backdrop-filter: url(#xxx)` is Chromium-only; other browsers show the blur without the bend.
  2. The map is an 8-bit image, so large displacements quantize into visible steps. Keep `refraction + bevelDepth` moderate.
  3. The map is tied to one element size and corner radius; each differently sized panel needs its own filter and map.
