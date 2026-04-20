import { Link } from 'react-router-dom';

const APPROACHES = [
  {
    path: '/webgl',
    title: 'WebGL Shader',
    desc: 'Custom GLSL fragment shader with SDF edge detection, per-pixel UV displacement, chromatic aberration, and animated specular highlights.',
    tech: 'WebGL 1 • GLSL • Canvas 2D',
    color: '#ff6b4a',
  },
  {
    path: '/css-svg',
    title: 'CSS + SVG Filters',
    desc: 'Pure CSS backdrop-filter with SVG feDisplacementMap for refraction, feSpecularLighting for highlights, and layered box-shadows for bevel.',
    tech: 'CSS • SVG Filters • No JavaScript',
    color: '#3ecf8e',
  },
  {
    path: '/html2canvas',
    title: 'html2canvas Snapshot',
    desc: 'DOM snapshot via html2canvas uploaded as a WebGL texture. The shader refracts the captured page content through each glass element.',
    tech: 'html2canvas • WebGL • GLSL',
    color: '#e8a838',
  },
];

export default function Home() {
  return (
    <div className="home">
      {/* Photo background */}
      <div className="photo-bg" />

      {/* Content */}
      <header className="home-header" style={{
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <h1 className="home-title">Liquid Glass</h1>
        <p className="home-subtitle">
          A comparison of web-based approaches to Apple's Liquid Glass refraction effect.
          <br />
          Each page implements the same glass aesthetic using a different rendering technique.
        </p>
      </header>

      <section className="home-grid">
        {APPROACHES.map(a => (
          <Link key={a.path} to={a.path} className="home-card" style={{
            '--card-accent': a.color,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          } as React.CSSProperties}>
            <div className="card-number">{APPROACHES.indexOf(a) + 1}</div>
            <h2 className="card-title">{a.title}</h2>
            <p className="card-desc">{a.desc}</p>
            <span className="card-tech">{a.tech}</span>
            <span className="card-arrow">→</span>
          </Link>
        ))}
      </section>

      <footer className="home-footer">
        <p>
          Reference implementations:{' '}
          <a href="https://github.com/naughtyduk/liquidGL" target="_blank" rel="noopener">liquidGL</a>{' · '}
          <a href="https://github.com/ybouane/liquidglass" target="_blank" rel="noopener">@ybouane/liquidglass</a>{' · '}
          <a href="https://github.com/iyinchao/liquid-glass-studio" target="_blank" rel="noopener">liquid-glass-studio</a>{' · '}
          <a href="https://kube.io/blog/liquid-glass-css-svg/" target="_blank" rel="noopener">kube.io</a>
        </p>
      </footer>
    </div>
  );
}
