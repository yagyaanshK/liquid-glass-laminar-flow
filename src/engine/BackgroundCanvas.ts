/**
 * BackgroundCanvas renders the animated abstract scene used as the live texture
 * source for the WebGL refraction shader.
 */

const COLORS = {
  base: [13, 17, 22],
  mid: [138, 174, 190],
  dark: [22, 27, 32],
  grid: [237, 246, 242],
  violet: [160, 120, 220],
  coral: [255, 107, 74],
  mint: [62, 207, 142],
  gold: [232, 168, 56],
  blue: [92, 134, 255],
} as const;

function rgba(color: readonly number[], alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

export class BackgroundCanvas {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private animFrameId = 0;
  private _destroyed = false;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.staticCanvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: fixed; inset: 0;
      width: 100%; height: 100%;
      z-index: -2;
      pointer-events: none;
    `;
    this.canvas.setAttribute('data-liquid-glass-ignore', '');
    container.prepend(this.canvas);

    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.staticCtx = this.staticCanvas.getContext('2d', { alpha: false })!;
    this._resize();
    window.addEventListener('resize', this._resize, { passive: true });
  }

  start() {
    this._loop();
  }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this._resize);
    this.canvas.remove();
  }

  private _resize = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.staticCanvas.width = this.canvas.width;
    this.staticCanvas.height = this.canvas.height;
    this._drawStaticLayer();
  };

  private _loop = () => {
    if (this._destroyed) return;
    this._draw();
    this.animFrameId = requestAnimationFrame(this._loop);
  };

  private _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = performance.now() / 1000;

    ctx.drawImage(this.staticCanvas, 0, 0);
    this._drawFlowField(ctx, w, h, now);
    this._drawGrid(ctx, w, h, now);
    this._drawLines(ctx, w, h, now);
    this._drawRings(ctx, w, h, now);
    this._drawDots(ctx, w, h, now);
  }

  private _drawStaticLayer() {
    const ctx = this.staticCtx;
    const w = this.staticCanvas.width;
    const h = this.staticCanvas.height;

    ctx.fillStyle = rgba(COLORS.base, 1);
    ctx.fillRect(0, 0, w, h);
    this._drawAmbient(ctx, w, h);
  }

  private _drawAmbient(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const accents = [
      { x: 0.18, y: 0.12, r: 0.36, color: COLORS.mint, alpha: 0.08 },
      { x: 0.78, y: 0.24, r: 0.38, color: COLORS.blue, alpha: 0.08 },
      { x: 0.54, y: 0.86, r: 0.42, color: COLORS.coral, alpha: 0.06 },
    ];

    for (const accent of accents) {
      const radius = Math.max(w, h) * accent.r;
      const gradient = ctx.createRadialGradient(w * accent.x, h * accent.y, 0, w * accent.x, h * accent.y, radius);
      gradient.addColorStop(0, rgba(accent.color, accent.alpha));
      gradient.addColorStop(1, rgba(accent.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private _drawFlowField(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const rows = [
      { y: 0.11, amp: 0.06, phase: 0, color: COLORS.mid, alpha: 0.13 },
      { y: 0.22, amp: 0.08, phase: 1.2, color: COLORS.mid, alpha: 0.12 },
      { y: 0.37, amp: 0.07, phase: 2.4, color: COLORS.violet, alpha: 0.10 },
      { y: 0.53, amp: 0.08, phase: 3.6, color: COLORS.mid, alpha: 0.12 },
      { y: 0.71, amp: 0.08, phase: 4.8, color: COLORS.violet, alpha: 0.09 },
      { y: 0.86, amp: 0.06, phase: 6.0, color: COLORS.mid, alpha: 0.12 },
    ];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0012);

    for (const row of rows) {
      const drift = Math.sin(now * 0.16 + row.phase) * w * 0.018;
      const y = h * row.y;
      const amp = h * row.amp;

      ctx.strokeStyle = rgba(row.color, row.alpha);
      ctx.setLineDash([18, 34]);
      ctx.lineDashOffset = -now * 14;
      ctx.beginPath();
      ctx.moveTo(-w * 0.12 + drift, y);
      ctx.bezierCurveTo(w * 0.12, y - amp, w * 0.30, y + amp, w * 0.44, y);
      ctx.bezierCurveTo(w * 0.60, y - amp, w * 0.76, y + amp, w * 0.92, y);
      ctx.bezierCurveTo(w * 1.08, y - amp * 0.7, w * 1.16, y + amp * 0.5, w * 1.24, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const spacing = 56 * dpr;
    const offset = (now * 7) % spacing;
    ctx.fillStyle = rgba(COLORS.grid, 0.13);

    for (let y = -spacing + offset; y < h + spacing; y += spacing) {
      for (let x = -spacing + offset; x < w + spacing; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private _drawLines(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const lines = [
      { color: COLORS.coral, y: 0.26, amp: 0.11, phase: 0, alpha: 0.62, dash: [12, 28] },
      { color: COLORS.mint, y: 0.58, amp: 0.12, phase: 1.7, alpha: 0.58, dash: [12, 28] },
      { color: COLORS.gold, y: 0.38, amp: 0.18, phase: 3.4, alpha: 0.48, dash: [4, 22] },
      { color: COLORS.blue, y: 0.70, amp: 0.14, phase: 5.1, alpha: 0.45, dash: [8, 24] },
    ];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.002);

    for (const line of lines) {
      const drift = Math.sin(now * 0.25 + line.phase) * w * 0.025;
      const y = h * line.y;
      const amp = h * line.amp;

      ctx.strokeStyle = rgba(line.color, line.alpha);
      ctx.setLineDash(line.dash.map(v => v * dpr));
      ctx.lineDashOffset = -now * 42;
      ctx.beginPath();
      ctx.moveTo(-w * 0.1 + drift, y);
      ctx.bezierCurveTo(w * 0.16, y - amp, w * 0.30, y + amp, w * 0.45, y);
      ctx.bezierCurveTo(w * 0.62, y - amp, w * 0.75, y + amp, w * 0.92, y);
      ctx.bezierCurveTo(w * 1.05, y - amp * 0.7, w * 1.14, y + amp * 0.5, w * 1.22, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private _drawRings(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const rings = [
      { x: 0.23, y: 0.70, r: 0.07, color: COLORS.coral, phase: 0 },
      { x: 0.77, y: 0.72, r: 0.10, color: COLORS.mint, phase: 2.2 },
      { x: 0.64, y: 0.22, r: 0.06, color: COLORS.gold, phase: 4.4 },
    ];

    ctx.save();
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.002);

    for (const ring of rings) {
      const pulse = 0.92 + Math.sin(now * 0.8 + ring.phase) * 0.12;
      const x = w * ring.x + Math.sin(now * 0.18 + ring.phase) * w * 0.025;
      const y = h * ring.y + Math.cos(now * 0.16 + ring.phase) * h * 0.025;
      const r = Math.min(w, h) * ring.r * pulse;

      ctx.strokeStyle = rgba(ring.color, 0.56);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private _drawDots(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const dots = [
      [0.10, 0.36, 0], [0.18, 0.47, 1], [0.27, 0.34, 2], [0.38, 0.45, 3],
      [0.48, 0.33, 0], [0.57, 0.46, 1], [0.68, 0.35, 2], [0.78, 0.47, 3],
      [0.88, 0.34, 0], [0.15, 0.76, 1], [0.33, 0.79, 2], [0.51, 0.72, 3],
      [0.69, 0.81, 0], [0.86, 0.75, 1], [0.81, 0.14, 2], [0.43, 0.17, 3],
      [0.22, 0.17, 0],
    ];
    const palette = [COLORS.coral, COLORS.mint, COLORS.gold, COLORS.blue];

    for (let i = 0; i < dots.length; i++) {
      const [px, py, colorIndex] = dots[i];
      const phase = i * 0.77;
      const x = w * px + Math.sin(now * 0.65 + phase) * w * 0.012;
      const y = h * py + Math.cos(now * 0.60 + phase) * h * 0.014;
      const radius = Math.max(3, Math.min(w, h) * (i % 3 === 0 ? 0.005 : 0.0036));

      ctx.fillStyle = rgba(palette[colorIndex], 0.74);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
