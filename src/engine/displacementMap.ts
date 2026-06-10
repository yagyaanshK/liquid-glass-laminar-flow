const mapCache = new Map<string, string>();
const aaveMapCache = new Map<string, string>();

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

export interface AaveLensMapOptions {
  lensWidth: number;
  lensHeight: number;
  borderRadius: number;
  mapSize?: number;
  depth?: number;
  domeDepth?: number;
  splayAmount?: number;
  edgeFalloff?: boolean;
  specularRotation?: number;
  glowStrength?: number;
  glowSpread?: number;
  glowExponent?: number;
  edgeStrength?: number;
  edgeWidth?: number;
  edgeExponent?: number;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function erfApprox(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

function domeGradient(position: number, radius: number, scale: number) {
  const safeRadius = Math.max(1, radius);
  const limited = Math.min(Math.abs(position), safeRadius * 0.995);
  const denom = Math.sqrt(Math.max(0.001, safeRadius * safeRadius - limited * limited));
  return Math.sign(position) * (limited / denom) * scale;
}

function computeDomeScale(domeDepth: number, halfW: number, halfH: number) {
  const depth = Math.max(0, domeDepth);
  const rx = Math.max(halfW, depth);
  const ry = Math.max(halfH, depth);
  return {
    rx,
    ry,
    scaleX: depth / Math.max(halfW, 1),
    scaleY: depth / Math.max(halfH, 1),
  };
}

export function createAaveLensDisplacementMap({
  lensWidth,
  lensHeight,
  borderRadius,
  mapSize = 512,
  depth = 32,
  domeDepth = 0,
  splayAmount = 1,
  edgeFalloff = true,
  specularRotation = 45,
  glowStrength = 0.12,
  glowSpread = 1,
  glowExponent = 0.5,
  edgeStrength = 0.28,
  edgeWidth = 3,
  edgeExponent = 1.5,
}: AaveLensMapOptions) {
  const size = Math.max(32, Math.min(1024, Math.round(mapSize)));
  const halfW = Math.max(1, lensWidth / 2);
  const halfH = Math.max(1, lensHeight / 2);
  const radius = Math.max(0, Math.min(borderRadius, halfW, halfH));
  const key = [
    Math.round(lensWidth),
    Math.round(lensHeight),
    Math.round(radius),
    size,
    depth,
    domeDepth,
    splayAmount,
    edgeFalloff,
    specularRotation,
    glowStrength,
    glowSpread,
    glowExponent,
    edgeStrength,
    edgeWidth,
    edgeExponent,
  ].join('|');
  const cached = aaveMapCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const image = ctx.createImageData(size, size);
  const data = image.data;
  const safeDepth = Math.max(0.001, depth);
  const innerHalfW = Math.max(0, halfW - safeDepth);
  const innerHalfH = Math.max(0, halfH - safeDepth);
  const innerRadius = Math.max(0, Math.min(radius, innerHalfW, innerHalfH));
  const dome = domeDepth > 0 ? computeDomeScale(domeDepth, halfW, halfH) : null;
  const angle = (specularRotation * Math.PI) / 180;
  const lightX = Math.cos(angle);
  const lightY = Math.sin(angle);
  const glowStart = (1 - glowSpread) * Math.SQRT2;
  const glowRange = Math.max(0.001, glowSpread * Math.SQRT2);
  const edgeInv = edgeWidth > 0 ? 1 / edgeWidth : 0;
  const halfMinInv = 1 / Math.max(1, Math.min(halfW, halfH));

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = ((px + 0.5) / size) * lensWidth - halfW;
      const y = ((py + 0.5) / size) * lensHeight - halfH;
      const distance = roundedRectDistance(x, y, halfW, halfH, radius);
      const index = (py * size + px) * 4;

      if (distance > 0) {
        data[index] = 128;
        data[index + 1] = 128;
        data[index + 2] = 128;
        data[index + 3] = 0;
        continue;
      }

      let normalX = dome ? domeGradient(x, dome.rx, dome.scaleX) : clamp(x / halfW, -1, 1);
      let normalY = dome ? domeGradient(y, dome.ry, dome.scaleY) : clamp(y / halfH, -1, 1);

      if (splayAmount < 1) {
        const splay = 1 - splayAmount;
        const horizontalEdge = Math.max(0, 1 - (halfW - Math.abs(x)) * halfMinInv) * splay;
        const verticalEdge = Math.max(0, 1 - (halfH - Math.abs(y)) * halfMinInv) * splay;
        const originalX = normalX;
        const originalY = normalY;
        normalX *= 1 - verticalEdge;
        normalY *= 1 - horizontalEdge;
        const originalLength = Math.hypot(originalX, originalY);
        const newLength = Math.hypot(normalX, normalY);
        if (newLength > 0.001) {
          const restore = originalLength / newLength;
          normalX *= restore;
          normalY *= restore;
        }
      }

      let falloff = 1;
      if (edgeFalloff) {
        const innerDistance = roundedRectDistance(x, y, innerHalfW, innerHalfH, innerRadius);
        falloff = 0.5 * (1 + erfApprox(innerDistance / (safeDepth * Math.SQRT2)));
      }

      const channelX = Math.round((0.5 - 0.5 * normalX * falloff) * 255);
      const channelY = Math.round((0.5 - 0.5 * normalY * falloff) * 255);
      data[index] = clamp(channelX, 0, 255);
      data[index + 1] = clamp(channelY, 0, 255);

      const light = Math.abs(clamp(x / halfW, -1, 1) * lightX + clamp(y / halfH, -1, 1) * lightY);
      let specular = 0;
      if (glowStrength > 0) {
        specular += glowStrength * Math.pow(clamp((light - glowStart) / glowRange), glowExponent) * falloff;
      }
      if (edgeStrength > 0 && edgeInv > 0) {
        const edgeMask = clamp(1 + distance * edgeInv);
        specular += edgeStrength * edgeMask * Math.pow(light, edgeExponent);
      }
      data[index + 2] = Math.round(128 + clamp(specular) * 127);
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL('image/png');
  aaveMapCache.set(key, url);
  return url;
}
