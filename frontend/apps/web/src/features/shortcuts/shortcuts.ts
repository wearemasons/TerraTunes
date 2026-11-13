export interface ShortcutDef {
  keys: string[];
  label: string;
  /** Where it works. */
  scope: "Everywhere" | "Player" | "Explore mode";
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: ["?"], label: "Show keyboard shortcuts", scope: "Everywhere" },
  { keys: ["Space"], label: "Play or pause", scope: "Player" },
  { keys: ["←", "→"], label: "Previous or next frame", scope: "Player" },
  { keys: ["Home", "End"], label: "First or last frame", scope: "Player" },
  { keys: ["↑", "↓"], label: "Volume up or down", scope: "Player" },
  { keys: ["M"], label: "Mute or unmute", scope: "Player" },
  { keys: ["1", "2", "3"], label: "Scan, Overview or Explore mode", scope: "Player" },
  { keys: ["C"], label: "Switch between Musical and Clear tone", scope: "Player" },
  { keys: ["K"], label: "Read the audio key", scope: "Player" },
  { keys: ["D"], label: "Read the current frame description", scope: "Player" },
  { keys: ["←", "↑", "→", "↓"], label: "Move across the map (hold Shift for bigger steps)", scope: "Explore mode" },
  { keys: ["Enter"], label: "Read the value under the cursor", scope: "Explore mode" },
];
