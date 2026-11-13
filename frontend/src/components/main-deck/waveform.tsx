import { useEffect, useRef } from "react";
import { player } from "@main/audio/use-player";
import type { PlayerStatus } from "@main/audio/player";

export function Waveform({
  status,
  className = "",
}: {
  status: PlayerStatus;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const mid = height / 2;
      ctx.strokeStyle = "rgba(255, 226, 165, .32)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();
      const analyser = player.analyser;
      if (status === "playing" && analyser) {
        const values = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(values);
        ctx.strokeStyle = "#ffd27a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        values.forEach((value, index) => {
          const x = (index / (values.length - 1)) * width;
          const y = mid + ((value - 128) / 128) * mid * 0.86;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      if (status === "playing") frame = requestAnimationFrame(draw);
    };
    resize();
    observer = new ResizeObserver(resize);
    observer.observe(parent);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [status]);

  return (
    <div className={`deck-waveform ${className}`} aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
