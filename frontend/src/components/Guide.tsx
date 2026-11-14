import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Captions,
  ChevronRight,
  MessageCircle,
  RotateCcw,
  Volume2,
  X,
} from "lucide-react";
import { player } from "@main/audio/player";
import { useUI } from "../lib/store";
import {
  GUIDE_DUCK,
  GUIDE_GIVE_UP_MS,
  GUIDE_LAST,
  GUIDE_NUDGE_MS,
  GUIDE_STEPS,
} from "../lib/guide";
import type { GuideWait } from "../lib/guide";
import "./guide.css";

/** is the thing this step is waiting for actually true yet */
const satisfied = (wait: GuideWait) => {
  const s = useUI.getState();
  switch (wait) {
    case "powered":
      return s.powered;
    case "loaded":
      return s.loadedId !== "";
    case "playing":
      return s.isPlaying;
    case "deck":
      return s.deckOpen;
    default:
      return true;
  }
};

/**
 * The character talks the visitor through the cabinet: one recorded line per
 * step, the control she mentioned rings until they use it, and the record's own
 * volume ducks under her voice. Captions carry every line, so the tour works
 * just as well with the voice off.
 */
export function Guide() {
  const active = useUI((s) => s.guideActive);
  const prompted = useUI((s) => s.guidePrompt);
  const setGuidePrompt = useUI((s) => s.setGuidePrompt);
  const index = useUI((s) => s.guideIndex);
  const voiceOn = useUI((s) => s.guideVoice);
  const setGuideVoice = useUI((s) => s.setGuideVoice);
  const powered = useUI((s) => s.powered);
  const loadedId = useUI((s) => s.loadedId);
  const isPlaying = useUI((s) => s.isPlaying);
  const deckOpen = useUI((s) => s.deckOpen);
  const filmUp = useUI((s) => s.filmUp);
  const reduceMotion = useUI((s) => s.reduceMotion);
  const announce = useUI((s) => s.announce);
  const setGuide = useUI((s) => s.setGuide);

  const step = GUIDE_STEPS[Math.min(index, GUIDE_LAST)];
  const [phase, setPhase] = useState<"speaking" | "waiting">("speaking");
  const [ring, setRing] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // leaving the page ends the tour; it should not speak from behind a route
  useEffect(() => () => useUI.getState().setGuide(false), []);

  // offered once per visit, so an idle visitor is never lectured twice
  useEffect(() => {
    if (active) sessionStorage.setItem("tt-toured", "1");
  }, [active]);
  const duckFrom = useRef<number | null>(null);

  const duck = useCallback((on: boolean) => {
    if (on) {
      const snap = player.getSnapshot();
      if (duckFrom.current !== null || snap.muted || snap.volume <= 0.001)
        return;
      player.setVolume(snap.volume * GUIDE_DUCK);
      duckFrom.current = snap.volume;
    } else if (duckFrom.current !== null) {
      // only hand the volume back if the visitor has not moved the knob
      if (
        Math.abs(player.getSnapshot().volume - duckFrom.current * GUIDE_DUCK) <
        0.02
      )
        player.setVolume(duckFrom.current);
      duckFrom.current = null;
    }
  }, []);

  const stop = useCallback(
    (msg = "Tour stopped.") => {
      audioRef.current?.pause();
      audioRef.current = null;
      duck(false);
      setRing(null);
      setGuide(false);
      announce(msg);
    },
    [announce, duck, setGuide],
  );

  const advance = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    duck(false);
    if (index >= GUIDE_LAST) stop("Tour finished.");
    else setGuide(true, index + 1);
  }, [duck, index, setGuide, stop]);

  // the film owns the screen; a tour underneath it would be pointing at nothing
  useEffect(() => {
    if (filmUp && active) stop();
  }, [active, filmUp, stop]);

  // one line, one control ring, one wait
  useEffect(() => {
    if (!active) {
      setRing(null);
      return;
    }
    setPhase("speaking");
    announce(step.announce);
    // the route listens for this so a fullscreen panel can step aside
    window.dispatchEvent(new CustomEvent("tt-guide-step", { detail: step.id }));
    // already done means there is nothing to point at: the line is still said,
    // because it explains what that control does, then the tour moves on
    const preDone = step.wait !== "none" && satisfied(step.wait);
    const measure = () => {
      if (!step.target || preDone) return setRing(null);
      const node = document.querySelector<HTMLElement>(
        `[data-guide="${step.target}"]`,
      );
      if (!node || !node.getClientRects().length) return setRing(null);
      const r = node.getBoundingClientRect();
      setRing((old) =>
        old &&
        Math.abs(old.top - r.top) < 0.5 &&
        Math.abs(old.left - r.left) < 0.5 &&
        Math.abs(old.width - r.width) < 0.5 &&
        Math.abs(old.height - r.height) < 0.5
          ? old
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    measure();
    let raf = 0;
    const watch = () => {
      measure();
      raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    const audio = new Audio(step.audio);
    audioRef.current = audio;
    audio.preload = "auto";
    duck(true);
    const finished = () => {
      duck(false);
      setPhase("waiting");
    };
    audio.onended = finished;
    audio.onerror = finished;
    let quiet = 0;
    // how long the caption stays up when she cannot be heard
    const dwell = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(finished, step.duration * 1000);
    };
    if (voiceOn) {
      const attempt = audio.play();
      if (attempt && typeof attempt.catch === "function")
        // autoplay is not always allowed: the captions still carry the line,
        // and they stay up long enough to actually be read
        attempt.catch(() => {
          duck(false);
          dwell();
        });
    } else {
      audio.pause();
      dwell();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(quiet);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      audio.onended = audio.onerror = null;
      audio.pause();
      duck(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, voiceOn]);

  // a line with nothing to wait for moves on by itself
  useEffect(() => {
    if (!active || phase !== "waiting" || step.wait !== "none") return;
    const t = window.setTimeout(advance, step.id === "welcome" ? 900 : 1200);
    return () => window.clearTimeout(t);
  }, [active, advance, phase, step]);

  // the ring clears itself once the visitor has done the thing
  useEffect(() => {
    if (!active || phase !== "waiting" || step.wait === "none") return;
    if (satisfied(step.wait)) {
      setRing(null);
      advance();
    }
  }, [
    active,
    advance,
    deckOpen,
    isPlaying,
    loadedId,
    phase,
    powered,
    step.wait,
  ]);

  // nudge, then let go, so nobody is ever stuck behind the tour
  useEffect(() => {
    if (!active || phase !== "waiting" || step.wait === "none") return;
    const nudge = window.setTimeout(() => {
      announce(step.nudge);
    }, GUIDE_NUDGE_MS);
    const release = window.setTimeout(advance, GUIDE_GIVE_UP_MS);
    return () => {
      window.clearTimeout(nudge);
      window.clearTimeout(release);
    };
  }, [active, advance, announce, phase, step]);

  // Escape stops, right arrow skips a line
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        stop();
      } else if (e.key === "ArrowRight" && e.target === document.body) {
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, advance, stop]);

  if (!active) {
    if (!prompted) return null;
    return createPortal(
      <div className="guide-root">
        <div
          className="guide-card guide-ask"
          role="dialog"
          aria-label="Guided tour"
        >
          <div className="guide-head">
            <MessageCircle size={13} aria-hidden="true" />
            <span>guide</span>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("tt-toured", "1");
                setGuidePrompt(false);
              }}
              aria-label="No thanks"
              title="No thanks"
            >
              <X size={13} />
            </button>
          </div>
          <p className="guide-caption">
            You look like you could use a hand. Want me to show you around? It
            takes about a minute.
          </p>
          <div className="guide-foot">
            <button
              type="button"
              className="guide-next"
              onClick={() => setGuide(true, 0)}
            >
              Show me <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  const talking = phase === "speaking" && voiceOn;
  const waiting =
    phase === "waiting" && step.wait !== "none" && !satisfied(step.wait);

  return createPortal(
    <div className="guide-root" data-guide-running="true">
      {ring && (
        <div
          className={`guide-ring${reduceMotion ? " still" : ""}`}
          style={{
            top: ring.top - 9,
            left: ring.left - 9,
            width: ring.width + 18,
            height: ring.height + 18,
          }}
          aria-hidden="true"
        />
      )}
      <div
        className={`guide-card${talking ? " talking" : ""}`}
        role="region"
        aria-label="Guided tour"
      >
        <div className="guide-head">
          <MessageCircle size={13} aria-hidden="true" />
          <span>
            guide · {index + 1} of {GUIDE_STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => {
              if (voiceOn) {
                audioRef.current?.pause();
                audioRef.current = null;
                duck(false);
                setPhase("waiting");
              }
              setGuideVoice(!voiceOn);
            }}
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "Captions only" : "Hear the guide"}
            title={voiceOn ? "Captions only" : "Hear the guide"}
          >
            {voiceOn ? <Volume2 size={12} /> : <Captions size={12} />}
          </button>
          <button
            type="button"
            onClick={() => {
              const a = new Audio(step.audio);
              audioRef.current?.pause();
              audioRef.current = a;
              duck(true);
              a.onended = () => {
                duck(false);
                setPhase("waiting");
              };
              a.onerror = () => {
                duck(false);
                setPhase("waiting");
              };
              void a.play().catch(() => duck(false));
              setPhase("speaking");
            }}
            aria-label="Say that line again"
            title="Say that line again"
          >
            <RotateCcw size={12} />
          </button>
          <button
            type="button"
            onClick={() => stop()}
            aria-label="Stop the tour"
            title="Stop the tour (Escape)"
          >
            <X size={13} />
          </button>
        </div>
        <p className="guide-caption">{waiting ? step.nudge : step.caption}</p>
        <div className="guide-foot">
          <span className="guide-dots" aria-hidden="true">
            {GUIDE_STEPS.map((s, i) => (
              <i key={s.id} data-on={i <= index} />
            ))}
          </span>
          <button
            type="button"
            className="guide-next"
            onClick={() => advance()}
            aria-label="Next step of the tour"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
