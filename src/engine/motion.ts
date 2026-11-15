/**
 * Device-orientation permission.
 *
 * Tilt drives the direction of the rim light. Most browsers deliver
 * `deviceorientation` events without asking. iOS Safari delivers none until the
 * page has called `DeviceOrientationEvent.requestPermission()` from a user
 * gesture and the person has allowed it. Listeners that were added earlier
 * start receiving events as soon as permission is granted.
 *
 * The method's existence is not enough to tell the two apart: Chrome also
 * exposes it and resolves `granted` straight away. So the state is probed by
 * calling it once without a gesture. Where a prompt is required that call is
 * rejected, which is the signal to show an opt-in button.
 */

type OrientationPermission = 'granted' | 'denied' | 'default';

interface PermissionGatedOrientation {
  requestPermission?: () => Promise<OrientationPermission>;
}

export type MotionPermissionState =
  /** Tilt events flow (or will, if the device has sensors); nothing to ask. */
  | 'granted'
  /** A prompt is needed, and it has to come from a tap. */
  | 'prompt'
  /** The person declined; the browser will not prompt again for now. */
  | 'denied';

function orientationApi(): PermissionGatedOrientation | null {
  if (typeof DeviceOrientationEvent === 'undefined') return null;
  return DeviceOrientationEvent as unknown as PermissionGatedOrientation;
}

/** Find out, without prompting, whether tilt needs a permission prompt. */
export async function probeMotionPermission(): Promise<MotionPermissionState> {
  const api = orientationApi();
  if (!api || typeof api.requestPermission !== 'function') return 'granted';
  try {
    const result = await api.requestPermission();
    return result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt';
  } catch {
    // Rejected because there was no user gesture: this browser wants a tap first
    return 'prompt';
  }
}

/** Ask for tilt access. Must be called from a user gesture (a click or tap handler). */
export async function requestMotionPermission(): Promise<boolean> {
  const api = orientationApi();
  if (!api || typeof api.requestPermission !== 'function') return true;
  try {
    return (await api.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
