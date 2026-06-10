import { type CSSProperties, type ReactNode, useId, useMemo, useState } from 'react';
import { PageShell, DemoBackground } from '../components/PageShell';
import { createRoundedGlassDisplacementMap } from '../engine/displacementMap';

const MARKETS = [
  { name: 'ETH', rate: '3.12%', tone: 'coral' },
  { name: 'USDC', rate: '4.84%', tone: 'mint' },
  { name: 'AAVE', rate: '2.41%', tone: 'blue' },
];

const TABS = ['Overview', 'Markets', 'Risk', 'Settings'];

interface AaveGlassProps {
  width: number;
  height: number;
  radius: number;
  scale?: number;
  className?: string;
  children: ReactNode;
  target?: ReactNode;
}

function AaveGlass({
  width,
  height,
  radius,
  scale = 42,
  className = '',
  children,
  target,
}: AaveGlassProps) {
  const rawId = useId().replace(/:/g, '');
  const filterId = `aave-map-${rawId}`;
  const mapUrl = useMemo(
    () => createRoundedGlassDisplacementMap({ width, height, radius, bevelWidth: 0.34 }),
    [width, height, radius],
  );

  return (
    <div
      className={`aave-glass ${className}`}
      style={{
        '--glass-width': `${width}px`,
        '--glass-height': `${height}px`,
        '--glass-radius': `${radius}px`,
      } as CSSProperties}
    >
      <svg width="0" height="0" className="aave-filter-defs" aria-hidden="true">
        <defs>
          <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={mapUrl} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
          </filter>
        </defs>
      </svg>

      <div className="aave-glass-target" style={{ filter: `url(#${filterId})` }}>
        {target ?? <TargetPattern />}
      </div>
      <div className="aave-glass-surface" />
      <div className="aave-glass-content">{children}</div>
    </div>
  );
}

function TargetPattern({ label = 'Live target layer' }: { label?: string }) {
  return (
    <div className="aave-target-pattern" aria-hidden="true">
      <div className="aave-target-gradient" />
      <div className="aave-target-lines">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="aave-target-dots">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="aave-target-copy">
        <strong>{label}</strong>
        <small>filtered only inside this component</small>
      </div>
    </div>
  );
}

function FlowBackdrop({ value }: { value: number }) {
  const intensity = 0.55 + value / 220;

  return (
    <div className="aave-panel-target" aria-hidden="true">
      <div className="aave-panel-orbits">
        <span />
        <span />
        <span />
      </div>
      <div className="aave-panel-rows">
        {MARKETS.map((market, index) => (
          <div className="aave-panel-row" key={market.name} style={{ '--row-index': index } as CSSProperties}>
            <span className={`aave-market-dot ${market.tone}`} />
            <span>{market.name}</span>
            <strong>{market.rate}</strong>
          </div>
        ))}
      </div>
      <div className="aave-panel-wave" style={{ opacity: intensity }} />
    </div>
  );
}

export default function AaveSvgPage() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [intensity, setIntensity] = useState(58);
  const [volume, setVolume] = useState(68);
  const [playing, setPlaying] = useState(true);
  const [protectedMode, setProtectedMode] = useState(true);

  return (
    <PageShell title="SVG Map Glass" badge="Interactive SVG" badgeColor="#b9d7ff">
      <DemoBackground />

      <main className="demo-area aave-page">
        <section className="aave-hero" aria-labelledby="svg-map-title">
          <div className="aave-hero-copy">
            <span className="aave-kicker">Approach 04</span>
            <h1 id="svg-map-title">Component-scoped glass for real product UI.</h1>
            <p>
              This route follows the Aave-style strategy: generate a small displacement map for each lens, cache it by
              geometry, then filter only the content that belongs inside that component. The foreground controls stay
              sharp and clickable while the internal target layer bends like glass.
            </p>
          </div>

          <AaveGlass
            width={640}
            height={500}
            radius={44}
            scale={Math.round(28 + intensity * 0.42)}
            className="aave-control-glass"
            target={<FlowBackdrop value={intensity} />}
          >
            <div className="aave-control-panel">
              <div className="aave-panel-top">
                <div>
                  <span>Glass Console</span>
                  <strong>{activeTab}</strong>
                </div>
                <button
                  type="button"
                  className={`aave-toggle ${protectedMode ? 'active' : ''}`}
                  aria-pressed={protectedMode}
                  onClick={() => setProtectedMode(value => !value)}
                >
                  Protected
                </button>
              </div>

              <div className="aave-nav-pills" role="tablist" aria-label="Glass console sections">
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

              <div className="aave-balance">
                <span>Available liquidity</span>
                <strong>${(48200 + intensity * 91).toLocaleString()}</strong>
              </div>

              <div className="aave-market-list" aria-label="Market rates">
                {MARKETS.map(market => (
                  <button type="button" key={market.name} className="aave-market-button">
                    <span className={`aave-market-dot ${market.tone}`} />
                    <span>{market.name}</span>
                    <strong>{market.rate}</strong>
                  </button>
                ))}
              </div>

              <label className="aave-slider-row">
                <span>
                  Refraction strength
                  <strong>{intensity}%</strong>
                </span>
                <input
                  type="range"
                  min="12"
                  max="100"
                  value={intensity}
                  onChange={event => setIntensity(Number(event.target.value))}
                />
              </label>

              <div className="aave-action-row">
                <button type="button" className="aave-primary-action">Supply</button>
                <button type="button" className="aave-secondary-action">Borrow</button>
                <button type="button" className="aave-icon-action" aria-label="Open details">i</button>
              </div>
            </div>
          </AaveGlass>
        </section>

        <section className="aave-interactive-strip" aria-label="Glass controls">
          <AaveGlass width={336} height={112} radius={32} scale={32} className="aave-mini-glass">
            <div className="aave-mini-control">
              <span>Navigation pill</span>
              <div className="aave-mini-pills">
                <button type="button" className="active">Pool</button>
                <button type="button">Vault</button>
              </div>
            </div>
          </AaveGlass>

          <AaveGlass width={336} height={112} radius={32} scale={30} className="aave-mini-glass">
            <div className="aave-media-control">
              <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? 'Pause' : 'Play'}
              </button>
              <div className="aave-progress">
                <span style={{ width: `${playing ? 62 : 38}%` }} />
              </div>
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={event => setVolume(Number(event.target.value))}
              />
            </div>
          </AaveGlass>

          <AaveGlass width={336} height={112} radius={32} scale={34} className="aave-mini-glass">
            <div className="aave-mini-control">
              <span>Button states</span>
              <div className="aave-mini-actions">
                <button type="button">Confirm</button>
                <button type="button">Review</button>
              </div>
            </div>
          </AaveGlass>
        </section>

        <section className="aave-explainer" aria-label="Implementation notes">
          <article>
            <span>Render scope</span>
            <strong>Each lens filters a local target layer.</strong>
            <p>No full-page snapshot or live canvas upload is required for these controls.</p>
          </article>
          <article>
            <span>Map lifecycle</span>
            <strong>Maps are generated only when geometry changes.</strong>
            <p>Interaction can update CSS and component state without rebuilding the displacement image.</p>
          </article>
          <article>
            <span>Best fit</span>
            <strong>Buttons, sliders, pills, cards, and compact panels.</strong>
            <p>The technique prioritizes production UI performance over full-scene optical accuracy.</p>
          </article>
        </section>
      </main>
    </PageShell>
  );
}
