import { useEffect, useState } from 'react';
import { type MotionPermissionState, probeMotionPermission, requestMotionPermission } from '../engine/motion';
import { useMediaQuery } from './useGlassEnvironment';

/**
 * Opt-in for tilt-driven highlights. Renders only where the browser will not
 * send device-orientation events without a permission prompt (iOS Safari);
 * everywhere else tilt already works and there is nothing to ask. Hidden when
 * the user prefers reduced motion, since tilt is ignored then.
 */
export function MotionPermissionButton({ className = '' }: { className?: string }) {
  // Assume nothing is needed until the probe says otherwise, so the button never flashes
  const [state, setState] = useState<MotionPermissionState>('granted');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    let cancelled = false;
    void probeMotionPermission().then(result => {
      if (!cancelled) setState(result);
    });
    return () => { cancelled = true; };
  }, []);

  if (state === 'granted' || reduceMotion) return null;

  const ask = async () => {
    setState((await requestMotionPermission()) ? 'granted' : 'denied');
  };

  return (
    <button
      type="button"
      className={`motion-permission-btn ${className}`}
      onClick={ask}
      disabled={state === 'denied'}
    >
      {state === 'denied'
        ? 'Motion access was declined in this browser'
        : 'Enable motion highlights: tilt to move the light'}
    </button>
  );
}
