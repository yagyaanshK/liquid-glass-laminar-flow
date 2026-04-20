# Post-Mortem: Frosted Glass Regression

## Timeline

| Commit | Action | Result |
|--------|--------|--------|
| `05bfdb7` | Initial commit | ✅ Everything works |
| `05e17d8` | Add GitHub Pages workflow | ✅ Works (landing + CSS/SVG + html2canvas). WebGL has no bg.jpg on Pages due to hardcoded `/bg.jpg` path |
| `5e773c0` | Fix workflow syntax | ✅ Same as above — **last known good state** |
| `d855993` | **Standardize frosted glass** | ❌ **BROKE EVERYTHING** — introduced `.glass-container-sleek` utility class and stripped all inline styles |
| `c1f31cf` | Fix bg.jpg path | Partially fixed WebGL bg, but glass still broken from d855993 |
| `3715eb6` | "Restore frosted glass styles" | ❌ Failed to fix — added backdrop-filter back to CSS classes but missed the real problem |
| `5d3926c` | "Revert to original inline styles" | ❌ Failed to fix — re-added inline styles but introduced wrong approach |
| `30dc713` | Update docs | No effect on rendering |
| `eac413a` | Remove z-index, add drawer | ❌ Failed to fix — removed z-index from `.demo-area` which actually wasn't the problem |

---

## Root Cause Analysis

### What Was Working (branch `last-working-state`, commit `5e773c0`)

The original architecture had **two completely different rendering strategies** depending on the page:

#### Landing Page (`Home.tsx`)
- `.home-header`, `.home-card`, `.home-footer` each had **their own frosted glass properties defined directly in `index.css`**
- These CSS classes included `background: rgba(0,0,0,0.65)`, `backdrop-filter: blur(16px)`, `border`, etc.
- The elements had `z-index: 1` on *themselves*, which was fine because they were direct children of `.home` (which had `position: relative; overflow: hidden`)
- The background was a **CSS-only** `position: fixed` div with `background: url(bg.jpg)` — defined via the `.photo-bg` class
- **`backdrop-filter` worked** because the frosted elements were composited directly against this fixed background

#### CSS + SVG Page (`CssSvgPage.tsx`)
- Info boxes and panel content used **React inline styles** with `background`, `backdropFilter`, `WebkitBackdropFilter`, `border` defined directly on each element
- The background was `<DemoBackground />` — a `position: fixed` div with CSS `background: url(bg.jpg)`
- `.glass-controls` sidebar was `position: fixed; z-index: 50` with its own frosted glass properties in CSS
- `.demo-area` had `z-index: 1` — but **`backdrop-filter` still worked** because the background was a fixed-position element painted behind everything

#### html2canvas Page (`Html2CanvasPage.tsx`)
- Same pattern as CSS+SVG: inline styles on containers, `<DemoBackground />` for the background
- `.glass-controls` was `position: fixed` with CSS-defined frosted properties

#### WebGL Page (`WebGLPage.tsx`)
- Used `BackgroundCanvas` (a `<canvas>` element with `position: fixed; z-index: 0`) instead of `<DemoBackground />`
- The canvas **drew `bg.jpg` programmatically** via `new Image()` with `img.src = '/bg.jpg'`
- This path was hardcoded and broke on GitHub Pages (served at `/liquid-glass-laminar-flow/`)
- `.glass-controls` sidebar: same `position: fixed` approach with CSS-defined frosted properties

### Why `.demo-area { z-index: 1 }` Was NOT The Problem

This is the critical misdiagnosis. The subsequent fix attempts removed `z-index: 1` from `.demo-area`, believing it was creating a stacking context that broke `backdrop-filter`.

**This was wrong.** In the original code:
- `.demo-area` had `z-index: 1` AND the background was `position: fixed` with `z-index: 0` (or lower, via `.photo-bg` / `<DemoBackground />`)
- Since the background element was painted at the viewport level (fixed positioning), `backdrop-filter` on child elements **could still see through to it** even inside a stacking context
- The `z-index: 1` was actually *needed* to ensure the demo content appeared above the fixed background layer

### What Commit `d855993` Actually Broke

The "standardize" commit made these destructive changes:

1. **Replaced specific CSS classes with a generic utility class `.glass-container-sleek`**
   - Stripped `background`, `backdrop-filter`, `border` from `.home-header`, `.home-card`, `.home-footer`, `.glass-controls`
   - Added a single `.glass-container-sleek` class expected to apply the frosted look everywhere

2. **Added `glass-container-sleek` to JSX classNames** and **removed all inline styles**
   - `CssSvgPage.tsx`: Changed `style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: ... }}` → `className="glass-container-sleek"`
   - `Html2CanvasPage.tsx`: Same pattern
   - `WebGLPage.tsx`: Same pattern
   - `Home.tsx`: Added `glass-container-sleek` alongside existing class names

3. **The utility class itself was insufficient** because:
   - It could not account for the different `background` opacities needed by different elements (header = 0.65, cards = 0.7, footer = 0.5, controls = 0.65)
   - It could not carry the element-specific properties like `border-radius`, `max-width`, `padding` that were previously part of each element's dedicated class
   - CSS specificity conflicts between the utility class and the existing element classes created unpredictable overrides

### Why All Subsequent Fix Attempts Failed

Every fix after `d855993` tried to patch symptoms instead of reverting to the working architecture:

1. **Commit `3715eb6`** — Re-added `backdrop-filter` to the CSS classes but kept the structural changes from d855993 (the utility class mess, removed inline styles on pages)

2. **Commit `5d3926c`** — Tried to add inline styles back to the JSX pages, but:
   - Used different opacity values than the originals
   - Left the CSS architecture from d855993 partially in place
   - The git history shows the inline styles were added with **only `background` but missing `backdrop-filter`** in some cases, or vice versa

3. **Commit `eac413a`** — Misidentified `z-index: 1` on `.demo-area` as the root cause:
   - Removed the z-index (which was not the problem)
   - Replaced `.glass-controls` (a working `position: fixed` sidebar) with a new `ControlsDrawer` component
   - This introduced a hamburger menu and slide-out panel — an unnecessary UX change to "fix" a problem that didn't exist
   - The drawer itself used `position: fixed` (correct for backdrop-filter), but this was solving the wrong problem
   - Also stripped `.glass-controls` of all its visual styles (background, border, backdrop-filter, box-shadow) since they were now "on the drawer parent" — but the `GlassControls` component still rendered with `className="glass-controls"`, which now had no visual styling

---

## Correct Architecture (What Works)

### Landing Page
- Frosted glass properties (`background`, `backdrop-filter`, `border`) defined **directly on each element's CSS class** in `index.css`
- `.home-header`, `.home-card`, `.home-footer` each have their own dedicated styles
- No utility classes, no inline styles needed

### Demo Pages (CSS+SVG, html2canvas)
- **Inline React styles** on container elements: `style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', ... }}`
- Background via `<DemoBackground />` (CSS `position: fixed` with `background: url(bg.jpg)`)
- `.glass-controls` sidebar: CSS class with `position: fixed; z-index: 50` and its own frosted glass properties

### WebGL Page
- Background via `BackgroundCanvas` (programmatic canvas, `position: fixed`)
- `bg.jpg` path must use `import.meta.env.BASE_URL` for GitHub Pages compatibility
- `.glass-controls` sidebar: same `position: fixed` CSS approach

### Rules
1. **Never use a shared utility class for `backdrop-filter`** — each element needs its own specific styling
2. **`z-index: 1` on `.demo-area` is fine** — the fixed-position background is painted below it at the viewport level
3. **`.glass-controls` must be `position: fixed`** with its own frosted properties in CSS — don't wrap it in extra components
4. **Asset paths** must use `import.meta.env.BASE_URL` prefix for GitHub Pages deployment

---

## New Finding (April 2026): Vite Production CSS Bundler Strips `backdrop-filter`

### Symptom

After the z-index refactoring (moving WebGL overlay to `z-index: -1`, background canvas to `z-index: -2`)
and restyling the navbar to dark frosted glass, the site rendered **perfectly in local `npm run dev`** but
showed **transparent/unfrosted UI elements on the live GitHub Pages deployment** — specifically:

- Home page header box and cards
- The `.page-topbar` navbar
- The `.controls-drawer` slide-out panel

Interestingly, the **"Pure CSS Frosted Glass" description box on CssSvgPage was rendering correctly** on
the live site even when all other frosted elements were broken. This was the key diagnostic clue.

### Root Cause

**Vite's CSS bundler processes and potentially strips/reorders `backdrop-filter` declarations when building
for production.** The `backdrop-filter` + `-webkit-backdrop-filter` pair in CSS class definitions gets
processed differently than when the same properties are applied as React inline `style` props.

The working element ("Pure CSS Frosted Glass" header) was styled with an **inline React `style` prop**:
```tsx
style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
```

All failing elements were styled via **CSS classes in `index.css`**:
```css
.page-topbar {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
```

This is NOT a z-index or stacking context issue. The background image loaded correctly on the live site.
The `backdrop-filter` property itself was the victim of CSS build-time processing.

### Fix

Convert all frosted-glass UI chrome elements from CSS class definitions to **inline React `style` props**:

```tsx
// PageShell.tsx — navbar
<nav className="page-topbar" style={{
  background: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
}}>

// Home.tsx — header and cards
// ControlsDrawer.tsx — slide-out drawer panel
// Pattern: always use React inline style props for backdropFilter
```

### Rule to Remember

> **In a Vite + React project, never apply `backdrop-filter` (and its `-webkit-` prefix) via CSS classes
> for elements that must render correctly on GitHub Pages production builds. Always use inline React
> `style` props for `backdropFilter` and `WebkitBackdropFilter`.** CSS classes work in dev mode but
> are processed differently by the Vite production bundler.

### Branch

Fix implemented in `inline-style-all` branch, merged into `master` on 21 April 2026.
