import { useEffect, useState } from "react";

import { onAnnounce } from "@/lib/a11y/announce";

/** Visually hidden live regions. Rendered once in the root layout. */
export function LiveRegion() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  useEffect(() => {
    const timers: number[] = [];
    const unsubscribe = onAnnounce((channel, message) => {
      const set = channel === "polite" ? setPolite : setAssertive;
      // Clear first so repeating the same text is announced again.
      set("");
      timers.push(window.setTimeout(() => set(message), 60));
    });
    return () => {
      unsubscribe();
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}
