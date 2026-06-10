# Liquid Glass Laminar Flow Showcase

A high-fidelity refraction engine showcase demonstrating four distinct architectural patterns for achieving "Liquid Glass" effects in the browser. This repository is designed to be agent-ready, with structured implementation detail files that can be used as context for AI coding assistants.

## Overview

This project explores the "Liquid Glass" design language where UI elements behave as thick, curved geometric lenses.

This repository implements:

1. **WebGL / GLSL Shader**: Real-time pixel displacement over a live animated canvas using mathematical Signed Distance Functions (SDFs).
2. **CSS + SVG Filters**: Hardware-accelerated refraction using `feDisplacementMap` and `backdrop-filter`.
3. **DOM Snapshotting**: Full-page refraction over complex HTML layouts using `html2canvas` and WebGL.
4. **Aave-Style SVG Displacement Maps**: Component-scoped moving lenses using generated and cached PNG maps, RGB channel splitting, specular masks, and native real UI controls underneath.

The demo background is intentionally minimal: animated dots, lines, and rings move behind the glass so refraction is easy to see without the UI competing with a busy photo.

---

## Agent-Ready Documentation

If you are working with an AI coding assistant and want to implement these features, use the following files as context. They contain mathematical algorithms, shader code, and configuration parameters optimized for technical extraction.

### Critical Architecture Rule for Agents

> **Do NOT refactor the frosted glass container styles into a shared CSS utility class.**
>
> This project uses a deliberately fragmented styling strategy for its frosted glass UI containers:
>
> - **Landing page**: Frosted properties live in CSS classes (`.home-header`, `.home-card`, `.home-footer`), each with different opacities.
> - **Demo pages**: Frosted properties are set via inline React styles on each container element.
> - **Controls sidebar**: `.glass-controls` must stay `position: fixed` with its own CSS-defined frosted properties.
> - **Background layers**: DOM pages use `AnimatedBackground`; the WebGL page uses `BackgroundCanvas` so the shader can refract a live animated canvas texture.
>
> **Why?** A previous attempt to standardize these into a single `.glass-container-sleek` utility class caused a cascading regression that took multiple failed fix attempts to resolve. Different elements require different background opacities, border radii, and padding. See `design.md` for the full explanation.

### Core Reference

- **[Design & Architecture](./design.md)**: The comprehensive master reference for all parameters, library comparisons, and core concepts.

### Implementation Deep-Dives

- **[WebGL Live Shader](./implementation_details_webgl.md)**: Best for high-performance apps, games, or full-viewport canvas backgrounds. Includes GLSL logic for refraction, chromatic aberration, and specular highlights.
- **[CSS + SVG Filters](./implementation_details_css_svg.md)**: Best for lightweight, no-JS implementations. Explains the SVG filter chain and cross-browser fallbacks.
- **[HTML2Canvas Snapshots](./implementation_details_html2canvas.md)**: Best for traditional web apps needing glass panels over complex text and layout elements.
- **[SVG Displacement Map Glass](./implementation_details_svg_map.md)**: Best for production UI controls that need smooth component-scoped glass without a full-screen WebGL texture.

---

## Features

- **Mathematical SDF Shapes**: Includes precise 2D geometry math for rectangles, circles, ellipses, triangles, and hexagons.
- **Tunable Parameters**: A unified control system for refraction, bevel depth, frost blur, chromatic aberration, Fresnel, and more.
- **Animated Abstract Backgrounds**: Minimal moving dots, lines, and rings that make refraction visible without overpowering the UI.
- **Smooth WebGL Demo Layout**: Labels are anchored to their glass lenses, and the live texture path avoids repeated GPU texture allocation for same-size frames.
- **Interactive Aave-Style SVG Map Glass**: Component-sized moving lenses with cached displacement maps, chromatic aberration, edge/specular masks, native tabs, sliders, toggles, media controls, and explanatory tradeoff panels.

## Getting Started

```bash
# Clone the repository
git clone https://github.com/yagyaanshK/liquid-glass-laminar-flow.git

# Install dependencies
npm install

# Run the development server
npm run dev
```

## License

MIT - Created for the community to explore high-fidelity UI engineering.
