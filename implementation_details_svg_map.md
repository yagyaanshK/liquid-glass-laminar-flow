# SVG Displacement Map Glass Implementation Details

This document explains the fourth approach in this repository: Aave-style, component-scoped glass driven by generated SVG displacement maps.

The route was informed by the public Aave design article, "Building Glass for the Web": https://aave.com/design/building-glass-for-the-web. A public source repository was not available, so this implementation is a clean-room React/SVG version that follows the same architectural idea rather than copying application source.

## Overview

This approach does not upload a full-screen live background texture every frame. Each lens owns a small generated PNG displacement map and uses that map inside an SVG filter. The visible lens moves over a local copy of the component content, while the real buttons, sliders, and tabs remain native DOM underneath.

The result is much cheaper and more practical for product UI:

1. Generate a displacement map for a specific lens size, depth, radius, and tuning.
2. Cache that map by geometry and optical parameters.
3. Render the normal interactive component once.
4. Render a pointer-transparent, clipped lens overlay above it.
5. Inside the lens, render a translated copy of the same component content.
6. Filter that copy through SVG displacement, chroma split, blur, brightness, and specular overlays.
7. Move the lens with CSS/React state without regenerating the displacement map.

This is best for controls, cards, pills, sliders, media controls, and compact panels where the glass should refract deliberate component content rather than arbitrary pixels from the entire page.

## Key Files

- `src/engine/displacementMap.ts`: generates and caches the PNG displacement maps.
- `src/components/AaveLensGlass.tsx`: reusable lens wrapper that creates the SVG filter and clipped refracted overlay.
- `src/pages/AaveSvgPage.tsx`: the fourth route, with a premium interactive finance-style surface and smaller glass controls.
- `src/index.css`: lens layering, route layout, responsive behavior, and visual styling.

## Displacement Map Encoding

`createAaveLensDisplacementMap()` renders map pixels to an offscreen canvas and returns a PNG data URL.

Each pixel stores:

- `R`: horizontal displacement, neutral at `128`.
- `G`: vertical displacement, neutral at `128`.
- `B`: specular and edge mask intensity.
- `A`: lens coverage mask.

The red/green channels are derived from a rounded-rect dome model. The strongest bend occurs close to the glass rim, while the center behaves like a smoother magnifying lens. This is what makes the effect read as thick glass instead of a flat frosted card.

The blue channel is reserved for highlight information. `AaveLensGlass` extracts it with `feColorMatrix` and composites it back as a rim/specular layer.

## SVG Filter Pipeline

`AaveLensGlass` builds a per-lens SVG filter:

1. `feImage` loads the generated map.
2. Optional `feGaussianBlur` softens the sampled source.
3. Three `feDisplacementMap` passes sample red, green, and blue shifted variants.
4. `feColorMatrix` isolates each color channel.
5. `feComposite` combines the shifted channels into a chromatic-aberration result.
6. A second `feColorMatrix` extracts the map's blue channel as a specular mask.
7. The specular mask is composited over the refracted content.

This mirrors the production tradeoff described by Aave: generate a reusable displacement texture, then let the browser's SVG filter pipeline do component-sized work.

## Layering Model

The wrapper renders two copies of the content:

1. Base content: normal DOM that receives pointer, keyboard, and form interactions.
2. Lens overlay: pointer-transparent visual copy clipped to the lens shape.

The overlay translates its copy by the negative lens offset, so the content inside the lens lines up with the same local region underneath. The real interactive controls are never distorted or made harder to click.

Additional visual layers add:

- subtle tint,
- glass rim,
- inner shadow,
- edge glow,
- chroma fringe,
- rounded lens clipping.

## Current Demo Interaction Model

`src/pages/AaveSvgPage.tsx` demonstrates the technique with:

- a large moving lens over a finance-style product surface,
- native tabs and liquidity slider underneath the refracted overlay,
- standalone toggle, slider, segmented-control, and media-control demos,
- implementation notes that explain map channels, layering, and render scope.

The large lens slowly orbits by default and follows pointer movement when the user hovers or presses inside the showcase. Smaller controls position their lens from their own interaction state.

## Why It Is Fast

- The filter is scoped to a component-sized region.
- The displacement map is generated only when geometry or tuning changes.
- Moving the lens does not require map regeneration.
- Ordinary React state changes do not require full-page capture.
- There is no full-screen texture upload.
- The real controls stay native, so the filtered overlay can be pointer-transparent.

## Tradeoffs

- It refracts a local copy of chosen component content, not arbitrary pixels behind the element.
- It duplicates rendered markup for the visual layer, so heavy child components should be kept small.
- SVG filter behavior and performance can vary by browser.
- It is less physically complete than the WebGL shader route, but it is usually more practical for product UI.

## Best Use Cases

- Buttons
- Toggle controls
- Navigation pills
- Sliders
- Media controls
- Cards
- Small panels
- UI systems where performance matters more than full-scene optical accuracy
