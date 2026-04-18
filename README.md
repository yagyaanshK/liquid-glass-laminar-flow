# 💎 Liquid Glass Laminar Flow Showcase

A high-fidelity refraction engine showcase demonstrating three distinct architectural patterns for achieving "Liquid Glass" effects in the browser. This repository is designed to be **Agent-ready**—providing structured implementation detail files that you can feed directly into AI coding assistants (like Gemini, Claude, or GPT) to replicate these effects in your own projects.

![Repo Header](public/bg.jpg)

## 🚀 Overview
This project explores the "Liquid Glass" design language (popularized by modern mobile OS interfaces) where UI elements behave as thick, curved geometric lenses. 

This repository implements:
1. **WebGL / GLSL Shader**: Real-time pixel displacement over a live background using mathematical Signed Distance Functions (SDFs).
2. **CSS + SVG Filters**: Hardware-accelerated refraction using `feDisplacementMap` and `backdrop-filter`.
3. **DOM Snapshotting**: Full-page refraction over complex HTML layouts using `html2canvas` and WebGL.

---

## 🤖 Agent-Ready Documentation (LLM-Friendly)
If you are working with an AI coding assistant and want to implement these features, use the following files as context. They contain precise mathematical algorithms, shader code, and configuration parameters optimized for technical extraction.

### 📗 Core Reference
- **[Design & Architecture (design.md)](./design.md)**: The comprehensive master reference for all parameters, library comparisons, and core concepts.

### 📘 Implementation Deep-Dives
- **[WebGL Live Shader (implementation_details_webgl.md)](./implementation_details_webgl.md)**: Best for high-performance apps, games, or full-viewport canvas backgrounds. Includes GLSL logic for Refraction, Chromatic Aberration, and Specular highlights.
- **[CSS + SVG Filters (implementation_details_css_svg.md)](./implementation_details_css_svg.md)**: Best for lightweight, no-JS implementations. Explains the SVG filter chain and cross-browser fallbacks.
- **[HTML2Canvas Snapshots (implementation_details_html2canvas.md)](./implementation_details_html2canvas.md)**: Best for traditional web apps needing glass panels over complex text and layout elements.

---

## 🛠 Features
- **Mathematical SDF Shapes**: Includes precise 2D geometry math for Rectangles, Circles, Ellipses, Triangles, and Hexagons.
- **Tunable Parameters**: A unified control system for Refraction, Bevel Depth, Frost (Blur), Chromatic Aberration, Fresnel, and more.
- **Pure CSS Backgrounds**: Clean, high-fidelity photo backgrounds with removed decorative clutter for a professional showcase.

## 🏁 Getting Started

```bash
# Clone the repository
git clone https://github.com/yagyaanshK/liquid-glass-laminar-flow.git

# Install dependencies  
npm install

# Run the development server
npm run dev
```

## 📜 License
MIT - Created for the community to explore high-fidelity UI engineering.
