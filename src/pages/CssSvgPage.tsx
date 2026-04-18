import { PageShell, DemoBackground } from '../components/PageShell';
import { GlassControls } from '../components/GlassControls';
import { DEFAULT_CONFIG } from '../engine/LiquidGlassEngine';

export default function CssSvgPage() {
  return (
    <PageShell title="CSS + SVG Filters" badge="Pure CSS" badgeColor="#3ecf8e">
      <DemoBackground />

      {/* Hidden SVG filter definition for displacement-based refraction */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          {/* Displacement map filter — bends pixels based on a turbulence pattern */}
          <filter id="glass-displacement" x="-10%" y="-10%" width="120%" height="120%">
            {/* Generate a bevel-like displacement map using turbulence */}
            <feTurbulence
              type="turbulence"
              baseFrequency="0.01 0.01"
              numOctaves="1"
              seed="2"
              result="noise"
            />
            {/* Displace the backdrop pixels using the turbulence as a normal map */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="8"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            {/* Merge displaced + original for subtle effect */}
            <feBlend in="displaced" in2="SourceGraphic" mode="normal" />
          </filter>

          {/* Specular lighting for fake bevel highlights */}
          <filter id="glass-specular" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
            <feSpecularLighting
              in="blur"
              result="specular"
              specularConstant="1.2"
              specularExponent="20"
              lightingColor="#ffffff"
            >
              <fePointLight x="200" y="50" z="150" />
            </feSpecularLighting>
            <feComposite in="specular" in2="SourceAlpha" operator="in" result="spec-masked" />
            <feComposite in="SourceGraphic" in2="spec-masked" operator="arithmetic" k1="0" k2="1" k3="0.3" k4="0" />
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
            color: 'var(--text)',
            fontFamily: 'var(--font)',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}>
            Glass Button
          </button>

          {/* Pill */}
          <div className="css-glass" style={{ width: 160, height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-dim)' }}>Frosted Pill</span>
          </div>
        </div>

        {/* SVG displacement version (Chrome only) */}
        <div style={{ textAlign: 'center', marginTop: '3rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '1.25rem 2rem', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#fff' }}>CSS + SVG Displacement</h2>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>backdrop-filter: url(#svg-filter) — Chrome only</p>
        </div>

        <div style={{ display: 'flex', gap: '3rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div className="demo-panel css-glass-refract" style={{ borderRadius: 40 }}>
            <div className="demo-panel-content" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 24, padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ color: '#fff' }}>SVG Refraction</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>
                feDisplacementMap bends pixels,<br />
                feSpecularLighting adds bevel light,<br />
                no JavaScript required.
              </p>
            </div>
          </div>

          <GlassControls 
            title="Equivalent SVG Parameters"
            config={{ ...DEFAULT_CONFIG, refraction: 0.05, frost: 1.2, bevelDepth: 0.1, bevelWidth: 0.2, specular: true }} 
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
