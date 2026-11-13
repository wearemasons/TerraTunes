import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { player } from "@/audio/player";
import { usePlayer } from "@/audio/use-player";
import { getPrefs, setPrefs, usePrefs } from "@/lib/prefs";
import { isTypingTarget, setUi } from "@/lib/ui-store";

/** Side effects that belong to the whole app, not a page. Renders nothing. */
export function AppEffects() {
  const prefs = usePrefs();
  const { volume, muted } = usePlayer();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  // High contrast = a class that remaps theme tokens (see index.css).
  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", prefs.highContrast);
  }, [prefs.highContrast]);

  // Saved volume is restored in main.tsx before the first render; persist changes here.
  useEffect(() => {
    const saved = getPrefs();
    if (saved.volume !== volume || saved.muted !== muted) setPrefs({ volume, muted });
  }, [volume, muted]);

  // "?" opens the shortcuts dialog anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || !getPrefs().shortcuts) return;
      event.preventDefault();
      setUi({ shortcutsOpen: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Move focus to the new page's heading once the destination has rendered (not on first load,
  // not for search-only changes such as filters or player mode).
  useEffect(() => {
    return router.subscribe("onRendered", (event) => {
      if (!event.fromLocation || !event.pathChanged) return;
      requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>("#main h1");
        if (!heading) return;
        heading.tabIndex = -1;
        heading.focus();
      });
    });
  }, [router]);

  // Leaving a track page stops the sound.
  useEffect(() => {
    if (!pathname.startsWith("/track/")) player.unload();
  }, [pathname]);

  return null;
}
