import { useEffect, useRef, useState } from 'react';
import { PageShell, DemoBackground } from '../components/PageShell';
import { GlassControls } from '../components/GlassControls';
import { LiquidGlassEngine, DEFAULT_CONFIG, type GlassConfig } from '../engine/LiquidGlassEngine';

export default function Html2CanvasPage() {
  const [config, setConfig] = useState<GlassConfig>({ ...DEFAULT_CONFIG });
  const panelRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const engineRef = useRef<LiquidGlassEngine | null>(null);

  useEffect(() => {
    // Engine uses document.body as snapshot root
    const engine = new LiquidGlassEngine(document.body);
    engineRef.current = engine;

    const timer = setTimeout(() => {
      if (panelRef.current) engine.addLens(panelRef.current, { ...DEFAULT_CONFIG });
      if (circleRef.current) engine.addLens(circleRef.current, { ...DEFAULT_CONFIG, cornerRadius: 999 });
      if (btnRef.current) engine.addLens(btnRef.current, { ...DEFAULT_CONFIG, cornerRadius: 24 });
      engine.startSnapshot();
    }, 600);

    return () => {
      clearTimeout(timer);
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (panelRef.current) engine.updateLensConfig(panelRef.current, config);
    if (circleRef.current) engine.updateLensConfig(circleRef.current, { ...config, cornerRadius: 999 });
    if (btnRef.current) engine.updateLensConfig(btnRef.current, { ...config, cornerRadius: 24 });
  }, [config]);

  return (
    <PageShell title="html2canvas Snapshot" badge="html2canvas + WebGL" badgeColor="#e8a838">
      <DemoBackground />

      <div className="demo-area">
        <div style={{ textAlign: 'center', marginBottom: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '1.25rem 2rem', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#fff' }}>DOM Snapshot Refraction</h2>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>html2canvas captures the page → WebGL shader refracts the texture</p>
        </div>

        <div ref={panelRef} className="demo-panel" style={{ borderRadius: config.cornerRadius }}>
          <div className="demo-panel-content" data-liquid-glass-ignore style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 24, padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 style={{ color: '#fff' }}>Snapshot Glass</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>
              One-time DOM capture,<br />
              then GLSL refraction shader.
            </p>
          </div>
        </div>

        <div className="demo-shapes-row" style={{ marginTop: '2rem' }}>
          <div ref={circleRef} style={{ width: 100, height: 100, borderRadius: 999 }} />
          <button ref={btnRef} style={{
            borderRadius: 24,
            padding: '0.75rem 2rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--font)',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}>
            Glass Button
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem', padding: '1.25rem 2rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 16, maxWidth: 520, border: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', fontWeight: 400, lineHeight: 1.6 }}>
            ⚠ Static snapshot — the glass shows a frozen image of the background.
            Scrolling or resizing won't update the refraction without re-capturing.
          </p>
        </div>
      </div>

      <GlassControls config={config} onChange={setConfig} />
    </PageShell>
  );
}
