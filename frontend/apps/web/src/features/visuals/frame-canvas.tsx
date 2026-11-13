import { cn } from "@my-better-t-app/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Legend, ValueGrid } from "@/lib/api/types";
import { buildLut, gridToImageData } from "@/lib/colormap";
import { prepareCanvas, useCanvasSize } from "@/hooks/use-canvas-size";
import { themeColor, useThemeVersion } from "@/lib/theme-colors";

interface FrameCanvasProps {
  grid: ValueGrid | undefined;
  legend: Legend | undefined;
  /** When the backend serves real frame images, draw those instead of the grid. */
  imageUrl?: string | null;
  className?: string;
}

/**
 * Base layer: the frame itself. Data colours come from the track's colormap; no-data areas show
 * the theme's muted colour so the map outline adapts to light, dark and tweakcn themes.
 */
export function FrameCanvas({ grid, legend, imageUrl, className }: FrameCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(wrapRef);
  const themeVersion = useThemeVersion();
  const lut = useMemo(() => (legend ? buildLut(legend) : null), [legend]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => setImage(img);
    img.src = imageUrl;
    return () => {
      img.onload = null;
    };
  }, [imageUrl]);

  const source = useMemo(() => {
    if (!grid || !lut) return null;
    const off = document.createElement("canvas");
    off.width = grid.cols;
    off.height = grid.rows;
    off.getContext("2d")?.putImageData(gridToImageData(grid, lut), 0, 0);
    return off;
  }, [grid, lut]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = prepareCanvas(canvas, size);
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = themeColor("muted");
    ctx.fillRect(0, 0, size.width, size.height);
    const drawable = image ?? source;
    if (!drawable) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(drawable, 0, 0, size.width, size.height);
  }, [size, source, image, themeVersion]);

  return (
    <div ref={wrapRef} className={cn("absolute inset-0", className)} aria-hidden="true">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
