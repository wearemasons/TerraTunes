import { useEffect, useState } from "react";

import { type Playhead, player } from "@/audio/player";
import { usePlayer } from "@/audio/use-player";

/** Playhead sampled ~10×/s for React UI (charts, labels). Canvases read the player directly. */
export function usePlayheadStep(): Playhead | null {
  const { status } = usePlayer();
  const [playhead, setPlayhead] = useState<Playhead | null>(null);

  useEffect(() => {
    if (status !== "playing") {
      setPlayhead(null);
      return;
    }
    const id = window.setInterval(() => {
      const next = player.getPlayhead();
      setPlayhead((prev) =>
        prev?.frame === next?.frame && prev?.step === next?.step && prev?.stepsPerFrame === next?.stepsPerFrame ? prev : next,
      );
    }, 100);
    return () => window.clearInterval(id);
  }, [status]);

  return playhead;
}
