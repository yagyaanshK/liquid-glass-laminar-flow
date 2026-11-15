import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { GlassControls } from '../components/GlassControls';
import { ControlsDrawer } from '../components/ControlsDrawer';
import { GlassBackdrop, type GlassBackdropHandle } from '../components/GlassBackdrop';
import { MotionPermissionButton } from '../components/MotionPermissionButton';
import { LiquidGlassEngine, DEFAULT_CONFIG, supportsHtmlInCanvas, type GlassConfig } from '../engine/LiquidGlassEngine';
import { BackgroundCanvas, type BackgroundTheme } from '../engine/BackgroundCanvas';

const GRAVITY_MODE_CONFIG: Partial<GlassConfig> = {
  lensField: 'gravity',
  gravityStrength: 0.16,
  gravityFalloff: 4.2,
  gravitySoftness: 0.045,
  frost: 0,
  chromAberration: 0.16,
  fresnel: 1.1,
  edgeHighlight: 0.1,
  cornerRadius: 96,
  specular: true,
};

// Two capsules in one group: they are drawn as a single surface, so they melt
// together as the small one drifts toward the bar.
const MERGE_OVERRIDES: Partial<GlassConfig> = {
  shape: 'rect',
  cornerRadius: 999,
  group: 'merge-demo',
  blend: 36,
};

function getHashParams() {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '');
}

function getInitialConfig(): GlassConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(getHashParams().get('field') === 'gravity' ? GRAVITY_MODE_CONFIG : {}),
  };
}

function getInitialDrawerOpen(): boolean {
  return getHashParams().get('controls') === 'open';
}

function getInitialBackdrop(): BackgroundTheme {
  return getHashParams().get('backdrop') === 'light' ? 'light' : 'dark';
}

// `?dom=snapshot` forces the html2canvas fallback, to compare it with the live path
function getDomMode(): 'auto' | 'snapshot' {
  return getHashParams().get('dom') === 'snapshot' ? 'snapshot' : 'auto';
}

// A capsule that drifts over real DOM content
const DOM_LENS_OVERRIDES: Partial<GlassConfig> = {
  shape: 'rect',
  cornerRadius: 999,
};

interface LensDef {
  ref: RefObject<HTMLDivElement | null>;
  overrides: Partial<GlassConfig>;
}

export default function WebGLPage() {
  const [config, setConfig] = useState<GlassConfig>(getInitialConfig);
  const [backdrop, setBackdrop] = useState<BackgroundTheme>(getInitialBackdrop);
  const isGravityLens = config.lensField === 'gravity';
  const panelRef = useRef<HTMLDivElement>(null);
  const mergeBarRef = useRef<HTMLDivElement>(null);
  const mergeOrbRef = useRef<HTMLDivElement>(null);
  const domLensRef = useRef<HTMLDivElement>(null);
  const domBackdropRef = useRef<GlassBackdropHandle>(null);
  const [domMode] = useState(getDomMode);
  const [taps, setTaps] = useState(0);
  const domIsLive = domMode === 'auto' && supportsHtmlInCanvas();
  const circleRef = useRef<HTMLDivElement>(null);
  const ellipseRef = useRef<HTMLDivElement>(null);
  const triangleRef = useRef<HTMLDivElement>(null);
  const hexagonRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LiquidGlassEngine | null>(null);
  const bgRef = useRef<BackgroundCanvas | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  // Every lens on the page, with what it overrides from the shared config
  const [lensDefs] = useState<LensDef[]>(() => [
    { ref: panelRef, overrides: { shape: 'rect' } },
    { ref: mergeBarRef, overrides: MERGE_OVERRIDES },
    { ref: mergeOrbRef, overrides: MERGE_OVERRIDES },
    { ref: domLensRef, overrides: DOM_LENS_OVERRIDES },
    { ref: circleRef, overrides: { shape: 'circle' } },
    { ref: ellipseRef, overrides: { shape: 'ellipse' } },
    { ref: triangleRef, overrides: { shape: 'triangle' } },
    { ref: hexagonRef, overrides: { shape: 'hexagon' } },
  ]);

  useLayoutEffect(() => {
    // 1. Create the live background canvas
    const bg = new BackgroundCanvas(document.body);
    bgRef.current = bg;
    bg.setTheme(getInitialBackdrop());
    bg.start();

    // 2. Create the WebGL engine, giving it the background canvas as the texture source
    // The glass canvas goes inside the demo area, above its DOM content and
    // below the lens elements (see .glass-above-dom in index.css), so glass can
    // sit over the DOM card as well as over the canvas.
    const engine = new LiquidGlassEngine(bg.canvas, {
      overlayParent: areaRef.current ?? undefined,
      overlayZIndex: 1,
    });
    engineRef.current = engine;

    // DOM content the glass should refract, on top of the canvas
    const domBackdrop = domBackdropRef.current;
    if (domBackdrop) engine.addBackdrop(domBackdrop.element, { liveContent: domBackdrop.liveContent });

    // 3. Register lens elements after layout has settled.
    let frameA = 0;
    let frameB = 0;
    frameA = requestAnimationFrame(() => {
      frameB = requestAnimationFrame(() => {
        const initial = getInitialConfig();
        for (const { ref, overrides } of lensDefs) {
          if (ref.current) engine.addLens(ref.current, { ...initial, ...overrides });
        }
        engine.startLive(bg.canvas);
      });
    });

    return () => {
      cancelAnimationFrame(frameA);
      cancelAnimationFrame(frameB);
      engine.destroy();
      bg.destroy();
    };
  }, [lensDefs]);

  // Update configs when sliders change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const { ref, overrides } of lensDefs) {
      if (ref.current) engine.updateLensConfig(ref.current, { ...config, ...overrides });
    }
  }, [config, lensDefs]);

  useEffect(() => {
    bgRef.current?.setTheme(backdrop);
  }, [backdrop]);

  return (
    <PageShell title="WebGL Shader" badge="WebGL + GLSL" badgeColor="#ff6b4a">
      {/* No DOM background needed — BackgroundCanvas renders it */}

      <div ref={areaRef} className="demo-area glass-above-dom" style={{
        paddingTop: '6rem',
        paddingBottom: '10rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}>

        <div className="webgl-backdrop-toggle" role="group" aria-label="Backdrop behind the glass">
          <button
            type="button"
            className={`field-mode-btn ${backdrop === 'dark' ? 'active' : ''}`}
            aria-pressed={backdrop === 'dark'}
            onClick={() => setBackdrop('dark')}
          >
            Dark backdrop
          </button>
          <button
            type="button"
            className={`field-mode-btn ${backdrop === 'light' ? 'active' : ''}`}
            aria-pressed={backdrop === 'light'}
            onClick={() => setBackdrop('light')}
          >
            Light backdrop
          </button>
          <small className="field-mode-note">
            Adaptive glass reads what is behind it and flips its tint, shadow and label colour to match.
          </small>
          <MotionPermissionButton />
        </div>

        <div className="webgl-showcase">
          {/* Main glass panel (Rect) */}
          <div style={{ textAlign: 'center' }}>
            <div ref={panelRef} className="demo-panel" style={{ borderRadius: config.cornerRadius }}>
              <div className="demo-panel-content" style={{ background: 'rgba(0,0,0,0.65)', borderRadius: 24, padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ color: '#fff' }}>{isGravityLens ? 'Gravity Lens Field' : 'Rectangle SDF'}</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem' }}>
                  {isGravityLens
                    ? 'Radial theta^2/r deflection, clipped by the same rounded rectangle SDF.'
                    : 'Continuous-corner rectangle SDF. Press and hold: the glass flexes and lights up from the pointer.'}
                </p>
              </div>
            </div>
          </div>

          {/* Merging group */}
          <div className="webgl-shape-stage">
            <div className="webgl-merge-stage">
              <div ref={mergeBarRef} className="webgl-merge-bar glass-vibrant">
                <span>Library</span>
                <span>Search</span>
                <span>Radio</span>
              </div>
              <div ref={mergeOrbRef} className="webgl-merge-orb glass-vibrant" aria-hidden="true">+</div>
            </div>
            <p className="webgl-stage-caption">
              Merging: both capsules share one group, so they are one smooth-union SDF and blend as they meet.
            </p>
          </div>

          {/* Glass over DOM content */}
          <div className="webgl-shape-stage">
            <div className="webgl-dom-stage">
              <GlassBackdrop ref={domBackdropRef} className="webgl-dom-card" mode={domMode}>
                <span className="webgl-dom-eyebrow">DOM content</span>
                <h3>This card is ordinary HTML, and the glass bends it.</h3>
                <p>
                  Headings, paragraphs and buttons sit behind the lens as real elements. The engine keeps
                  the card as a texture and composites it under the glass wherever the card is on screen.
                </p>
                <div className="webgl-dom-tiles">
                  <span className="webgl-dom-tile coral">Refraction</span>
                  <span className="webgl-dom-tile light">Light tile</span>
                  <span className="webgl-dom-tile mint">Dispersion</span>
                </div>
                <button type="button" className="webgl-dom-button" onClick={() => setTaps(count => count + 1)}>
                  Tapped {taps} {taps === 1 ? 'time' : 'times'}
                </button>
              </GlassBackdrop>
              <div ref={domLensRef} className="webgl-dom-lens">
                <strong className="glass-vibrant">Glass</strong>
                <small className="glass-vibrant-secondary">over DOM</small>
              </div>
            </div>
            <p className="webgl-stage-caption">
              {domIsLive
                ? 'Live: this browser paints the card into a canvas (HTML-in-canvas), so the glass shows every change as it happens. Tap the button and watch the lens.'
                : 'Snapshot: the card is captured with html2canvas and re-captured when its text or size changes. Tap the button; the lens catches up a moment later.'}
            </p>
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
