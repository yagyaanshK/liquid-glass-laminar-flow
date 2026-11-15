import { type CSSProperties, type PointerEvent, type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createAaveLensDisplacementMap } from '../engine/displacementMap';
import { useDeviceTilt, useGlassEnvironment } from './useGlassEnvironment';

export interface AaveLensParams {
  lensW: number;
  lensH: number;
  borderRadius: number;
  mapSize?: number;
  depth?: number;
  domeDepth?: number;
  scaleX?: number;
  scaleY?: number;
  chromaAmount?: number;
  blurAmount?: number;
  brightness?: number;
  tint?: number;
  splayAmount?: number;
  specularRotation?: number;
  glowStrength?: number;
  glowSpread?: number;
  glowExponent?: number;
  edgeStrength?: number;
  edgeWidth?: number;
  edgeExponent?: number;
}

interface AaveLensGlassProps {
  children: ReactNode;
  className?: string;
  lens: AaveLensParams;
  x?: number;
  y?: number;
  refractionTarget?: ReactNode;
  /** Flex the lens and glow from the pointer while the component is pressed. */
  interactive?: boolean;
  style?: CSSProperties;
}

const DEFAULT_LENS: Required<AaveLensParams> = {
  lensW: 120,
  lensH: 86,
  borderRadius: 43,
  mapSize: 512,
  depth: 34,
  domeDepth: 80,
  scaleX: 0.08,
  scaleY: 0.08,
  chromaAmount: 0.38,
  blurAmount: 0.5,
  brightness: 0.1,
  tint: 0,
  splayAmount: 1,
  specularRotation: 45,
  glowStrength: 0.14,
  glowSpread: 1,
  glowExponent: 0.5,
  edgeStrength: 0.3,
  edgeWidth: 3,
  edgeExponent: 1.5,
};

export function AaveLensGlass({
  children,
  className = '',
  lens,
  x = 0.5,
  y = 0.5,
  refractionTarget,
  interactive = true,
  style,
}: AaveLensGlassProps) {
  const id = useId().replace(/:/g, '');
  const filterId = `aave-lens-filter-${id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pressed, setPressed] = useState(false);
  const env = useGlassEnvironment();
  const tilt = useDeviceTilt(!env.reduceMotion);
  const params = { ...DEFAULT_LENS, ...lens };

  // Accessibility variants. On this route the content sits *under* the lens,
  // so legibility means less optics, not more frost: the lens flattens toward
  // a plain, sharp highlight. Increased contrast also drops the specular
  // layers and gets a solid outline (see .is-more-contrast in index.css).
  if (env.reduceTransparency || env.moreContrast) {
    params.blurAmount = 0;
    params.scaleX *= 0.35;
    params.scaleY *= 0.35;
    params.chromaAmount = 0;
  }
  if (env.moreContrast) {
    params.glowStrength = 0;
    params.edgeStrength = 0;
  }

  // One light direction for the map's specular channel and the CSS rim / sheen.
  // Device tilt swings it, so highlights travel around the rim.
  const lightRotation = params.specularRotation + tilt;
  const lightRadians = (lightRotation * Math.PI) / 180;
  const lightX = Math.cos(lightRadians);
  const lightY = Math.sin(lightRadians);

  // feDisplacementMap has a single scale for both axes, so the per-axis
  // strengths are baked into the map and one base scale drives every channel.
  const maxAxisScale = Math.max(params.scaleX, params.scaleY, 0.0001);
  const axisScaleX = params.scaleX / maxAxisScale;
  const axisScaleY = params.scaleY / maxAxisScale;
  const baseScale = maxAxisScale * Math.min(params.lensW, params.lensH);
  // Dispersion is symmetric around green: red bends a little less, blue a little more.
  const dispersion = params.chromaAmount * 0.14;
  const blurred = params.blurAmount > 0.01;
  const mapUrl = useMemo(
    () => createAaveLensDisplacementMap({
      lensWidth: params.lensW,
      lensHeight: params.lensH,
      borderRadius: params.borderRadius,
      mapSize: params.mapSize,
      depth: params.depth,
      domeDepth: params.domeDepth,
      axisScaleX,
      axisScaleY,
      splayAmount: params.splayAmount,
      edgeFalloff: true,
      specularRotation: lightRotation,
      glowStrength: params.glowStrength,
      glowSpread: params.glowSpread,
      glowExponent: params.glowExponent,
      edgeStrength: params.edgeStrength,
      edgeWidth: params.edgeWidth,
      edgeExponent: params.edgeExponent,
    }),
    [
      params.lensW,
      params.lensH,
      params.borderRadius,
      params.mapSize,
      params.depth,
      params.domeDepth,
      axisScaleX,
      axisScaleY,
      params.splayAmount,
      lightRotation,
      params.glowStrength,
      params.glowSpread,
      params.glowExponent,
      params.edgeStrength,
      params.edgeWidth,
      params.edgeExponent,
    ],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const update = () => {
      const rect = root.getBoundingClientRect();
      setSize(current => (
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      ));
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const lensLeft = Math.max(params.lensW / 2, Math.min(size.width - params.lensW / 2, x * size.width || params.lensW / 2));
  const lensTop = Math.max(params.lensH / 2, Math.min(size.height - params.lensH / 2, y * size.height || params.lensH / 2));
  const source = refractionTarget ?? children;
  const hasSize = size.width > 0 && size.height > 0;

  // Press response: the glow follows the pointer through CSS variables, so
  // moving the pointer does not re-render the component.
  const trackPointer = (event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    root.style.setProperty('--lens-press-x', `${event.clientX - rect.left - (lensLeft - params.lensW / 2)}px`);
    root.style.setProperty('--lens-press-y', `${event.clientY - rect.top - (lensTop - params.lensH / 2)}px`);
  };
  const pressHandlers = interactive
    ? {
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => { trackPointer(event); setPressed(true); },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => { if (pressed) trackPointer(event); },
        onPointerUp: () => setPressed(false),
        onPointerCancel: () => setPressed(false),
        onPointerLeave: () => setPressed(false),
      }
    : {};

  const rootClassName = [
    'aave-lens-root',
    className,
    pressed ? 'is-pressed' : '',
    env.reduceMotion ? 'is-reduced-motion' : '',
    env.reduceTransparency ? 'is-reduced-transparency' : '',
    env.moreContrast ? 'is-more-contrast' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      {...pressHandlers}
      style={{
        '--lens-w': `${params.lensW}px`,
        '--lens-h': `${params.lensH}px`,
        '--lens-r': `${params.borderRadius}px`,
        '--lens-x': `${lensLeft}px`,
        '--lens-y': `${lensTop}px`,
        '--lens-brightness': params.brightness,
        '--lens-tint': params.tint,
        '--lens-light-x': lightX,
        '--lens-light-y': lightY,
        '--lens-light-rot': `${lightRotation}deg`,
        ...style,
      } as CSSProperties}
    >
      <div className="aave-lens-base">
        {children}
      </div>

      <svg width="0" height="0" className="aave-lens-defs" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-18%" y="-18%" width="136%" height="136%" colorInterpolationFilters="sRGB">
            {/* Explicit px geometry: the map covers exactly the lens box of the filtered element */}
            <feImage href={mapUrl} x="0" y="0" width={params.lensW} height={params.lensH} preserveAspectRatio="none" result="map" />
            {blurred && (
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={params.blurAmount}
                edgeMode="duplicate"
                result="blurred"
              />
            )}
            {params.chromaAmount > 0.01 ? (
              <>
                <feDisplacementMap
                  in={blurred ? 'blurred' : 'SourceGraphic'}
                  in2="map"
                  scale={baseScale * (1 - dispersion)}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispR"
                />
                <feColorMatrix
                  in="dispR"
                  type="matrix"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="rOnly"
                />
                <feDisplacementMap
                  in={blurred ? 'blurred' : 'SourceGraphic'}
                  in2="map"
                  scale={baseScale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispG"
                />
                <feColorMatrix
                  in="dispG"
                  type="matrix"
                  values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="gOnly"
                />
                <feDisplacementMap
                  in={blurred ? 'blurred' : 'SourceGraphic'}
                  in2="map"
                  scale={baseScale * (1 + dispersion)}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispB"
                />
                <feColorMatrix
                  in="dispB"
                  type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                  result="bOnly"
                />
                <feComposite in="rOnly" in2="gOnly" operator="arithmetic" k2="1" k3="1" result="rg" />
                <feComposite in="rg" in2="bOnly" operator="arithmetic" k2="1" k3="1" result="lensResult" />
              </>
            ) : (
              <feDisplacementMap
                in={blurred ? 'blurred' : 'SourceGraphic'}
                in2="map"
                scale={baseScale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="lensResult"
              />
            )}
            <feColorMatrix
              in="map"
              type="matrix"
              values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 -0.5019"
              result="specMask"
            />
            <feComposite in="specMask" in2="lensResult" operator="arithmetic" k2="0.85" k3="1" result="litLens" />
          </filter>
        </defs>
      </svg>

      {hasSize && (
        <div className="aave-lens">
          <div className="aave-lens-refracted" style={{ filter: `url(#${filterId})` }}>
            <div
              className="aave-lens-source-copy"
              style={{
                width: size.width,
                height: size.height,
                transform: `translate(${-lensLeft + params.lensW / 2}px, ${-lensTop + params.lensH / 2}px)`,
              }}
              aria-hidden="true"
              inert
            >
              {source}
            </div>
          </div>
          <div className="aave-lens-tint" />
          <div className="aave-lens-glow" />
          <div className="aave-lens-rim" />
        </div>
      )}
    </div>
  );
}
