const mapCache = new Map<string, string>();

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function roundedRectDistance(px: number, py: number, halfW: number, halfH: number, radius: number) {
  const qx = Math.abs(px) - halfW + radius;
  const qy = Math.abs(py) - halfH + radius;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

export interface DisplacementMapOptions {
  width: number;
  height: number;
  radius: number;
  bevelWidth?: number;
}

export function createRoundedGlassDisplacementMap({
  width,
  height,
  radius,
  bevelWidth = 0.32,
}: DisplacementMapOptions) {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  const key = `${w}x${h}:${r}:${bevelWidth}`;
  const cached = mapCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const image = ctx.createImageData(w, h);
  const halfW = w / 2;
  const halfH = h / 2;
  const bevelPx = Math.max(8, Math.min(w, h) * bevelWidth);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - halfW;
      const py = y + 0.5 - halfH;
      const distance = roundedRectDistance(px, py, halfW, halfH, r);
      const inside = distance <= 0;
      const edge = inside ? 1 - smoothstep(0, bevelPx, -distance) : 0;
      const len = Math.max(0.001, Math.hypot(px, py));
      const centerFade = smoothstep(0.08, 0.64, len / Math.max(halfW, halfH));
      const force = edge * centerFade;
      const dx = (px / len) * force;
      const dy = (py / len) * force;
      const i = (y * w + x) * 4;

      image.data[i] = Math.round(128 + dx * 127);
      image.data[i + 1] = Math.round(128 + dy * 127);
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL('image/png');
  mapCache.set(key, url);
  return url;
}
