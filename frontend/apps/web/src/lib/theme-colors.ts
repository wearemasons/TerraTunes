// Canvas can't use Tailwind classes, so visuals read theme tokens at draw time.
// A hidden probe resolves nested var() chains (e.g. high-contrast remaps) to a real colour.

import { useEffect, useState } from "react";

let probe: HTMLSpanElement | null = null;

export function themeColor(token: string, alpha = 1): string {
  if (typeof document === "undefined") return "transparent";
  if (!probe) {
    probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.display = "none";
    document.body.appendChild(probe);
  }
  probe.style.color = alpha >= 1 ? `var(--${token})` : `color-mix(in oklab, var(--${token}) ${Math.round(alpha * 100)}%, transparent)`;
  return getComputedStyle(probe).color;
}

/** Changes whenever the theme, dark mode or high contrast changes, so canvases can redraw. */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  return version;
}
