import { type CSSProperties, type ReactNode, type Ref, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { supportsHtmlInCanvas } from '../engine/LiquidGlassEngine';

/** What to hand to `engine.addBackdrop(handle.element, { liveContent: handle.liveContent })` */
export interface GlassBackdropHandle {
  element: HTMLElement;
  /** Set in live mode: the element the browser paints into the canvas. */
  liveContent?: HTMLElement;
}

interface GlassBackdropProps {
  children: ReactNode;
  /** Styles the content itself (background, padding, radius…). */
  className?: string;
  style?: CSSProperties;
  /** Sizes the block in the page layout. */
  wrapperClassName?: string;
  /**
   * 'auto' uses the HTML-in-canvas API when the browser has it (the content is
   * live behind the glass) and falls back to an html2canvas snapshot.
   * 'snapshot' always uses the fallback.
   */
  mode?: 'auto' | 'snapshot';
  ref?: Ref<GlassBackdropHandle>;
}

// `drawable` marks a canvas child as paintable by the HTML-in-canvas API
const DRAWABLE = { drawable: '' } as Record<string, string>;

/**
 * A block of DOM content that liquid glass can refract.
 *
 * Fallback: an ordinary div, captured by the engine with html2canvas.
 *
 * Live: the content becomes the `drawable` child of a `<canvas content="drawable">`.
 * The browser paints the child into that canvas (the engine does the drawing),
 * the canvas is what the user sees and what gets uploaded as a texture, and the
 * child stays focusable and clickable. A canvas cannot size itself to its
 * children, so the content's width is pinned to the wrapper's width and the
 * canvas's height to the content's height.
 */
export function GlassBackdrop({ children, className, style, wrapperClassName, mode = 'auto', ref }: GlassBackdropProps) {
  const live = mode === 'auto' && supportsHtmlInCanvas();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useImperativeHandle(ref, () => (
    live
      ? { element: canvasRef.current!, liveContent: contentRef.current! }
      : { element: contentRef.current! }
  ), [live]);

  useLayoutEffect(() => {
    if (!live) return;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    const update = () => {
      const width = wrapper.clientWidth;
      const height = content.offsetHeight;
      setSize(current => (current.width === width && current.height === height ? current : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    observer.observe(content);
    return () => observer.disconnect();
  }, [live]);

  if (!live) {
    return (
      <div ref={wrapperRef} className={wrapperClassName}>
        <div ref={contentRef} className={className} style={style}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={wrapperClassName}>
      <canvas
        ref={canvasRef}
        content="drawable"
        style={{ display: 'block', width: '100%', height: size.height || undefined }}
      >
        <div
          ref={contentRef}
          {...DRAWABLE}
          className={className}
          style={{ ...style, boxSizing: 'border-box', width: size.width || undefined }}
        >
          {children}
        </div>
      </canvas>
    </div>
  );
}
