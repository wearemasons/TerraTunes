import { useSyncExternalStore } from "react";

import { type PlayerSnapshot, player } from "./player";

export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
}

export { player };
