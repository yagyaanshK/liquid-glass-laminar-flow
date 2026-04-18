import { type GlassConfig, DEFAULT_CONFIG } from '../engine/LiquidGlassEngine';

interface Props {
  config: GlassConfig;
  onChange?: (config: GlassConfig) => void;
  readonly?: boolean;
  inline?: boolean;
  visibleKeys?: (keyof GlassConfig)[];
  title?: string;
}

const SLIDERS: { key: keyof GlassConfig; label: string; min: number; max: number; step: number }[] = [
  { key: 'refraction',      label: 'Refraction / Distortion', min: 0, max: 0.2,  step: 0.001 },
  { key: 'bevelDepth',      label: 'Bevel Depth',         min: 0, max: 0.5,  step: 0.005 },
  { key: 'bevelWidth',      label: 'Bevel Width',         min: 0, max: 0.5,  step: 0.005 },
  { key: 'frost',           label: 'Frost (Blur)',        min: 0, max: 5,    step: 0.1   },
  { key: 'cornerRadius',    label: 'Corner Radius',       min: 0, max: 200,  step: 1     },
  { key: 'chromAberration', label: 'Chromatic Aberration', min: 0, max: 0.5, step: 0.005 },
  { key: 'fresnel',         label: 'Fresnel',             min: 0, max: 2,    step: 0.01  },
  { key: 'edgeHighlight',   label: 'Edge Highlight',      min: 0, max: 0.5,  step: 0.005 },
  { key: 'brightness',      label: 'Brightness',          min: -0.5, max: 0.5, step: 0.01 },
  { key: 'saturation',      label: 'Saturation',          min: -1, max: 1,   step: 0.01  },
  { key: 'shadowOpacity',   label: 'Shadow Opacity',      min: 0, max: 1,    step: 0.01  },
];

const PRESETS: { name: string; values: Partial<GlassConfig> }[] = [
  {
    name: 'Apple Default',
    values: { refraction: 0.03, bevelDepth: 0.08, bevelWidth: 0.18, frost: 0, chromAberration: 0.05, fresnel: 0.6, edgeHighlight: 0.06, cornerRadius: 40, specular: true },
  },
  {
    name: 'Crystal',
    values: { refraction: 0.03, bevelDepth: 0, bevelWidth: 0.273, frost: 0, chromAberration: 0, fresnel: 0.3, edgeHighlight: 0.02, cornerRadius: 30, specular: false },
  },
  {
    name: 'Frosted',
    values: { refraction: 0, bevelDepth: 0.052, bevelWidth: 0.211, frost: 2, chromAberration: 0.02, fresnel: 0.4, edgeHighlight: 0.04, cornerRadius: 50, specular: true },
  },
  {
    name: 'Heavy Bevel',
    values: { refraction: 0.073, bevelDepth: 0.2, bevelWidth: 0.156, frost: 0, chromAberration: 0.1, fresnel: 0.8, edgeHighlight: 0.1, cornerRadius: 60, specular: false },
  },
  {
    name: 'Water Drop',
    values: { refraction: 0.1, bevelDepth: 0.3, bevelWidth: 0.35, frost: 0, chromAberration: 0.15, fresnel: 1.0, edgeHighlight: 0.08, cornerRadius: 120, specular: true },
  },
];

export function GlassControls({ config, onChange, readonly = false, inline = false, visibleKeys, title }: Props) {
  const set = (key: keyof GlassConfig, value: number | boolean) => {
    if (!readonly && onChange) onChange({ ...config, [key]: value });
  };

  const activeSliders = visibleKeys ? SLIDERS.filter(s => visibleKeys.includes(s.key)) : SLIDERS;
  const showSpecular = !visibleKeys || visibleKeys.includes('specular' as keyof GlassConfig);

  return (
    <div className={`glass-controls ${readonly ? 'locked' : ''} ${inline ? 'inline' : ''}`}>
      <h3 className="controls-title">{title || (readonly ? 'Fixed Equivalent Parameters' : 'Tunable Parameters')}</h3>

      {/* Presets */}
      {!readonly && (
        <div className="presets-row">
          {PRESETS.map(p => (
            <button
              key={p.name}
              className="preset-btn"
              onClick={() => onChange && onChange({ ...DEFAULT_CONFIG, ...p.values })}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Sliders */}
      <div className="sliders-grid">
        {activeSliders.map(s => (
          <div key={s.key} className="slider-row">
            <label className="slider-label">
              <span>{s.label}</span>
              <span className="slider-value">{(config[s.key] as number).toFixed(s.step < 0.01 ? 3 : s.step < 1 ? 2 : 0)}</span>
            </label>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={config[s.key] as number}
              onChange={e => set(s.key, parseFloat(e.target.value))}
              className="slider-input"
              disabled={readonly}
            />
          </div>
        ))}

        {/* Specular toggle */}
        {showSpecular && (
          <div className="slider-row">
            <label className="slider-label">
              <span>Specular Highlights</span>
              <span className="slider-value">{config.specular ? 'ON' : 'OFF'}</span>
            </label>
            <button
              className={`toggle-btn ${config.specular ? 'active' : ''}`}
              onClick={() => set('specular', !config.specular)}
              disabled={readonly}
            >
              {config.specular ? '● Enabled' : '○ Disabled'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
