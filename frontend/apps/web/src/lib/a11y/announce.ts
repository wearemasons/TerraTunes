// Screen-reader announcements through two ARIA live regions (see components/live-region.tsx).
// Polite messages are throttled to one per 2 s; the latest pending message wins.

type Channel = "polite" | "assertive";
type Listener = (channel: Channel, message: string) => void;

const listeners = new Set<Listener>();
const THROTTLE_MS = 2000;
let lastPolite = 0;
let pending: string | null = null;
let pendingTimer: number | null = null;

export function onAnnounce(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(channel: Channel, message: string): void {
  for (const listener of listeners) listener(channel, message);
}

export function announce(message: string, options: { assertive?: boolean; force?: boolean } = {}): void {
  if (!message) return;
  if (options.assertive) {
    emit("assertive", message);
    return;
  }
  const now = Date.now();
  const wait = lastPolite + THROTTLE_MS - now;
  if (options.force || wait <= 0) {
    lastPolite = now;
    pending = null;
    emit("polite", message);
    return;
  }
  pending = message;
  if (pendingTimer !== null) return;
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    if (pending) {
      lastPolite = Date.now();
      emit("polite", pending);
      pending = null;
    }
  }, wait);
}
