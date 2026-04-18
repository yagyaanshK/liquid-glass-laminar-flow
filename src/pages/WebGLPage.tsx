import { useEffect, useRef, useState } from 'react';
import { PageShell, DemoBackground } from '../components/PageShell';
import { GlassControls } from '../components/GlassControls';
import { LiquidGlassEngine, DEFAULT_CONFIG, type GlassConfig } from '../engine/LiquidGlassEngine';
import { BackgroundCanvas } from '../engine/BackgroundCanvas';

export default function WebGLPage() {
  const [config, setConfig] = useState<GlassConfig>({ ...DEFAULT_CONFIG });
  const panelRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const ellipseRef = useRef<HTMLDivElement>(null);
  const triangleRef = useRef<HTMLDivElement>(null);
  const hexagonRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LiquidGlassEngine | null>(null);
  const bgRef = useRef<BackgroundCanvas | null>(null);

  useEffect(() => {
    // 1. Create the live background canvas
    const bg = new BackgroundCanvas(document.body);
    bgRef.current = bg;
    bg.start();

    // 2. Create the WebGL engine, giving it the background canvas as the texture source
    const engine = new LiquidGlassEngine(bg.canvas);
    engineRef.current = engine;

    // 3. Register lens elements after a short delay to let React paint
    const timer = setTimeout(() => {
      if (panelRef.current)    engine.addLens(panelRef.current, { ...DEFAULT_CONFIG, shape: 'rect' });
      if (circleRef.current)   engine.addLens(circleRef.current, { ...DEFAULT_CONFIG, shape: 'circle' });
      if (ellipseRef.current)  engine.addLens(ellipseRef.current, { ...DEFAULT_CONFIG, shape: 'ellipse' });
      if (triangleRef.current) engine.addLens(triangleRef.current, { ...DEFAULT_CONFIG, shape: 'triangle' });
      if (hexagonRef.current)  engine.addLens(hexagonRef.current, { ...DEFAULT_CONFIG, shape: 'hexagon' });
      engine.startLive(bg.canvas);
    }, 300);

    return () => {
      clearTimeout(timer);
      engine.destroy();
      bg.destroy();
    };
  }, []);

  // Update configs when sliders change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (panelRef.current)    engine.updateLensConfig(panelRef.current, config);
    if (circleRef.current)   engine.updateLensConfig(circleRef.current, { ...config, shape: 'circle' });
    if (ellipseRef.current)  engine.updateLensConfig(ellipseRef.current, { ...config, shape: 'ellipse' });
    if (triangleRef.current) engine.updateLensConfig(triangleRef.current, { ...config, shape: 'triangle' });
    if (hexagonRef.current)  engine.updateLensConfig(hexagonRef.current, { ...config, shape: 'hexagon' });
  }, [config]);

  return (
    <PageShell title="WebGL Shader" badge="WebGL + GLSL" badgeColor="#ff6b4a">
      {/* No DOM background needed — BackgroundCanvas renders it */}

      <div className="demo-area" style={{ 
        paddingBottom: '10rem',
        paddingRight: '340px', /* Reserve space for the fixed controls sidebar */
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}>
        
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12rem', 
          width: '100%',
          alignItems: 'center'
        }}>
          {/* Main glass panel (Rect) */}
          <div style={{ textAlign: 'center' }}>
            <div ref={panelRef} className="demo-panel" style={{ borderRadius: config.cornerRadius }}>
              <div className="demo-panel-content" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 24, padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ color: '#fff' }}>Rectangle SDF</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>Standard Rounded Rectangle SDF.</p>
              </div>
            </div>
          </div>

          {/* Circle */}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 500, background: 'rgba(0,0,0,0.65)', padding: '1rem', borderRadius: '12px' }}>Circle SDF</h2>
            <div ref={circleRef} style={{ width: 450, height: 450, borderRadius: '50%' }} />
          </div>

          {/* Ellipse */}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 500, background: 'rgba(0,0,0,0.65)', padding: '1rem', borderRadius: '12px' }}>Ellipse SDF</h2>
            <div ref={ellipseRef} style={{ width: 650, height: 380, borderRadius: '50%' }} />
          </div>

          {/* Equilateral Triangle */}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 500, background: 'rgba(0,0,0,0.65)', padding: '1rem', borderRadius: '12px' }}>Triangle SDF</h2>
            <div ref={triangleRef} style={{ width: 450, height: 450 }} />
          </div>

          {/* Hexagon */}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 500, background: 'rgba(0,0,0,0.65)', padding: '1rem', borderRadius: '12px' }}>Hexagon SDF</h2>
            <div ref={hexagonRef} style={{ width: 450, height: 450 }} />
          </div>
        </div>
      </div>

      <GlassControls config={config} onChange={setConfig} />
    </PageShell>
  );
}
