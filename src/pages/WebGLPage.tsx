import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { GlassControls } from '../components/GlassControls';
import { ControlsDrawer } from '../components/ControlsDrawer';
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

  useLayoutEffect(() => {
    // 1. Create the live background canvas
    const bg = new BackgroundCanvas(document.body);
    bgRef.current = bg;
    bg.start();

    // 2. Create the WebGL engine, giving it the background canvas as the texture source
    const engine = new LiquidGlassEngine(bg.canvas);
    engineRef.current = engine;

    // 3. Register lens elements after layout has settled.
    let frameA = 0;
    let frameB = 0;
    frameA = requestAnimationFrame(() => {
      frameB = requestAnimationFrame(() => {
      if (panelRef.current) engine.addLens(panelRef.current, { ...DEFAULT_CONFIG, shape: 'rect' });
      if (circleRef.current) engine.addLens(circleRef.current, { ...DEFAULT_CONFIG, shape: 'circle' });
      if (ellipseRef.current) engine.addLens(ellipseRef.current, { ...DEFAULT_CONFIG, shape: 'ellipse' });
      if (triangleRef.current) engine.addLens(triangleRef.current, { ...DEFAULT_CONFIG, shape: 'triangle' });
      if (hexagonRef.current) engine.addLens(hexagonRef.current, { ...DEFAULT_CONFIG, shape: 'hexagon' });
      engine.startLive(bg.canvas);
      });
    });

    return () => {
      cancelAnimationFrame(frameA);
      cancelAnimationFrame(frameB);
      engine.destroy();
      bg.destroy();
    };
  }, []);

  // Update configs when sliders change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (panelRef.current) engine.updateLensConfig(panelRef.current, config);
    if (circleRef.current) engine.updateLensConfig(circleRef.current, { ...config, shape: 'circle' });
    if (ellipseRef.current) engine.updateLensConfig(ellipseRef.current, { ...config, shape: 'ellipse' });
    if (triangleRef.current) engine.updateLensConfig(triangleRef.current, { ...config, shape: 'triangle' });
    if (hexagonRef.current) engine.updateLensConfig(hexagonRef.current, { ...config, shape: 'hexagon' });
  }, [config]);

  return (
    <PageShell title="WebGL Shader" badge="WebGL + GLSL" badgeColor="#ff6b4a">
      {/* No DOM background needed — BackgroundCanvas renders it */}

      <div className="demo-area" style={{
        paddingTop: '8rem',
        paddingBottom: '10rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}>

        <div className="webgl-showcase">
          {/* Main glass panel (Rect) */}
          <div style={{ textAlign: 'center' }}>
            <div ref={panelRef} className="demo-panel" style={{ borderRadius: config.cornerRadius }}>
              <div className="demo-panel-content" style={{ background: 'rgba(0,0,0,0.65)', borderRadius: 24, padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ color: '#fff' }}>Rectangle SDF</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>Standard Rounded Rectangle SDF.</p>
              </div>
            </div>
          </div>

          {/* Circle */}
          <div className="webgl-shape-stage">
            <div ref={circleRef} className="webgl-lens" style={{ width: 'min(450px, 85vw)', aspectRatio: '1/1', borderRadius: '50%' }}>
              <div className="webgl-lens-label">Circle SDF</div>
            </div>
          </div>

          {/* Ellipse */}
          <div className="webgl-shape-stage">
            <div ref={ellipseRef} className="webgl-lens" style={{ width: 'min(650px, 90vw)', aspectRatio: '650/380', borderRadius: '50%' }}>
              <div className="webgl-lens-label">Ellipse SDF</div>
            </div>
          </div>

          {/* Equilateral Triangle */}
          <div className="webgl-shape-stage">
            <div ref={triangleRef} className="webgl-lens" style={{ width: 'min(450px, 85vw)', aspectRatio: '1/1' }}>
              <div className="webgl-lens-label">Triangle SDF</div>
            </div>
          </div>

          {/* Hexagon */}
          <div className="webgl-shape-stage">
            <div ref={hexagonRef} className="webgl-lens" style={{ width: 'min(450px, 85vw)', aspectRatio: '1/1' }}>
              <div className="webgl-lens-label">Hexagon SDF</div>
            </div>
          </div>
        </div>
      </div>

      <ControlsDrawer>
        <GlassControls config={config} onChange={setConfig} />
      </ControlsDrawer>
    </PageShell>
  );
}
