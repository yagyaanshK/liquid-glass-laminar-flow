import { useId, useMemo } from 'react';
import { PageShell, DemoBackground } from '../components/PageShell';
import { createRoundedGlassDisplacementMap } from '../engine/displacementMap';

interface AaveGlassProps {
  width: number;
  height: number;
  radius: number;
  scale?: number;
  title: string;
  subtitle?: string;
  compact?: boolean;
}

function AaveGlass({ width, height, radius, scale = 36, title, subtitle, compact = false }: AaveGlassProps) {
  const rawId = useId().replace(/:/g, '');
  const filterId = `aave-map-${rawId}`;
  const mapUrl = useMemo(
    () => createRoundedGlassDisplacementMap({ width, height, radius }),
    [width, height, radius],
  );

  return (
    <div
      className={`aave-glass ${compact ? 'compact' : ''}`}
      style={{
        width,
        height,
        maxWidth: '88vw',
        borderRadius: radius,
      }}
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
        <div className="aave-target-lines">
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
        </div>
        <div className="aave-target-copy">
          <strong>Target Layer</strong>
          <small>filtered by map</small>
        </div>
      </div>

      <div className="aave-glass-surface" />
      <div className="aave-glass-label">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>
  );
}

export default function AaveSvgPage() {
  return (
    <PageShell title="SVG Map Glass" badge="Aave-style SVG" badgeColor="#8f7bff">
      <DemoBackground />

      <div className="demo-area aave-page">
        <div className="aave-intro">
          <h2>Displacement Map Glass</h2>
          <p>Generated PNG offset maps drive SVG `feDisplacementMap`; movement stays cheap because the map is cached per lens geometry.</p>
        </div>

        <section className="aave-demo-layout" aria-label="Aave-style glass examples">
          <AaveGlass
            width={440}
            height={292}
            radius={42}
            title="Cached Map Lens"
            subtitle="No full-screen texture upload"
          />

          <div className="aave-stack">
            <AaveGlass width={300} height={96} radius={34} scale={28} title="Action Control" compact />
            <AaveGlass width={180} height={180} radius={90} scale={34} title="Round Lens" compact />
          </div>
        </section>

        <section className="aave-comparison">
          <div>
            <span>Render scope</span>
            <strong>Component-sized filter</strong>
          </div>
          <div>
            <span>Per-frame work</span>
            <strong>Move DOM/CSS only</strong>
          </div>
          <div>
            <span>Map lifecycle</span>
            <strong>Generate on geometry change</strong>
          </div>
          <div>
            <span>Tradeoff</span>
            <strong>Refracts chosen content, not the whole page</strong>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
