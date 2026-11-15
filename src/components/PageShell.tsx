import { Link } from 'react-router-dom';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatedBackground } from './AnimatedBackground';

interface Props {
  title: string;
  badge: string;
  badgeColor: string;
  children: ReactNode;
}

// Progressive blur: full strength against the bar, fading to nothing below it
const EDGE_MASK = 'linear-gradient(to bottom, #000 0%, rgba(0, 0, 0, 0.6) 45%, transparent 100%)';

/** True once the page has scrolled past `threshold` px */
function useScrolled(threshold = 6) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [threshold]);
  return scrolled;
}

/** Shared layout for all approach pages */
export function PageShell({ title, badge, badgeColor, children }: Props) {
  const scrolled = useScrolled();
  const navRef = useRef<HTMLElement>(null);
  const [barHeight, setBarHeight] = useState(57);

  // The scroll edge hangs directly under the bar, whatever height the bar has
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => setBarHeight(nav.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`page-shell ${scrolled ? 'is-scrolled' : ''}`}>
      {/* The bar and its edge sit above the glass, so they are kept out of DOM snapshots */}
      <nav ref={navRef} className="page-topbar" data-liquid-glass-ignore="" style={{
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--topbar-border, rgba(255, 255, 255, 0.1))',
      }}>
        <Link to="/" className="back-btn">← Home</Link>
        <span className="page-topbar-title">{title}</span>
        <span className="page-topbar-badge" style={{ background: `${badgeColor}18`, color: badgeColor }}>{badge}</span>
      </nav>

      {/* Scroll edge effect: once content scrolls under the bar, the hard
          divider gives way to a band where that content blurs and dims as it
          approaches the bar. A sibling of the bar, not a child: a nested
          backdrop-filter could only see the bar, not the page behind it. */}
      <div
        className="scroll-edge"
        aria-hidden="true"
        data-liquid-glass-ignore=""
        style={{
          top: barHeight,
          backdropFilter: 'blur(9px)',
          WebkitBackdropFilter: 'blur(9px)',
          maskImage: EDGE_MASK,
          WebkitMaskImage: EDGE_MASK,
        } as CSSProperties}
      />

      <div className="page-content">
        {children}
      </div>
    </div>
  );
}

/** Shared colorful background for demo pages */
export function DemoBackground() {
  return <AnimatedBackground className="demo-bg" />;
}
