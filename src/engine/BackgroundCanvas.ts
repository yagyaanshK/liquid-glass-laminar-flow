/**
 * BackgroundCanvas — Renders the animated background scene to a 2D canvas.
 * This canvas is used as the live texture source for the glass refraction shader.
 * No html2canvas, no snapshots — redrawn every frame.
 */

export class BackgroundCanvas {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animFrameId = 0;
  private _destroyed = false;
  private bgImage: HTMLImageElement | null = null;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: fixed; inset: 0;
      width: 100%; height: 100%;
      z-index: -2;
      pointer-events: none;
    `;
    this.canvas.setAttribute('data-liquid-glass-ignore', '');
    container.prepend(this.canvas);

    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this._resize();
    window.addEventListener('resize', this._resize, { passive: true });

    // Load the background photo — use Vite's BASE_URL so the path
    // resolves correctly on GitHub Pages (e.g. /liquid-glass-laminar-flow/bg.jpg)
    const img = new Image();
    const isLandscape = window.innerWidth > window.innerHeight;
    const bgName = isLandscape ? 'bg-landscape.jpg' : 'bg.jpg';
    img.src = `${import.meta.env.BASE_URL}${bgName}`;
    img.onload = () => { this.bgImage = img; };
    img.onerror = () => { console.warn(`BackgroundCanvas: failed to load ${bgName}`); };
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
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

    // ── Background photo ──
    if (this.bgImage) {
      // Cover-fit the image
      const imgR = this.bgImage.width / this.bgImage.height;
      const canR = w / h;
      let sw = this.bgImage.width, sh = this.bgImage.height, sx = 0, sy = 0;
      if (imgR > canR) {
        sw = sh * canR;
        sx = (this.bgImage.width - sw) / 2;
      } else {
        sh = sw / canR;
        sy = (this.bgImage.height - sh) / 2;
      }
      ctx.drawImage(this.bgImage, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#f5f0eb';
      ctx.fillRect(0, 0, w, h);
    }
  }
}
