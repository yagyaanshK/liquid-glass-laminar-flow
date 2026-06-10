import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { GlassControls } from '../components/GlassControls';
import { ControlsDrawer } from '../components/ControlsDrawer';
import { LiquidGlassEngine, DEFAULT_CONFIG, type GlassConfig } from '../engine/LiquidGlassEngine';
import { BackgroundCanvas } from '../engine/BackgroundCanvas';

const GRAVITY_MODE_CONFIG: Partial<GlassConfig> = {
  lensField: 'gravity',
  gravityStrength: 0.105,
  gravityFalloff: 4.2,
  gravitySoftness: 0.045,
  frost: 0,
  chromAberration: 0.16,
  fresnel: 1.1,
  edgeHighlight: 0.1,
  cornerRadius: 96,
  specular: true,
};

function getInitialConfig(): GlassConfig {
  const hashQuery = window.location.hash.split('?')[1] ?? '';
  const params = new URLSearchParams(hashQuery);
  return {
    ...DEFAULT_CONFIG,
    ...(params.get('field') === 'gravity' ? GRAVITY_MODE_CONFIG : {}),
  };
}

function getInitialDrawerOpen(): boolean {
  const hashQuery = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(hashQuery).get('controls') === 'open';
}

export default function WebGLPage() {
  const [config, setConfig] = useState<GlassConfig>(getInitialConfig);
  const isGravityLens = config.lensField === 'gravity';
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
                <h2 style={{ color: '#fff' }}>{isGravityLens ? 'Gravity Lens Field' : 'Rectangle SDF'}</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>
                  {isGravityLens
                    ? 'Radial theta^2/r deflection, clipped by the same rounded rectangle SDF.'
                    : 'Standard rounded rectangle SDF with edge-driven refraction.'}
                </p>
              </div>
            </div>
          </div>

          {/* Circle */}
          <div className="webgl-shape-stage">
            <div ref={circleRef} className="webgl-lens" style={{ width: 'min(450px, 85vw)', aspectRatio: '1/1', borderRadius: '50%' }}>
              <div className="webgl-lens-label">{isGravityLens ? 'Circle Gravity Field' : 'Circle SDF'}</div>
            </div>
          </div>

          {/* Ellipse */}
          <div className="webgl-shape-stage">
            <div ref={ellipseRef} className="webgl-lens" style={{ width: 'min(650px, 90vw)', aspectRatio: '650/380', borderRadius: '50%' }}>
              <div className="webgl-lens-label">{isGravityLens ? 'Ellipse Gravity Field' : 'Ellipse SDF'}</div>
            </div>
          </div>

          {/* Equilateral Triangle */}
          <div className="webgl-shape-stage">
            <div ref={triangleRef} className="webgl-lens" style={{ width: 'min(450px, 85vw)', aspectRatio: '1/1' }}>
              <div className="webgl-lens-label">{isGravityLens ? 'Triangle Gravity Field' : 'Triangle SDF'}</div>
            </div>
          </div>

          {/* Hexagon */}
          <div className="webgl-shape-stage">
            <div ref={hexagonRef} className="webgl-lens" style={{ width: 'min(450px, 85vw)', aspectRatio: '1/1' }}>
              <div className="webgl-lens-label">{isGravityLens ? 'Hexagon Gravity Field' : 'Hexagon SDF'}</div>
            </div>
          </div>
        </div>
      </div>

      <ControlsDrawer defaultOpen={getInitialDrawerOpen()}>
        <GlassControls config={config} onChange={setConfig} />
      </ControlsDrawer>
    </PageShell>
  );
}
