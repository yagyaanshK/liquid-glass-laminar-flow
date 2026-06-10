# Liquid Glass Laminar Flow: Repository and UX Audit

Audit date: 2026-06-11

## Scope and Method

This audit reviewed the whole repository: product experience, visual design, accessibility, performance, rendering architecture, code maintainability, documentation, build/deployment, and test coverage.

Checks performed:

- Read the React/Vite app source, rendering engines, CSS, README, implementation notes, and GitHub Pages workflow.
- Ran `npm run build`; production build completed successfully.
- Started the Vite dev server at `http://127.0.0.1:5173/liquid-glass-laminar-flow/`.
- Captured local screenshots with Playwright CLI for the landing page, WebGL route, CSS/SVG route, html2canvas route, and mobile viewports.
- The in-app Browser backend was unavailable in this session, so deeper live interaction inspection was limited. The Playwright CLI screenshots were sufficient to identify the main visual and layout issues.

## Executive Summary

The repository is a strong technical prototype. It clearly demonstrates three approaches to a liquid-glass/refraction effect and has useful agent-oriented implementation notes. The main shortcoming is that the product experience still feels like an internal rendering experiment rather than a polished showcase or reusable demo.

The highest-impact improvements are:

1. Improve readability and visual hierarchy against the busy photographic background.
2. Make the controls easier to discover and understand, especially on mobile.
3. Add accessible labels, focus states, and drawer semantics.
4. Reduce first-load weight from large background JPGs.
5. Add graceful fallbacks for WebGL and snapshot failures.
6. Add smoke tests and browser-level visual checks for the three routes.
7. Separate "showcase UI" concerns from "rendering engine" concerns without violating the project's documented warning against over-standardizing the glass container styles.

## Product and UX Shortcomings

### 1. The background competes with the glass effect

Observed in screenshots of the landing page and all demo pages.

The textile/photo background is high contrast, high frequency, and strongly colored. This makes the refraction effect visible, but it also makes text, lens edges, and interaction affordances harder to scan. On the WebGL and html2canvas routes, the effect is visually impressive but labels inside the lens fight with the refracted pattern behind them.

Relevant code:

- `src/main.tsx` sets `--bg-url` and `--bg-url-landscape`.
- `src/index.css:40` and `src/index.css:295` apply the photo as full-page backgrounds.
- `src/engine/BackgroundCanvas.ts:80` draws the same image into the live canvas source.

Recommended improvements:

- Add a subtle global image treatment: lower saturation, lower contrast, or apply a dim overlay behind content areas.
- Use a less visually dense default background for the first viewport, then provide the current high-frequency background as a "stress test" toggle.
- Add a small background selector: "Photo", "Gradient grid", "Text sample", "Color bands", "High-detail stress test". This would make the project more useful as a refraction comparison tool.
- Use the busy photo only where it helps demonstrate distortion. Keep explanatory UI on calmer surfaces.

### 2. The landing page communicates "three demos", but not which one to choose

The three approach cards are clear as labels, but the user has to infer practical tradeoffs from technical descriptions. The current descriptions are implementation-heavy and do not answer common user questions: "Which should I use?", "Which is fastest?", "Which works in Safari?", "Which supports dynamic content?", "Which is production-ready?"

Relevant code:

- `src/pages/Home.tsx:3` defines the three approaches.
- `src/pages/Home.tsx:49` renders each card as a link.

Recommended improvements:

- Add comparison metadata to each card:
  - Best for
  - Browser support
  - Dynamic content support
  - Performance cost
  - Implementation complexity
- Add a compact comparison table below the cards.
- Change card descriptions from shader jargon to outcome-oriented copy, while keeping a technical detail line for advanced users.

Example:

- WebGL Shader: "Best visual fidelity and live movement. Highest GPU cost. Needs WebGL fallback."
- CSS + SVG: "Lightweight and easy to drop in. Browser support varies."
- html2canvas Snapshot: "Works over complex DOM, but captures can become stale."

### 3. Card affordance is too hover-dependent

On the landing page, the arrow is hidden until hover and the cards are visually close to static panels. Mobile users do not get hover feedback. The cards are links, but there is no always-visible action cue.

Relevant code:

- `src/pages/Home.tsx:50` renders cards as links.
- `src/pages/Home.tsx:61` renders the arrow.
- `src/index.css:182` hides `.card-arrow` by default.
- `src/index.css:193` only shows the arrow on hover.

Recommended improvements:

- Keep a small persistent "Open demo" or arrow affordance visible.
- Add focus-visible styling for keyboard navigation.
- Add `:active` and `:focus-visible` states matching hover states.
- Consider making the whole card footer a clear action row with browser/support badges.

### 4. Demo pages do not orient users before showing the effect

The demo routes open directly into a visual effect with a title badge, but the user does not get immediate guidance on what to interact with or what to compare. The WebGL page especially has a hidden controls drawer in the top-right hamburger, but the UI does not make that affordance obvious enough.

Relevant code:

- `src/components/PageShell.tsx` renders only a back link, route title, and badge.
- `src/pages/WebGLPage.tsx:112` and `src/pages/Html2CanvasPage.tsx:89` put controls inside a hidden drawer.
- `src/components/ControlsDrawer.tsx:23` renders the hamburger button with only `aria-label="Toggle Controls"`.

Recommended improvements:

- Add a small route-level intro strip with:
  - What this route demonstrates
  - Main limitation
  - "Open controls" button
- On desktop, default the controls drawer open or pin a compact controls panel to the right.
- On mobile, replace the hamburger with a bottom "Controls" sheet button or a clearly labeled topbar button.
- Add a "Reset" button and "Compare presets" affordance near the lens, not only inside the drawer.

### 5. The WebGL showcase is too vertically sparse

The WebGL page spaces shapes with a `12rem` gap. On mobile, the result is a long scroll where users see isolated labels and partial lens visuals. This weakens comparison between shapes.

Relevant code:

- `src/pages/WebGLPage.tsx:61` sets large top padding.
- `src/pages/WebGLPage.tsx:72` sets `gap: '12rem'`.
- `src/pages/WebGLPage.tsx:89`, `95`, `101`, and `107` render isolated shape labels.

Recommended improvements:

- Use a responsive grid for shape demos on desktop and a tighter vertical rhythm on mobile.
- Add a sticky or local mini-nav for shape types.
- Keep each shape label visually attached to its shape.
- Provide side-by-side comparison for at least two shapes above the fold.

### 6. The CSS/SVG route uses disabled controls as explanatory UI

The CSS/SVG page shows `GlassControls` in readonly mode. Because the controls look like real sliders and buttons but are disabled, users may perceive the page as broken or less interactive than the WebGL routes.

Relevant code:

- `src/pages/CssSvgPage.tsx:73` and `src/pages/CssSvgPage.tsx:123` render readonly controls.
- `src/components/GlassControls.tsx:91` disables sliders when readonly.
- `src/components/GlassControls.tsx:106` disables the specular button when readonly.

Recommended improvements:

- Replace readonly sliders with a parameter summary table or code snippet.
- If keeping sliders, make them visually read-only: remove thumbs, use progress bars, and label the block "Reference values".
- Add a "Copy CSS" action for the CSS route. That would make the route useful beyond visual inspection.

### 7. The html2canvas route demonstrates a limitation but does not help users recover from it

The route correctly states that the snapshot is static, but there is no recapture action. Users who scroll, resize, or change controls cannot refresh the snapshot.

Relevant code:

- `src/pages/Html2CanvasPage.tsx:23` calls `engine.startSnapshot()` once.
- `src/pages/Html2CanvasPage.tsx:83` explains the static snapshot limitation.
- `src/engine/LiquidGlassEngine.ts:467` implements one-time snapshot mode.

Recommended improvements:

- Add a "Recapture" button.
- Recapture on resize with debounce.
- Recapture after background/image load is complete.
- Show a loading state while html2canvas is capturing.
- Add a clear error state if capture fails.

## Accessibility Issues

### 1. Range inputs do not have associated labels

`GlassControls` renders a visual label and then an adjacent range input, but the label is not associated with the input using `htmlFor`/`id`, nor is the input wrapped by the label. Screen readers may announce unlabeled sliders.

Relevant code:

- `src/components/GlassControls.tsx:79` renders `<label className="slider-label">`.
- `src/components/GlassControls.tsx:83` renders the `<input type="range">` as a sibling, not a child.

Recommended fix:

- Generate a stable id for each slider.
- Use `<label htmlFor={id}>`.
- Add `aria-valuetext` where raw numeric values need explanation.

### 2. The specular toggle does not expose pressed state

The specular control is a button that visually toggles, but it does not set `aria-pressed`.

Relevant code:

- `src/components/GlassControls.tsx:103` renders the toggle button.

Recommended fix:

- Add `aria-pressed={config.specular}`.
- Keep visible text concise and stable.

### 3. Drawer semantics and keyboard behavior are incomplete

The controls drawer can close on Escape, but it does not expose expanded state, does not connect the button to the drawer, does not trap focus, and does not restore focus when closed. The overlay is a clickable div without semantics.

Relevant code:

- `src/components/ControlsDrawer.tsx:15` closes on Escape.
- `src/components/ControlsDrawer.tsx:23` renders the hamburger button.
- `src/components/ControlsDrawer.tsx:35` renders the overlay.
- `src/components/ControlsDrawer.tsx:42` renders the drawer.

Recommended fix:

- Add `aria-expanded`, `aria-controls`, and a drawer id.
- Give the drawer `role="dialog"` or `role="complementary"` depending on whether it blocks page interaction.
- Move focus into the drawer on open and restore focus to the trigger on close.
- Add an explicit close button inside the drawer.

### 4. Focus styles are weak or missing

The CSS defines hover states but not robust `:focus-visible` states. The slider input explicitly removes outline.

Relevant code:

- `src/index.css:451` sets `outline: none` on `.slider-input`.
- Hover transitions exist at `src/index.css:135`, `258`, `409`, `487`, and `626`.
- No `:focus-visible` rules were found.

Recommended fix:

- Add a consistent focus ring for links, buttons, sliders, and drawer controls.
- Do not remove default outlines unless a replacement is provided.

### 5. Motion preferences are not respected

The app uses hover transforms, drawer transitions, animated specular highlights, and requestAnimationFrame loops. There is no `prefers-reduced-motion` handling.

Relevant code:

- `src/index.css:119`, `190`, `624`, and `663` define transitions.
- `src/engine/LiquidGlassEngine.ts:527` uses a continuous animation loop.
- `src/engine/BackgroundCanvas.ts:59` uses a continuous animation loop.

Recommended fix:

- Add CSS `@media (prefers-reduced-motion: reduce)` to disable non-essential transitions.
- In the engine, allow specular animation to be disabled or reduced when the user prefers reduced motion.

## Performance Issues

### 1. Background images dominate first-load weight

Production build output includes:

- `dist/bg.jpg`: 2,593,358 bytes.
- `dist/bg-landscape.jpg`: 2,330,130 bytes.
- Main JS: 267,798 bytes raw.
- Lazy html2canvas chunk: 199,568 bytes raw.

The background images are larger than the app code and are required for the first visual impression.

Recommended improvements:

- Generate AVIF/WebP variants.
- Use responsive image sizes.
- Preload only the orientation-appropriate background.
- Consider a smaller low-quality placeholder while the full image loads.
- Keep the high-resolution image as an optional "detail stress test" asset.

### 2. WebGL mode uploads a full texture every frame

In live mode, the engine re-uploads the source canvas texture on every animation frame using `texImage2D`.

Relevant code:

- `src/engine/LiquidGlassEngine.ts:535` checks for live source each frame.
- `src/engine/LiquidGlassEngine.ts:536` uploads the texture.
- `src/engine/LiquidGlassEngine.ts:522` calls `gl.texImage2D`.

This is acceptable for a prototype, but it is a known GPU/CPU bandwidth cost and can hurt battery life.

Recommended improvements:

- Only upload when the source canvas changes.
- Use `texSubImage2D` after the first allocation where possible.
- Pause rendering when the page is hidden using `document.visibilityState`.
- Pause or throttle offscreen demos with `IntersectionObserver`.
- Provide a low-power mode with fewer samples and no animated specular highlights.

### 3. The background canvas redraws a static image every frame

`BackgroundCanvas` currently draws a static image every requestAnimationFrame. There is no animation in the background, so continuous redraw is unnecessary.

Relevant code:

- `src/engine/BackgroundCanvas.ts:59` schedules the draw loop.
- `src/engine/BackgroundCanvas.ts:80` draws the image.

Recommended improvements:

- Draw once on image load and resize.
- If animation is added later, make animation opt-in.
- Notify `LiquidGlassEngine` when the source changes so it can upload only then.

### 4. Snapshot mode keeps rendering continuously after a static capture

`startSnapshot()` captures once, uploads once, then starts the same render loop. This is useful only if animated specular highlights are enabled or config is changing.

Relevant code:

- `src/engine/LiquidGlassEngine.ts:496` sets `liveSource = null`.
- `src/engine/LiquidGlassEngine.ts:497` starts `_loop()`.

Recommended improvements:

- Render on demand when specular is disabled.
- Continue animation only when there is a time-based visual effect.
- Add dirty flags for config changes, resize, scroll, and recapture.

### 5. Frost blur can become expensive quickly

The shader uses 32 to 128 texture samples depending on `u_frost`.

Relevant code:

- `src/engine/LiquidGlassEngine.ts` fragment shader branches over 32/64/96/128 sample loops.
- `src/components/GlassControls.tsx:16` allows frost from 0 to 5.

Recommended improvements:

- Surface a performance warning or "High cost" badge when frost is high.
- Cap expensive parameters on mobile by default.
- Add quality presets: Low, Balanced, High.

## Robustness and Error Handling

### 1. WebGL failures can crash the route

The engine constructor throws if WebGL is unavailable or shader compilation fails.

Relevant code:

- `src/engine/LiquidGlassEngine.ts:399` throws `WebGL unavailable`.
- `src/engine/LiquidGlassEngine.ts:403` throws `Shader compilation failed`.

Recommended improvements:

- Catch engine construction errors in `WebGLPage` and `Html2CanvasPage`.
- Show a CSS fallback panel with a clear message.
- Log technical details only to the console.

### 2. Snapshot capture lacks `try/finally`

`startSnapshot()` hides the overlay and lens elements before capture. If `html2canvas` throws, the code may not restore visibility.

Relevant code:

- `src/engine/LiquidGlassEngine.ts:471` hides the overlay canvas.
- `src/engine/LiquidGlassEngine.ts:475` hides lens elements.
- `src/engine/LiquidGlassEngine.ts:478` awaits `html2canvas`.
- `src/engine/LiquidGlassEngine.ts:490` restores lens visibility only after successful capture.

Recommended improvements:

- Wrap capture in `try/finally`.
- Restore visibility in `finally`.
- Return a status or throw a typed error that the page can render.

### 3. Orientation-specific background is selected only once in WebGL live mode

`BackgroundCanvas` chooses `bg.jpg` or `bg-landscape.jpg` in the constructor. On orientation change, it resizes the canvas but does not reload the orientation-appropriate image.

Relevant code:

- `src/engine/BackgroundCanvas.ts:32` checks `window.innerWidth > window.innerHeight`.
- `src/engine/BackgroundCanvas.ts:33` selects the image.
- `src/engine/BackgroundCanvas.ts:52` and `53` resize the canvas.

Recommended improvements:

- Detect orientation changes on resize.
- Reload the background source only when the orientation bucket changes.
- Keep the previous image visible until the new image loads.

## Code Architecture and Maintainability

### 1. UI styles are split between CSS and inline styles

The project intentionally avoids a shared glass utility class, as documented in the README. That constraint makes sense given prior regressions. However, there is still a maintainability cost: many visual values are duplicated inline across pages.

Relevant examples:

- `src/pages/Home.tsx` inline frosted styles for header/cards.
- `src/pages/CssSvgPage.tsx` repeated dark panel styles.
- `src/pages/WebGLPage.tsx` repeated label panel styles.
- `src/pages/Html2CanvasPage.tsx` repeated explanatory panel styles.

Recommended improvements:

- Do not introduce a single shared `.glass-container-sleek` utility.
- Instead, extract small non-visual helpers:
  - `darkPanelStyle({ radius, padding, alpha })`
  - named constants for common rgba values
  - typed config objects per page
- Keep per-surface styles explicit, but remove copy/paste values that must stay consistent.

### 2. Lens registration relies on fixed timers

WebGL and html2canvas pages use `setTimeout` to wait for layout before registering lenses.

Relevant code:

- `src/pages/WebGLPage.tsx:29`
- `src/pages/Html2CanvasPage.tsx:19`

Recommended improvements:

- Use `requestAnimationFrame` twice after mount for layout stabilization.
- Or register in a layout effect after refs are available.
- Recompute lens bounds on resize and font/image load.

### 3. Rendering engine and demo behavior are tightly coupled

The engine handles WebGL setup, lens config, DOM snapshotting, texture upload, render loop, and DOM overlay canvas creation. This is fine for a prototype, but it makes testing and graceful fallback harder.

Recommended improvements:

- Keep `LiquidGlassEngine` as the low-level renderer.
- Move html2canvas snapshot orchestration into a small wrapper/controller.
- Expose lifecycle hooks: `onReady`, `onError`, `onCaptureStart`, `onCaptureEnd`.
- Add an explicit `renderOnce()` method for static modes.

### 4. There are no tests or automated visual checks

`package.json` includes only `dev`, `build`, and `preview`.

Relevant code:

- `package.json:6` to `9`.

Recommended improvements:

- Add a route smoke test for `/`, `#/webgl`, `#/css-svg`, and `#/html2canvas`.
- Add a Playwright visual smoke test that verifies each route renders non-blank content and has no console errors.
- Add unit tests for pure config behavior and engine helpers where practical.
- Add CI build plus smoke screenshots before deploying.

## Documentation and Developer Experience

### Strengths

- README clearly explains the three rendering approaches.
- Implementation detail files are valuable for AI-assisted reuse.
- GitHub Pages workflow is simple and appropriate for a static Vite app.
- The README documents a prior styling regression and warns against an overly broad refactor.

### Shortcomings

- The README is more implementation-focused than user-focused.
- There is no "which approach should I choose?" decision guide in the app itself.
- Browser support details are spread across implementation notes and in-page warnings.
- There is no local QA checklist for visual regressions.

Recommended improvements:

- Add a short decision matrix to README and the landing page.
- Add a "Known limitations" section per route.
- Add a "Manual QA" checklist:
  - desktop landing page
  - mobile landing page
  - controls drawer open/close
  - WebGL route fallback
  - html2canvas recapture
  - reduced motion
  - keyboard navigation

## Prioritized Roadmap

### P0: Fix user-visible clarity and accessibility

1. Add focus-visible styles across cards, buttons, sliders, and drawer controls.
2. Associate slider labels with inputs.
3. Add `aria-expanded`, `aria-controls`, and `aria-pressed` where appropriate.
4. Add persistent card affordances on the landing page.
5. Make controls more discoverable, especially on demo routes.

### P1: Improve showcase comprehension

1. Add a comparison matrix to the landing page.
2. Add route intro panels with "best for" and "limitation" summaries.
3. Replace readonly CSS/SVG sliders with clearer parameter summaries and a "Copy CSS" action.
4. Tighten WebGL shape layout and reduce mobile spacing.

### P2: Improve performance and resilience

1. Optimize background images and add modern formats.
2. Stop redrawing static background canvas every frame.
3. Avoid full texture re-upload every frame when the source has not changed.
4. Add graceful WebGL and html2canvas error states.
5. Add snapshot recapture and capture loading state.

### P3: Improve maintainability and QA

1. Add Playwright smoke tests.
2. Add route screenshot checks for desktop and mobile.
3. Extract safe style constants/helpers without flattening all glass surfaces into one utility class.
4. Split snapshot orchestration from the WebGL renderer.

## Suggested Next Implementation Sequence

If the goal is to improve UX quickly without destabilizing the shader work:

1. Start with accessibility and control discoverability in `GlassControls` and `ControlsDrawer`.
2. Update the landing page cards with practical comparison metadata.
3. Add background dimming/treatment and mobile spacing fixes.
4. Add image optimization.
5. Add WebGL/html2canvas error handling.
6. Add Playwright smoke tests once the visual baseline is better.

## Verification Notes

- `npm run build` passed.
- Local Vite server served the app at `/liquid-glass-laminar-flow/`.
- Screenshots confirmed all three routes render.
- In-app Browser was unavailable, so interactive keyboard/focus behavior was inferred from source rather than fully exercised in a live browser.
