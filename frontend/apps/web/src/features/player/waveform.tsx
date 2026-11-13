import { useEffect, useRef } from "react";

import { player } from "@/audio/player";
import { usePlayer } from "@/audio/use-player";
import { prepareCanvas, useCanvasSize } from "@/hooks/use-canvas-size";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { themeColor, useThemeVersion } from "@/lib/theme-colors";

/** Decorative live oscilloscope. Hidden from assistive tech; the play state is announced instead. */
export function Waveform({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(wrapRef);
  const { status } = usePlayer();
  const reduced = useReducedMotion();
  const themeVersion = useThemeVersion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = prepareCanvas(canvas, size);
    if (!ctx) return;
    const line = themeColor("primary");
    const faint = themeColor("muted-foreground", 0.4);
    const buffer = new Uint8Array(512);
    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      if (status === "playing") raf = requestAnimationFrame(draw);
      if (reduced && now - last < 250) return; // calm, low-rate level meter
      last = now;
      const analyser = player.analyser;
      ctx.clearRect(0, 0, size.width, size.height);
      const mid = size.height / 2;
      if (!analyser || status !== "playing") {
        ctx.strokeStyle = faint;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(size.width, mid);
        ctx.stroke();
        return;
      }
      analyser.getByteTimeDomainData(buffer);
      if (reduced) {
        let sum = 0;
        for (const v of buffer) sum += ((v - 128) / 128) ** 2;
        const rms = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
        ctx.fillStyle = line;
        ctx.fillRect(0, mid - 2, size.width * rms, 4);
        return;
      }
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < buffer.length; i++) {
        const x = (i / (buffer.length - 1)) * size.width;
        const y = mid + (((buffer[i] ?? 128) - 128) / 128) * mid * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    if (status === "playing") raf = requestAnimationFrame(draw);
    else draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [size, status, reduced, themeVersion]);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
