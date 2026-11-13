import { useEffect, useRef } from "react";

import { player } from "@main/audio/player";
import { announce } from "@main/lib/a11y/announce";
import { type ModeId, PRESET_IDS, PRESET_LABELS, type PresetId, type Score, type TrackDetail } from "@main/lib/api/types";
import { getPrefs } from "@main/lib/prefs";
import { isActivatable, isTypingTarget, ownsArrowKeys, useUi } from "@main/lib/ui-store";

const MODE_KEYS: Record<string, ModeId> = { "1": "scan", "2": "overview", "3": "explore" };

/** Single-key player shortcuts. Skips typing targets, modifier chords and widgets that own the key. */
export function usePlayerShortcuts(args: {
  track: TrackDetail;
  score: Score;
  preset: PresetId;
  onModeChange: (mode: ModeId) => void;
  onPresetChange: (preset: PresetId) => void;
  onToggle?: () => void;
}) {
  const ref = useRef(args);
  ref.current = args;
  const { shortcutsOpen, settingsOpen } = useUi();
  const dialogOpen = shortcutsOpen || settingsOpen;

  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (!getPrefs().shortcuts || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const { track, score, preset, onModeChange, onPresetChange, onToggle } = ref.current;
      const snapshot = player.getSnapshot();
      const key = event.key;

      const handled = (() => {
        switch (key) {
          case " ":
            if (isActivatable(event.target)) return false;
            if (snapshot.mode === "explore") return false;
            if (onToggle) onToggle();
            else player.toggle();
            return true;
          case "ArrowLeft":
          case "ArrowRight":
            if (ownsArrowKeys(event.target)) return false;
            player.step(key === "ArrowLeft" ? -1 : 1);
            return true;
          case "ArrowUp":
          case "ArrowDown": {
            if (ownsArrowKeys(event.target)) return false;
            const next = Math.round((snapshot.volume + (key === "ArrowUp" ? 0.1 : -0.1)) * 10) / 10;
            player.setVolume(next);
            announce(`Volume ${Math.round(Math.min(1, Math.max(0, next)) * 100)}%`);
            return true;
          }
          case "Home":
          case "End":
            if (ownsArrowKeys(event.target)) return false;
            player.seek(key === "Home" ? 0 : snapshot.frameCount - 1);
            return true;
          case "m":
          case "M":
            player.setMuted(!snapshot.muted);
            announce(snapshot.muted ? "Sound on" : "Muted", { force: true });
            return true;
          case "k":
          case "K":
            announce(track.audio_key, { assertive: true });
            return true;
          case "d":
          case "D": {
            const frame = score.frames[snapshot.frame];
            if (frame) announce(frame.description, { assertive: true });
            return true;
          }
          case "c":
          case "C": {
            const next: PresetId = PRESET_IDS[(PRESET_IDS.indexOf(preset) + 1) % PRESET_IDS.length]!;
            onPresetChange(next);
            announce(PRESET_LABELS[next], { force: true });
            return true;
          }
          default: {
            const mode = MODE_KEYS[key];
            if (!mode) return false;
            onModeChange(mode);
            announce(`${mode[0]?.toUpperCase()}${mode.slice(1)} mode`, { force: true });
            return true;
          }
        }
      })();

      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen]);
}
