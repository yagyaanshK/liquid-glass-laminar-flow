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
- `src/components/useGlassEnvironment.ts`: accessibility media queries and quantized device tilt.
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

1. `feImage` loads the generated map, placed with explicit px geometry (`0, 0, lensW, lensH`) so it covers exactly the lens box.
2. Optional `feGaussianBlur` softens the sampled source.
3. Three `feDisplacementMap` passes sample red, green, and blue with scales of `base * (1 - d)`, `base`, and `base * (1 + d)`, where `base = max(scaleX, scaleY) * min(lensW, lensH)` and `d = chromaAmount * 0.14`. Dispersion is therefore symmetric around green and independent of the lens's aspect ratio.
4. `feColorMatrix` isolates each color channel.
5. `feComposite` combines the shifted channels into a chromatic-aberration result.
6. A second `feColorMatrix` extracts the map's blue channel as a specular mask.
7. The specular mask is composited over the refracted content.

`feDisplacementMap` has a single `scale` for both axes. The per-axis `scaleX` / `scaleY` strengths are baked into the map's red and green channels (`axisScaleX`, `axisScaleY`) instead of being applied as different scales per color channel.

This mirrors the production tradeoff described by Aave: generate a reusable displacement texture, then let the browser's SVG filter pipeline do component-sized work.

## Layering Model

The wrapper renders two copies of the content:

1. Base content: normal DOM that receives pointer, keyboard, and form interactions.
2. Lens overlay: pointer-transparent visual copy clipped to the lens shape.

The overlay translates its copy by the negative lens offset, so the content inside the lens lines up with the same local region underneath. The real interactive controls are never distorted or made harder to click.

The copy is marked `aria-hidden` and `inert`. `pointer-events: none` alone does not stop keyboard focus, so without `inert` every button and input in the copy would be a second, invisible tab stop.

Additional visual layers add:

- subtle tint,
- glass rim,
- inner shadow,
- edge glow,
- chroma fringe,
- rounded lens clipping.

## Press, Light and Accessibility

`AaveLensGlass` implements the Apple-style behaviours that are possible without reading backdrop pixels.

- **Press response.** While the component is pressed (`interactive`, on by default) the lens scales to 1.07 on an overshooting curve and a glow layer lights up from the pointer. The pointer position is written to CSS variables (`--lens-press-x`, `--lens-press-y`), so tracking it does not re-render React.
- **One light direction.** `specularRotation` drives both the specular channel baked into the map and the CSS sheen and rim (`--lens-light-x`, `--lens-light-y`, `--lens-light-rot`), so they always agree. Device tilt shifts the angle in 15° steps within ±30°; the steps are coarse because each distinct angle needs its own generated map. On iOS, tilt needs a permission prompt first; the page shows `MotionPermissionButton` only where that is the case.
- **Accessibility variants.** On this route the content sits *under* the lens, so legibility means less optics rather than more frost:
  - `prefers-reduced-transparency: reduce` and `prefers-contrast: more` — no blur, no dispersion, displacement cut to 35%, sheen pulled back, and the lens body stops tinting what it covers.
  - `prefers-contrast: more` — additionally drops the specular layers and draws a solid 2px outline.
  - `prefers-reduced-motion: reduce` — no press scale, no tilt, and the hero lens stops drifting on its own (it still follows the pointer).

Not available here: merging lenses and backdrop-adaptive tint. An SVG filter cannot evaluate a shared field across elements or measure what is behind it; those live in the WebGL route.

## Current Demo Interaction Model

`src/pages/AaveSvgPage.tsx` demonstrates the technique with:

- a large moving lens over a finance-style product surface,
- native tabs and liquidity slider underneath the refracted overlay,
- standalone toggle, slider, segmented-control, and media-control demos,
- implementation notes that explain map channels, layering, and render scope.

The large lens slowly orbits by default and follows pointer movement when the user hovers or presses inside the showcase. Smaller controls position their lens from their own interaction state.

## Dark Theme Treatment

Aave's public implementation uses theme tokens on `html.light` and `html.dark`. Its primary buttons intentionally invert against the active theme: light mode uses a dark primary button, while dark mode uses a light primary button. Secondary and tertiary controls stay on tokenized local surfaces.

The SVG-map route mirrors that behavior for this repository's dark flow-field background:

- `.aave2-page` defines route-local dark background, surface, text, primary, and inverse action tokens.
- Primary actions such as `Connect`, the selected market action, and the video play/pause button use the inverse light surface with dark text.
- Inactive tabs, cards, switches, segmented buttons, and control rails use subdued dark translucent surfaces.
- The route background has an opaque dark base so long mobile pages and stitched screenshots do not expose the global light body color.

For small controls, the most important Aave detail is not just the color palette. The glass should bend a fill, highlight, or selected-pill layer while labels remain readable. Switches, sliders, and segmented controls therefore keep the native control text stable and use the lens as a moving highlight over the chosen control region.

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
