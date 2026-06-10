import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { AaveLensGlass, type AaveLensParams } from '../components/AaveLensGlass';
import { PageShell, DemoBackground } from '../components/PageShell';

const TABS = ['Supply', 'Borrow', 'Stake'];
const MARKETS = [
  { symbol: 'ETH', label: 'Ethereum', value: '$3,420.18', change: '+2.8%', tone: 'mint' },
  { symbol: 'USDC', label: 'USD Coin', value: '$1.00', change: '+0.1%', tone: 'blue' },
  { symbol: 'AAVE', label: 'Aave', value: '$284.92', change: '+5.6%', tone: 'coral' },
];

const HERO_LENS: AaveLensParams = {
  lensW: 178,
  lensH: 124,
  borderRadius: 62,
  mapSize: 512,
  depth: 42,
  domeDepth: 104,
  scaleX: 0.105,
  scaleY: 0.095,
  chromaAmount: 0.46,
  blurAmount: 0.7,
  brightness: 0.12,
  splayAmount: 1,
  specularRotation: 42,
  glowStrength: 0.22,
  glowSpread: 0.78,
  glowExponent: 0.65,
  edgeStrength: 0.42,
  edgeWidth: 3,
  edgeExponent: 1.45,
};

const PILL_LENS: AaveLensParams = {
  lensW: 94,
  lensH: 48,
  borderRadius: 24,
  mapSize: 384,
  depth: 24,
  domeDepth: 58,
  scaleX: 0.09,
  scaleY: 0.085,
  chromaAmount: 0.36,
  blurAmount: 0.35,
  brightness: 0.1,
  glowStrength: 0.2,
  edgeStrength: 0.36,
};

function useOrbitPosition(enabled: boolean) {
  const [position, setPosition] = useState({ x: 0.64, y: 0.38 });
  const manualUntil = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const tick = (time: number) => {
      if (time > manualUntil.current) {
        setPosition({
          x: 0.54 + Math.sin(time * 0.00027) * 0.26,
          y: 0.48 + Math.cos(time * 0.00023) * 0.24,
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  const setManualPosition = (x: number, y: number) => {
    manualUntil.current = performance.now() + 2600;
    setPosition({ x, y });
  };

  return [position, setManualPosition] as const;
}

function ProductSurface({ activeTab, liquidity }: { activeTab: string; liquidity: number }) {
  return (
    <div className="aave2-product-surface">
      <div className="aave2-surface-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="aave2-card-header">
        <div>
          <span>Portfolio balance</span>
          <strong>${liquidity.toLocaleString()}</strong>
        </div>
        <button type="button">Connect</button>
      </div>

      <div className="aave2-tabs" role="tablist" aria-label="Market action">
        {TABS.map(tab => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''}>
            {tab}
          </button>
        ))}
      </div>

      <div className="aave2-chart" aria-hidden="true">
        <svg viewBox="0 0 520 150" preserveAspectRatio="none">
          <path className="aave2-chart-fill" d="M0 120 C80 90 102 132 166 84 C232 34 270 84 330 52 C396 18 438 76 520 40 L520 150 L0 150 Z" />
          <path className="aave2-chart-line" d="M0 120 C80 90 102 132 166 84 C232 34 270 84 330 52 C396 18 438 76 520 40" />
          <path className="aave2-chart-line muted" d="M0 82 C80 52 138 96 206 62 C274 28 350 82 520 66" />
        </svg>
      </div>

      <div className="aave2-market-grid">
        {MARKETS.map(market => (
          <button type="button" key={market.symbol} className="aave2-market-card">
            <span className={`aave2-dot ${market.tone}`} />
            <span>{market.symbol}</span>
            <small>{market.label}</small>
            <strong>{market.value}</strong>
            <em>{market.change}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function GlassSwitch() {
  const [checked, setChecked] = useState(true);

  return (
    <AaveLensGlass
      className="aave2-mini-demo aave2-switch-demo"
      lens={{ ...PILL_LENS, lensW: 70, lensH: 42, borderRadius: 21, scaleX: 0.08 }}
      x={checked ? 0.72 : 0.28}
      y={0.5}
    >
      <button type="button" className="aave2-switch" aria-pressed={checked} onClick={() => setChecked(value => !value)}>
        <span>{checked ? 'Enabled' : 'Disabled'}</span>
        <strong>{checked ? 'Live' : 'Paused'}</strong>
      </button>
    </AaveLensGlass>
  );
}

function GlassSlider() {
  const [value, setValue] = useState(64);
  const progress = value / 100;

  return (
    <AaveLensGlass className="aave2-mini-demo aave2-slider-demo" lens={PILL_LENS} x={progress} y={0.54}>
      <label className="aave2-slider">
        <span>
          Refraction
          <strong>{value}%</strong>
        </span>
        <input type="range" min="0" max="100" value={value} onChange={event => setValue(Number(event.target.value))} />
      </label>
    </AaveLensGlass>
  );
}

function GlassSegmentedControl() {
  const [active, setActive] = useState(1);
  const options = ['Day', 'Week', 'Month'];

  return (
    <AaveLensGlass className="aave2-mini-demo aave2-segment-demo" lens={PILL_LENS} x={(active + 0.5) / options.length} y={0.56}>
      <div className="aave2-segmented" role="tablist" aria-label="Time range">
        {options.map((option, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={active === index}
            key={option}
            onClick={() => setActive(index)}
          >
            {option}
          </button>
        ))}
      </div>
    </AaveLensGlass>
  );
}

function GlassVideoControls() {
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(42);

  return (
    <AaveLensGlass className="aave2-video-demo" lens={{ ...PILL_LENS, lensW: 76, lensH: 76, borderRadius: 38, domeDepth: 78 }} x={0.17} y={0.5}>
      <div className="aave2-video">
        <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <label>
          <span style={{ width: `${progress}%` }} />
          <input aria-label="Playback progress" type="range" min="0" max="100" value={progress} onChange={event => setProgress(Number(event.target.value))} />
        </label>
      </div>
    </AaveLensGlass>
  );
}

export default function AaveSvgPage() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [liquidity, setLiquidity] = useState(128420);
  const [lensPosition, setLensPosition] = useOrbitPosition(true);

  const updateLens = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLensPosition(
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    );
  };

  return (
    <PageShell title="SVG Map Glass" badge="Aave-style Lens" badgeColor="#b9d7ff">
      <DemoBackground />

      <main className="demo-area aave2-page">
        <section className="aave2-hero" aria-labelledby="aave2-title">
          <div className="aave2-copy">
            <span>Approach 04</span>
            <h1 id="aave2-title">A real lens, not a frosted card.</h1>
            <p>
              This implementation generates a dome-shaped displacement map, clips it to a moving lens, and refracts a
              local copy of the component content. The buttons and inputs stay native, while the glass bends the UI
              underneath it.
            </p>
          </div>

          <AaveLensGlass
            className="aave2-showcase"
            lens={HERO_LENS}
            x={lensPosition.x}
            y={lensPosition.y}
          >
            <section
              className="aave2-showcase-hit"
              onPointerMove={updateLens}
              onPointerDown={updateLens}
              aria-label="Interactive Aave-style glass lens demo"
            >
              <ProductSurface activeTab={activeTab} liquidity={liquidity} />
              <div className="aave2-hero-controls">
                <div className="aave2-tabs" role="tablist" aria-label="Primary action">
                  {TABS.map(tab => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab}
                      className={activeTab === tab ? 'active' : ''}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <label className="aave2-liquidity-control">
                  <span>Liquidity</span>
                  <input
                    type="range"
                    min="64000"
                    max="220000"
                    step="1000"
                    value={liquidity}
                    onChange={event => setLiquidity(Number(event.target.value))}
                  />
                </label>
              </div>
            </section>
          </AaveLensGlass>
        </section>

        <section className="aave2-component-family" aria-label="Aave-style glass component family">
          <GlassSwitch />
          <GlassSlider />
          <GlassSegmentedControl />
          <GlassVideoControls />
        </section>

        <section className="aave2-notes" aria-label="Implementation notes">
          <article>
            <span>Map</span>
            <strong>Dome normals in RG, specular in B.</strong>
            <p>The map drives refraction, chroma split, glow, and edge highlights from one cached image.</p>
          </article>
          <article>
            <span>Layering</span>
            <strong>Native controls below, refracted clone above.</strong>
            <p>The lens is pointer-transparent, so the visible UI remains accessible and interactive.</p>
          </article>
          <article>
            <span>Scope</span>
            <strong>Component-sized work, not full-page capture.</strong>
            <p>Each lens samples only the component content it needs, matching the Aave article's production tradeoff.</p>
          </article>
        </section>
      </main>
    </PageShell>
  );
}
