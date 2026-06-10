import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AnimatedBackground } from '../components/AnimatedBackground';

const APPROACHES = [
  {
    path: '/webgl',
    title: 'WebGL Shader',
    desc: 'Custom GLSL fragment shader with SDF edge refraction, optional gravity-lens field distortion, chromatic aberration, and animated specular highlights.',
    tech: 'WebGL 1 / GLSL / Canvas 2D',
    best: 'Best for high-fidelity scenes',
    color: '#ff6b4a',
  },
  {
    path: '/css-svg',
    title: 'CSS + SVG Filters',
    desc: 'Pure CSS backdrop-filter with SVG feDisplacementMap for refraction, feSpecularLighting for highlights, and layered box-shadows for bevel.',
    tech: 'CSS / SVG Filters / No JavaScript',
    best: 'Best for lightweight experiments',
    color: '#3ecf8e',
  },
  {
    path: '/html2canvas',
    title: 'html2canvas Snapshot',
    desc: 'DOM snapshot via html2canvas uploaded as a WebGL texture. The shader refracts the captured page content through each glass element.',
    tech: 'html2canvas / WebGL / GLSL',
    best: 'Best for DOM-heavy prototypes',
    color: '#e8a838',
  },
  {
    path: '/svg-map',
    title: 'Interactive SVG Map',
    desc: 'Aave-style component-scoped glass using cached displacement maps, stable foreground controls, and real buttons, pills, sliders, and media controls.',
    tech: 'SVG Filters / Cached PNG Map / DOM',
    best: 'Best for production UI controls',
    color: '#b9d7ff',
  },
];

export default function Home() {
  return (
    <div className="home">
      <AnimatedBackground />

      <header className="home-header" style={{
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <span className="home-kicker">Interactive implementation lab</span>
        <h1 className="home-title">Liquid Glass</h1>
        <p className="home-subtitle">
          Compare four browser-native ways to build refractive interface glass, from full shader pipelines to
          lightweight component-scoped SVG filters.
        </p>
        <div className="home-actions" aria-label="Primary demos">
          <Link to="/svg-map" className="home-primary-link">Open interactive UI</Link>
          <Link to="/webgl" className="home-secondary-link">View shader route</Link>
        </div>
      </header>

      <section className="home-grid" aria-label="Implementation approaches">
        {APPROACHES.map((approach, index) => (
          <Link key={approach.path} to={approach.path} className="home-card" style={{
            '--card-accent': approach.color,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          } as CSSProperties}>
            <div className="card-number">{index + 1}</div>
            <h2 className="card-title">{approach.title}</h2>
            <p className="card-desc">{approach.desc}</p>
            <span className="card-best">{approach.best}</span>
            <span className="card-tech">{approach.tech}</span>
            <span className="card-arrow">Open</span>
          </Link>
        ))}
      </section>

      <footer className="home-footer">
        <p>
          Reference implementations:{' '}
          <a href="https://github.com/naughtyduk/liquidGL" target="_blank" rel="noopener noreferrer">liquidGL</a>{' / '}
          <a href="https://github.com/ybouane/liquidglass" target="_blank" rel="noopener noreferrer">@ybouane/liquidglass</a>{' / '}
          <a href="https://github.com/iyinchao/liquid-glass-studio" target="_blank" rel="noopener noreferrer">liquid-glass-studio</a>{' / '}
          <a href="https://kube.io/blog/liquid-glass-css-svg/" target="_blank" rel="noopener noreferrer">kube.io</a>{' / '}
          <a href="https://aave.com/design/building-glass-for-the-web" target="_blank" rel="noopener noreferrer">Aave Design</a>
        </p>
      </footer>
    </div>
  );
}
