import { useEffect, useRef, useState } from "react";
import { useUI } from "../lib/store";

/**
 * The girl by the cabinet.
 *
 * The pose clips are short, seamlessly looped keyed plates. Sitting is not a
 * pose cross-fade: playback owns that state, and the complete source-plate
 * crouch is played once on each music-state change. The stand-up asset is the
 * same source action in reverse because the plate contains no independent
 * stand-up take.
 */

const POSE = {
  greet: {
    video: "/video/girl-greet.webm",
    still: "/art/girl-greet.webp",
    w: 242,
    h: 546,
  },
  point: {
    video: "/video/girl-point.webm",
    still: "/art/girl-point.webp",
    w: 288,
    h: 437,
  },
  listen: {
    video: "/video/girl-listen.webm",
    still: "/art/girl-listen.webp",
    w: 258,
    h: 387,
  },
} as const;

const TRANSITION = {
  sitdown: {
    video: "/video/girl-sitdown.webm",
    still: "/art/girl-sitdown.webp",
    w: 320,
    h: 452,
  },
  standup: {
    video: "/video/girl-standup.webm",
    still: "/art/girl-standup.webp",
    w: 320,
    h: 452,
  },
} as const;

const TRANSITION_TIMEOUT_MS = 5600;

type TransitionKind = keyof typeof TRANSITION;
type TransitionState = { kind: TransitionKind; id: number };

export type GirlPose = keyof typeof POSE;

export function Girl({
  pose = "greet",
  weather = "calm",
  level,
  playing,
  wrapRef,
}: {
  pose?: GirlPose;
  weather?: "calm" | "wind" | "rain";
  level: number;
  playing: boolean;
  /** handed to the opening film's match-move, which needs to know where she is */
  wrapRef?: React.Ref<HTMLDivElement>;
}) {
  const reduceMotion = useUI((s) => s.reduceMotion);
  const [t, setT] = useState(0);
  const [visualSitting, setVisualSitting] = useState(playing);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const [live, setLive] = useState<GirlPose | null>(null);
  const transitionVideoRef = useRef<HTMLVideoElement>(null);
  const transitionIdRef = useRef(0);
  const transitionStartProgressRef = useRef(0);
  const transitionPlayAttemptsRef = useRef(0);

  // Warm stills once so a decoder failure leaves a painted character in place.
  useEffect(() => {
    for (const spec of [...Object.values(POSE), ...Object.values(TRANSITION)]) {
      const img = new Image();
      img.src = spec.still;
    }
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      setT((now - t0) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  const settleTransition = (id: number, kind: TransitionKind) => {
    if (transitionIdRef.current !== id) return;
    setVisualSitting(kind === "sitdown");
    setTransition(null);
  };

  // Playback state is the only authority for sitting. A quick toggle reverses
  // at the matching point in the reversed clip instead of snapping to a still.
  useEffect(() => {
    if (reduceMotion) {
      transitionIdRef.current += 1;
      setTransition(null);
      setVisualSitting(playing);
      return;
    }

    const activeTarget = transition
      ? transition.kind === "sitdown"
      : visualSitting;
    if (playing === activeTarget) return;

    const currentVideo = transitionVideoRef.current;
    const progress =
      transition &&
      currentVideo &&
      Number.isFinite(currentVideo.duration) &&
      currentVideo.duration > 0
        ? Math.min(
            1,
            Math.max(0, currentVideo.currentTime / currentVideo.duration),
          )
        : 0;
    transitionStartProgressRef.current = transition ? 1 - progress : 0;
    transitionPlayAttemptsRef.current = 0;
    const id = transitionIdRef.current + 1;
    transitionIdRef.current = id;
    setTransition({ kind: playing ? "sitdown" : "standup", id });
  }, [playing, reduceMotion, transition, visualSitting]);

  // A broken or stalled transition must not leave the character waiting
  // forever. The stable target then falls back to its keyed still/loop.
  useEffect(() => {
    if (!transition) return;
    const { id, kind } = transition;
    const timer = window.setTimeout(
      () => settleTransition(id, kind),
      TRANSITION_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [transition]);

  const attemptTransitionPlay = (video: HTMLVideoElement, id: number) => {
    if (
      transitionIdRef.current !== id ||
      transitionPlayAttemptsRef.current >= 2
    )
      return;
    transitionPlayAttemptsRef.current += 1;
    void video.play().catch(() => {
      // Muted autoplay is normally allowed; the timeout above is the final
      // fallback if this browser still refuses the one-shot clip.
    });
  };

  const stablePose: GirlPose = visualSitting ? "listen" : "greet";

  // Hair and coat keep a small weather response, but reduced motion is a
  // genuinely held frame rather than a slower animation.
  const gust = weather === "calm" ? 0.1 : weather === "wind" ? 0.5 : 0.85;
  const sway = reduceMotion
    ? 0
    : Math.sin(t * (weather === "rain" ? 1.5 : 0.85)) * gust +
      Math.sin(t * 0.33) * 0.12;
  const bob =
    reduceMotion || !visualSitting ? 0 : Math.sin(t * 1.6) * level * 0.5;
  const stableSpec = POSE[stablePose];
  const transitionSpec = transition ? TRANSITION[transition.kind] : null;

  return (
    <div
      ref={wrapRef}
      data-girl-state={
        transition?.kind ?? (visualSitting ? "sitting" : "standing")
      }
      className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[46%] select-none"
      aria-hidden
    >
      <div
        className={`absolute bottom-[1%] left-[clamp(-52%,-17vw,-11%)] ${visualSitting ? "h-[clamp(160px,26vh,300px)] md:h-[clamp(210px,38vh,400px)]" : "h-[clamp(230px,40vh,430px)] md:h-[clamp(340px,58vh,620px)]"}`}
        style={{
          aspectRatio: `${stableSpec.w} / ${stableSpec.h}`,
          opacity: transition ? 0 : 1,
          transform: `rotate(${(sway * 1.1 + bob * 0.25 + (!reduceMotion && !visualSitting && pose === "point" ? 0.6 : 0)).toFixed(3)}deg)`,
          transformOrigin: "50% 100%",
          filter: "drop-shadow(0 14px 16px rgba(20,12,6,.5))",
        }}
      >
        <img
          key={`still-${stablePose}`}
          src={stableSpec.still}
          alt=""
          width={stableSpec.w}
          height={stableSpec.h}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain object-bottom"
          style={{
            opacity: live === stablePose ? 0 : 1,
            filter:
              weather === "rain" ? "brightness(.94) saturate(.95)" : undefined,
          }}
        />
        {!reduceMotion && (
          <video
            key={`loop-${stablePose}`}
            src={stableSpec.video}
            className="absolute inset-0 h-full w-full object-contain object-bottom"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden
            style={{ opacity: live === stablePose ? 1 : 0 }}
            onPlaying={() => setLive(stablePose)}
            onError={() => setLive(null)}
          />
        )}
      </div>

      {transitionSpec && transition && (
        <div
          className="absolute bottom-[1%] left-[clamp(-52%,-17vw,-11%)] h-[clamp(230px,40vh,430px)] md:left-[clamp(-52%,-17vw,-11%)] md:h-[clamp(340px,58vh,620px)]"
          style={{
            aspectRatio: `${transitionSpec.w} / ${transitionSpec.h}`,
            transform: `rotate(${(sway * 1.1).toFixed(3)}deg)`,
            transformOrigin: "50% 100%",
            filter: "drop-shadow(0 14px 16px rgba(20,12,6,.5))",
          }}
        >
          <img
            src={transitionSpec.still}
            alt=""
            width={transitionSpec.w}
            height={transitionSpec.h}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain object-bottom"
            style={{
              filter:
                weather === "rain"
                  ? "brightness(.94) saturate(.95)"
                  : undefined,
            }}
          />
          {!reduceMotion && (
            <video
              key={`${transition.kind}-${transition.id}`}
              ref={transitionVideoRef}
              src={transitionSpec.video}
              className="absolute inset-0 h-full w-full object-contain object-bottom"
              autoPlay
              muted
              playsInline
              preload="auto"
              aria-hidden
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (transitionIdRef.current !== transition.id) return;
                const start = transitionStartProgressRef.current;
                if (
                  start > 0 &&
                  Number.isFinite(video.duration) &&
                  video.duration > 0
                ) {
                  video.currentTime = video.duration * start;
                }
                attemptTransitionPlay(video, transition.id);
              }}
              onCanPlay={(event) =>
                attemptTransitionPlay(event.currentTarget, transition.id)
              }
              onEnded={() => settleTransition(transition.id, transition.kind)}
              onError={() => settleTransition(transition.id, transition.kind)}
            />
          )}
        </div>
      )}
    </div>
  );
}
