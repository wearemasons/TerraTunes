export type GirlState = "standing" | "sitting" | "sitdown" | "standup";
export type GirlRequest = {
  state: GirlState;
  progress: number;
  still: boolean;
};
export const isGirlTransition = (state: GirlState) =>
  state === "sitdown" || state === "standup";

/** Progress always belongs to the currently playing clip, not the new one. */
export function nextGirlMotion(
  current: GirlState,
  playing: boolean,
  progress: number,
  reduced: boolean,
): GirlRequest | null {
  const target: GirlState = playing ? "sitting" : "standing";
  if (reduced) return { state: target, progress: 0, still: true };
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (
    (current === "standing" && !playing) ||
    (current === "sitting" && playing)
  )
    return null;
  if ((current === "sitdown" && playing) || (current === "standup" && !playing))
    return null;
  if (isGirlTransition(current)) {
    // Reversing before the first frame has advanced is already at the target.
    if (p <= 0.0001) return { state: target, progress: 0, still: false };
    return {
      state: playing ? "sitdown" : "standup",
      progress: 1 - p,
      still: false,
    };
  }
  return { state: playing ? "sitdown" : "standup", progress: 0, still: false };
}
