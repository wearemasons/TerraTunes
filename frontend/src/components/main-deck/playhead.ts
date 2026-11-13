import { useEffect, useState } from "react";
import { player, usePlayer } from "@main/audio/use-player";
import type { Playhead } from "@main/audio/player";

/** The map, pitch contour and frame timeline all read the same audio clock. */
export function useDeckPlayhead(): Playhead | null {
  const { status, frame, trackId, mode } = usePlayer();
  const [value, setValue] = useState<Playhead | null>(null);
  useEffect(() => setValue(null), [trackId, mode]);
  useEffect(() => {
    if (status !== "playing") {
      setValue((previous) => (previous?.frame === frame ? previous : null));
      return;
    }
    let id = 0;
    const tick = () => {
      setValue(player.getPlayhead());
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [status, frame, trackId, mode]);
  return value;
}
