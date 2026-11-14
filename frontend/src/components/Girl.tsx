import { useEffect, useRef, useState } from "react";
import { useUI } from "../lib/store";
import assets from "../lib/girl-assets.json";
import { GirlRenderer } from "../lib/girlRenderer";
import type { GirlState } from "../lib/girlMotion";
import "./girl.css";

export type GirlPose = "greet" | "point" | "listen";

/** A single fixed-canvas character. Pose changes never change its CSS size. */
export function Girl({
  pose = "greet",
  weather = "calm",
  level,
  playing,
  wrapRef,
}: {
  pose?: GirlPose;
  weather?: "calm" | "wind" | "rain";
  level: number;
  playing: boolean;
  wrapRef?: React.Ref<HTMLDivElement>;
}) {
  const userReduced = useUI((s) => s.reduceMotion);
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const reduced = userReduced || systemReduced;
  const [state, setState] = useState<GirlState>("standing");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GirlRenderer | null>(null);
  const latest = useRef({ playing, reduced });
  latest.current = { playing, reduced };

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const instance = new GirlRenderer(canvas, assets, setState);
    renderer.current = instance;
    instance.update(latest.current.playing, latest.current.reduced);
    return () => {
      instance.dispose();
      renderer.current = null;
    };
  }, []);

  useEffect(() => {
    renderer.current?.update(playing, reduced);
  }, [playing, reduced]);

  return (
    <div
      ref={wrapRef}
      data-girl-state={state}
      data-girl-gesture={pose}
      className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[46%] select-none"
      aria-hidden
    >
      <div
        className="girl-plane absolute bottom-[1%] left-[clamp(-52%,-17vw,-11%)] h-[clamp(230px,40vh,430px)] md:h-[clamp(340px,58vh,620px)]"
        style={
          {
            aspectRatio: `${assets.width}/${assets.height}`,
            transformOrigin: "50% 100%",
            animation: reduced
              ? "none"
              : "girl-grounded-sway 5.5s ease-in-out infinite",
            filter: `drop-shadow(0 14px 16px rgba(20,12,6,.5))${weather === "rain" ? " brightness(.94)" : ""}`,
            "--girl-gust": `${weather === "wind" ? 0.25 : weather === "rain" ? 0.15 : 0.08}deg`,
            "--girl-beat": `${playing ? Math.min(0.15, level * 0.25) : 0}deg`,
          } as React.CSSProperties
        }
      >
        <canvas
          ref={canvasRef}
          width={assets.width}
          height={assets.height}
          data-girl-canvas
          className="block h-full w-full"
        />
      </div>
    </div>
  );
}
