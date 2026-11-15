import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PageShell, DemoBackground } from '../components/PageShell';
import { GlassControls } from '../components/GlassControls';
import { DEFAULT_CONFIG } from '../engine/LiquidGlassEngine';
import { createRoundedGlassDisplacementMap } from '../engine/displacementMap';

// Lens parameters for the SVG refraction panel, in the same lens-relative
// units as the WebGL shader (fractions of the panel's shorter side).
const SVG_LENS = { refraction: 0.05, bevelDepth: 0.1, bevelWidth: 0.2, radius: 40 };

export default function CssSvgPage() {
  const refractRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });

  // The lens map has to match the panel 1:1, so track its rendered size
  useLayoutEffect(() => {
    const panel = refractRef.current;
    if (!panel) return;
    const update = () => {
      const width = Math.round(panel.offsetWidth);
      const height = Math.round(panel.offsetHeight);
      setPanelSize(current => (current.width === width && current.height === height ? current : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const lensMap = useMemo(
    () => (panelSize.width > 0 && panelSize.height > 0
      ? createRoundedGlassDisplacementMap({
          width: panelSize.width,
          height: panelSize.height,
          radius: SVG_LENS.radius,
          bevelWidth: SVG_LENS.bevelWidth,
          refraction: SVG_LENS.refraction,
          bevelDepth: SVG_LENS.bevelDepth,
        })
      : null),
    [panelSize.width, panelSize.height],
  );

  return (
    <PageShell title="CSS + SVG Filters" badge="Pure CSS" badgeColor="#3ecf8e">
      <DemoBackground />

      {/* Hidden SVG filter: a generated lens map drives feDisplacementMap over the backdrop */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id="glass-displacement" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            {lensMap && lensMap.url ? (
              <>
                {/* R/G hold the bend along the panel's surface normal; 1:1 with the panel in px */}
                <feImage
                  href={lensMap.url}
                  x="0"
                  y="0"
                  width={panelSize.width}
                  height={panelSize.height}
                  preserveAspectRatio="none"
                  result="lensMap"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="lensMap"
                  scale={lensMap.scale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              </>
            ) : (
              <feOffset in="SourceGraphic" dx="0" dy="0" />
            )}
          </filter>
        </defs>
      </svg>

      <div className="demo-area">
        <div style={{ textAlign: 'center', marginBottom: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '1.25rem 2rem', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#fff' }}>Pure CSS Frosted Glass</h2>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>backdrop-filter: blur() • box-shadow bevel • gradient highlight overlay</p>
        </div>

        {/* CSS-only glass panel */}
        <div style={{ display: 'flex', gap: '3rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div className="demo-panel css-glass" style={{ borderRadius: 40 }}>
            <div className="demo-panel-content" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 24, padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ color: '#fff' }}>CSS Frosted Glass</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>
                Using backdrop-filter for blur,<br />
                layered box-shadows for bevel,<br />
                and gradient pseudo-elements for specular.
              </p>
            </div>
          </div>
          
          <GlassControls 
            title="Equivalent CSS Parameters"
            config={{ ...DEFAULT_CONFIG, refraction: 0, frost: 2.0, bevelDepth: 0.1, bevelWidth: 0.2, specular: true }} 
            readonly inline visibleKeys={['refraction', 'frost', 'bevelDepth', 'bevelWidth', 'specular']} 
          />
        </div>

        {/* Row of smaller shapes */}
        <div className="demo-shapes-row" style={{ marginTop: '2rem' }}>
          {/* Circle */}
          <div className="css-glass" style={{ width: 100, height: 100, borderRadius: 999 }} />

          {/* Button */}
          <button className="css-glass" style={{
            borderRadius: 24,
            padding: '0.75rem 2rem',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.82)',
            fontFamily: 'var(--font)',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}>
            Glass Button
          </button>

          {/* Pill */}
          <div className="css-glass" style={{ width: 160, height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'rgba(255,255,255,0.62)' }}>Frosted Pill</span>
          </div>
        </div>

        {/* SVG displacement version (Chrome only) */}
        <div style={{ textAlign: 'center', marginTop: '3rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '1.25rem 2rem', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#fff' }}>CSS + SVG Displacement</h2>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>backdrop-filter: url(#svg-filter) — Chrome only</p>
        </div>

        <div style={{ display: 'flex', gap: '3rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div ref={refractRef} className="demo-panel css-glass-refract" style={{ borderRadius: SVG_LENS.radius }}>
            <div className="demo-panel-content" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 24, padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ color: '#fff' }}>SVG Refraction</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>
                A generated lens map feeds feDisplacementMap,<br />
                bending the backdrop along the panel's edge normal.<br />
                JavaScript only draws the map.
              </p>
            </div>
          </div>

          <GlassControls 
            title="Equivalent SVG Parameters"
            config={{ ...DEFAULT_CONFIG, refraction: SVG_LENS.refraction, frost: 0.2, bevelDepth: SVG_LENS.bevelDepth, bevelWidth: SVG_LENS.bevelWidth, specular: true }} 
            readonly inline visibleKeys={['refraction', 'frost', 'bevelDepth', 'bevelWidth', 'specular']} 
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem', padding: '1.25rem 2rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 16, maxWidth: 520, border: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', fontWeight: 400, lineHeight: 1.6 }}>
            ⚠ SVG filter as backdrop-filter only works in Chromium browsers.
            Firefox and Safari will show the blur only.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
