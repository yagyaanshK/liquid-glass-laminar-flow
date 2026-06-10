import { type GlassConfig, DEFAULT_CONFIG } from '../engine/LiquidGlassEngine';

type NumericGlassConfigKey = {
  [K in keyof GlassConfig]-?: NonNullable<GlassConfig[K]> extends number ? K : never;
}[keyof GlassConfig];

interface Props {
  config: GlassConfig;
  onChange?: (config: GlassConfig) => void;
  readonly?: boolean;
  inline?: boolean;
  visibleKeys?: (keyof GlassConfig)[];
  title?: string;
}

const SLIDERS: { key: NumericGlassConfigKey; label: string; min: number; max: number; step: number }[] = [
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
  { key: 'gravityStrength', label: 'Gravity Strength',    min: 0, max: 0.18, step: 0.001 },
  { key: 'gravityFalloff',  label: 'Gravity Falloff',     min: 1, max: 12,   step: 0.1   },
  { key: 'gravitySoftness', label: 'Gravity Softness',    min: 0.01, max: 0.16, step: 0.001 },
];

const SDF_SLIDER_KEYS: NumericGlassConfigKey[] = [
  'refraction',
  'bevelDepth',
  'bevelWidth',
  'frost',
  'cornerRadius',
  'chromAberration',
  'fresnel',
  'edgeHighlight',
  'brightness',
  'saturation',
];

const GRAVITY_SLIDER_KEYS: NumericGlassConfigKey[] = [
  'gravityStrength',
  'gravityFalloff',
  'gravitySoftness',
  'chromAberration',
  'fresnel',
  'edgeHighlight',
  'frost',
  'cornerRadius',
  'brightness',
  'saturation',
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
  {
    name: 'Gravity Lens',
    values: { lensField: 'gravity', gravityStrength: 0.105, gravityFalloff: 4.2, gravitySoftness: 0.045, frost: 0, chromAberration: 0.16, fresnel: 1.1, edgeHighlight: 0.1, cornerRadius: 96, specular: true },
  },
];

export function GlassControls({ config, onChange, readonly = false, inline = false, visibleKeys, title }: Props) {
  const set = <K extends keyof GlassConfig>(key: K, value: GlassConfig[K]) => {
    if (!readonly && onChange) onChange({ ...config, [key]: value });
  };

  const sliderKeys = config.lensField === 'gravity' ? GRAVITY_SLIDER_KEYS : SDF_SLIDER_KEYS;
  const activeSliders = visibleKeys ? SLIDERS.filter(s => visibleKeys.includes(s.key)) : SLIDERS.filter(s => sliderKeys.includes(s.key));
  const showFieldMode = !visibleKeys || visibleKeys.includes('lensField');
  const showSpecular = !visibleKeys || visibleKeys.includes('specular');

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

      {showFieldMode && !readonly && (
        <div className="field-mode-row" aria-label="Lens field mode">
          <button
            type="button"
            className={`field-mode-btn ${config.lensField === 'sdf' ? 'active' : ''}`}
            aria-pressed={config.lensField === 'sdf'}
            onClick={() => set('lensField', 'sdf')}
          >
            SDF Glass
          </button>
          <button
            type="button"
            className={`field-mode-btn ${config.lensField === 'gravity' ? 'active' : ''}`}
            aria-pressed={config.lensField === 'gravity'}
            onClick={() => set('lensField', 'gravity')}
          >
            Gravity Lens
          </button>
          <small className="field-mode-note">
            {config.lensField === 'gravity'
              ? 'Uses a theta^2/r radial field inspired by black-hole lensing.'
              : 'Uses SDF edge normals for conventional liquid glass.'}
          </small>
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
