import { useSyncExternalStore } from "react";

interface UiState {
  shortcutsOpen: boolean;
  settingsOpen: boolean;
}

let state: UiState = { shortcutsOpen: false, settingsOpen: false };
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUi(): UiState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** True when a key press belongs to a text field or a widget that handles its own keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Widgets that use arrow keys themselves (sliders, tabs, toggle groups, the explore surface). */
export function ownsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('[role="slider"], [role="tab"], [role="tablist"], [role="radiogroup"], [role="group"][data-slot="toggle-group"], [data-explore-surface], [role="menu"], [role="dialog"] [role="listbox"]'),
  );
}

/** Buttons and links already react to Space/Enter; don't double-handle. */
export function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="tab"], summary'));
}
