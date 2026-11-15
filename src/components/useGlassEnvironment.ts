import { useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export interface GlassEnvironment {
  /** No elastic motion, no drifting lenses, no tilt-driven light. */
  reduceMotion: boolean;
  /** Frostier, more opaque glass that hides what is behind it. */
  reduceTransparency: boolean;
  /** Near-solid glass with a defined outline. */
  moreContrast: boolean;
}

/** The user's accessibility preferences that change how glass should render. */
export function useGlassEnvironment(): GlassEnvironment {
  return {
    reduceMotion: useMediaQuery('(prefers-reduced-motion: reduce)'),
    reduceTransparency: useMediaQuery('(prefers-reduced-transparency: reduce)'),
    moreContrast: useMediaQuery('(prefers-contrast: more)'),
  };
}

// ── Device tilt ──────────────────────────────────────────────────────────────
// One shared listener. The value is quantized to coarse steps because each
// distinct light angle needs its own generated displacement map.

const TILT_STEP = 15;
const TILT_LIMIT = 30;
let tiltValue = 0;
const tiltSubscribers = new Set<() => void>();

function onDeviceOrientation(event: DeviceOrientationEvent) {
  if (event.gamma == null) return;
  const limited = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, event.gamma));
  const next = Math.round(limited / TILT_STEP) * TILT_STEP;
  if (next === tiltValue) return;
  tiltValue = next;
  tiltSubscribers.forEach(notify => notify());
}

function subscribeTilt(onChange: () => void) {
  if (tiltSubscribers.size === 0) {
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
  }
  tiltSubscribers.add(onChange);
  return () => {
    tiltSubscribers.delete(onChange);
    if (tiltSubscribers.size === 0) {
      window.removeEventListener('deviceorientation', onDeviceOrientation);
    }
  };
}

/** Left/right device tilt in degrees, in 15° steps within ±30°. Zero when disabled or unavailable. */
export function useDeviceTilt(enabled: boolean): number {
  const tilt = useSyncExternalStore(subscribeTilt, () => tiltValue, () => 0);
  return enabled ? tilt : 0;
}
