import { type RefObject, useEffect, useState } from "react";

export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

/** Tracks an element's CSS size and device pixel ratio. */
export function useCanvasSize(ref: RefObject<HTMLElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height), dpr: Math.min(2, window.devicePixelRatio || 1) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Sizes a canvas backing store for crisp drawing and returns a scaled 2D context. */
export function prepareCanvas(canvas: HTMLCanvasElement, size: CanvasSize): CanvasRenderingContext2D | null {
  const w = Math.max(1, Math.round(size.width * size.dpr));
  const h = Math.max(1, Math.round(size.height * size.dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  return ctx;
}
