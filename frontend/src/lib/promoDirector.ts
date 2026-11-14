/**
 * Promo mode: `?promo=1` lets the real site drive itself.
 *
 * Nothing is faked here. The director clicks the same controls a person would
 * click, so a screen recording made in this mode shows the genuine product:
 * the real disc flight, the real iris opening the data deck, the real playhead
 * and the real sound engine. It exists so the demo film and the site can never
 * drift apart.
 */
type Action = () => boolean;

const click = (el: Element | null | undefined): boolean => {
  if (!el) return false;
  const target = el as HTMLElement;
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  target.click();
  return true;
};

const one = (selector: string) => document.querySelector(selector);

const byLabel = (prefix: string) =>
  [...document.querySelectorAll<HTMLElement>("button,[role='button']")].find(
    (e) => (e.getAttribute("aria-label") ?? "").startsWith(prefix),
  );

const byText = (re: RegExp) =>
  [...document.querySelectorAll<HTMLElement>("button")].find((e) =>
    re.test((e.textContent ?? "").trim()),
  );

const key = (name: string) => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true }),
  );
  return true;
};

export interface PromoStep {
  /** seconds from the start of the run */
  at: number;
  label: string;
  action: Action;
  /** how long to keep trying in case an animation must finish first */
  grace?: number;
}

const byEither = (re: RegExp) =>
  [...document.querySelectorAll<HTMLElement>("button,[role='button']")].find(
    (e) =>
      re.test(e.getAttribute("aria-label") ?? "") ||
      re.test((e.textContent ?? "").trim()),
  );

/** a record in the crate, found by the name printed on its sleeve */
const recordNamed = (name: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find(
    (e) =>
      (e.getAttribute("aria-label") ?? "").startsWith("Record ") &&
      (e.getAttribute("aria-label") ?? "").includes(name),
  );

/** the jukebox stage: power, crate, needle, deck, presets, a second record, scan */
export const PROMO_JUKEBOX: PromoStep[] = [
  { at: 0.5, label: "power", action: () => click(one('[data-guide="power"]')) },
  { at: 2.0, label: "crate", action: () => click(one('[data-guide="crate"]')) },
  {
    at: 3.4,
    label: "record: sea",
    action: () => click(byLabel("Record 8")),
    grace: 3,
  },
  { at: 4.9, label: "close crate", action: () => key("Escape") },
  {
    at: 5.7,
    label: "needle",
    action: () => click(one('[data-guide="needle"]')),
    grace: 3,
  },
  {
    at: 7.0,
    label: "tour on",
    action: () => click(byEither(/guided/i)),
    grace: 2,
  },
  {
    at: 8.6,
    label: "tour off",
    action: () => click(byEither(/guided/i)),
    grace: 2,
  },
  {
    at: 9.4,
    label: "deck",
    action: () => click(one('[data-guide="deck"]')),
    grace: 3,
  },
  {
    at: 11.2,
    label: "tab: regions",
    action: () => click(byEither(/regions/i)),
    grace: 2,
  },
  {
    at: 12.6,
    label: "tab: transcript",
    action: () => click(byEither(/transcript/i)),
    grace: 2,
  },
  {
    at: 14.0,
    label: "preset: clear tone",
    action: () => click(byEither(/^clear tone$/i)),
    grace: 2,
  },
  {
    at: 15.6,
    label: "preset: orchestra",
    action: () => click(byEither(/^orchestra$/i)),
    grace: 2,
  },
  {
    at: 17.0,
    label: "show grid",
    action: () => click(byEither(/show grid/i)),
    grace: 2,
  },
  {
    at: 18.6,
    label: "hide grid",
    action: () => click(byEither(/show grid|hide grid/i)),
    grace: 2,
  },
  {
    at: 19.8,
    label: "pause",
    action: () => click(byEither(/^pause$/i)),
    grace: 2,
  },
  {
    at: 21.2,
    label: "resume",
    action: () => click(byEither(/^play$/i)),
    grace: 2,
  },
  { at: 22.6, label: "close deck", action: () => key("Escape"), grace: 2 },
  {
    at: 23.8,
    label: "crate again",
    action: () => click(one('[data-guide="crate"]')),
    grace: 2,
  },
  {
    at: 25.0,
    label: "record: wind",
    action: () => click(recordNamed("Wind")),
    grace: 3,
  },
  { at: 26.4, label: "close crate", action: () => key("Escape") },
  {
    at: 27.2,
    label: "needle again",
    action: () => click(one('[data-guide="needle"]')),
    grace: 3,
  },
  {
    at: 29.6,
    label: "scan page",
    action: () => click(one('[data-guide="scan"]')),
    grace: 3,
  },
];

/** the scan page: read a bundled NASA frame, play it, then show the method */
export const PROMO_SCAN: PromoStep[] = [
  {
    at: 0.6,
    label: "read frame",
    action: () => click(byLabel("Read ")),
    grace: 6,
  },
  { at: 3.6, label: "play", action: () => click(byText(/^Play$/i)), grace: 6 },
  {
    at: 6.4,
    label: "method page",
    action: () => click(byEither(/method/i)),
    grace: 4,
  },
];

export interface PromoLog {
  label: string;
  at: number;
  ok: boolean;
}

/**
 * Run a script of clicks against the live page and leave a log behind, so the
 * recording can be checked afterwards without watching it frame by frame.
 */
export function runPromo(steps: PromoStep[]): () => void {
  const log: PromoLog[] = [];
  (window as unknown as { __promo: PromoLog[] }).__promo = log;
  delete document.documentElement.dataset.promoDone;

  let cancelled = false;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  void (async () => {
    const t0 = performance.now();
    for (const step of steps) {
      if (cancelled) return;
      const target = (step.at * 1000 - (performance.now() - t0)) | 0;
      if (target > 0) await sleep(target);
      const deadline = performance.now() + (step.grace ?? 0) * 1000;
      let ok = false;
      for (;;) {
        ok = step.action();
        if (ok) break;
        if (performance.now() > deadline) break;
        await sleep(120);
      }
      log.push({
        label: step.label,
        at: +((performance.now() - t0) / 1000).toFixed(2),
        ok,
      });
    }
    if (!cancelled) document.documentElement.dataset.promoDone = "1";
  })();

  return () => {
    cancelled = true;
  };
}

/** is this visit in promo mode? */
export const promoMode = () => {
  if (typeof window === "undefined") return false;
  const asked = new URLSearchParams(window.location.search).has("promo");
  try {
    // navigating inside the app drops the query string, but the recording has
    // to keep driving once it reaches another page, so remember the ask
    if (asked) window.sessionStorage.setItem("tt-promo", "1");
    return window.sessionStorage.getItem("tt-promo") === "1";
  } catch {
    return asked;
  }
};
