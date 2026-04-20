import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  badge: string;
  badgeColor: string;
  children: ReactNode;
}

/** Shared layout for all approach pages */
export function PageShell({ title, badge, badgeColor, children }: Props) {
  return (
    <div className="page-shell">
      <nav className="page-topbar" style={{
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <Link to="/" className="back-btn">← Home</Link>
        <span className="page-topbar-title">{title}</span>
        <span className="page-topbar-badge" style={{ background: `${badgeColor}18`, color: badgeColor }}>{badge}</span>
      </nav>
      <div className="page-content">
        {children}
      </div>
    </div>
  );
}

/** Shared colorful background for demo pages */
export function DemoBackground() {
  return <div className="demo-bg" />;
}
