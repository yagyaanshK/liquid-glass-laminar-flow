# SVG Displacement Map Glass Implementation Details

This document explains the fourth approach in this repository: component-scoped glass driven by generated SVG displacement maps. It is inspired by Aave's article, "Building Glass for the Web": https://aave.com/design/building-glass-for-the-web

## Overview

Unlike the WebGL route, this approach does not upload a full-screen live background texture every frame. Instead, each glass component owns a small generated PNG displacement map. The map's red and green channels encode x/y offsets for `feDisplacementMap`.

The result is much cheaper for interface controls:

1. Generate a displacement map for a specific lens size and radius.
2. Cache that map by geometry.
3. Use an SVG filter to displace the component's chosen content layer.
4. Move or animate the glass element without regenerating the map.

This approach is best for production UI controls, cards, pills, sliders, media controls, and compact panels where the glass should refract deliberate component content rather than the entire page behind it.

## Key Components

### 1. Displacement Map Generator

`src/engine/displacementMap.ts` generates a PNG data URL from a canvas.

Each pixel stores:

- `R`: horizontal offset, neutral at `128`.
- `G`: vertical offset, neutral at `128`.
- `B`: neutral filler.
- `A`: opaque map coverage.

The map is strongest near the rounded-rect edge and fades toward the center. This mirrors the behavior of a thick lens: edges bend more than the middle.

### 2. SVG Filter

`AaveSvgPage.tsx` creates a per-lens filter:

```tsx
<filter id={filterId} x="0" y="0" width="100%" height="100%">
  <feImage href={mapUrl} width="100%" height="100%" preserveAspectRatio="none" result="map" />
  <feDisplacementMap
    in="SourceGraphic"
    in2="map"
    scale={scale}
    xChannelSelector="R"
    yChannelSelector="G"
  />
</filter>
```

The filtered layer is the component's own refraction target, not the whole page backdrop.

### 3. Visual Layering

The component uses four layers:

1. Filtered target content: animated rows, dashed lines, dots, and soft color fields that show displacement clearly.
2. Glass surface: translucent fill, backdrop blur, saturation, and subtle tint.
3. Rim and specular overlays: inner border, edge shadows, and highlight gradients that make the lens read as thick glass.
4. Stable foreground controls: readable buttons, tabs, sliders, toggles, and media controls that are not distorted.

The key UX rule is that interaction belongs in the stable foreground layer. The refracted layer is there to show optical movement and depth, not to make labels or controls harder to use.

### 4. Current Demo Interaction Model

`src/pages/AaveSvgPage.tsx` demonstrates the technique with:

- A large glass console with clickable navigation pills, market buttons, a protected-mode toggle, a refraction-strength slider, and primary/secondary actions.
- Compact glass controls for navigation pills, video-style playback/progress/volume controls, and button states.
- Explanatory panels describing render scope, map lifecycle, and appropriate use cases.

The refraction slider changes the `scale` passed to `feDisplacementMap`. This updates filter strength without regenerating the cached displacement map.

## Why It Is Fast

- The filter is scoped to a component-sized region.
- The displacement map is generated only when geometry changes.
- Moving the component does not require map regeneration.
- Updating ordinary React state, button states, or slider values does not require map regeneration.
- There is no full-screen texture upload.
- The SVG/DOM background animations use transform-based movement rather than animated `stroke-dashoffset`.

## Tradeoffs

- It refracts selected component content, not arbitrary pixels behind the component.
- Browser SVG filter behavior can vary.
- Complex filter stacks may still cost more than ordinary CSS transforms.
- It is less physically complete than the WebGL shader approach, but usually more practical for UI controls.

## Best Use Cases

- Buttons
- Toggle controls
- Navigation pills
- Sliders
- Media controls
- Cards
- Small panels
- UI systems where performance matters more than full-scene optical accuracy
