import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Compass, Pause, Play } from "lucide-react";
import { api } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { player } from "@main/audio/player";
import { usePlayer } from "@main/audio/use-player";
import { scoreQuery, trackQuery } from "@main/lib/api/queries";
import type { Score, TrackDetail } from "@main/lib/api/types";
import { mechanism } from "../lib/audio/mechanism";
import { useUI } from "../lib/store";
import { flyDisc } from "../lib/discFlight";
import { Cabinet } from "../components/Cabinet";
import { DiscSelector } from "../components/DiscSelector";
import { BootFilm } from "../components/BootFilm";
import { NowPlaying } from "../components/NowPlaying";
import { Girl } from "../components/Girl";
import { Guide } from "../components/Guide";
import { PROMO_JUKEBOX, promoMode, runPromo } from "../lib/promoDirector";
import type { GirlPose } from "../components/Girl";
import { ARRIVAL_SCENE, sceneFor, weatherFor } from "../lib/world";
import { BOOT_FILM } from "../lib/boot";
import { playMatchCut } from "../lib/matchCut";
import { LoadingDoor } from "../components/LoadingDoor";

const DECK_OPEN_MS = 820;
/** closing replays the opening backwards at this speed */
const DECK_CLOSE_SPEED = 1.7;
/** slow start, fast middle, long soft landing: reads as the iris "pouring" open */
const DECK_EASE = "cubic-bezier(.7,0,.18,1)";

const MODEL_WORD: Record<string, string> = {
  wind: "Airflow",
  storm: "Storm",
  fire: "Fire",
  ocean: "Ocean",
  city: "City lights",
  canopy: "Canopy",
  plume: "Plume",
  space: "Deep space",
};

/** film = the cut scene rolling, match = frozen on the frame the page is
 *  composed like, live = the cabinet is the page again */
type Boot = "film" | "match" | "live";

export function JukeboxPage() {
  const datasetsQuery = useQuery({
    queryKey: ["datasets"],
    queryFn: api.datasets,
  });
  const {
    powered,
    setPowered,
    selectedId,
    select,
    arrived,
    setArrived,
    setFilmUp,
    setPlaying,
    setLoaded,
    setVolume,
    announce,
    setLevel,
    setGuidePrompt,
    setDeckOpen,
    level: storeLevel,
  } = useUI();

  const snapshot = usePlayer();
  const isPlaying = snapshot.status === "playing";
  const loadedScore = useRef<Score | null>(null);
  const [spectrum, setSpectrum] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [flying, setFlying] = useState(false);
  /*
   * The Data Deck opens like a portal out of the button that summoned it: an
   * iris (`--deck-r`, one animated radius) reveals the deck, a brass rim rides
   * the edge of the iris, a flare bursts from the button, then the deck's
   * cards fade in one after another. Closing plays the same animations
   * backwards, faster, and the iris collapses back into the button.
   */
  const [deck, setDeck] = useState<"closed" | "open" | "closing">("closed");
  const [deckOrigin, setDeckOrigin] = useState({ x: 0, y: 0 });
  const deckOpener = useRef<HTMLButtonElement | null>(null);
  const deckBack = useRef<HTMLButtonElement>(null);
  const deckRoot = useRef<HTMLDivElement>(null);
  const deckFlare = useRef<HTMLDivElement>(null);
  const deckAnims = useRef<Animation[]>([]);
  // Each route visit, including reloads, gets a new showing. Skip stays available.
  const [boot, setBoot] = useState<Boot>(() => (promoMode() ? "live" : "film"));
  const cradleRef = useRef<HTMLDivElement>(null);
  const discRefs = useRef<Record<string, HTMLElement | null>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const girlRef = useRef<HTMLDivElement>(null);
  const powerTimer = useRef(0);
  const pickSequence = useRef(0);
  const playSequence = useRef(0);
  const playPending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pickSequence.current += 1;
      window.clearTimeout(powerTimer.current);
    };
  }, []);

  /**
   * The film freezes on a frame where the cabinet is right of centre and the
   * girl is large in the foreground. Put the live page in that same place,
   * while the film is still opaque over the top of it, and the dissolve stops
   * being two jukeboxes ghosting through each other.
   */
  useLayoutEffect(() => {
    if (boot !== "match") return;
    return playMatchCut({
      stage: stageRef.current,
      girl: girlRef.current,
      framing: {
        frame: BOOT_FILM.frame,
        cabinet: BOOT_FILM.cabinetBox,
        girl: BOOT_FILM.girlBox,
      },
      holdMs: BOOT_FILM.fadeMs,
      settleMs: 1150,
    });
  }, [boot]);

  // Stand at rest. Sitting is exclusively a reaction to actual audio playback.
  const [pose, setPose] = useState<GirlPose>("greet");
  const poseTimer = useRef(0);
  const showPose = useCallback((p: GirlPose, ms: number) => {
    if (useUI.getState().reduceMotion) return;
    setPose(p);
    window.clearTimeout(poseTimer.current);
    poseTimer.current = window.setTimeout(() => {
      setPose(player.getSnapshot().status === "playing" ? "listen" : "greet");
    }, ms);
  }, []);
  useEffect(() => {
    window.clearTimeout(poseTimer.current);
    setPose(isPlaying ? "listen" : "greet");
  }, [isPlaying]);
  useEffect(() => () => window.clearTimeout(poseTimer.current), []);

  useEffect(() => {
    setArrived(false);
  }, [setArrived]);

  // while the film is up, the page behind it is unreachable, not merely covered
  useEffect(() => {
    setFilmUp(boot !== "live");
    if (boot !== "live") {
      player.pause();
      setPlaying(false);
    }
    return () => setFilmUp(false);
  }, [boot, setFilmUp, setPlaying]);

  // the film ends with the switch already thrown, so the page underneath is
  // lit and the cross-fade is a match rather than a before-and-after
  useEffect(() => {
    if (boot !== "live") setPowered(true);
  }, [boot, setPowered]);

  const openDeck = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (deckAnims.current.length) return; // already opening, open or closing
    const r = e.currentTarget.getBoundingClientRect();
    deckOpener.current = e.currentTarget;
    setDeckOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setDeck("open");
  }, []);

  const closeDeck = useCallback(
    () => setDeck((d) => (d === "open" ? "closing" : d)),
    [],
  );

  // start the opening before the first paint, so the deck never flashes in full
  useLayoutEffect(() => {
    if (deck !== "open" || deckAnims.current.length) return;
    const root = deckRoot.current;
    if (!root) return;
    const { x, y } = deckOrigin;
    // far enough to clear the farthest corner of the screen, at any window size
    const R =
      Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      ) + 40;
    const quick = useUI.getState().reduceMotion;
    const iris = root.animate(
      [{ "--deck-r": "0px" }, { "--deck-r": `${R}px` }] as Keyframe[],
      {
        duration: quick ? 1 : DECK_OPEN_MS,
        easing: DECK_EASE,
        fill: "forwards",
      },
    );
    const anims = [iris];
    if (deckFlare.current && !quick) {
      anims.push(
        deckFlare.current.animate(
          [
            { transform: "translate(-50%,-50%) scale(.2)", opacity: 0.95 },
            { transform: "translate(-50%,-50%) scale(2.6)", opacity: 0 },
          ],
          {
            duration: DECK_OPEN_MS * 0.8,
            easing: "cubic-bezier(.2,.8,.3,1)",
            fill: "forwards",
          },
        ),
      );
    }
    deckAnims.current = anims;
    let t = 0;
    void iris.finished.then(
      () => {
        if (iris.playbackRate > 0)
          t = window.setTimeout(
            () => deckBack.current?.focus({ preventScroll: true }),
            0,
          );
      },
      () => {},
    );
    return () => window.clearTimeout(t);
  }, [deck, deckOrigin]);

  // close: run the very same animations backwards (from wherever they are, so
  // closing mid-opening never jumps), then unmount and hand focus back
  useEffect(() => {
    if (deck !== "closing") return;
    const anims = deckAnims.current;
    if (!anims.length) {
      setDeck("closed");
      return;
    }
    for (const a of anims) {
      a.playbackRate = DECK_CLOSE_SPEED;
      a.reverse();
    }
    let alive = true;
    void Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (!alive) return;
        deckAnims.current = [];
        setDeck("closed");
        deckOpener.current?.focus({ preventScroll: true });
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [deck]);

  const deckOpen = deck !== "closed";

  useEffect(() => {
    setDeckOpen(deck === "open");
  }, [deck, setDeckOpen]);

  // the tour points at the navigation, so a fullscreen panel must not hide it
  useEffect(() => {
    const onStep = (event: Event) => {
      if ((event as CustomEvent).detail === "scan" && deck !== "closed")
        closeDeck();
    };
    window.addEventListener("tt-guide-step", onStep);
    return () => window.removeEventListener("tt-guide-step", onStep);
  }, [closeDeck, deck]);

  useEffect(() => {
    if (!deckOpen) return;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDeck();
      if (e.key !== "Tab") return;
      const controls = Array.from(
        deckRoot.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length > 0 && !element.closest("[hidden]"),
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !deckRoot.current?.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !deckRoot.current?.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (root) root.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      deckOpener.current?.focus({ preventScroll: true });
    };
  }, [deckOpen, closeDeck]);

  const datasets = datasetsQuery.data ?? [];
  const dataset = datasets.find((d) => d.id === selectedId) ?? datasets[0];

  const queryClient = useQueryClient();

  // measure the loaded record in the background as soon as one is chosen; the
  // needle drop only waits for this query, never for a re-render
  const specQuery = useQuery({
    queryKey: ["spec", selectedId],
    queryFn: () => api.spec(selectedId),
    enabled: Boolean(selectedId),
    staleTime: 0,
  });

  const spec = specQuery.data ?? null;

  // Main's score and player are authoritative. The legacy spec only dresses
  // the painted world; it never schedules the sound on this comparison branch.
  const mainTrackQuery = useQuery({
    ...trackQuery(selectedId),
    enabled: Boolean(selectedId),
  });
  const mainScoreQuery = useQuery({
    ...scoreQuery(selectedId, snapshot.preset),
    enabled: Boolean(selectedId),
  });

  const loadMain = useCallback((track: TrackDetail, score: Score) => {
    if (
      player.getSnapshot().trackId === track.id &&
      loadedScore.current === score
    )
      return;
    player.load({ trackId: track.id, score, theme: track.theme });
    loadedScore.current = score;
  }, []);

  useEffect(() => {
    // Sample-bank downloads must not compete with the first-start film.
    if (boot === "live" && mainTrackQuery.data && mainScoreQuery.data)
      loadMain(mainTrackQuery.data, mainScoreQuery.data);
  }, [boot, mainTrackQuery.data, mainScoreQuery.data, loadMain]);

  // The cabinet and the Data Deck share one volume and one playing state.
  useEffect(() => {
    player.setVolume(useUI.getState().volume);
    const unsubscribe = useUI.subscribe((state, previous) => {
      if (
        state.volume !== previous.volume &&
        state.volume !== player.getSnapshot().volume
      )
        player.setVolume(state.volume);
    });
    return () => {
      unsubscribe();
      player.unload();
    };
  }, []);

  useEffect(() => {
    setPlaying(isPlaying);
    setVolume(snapshot.volume);
    if (isPlaying && snapshot.trackId) {
      setPowered(true);
      setArrived();
      setLoaded(snapshot.trackId);
    }
  }, [
    isPlaying,
    snapshot.volume,
    snapshot.trackId,
    setPlaying,
    setVolume,
    setPowered,
    setArrived,
    setLoaded,
  ]);

  // Meter the actual main audio graph, not the old rendered MP3 or a visual
  // proxy. Its playhead follows main's tension-dependent tempo in every mode.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let idleFrame = -1;
    let frequencies = new Uint8Array(0);
    let waveform = new Uint8Array(0);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 80) return;
      last = now;
      const state = player.getSnapshot();
      const head = player.getPlayhead();
      if (state.status !== "playing") {
        if (idleFrame === state.frame) return;
        idleFrame = state.frame;
        setLevel(0);
        setProgress(state.frameCount ? state.frame / state.frameCount : 0);
        setSpectrum((s) => (s.length ? [] : s));
        return;
      }
      idleFrame = -1;
      setProgress(
        state.frameCount
          ? ((head?.frame ?? state.frame) + (head?.progress ?? 0)) /
              state.frameCount
          : 0,
      );
      const analyser = player.analyser;
      if (!analyser) return;
      if (frequencies.length !== analyser.frequencyBinCount)
        frequencies = new Uint8Array(analyser.frequencyBinCount);
      if (waveform.length !== analyser.fftSize)
        waveform = new Uint8Array(analyser.fftSize);
      analyser.getByteFrequencyData(frequencies);
      analyser.getByteTimeDomainData(waveform);
      let energy = 0;
      for (const value of waveform) energy += ((value - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(energy / waveform.length)));
      const out: number[] = [];
      for (let i = 0; i < 26; i++)
        out.push(
          (frequencies[Math.floor((i / 26) * frequencies.length * 0.5)] ?? 0) /
            255,
        );
      setSpectrum(out);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [setLevel]);

  const play = useCallback(async () => {
    if (
      !mainTrackQuery.data ||
      !mainScoreQuery.data ||
      snapshot.mode === "explore"
    )
      return;
    if (playPending.current) return;
    const requested = selectedId;
    const sequence = ++playSequence.current;
    playPending.current = true;
    try {
      loadMain(mainTrackQuery.data, mainScoreQuery.data);
      mechanism.needle();
      await player.play();
      const current = player.getSnapshot();
      const valid =
        mounted.current &&
        sequence === playSequence.current &&
        useUI.getState().powered &&
        !useUI.getState().filmUp;
      if (!valid) {
        if (current.trackId === requested) player.pause();
        return;
      }
      if (current.status === "playing" && current.trackId === requested)
        announce(
          `${dataset?.short ?? selectedId} is playing with main's ${snapshot.preset} sound.`,
        );
    } finally {
      playPending.current = false;
    }
  }, [
    mainTrackQuery.data,
    mainScoreQuery.data,
    snapshot.mode,
    snapshot.preset,
    loadMain,
    announce,
    dataset,
    selectedId,
  ]);

  const togglePlay = useCallback(async () => {
    if (snapshot.mode === "explore") return;
    if (player.getSnapshot().status === "playing" || playPending.current) {
      playSequence.current += 1;
      player.pause();
      announce("Needle lifted.");
      return;
    }
    if (!powered) {
      setPowered(true);
      setArrived();
    }
    await play();
  }, [
    snapshot.mode,
    isPlaying,
    play,
    powered,
    setPowered,
    setArrived,
    announce,
  ]);

  const throwSwitch = useCallback(() => {
    void mechanism.unlock();
    if (!powered) {
      mechanism.switchOn();
      setPowered(true);
      setArrived();
      showPose("greet", 2600);
      announce("Cabinet on. Loading a record…");
      // light up, then load a disc and drop the needle on its own
      window.clearTimeout(powerTimer.current);
      powerTimer.current = window.setTimeout(() => {
        const state = useUI.getState();
        if (mounted.current && state.powered && !state.filmUp)
          void chooseRef.current(state.selectedId, true, true);
      }, 720);
    } else {
      window.clearTimeout(powerTimer.current);
      pickSequence.current += 1;
      playSequence.current += 1;
      setFlying(false);
      mechanism.switchOff();
      player.pause();
      player.seek(0);
      setPlaying(false);
      setPowered(false);
      setLoaded("");
      announce("Cabinet off.");
    }
  }, [
    powered,
    setPowered,
    setArrived,
    setPlaying,
    setLoaded,
    announce,
    showPose,
  ]);

  /** Pull a disc out of the crate; it flies into the cradle, then plays. */
  const chooseDisc = useCallback(
    async (id: string, autoPlay = true, forceFly = false) => {
      const sequence = ++pickSequence.current;
      playSequence.current += 1;
      setArrived();
      if (id !== selectedId) showPose("point", 2100);
      if (!powered) {
        setPowered(true);
        mechanism.switchOn();
      }
      const prev = selectedId;
      if (id === prev && !forceFly) {
        if (autoPlay && !isPlaying) void play();
        return;
      }
      const from = discRefs.current[id]?.getBoundingClientRect();
      const to = cradleRef.current?.getBoundingClientRect();
      select(id);
      mechanism.transport();
      player.pause();
      setPlaying(false);
      if (from && to) {
        setFlying(true);
        await flyDisc({
          from,
          to,
          labelUrl: api.frameUrl(id),
          duration: 780,
          lift: 120,
        });
        if (mounted.current && sequence === pickSequence.current)
          setFlying(false);
      }
      if (
        !mounted.current ||
        sequence !== pickSequence.current ||
        !useUI.getState().powered
      )
        return;
      mechanism.index(1);
      announce(
        `Disc loaded: ${datasets.find((d) => d.id === id)?.short ?? id}.`,
      );
      if (autoPlay) {
        // measure the new disc, then drop the needle on it
        try {
          const preset = player.getSnapshot().preset;
          const [track, score] = await Promise.all([
            queryClient.fetchQuery(trackQuery(id)),
            queryClient.fetchQuery(scoreQuery(id, preset)),
          ]);
          // A later crate pick or power-off cancels this pending needle drop.
          if (
            !mounted.current ||
            sequence !== pickSequence.current ||
            useUI.getState().selectedId !== id ||
            !useUI.getState().powered
          )
            return;
          loadMain(track, score);
          mechanism.needle();
          if (player.getSnapshot().mode !== "explore") await player.play();
          if (
            !mounted.current ||
            sequence !== pickSequence.current ||
            !useUI.getState().powered
          ) {
            if (player.getSnapshot().trackId === id) player.pause();
            return;
          }
          setLoaded(id);
          announce(`Loaded ${track.title}. ${track.audio_key}`);
        } catch {
          /* the spec query will surface the error in the strip */
        }
      }
    },
    [
      powered,
      selectedId,
      isPlaying,
      play,
      select,
      setPowered,
      setArrived,
      setPlaying,
      announce,
      datasets,
      queryClient,
      showPose,
      loadMain,
      setLoaded,
    ],
  );

  const chooseRef = useRef(chooseDisc);
  chooseRef.current = chooseDisc;

  /** the picture has reached the frame the live cabinet is drawn to match */
  const reachMatch = useCallback(() => setBoot("match"), []);

  /** Promo mode (`?promo=1`) clicks the real controls so a recording shows the
   * genuine site: the real disc flight, iris, playhead and sound engine. */
  useEffect(() => {
    if (!promoMode()) return;
    return runPromo(PROMO_JUKEBOX);
  }, []);

  /**
   * The film explains the idea; the character explains the controls. She only
   * speaks if the visitor just stands there, and never twice in one session.
   */
  useEffect(() => {
    if (boot !== "live") return;
    if (sessionStorage.getItem("tt-toured")) return;
    if (promoMode()) return; // a recording drives itself
    if (new URLSearchParams(window.location.search).has("notour")) return;
    const timer = window.setTimeout(() => setGuidePrompt(true), 6000);
    const cancel = () => window.clearTimeout(timer);
    const opts = { once: true } as AddEventListenerOptions;
    window.addEventListener("pointerdown", cancel, opts);
    window.addEventListener("keydown", cancel, opts);
    window.addEventListener("wheel", cancel, opts);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", cancel);
      window.removeEventListener("wheel", cancel);
    };
  }, [boot, setGuidePrompt]);

  /** The film is gone; show the idle standing figure and invite interaction. */
  const finishFilm = useCallback(() => {
    setBoot("live");
    announce(
      "The Earth Information Jukebox. The Earth is lit in the dome and the cabinet is warm. Press the jewel on the speaker to put a record on the turntable and drop the needle.",
    );
  }, [announce]);

  if (datasetsQuery.isLoading) return <LoadingDoor />;

  if (datasetsQuery.isError || !dataset) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="tt-paper max-w-md p-6 text-center">
          <h2 className="font-display text-lg font-semibold text-ink">
            The jukebox is unplugged
          </h2>
          <p className="mt-1 text-[12px] font-semibold text-ink-soft">
            Start the engine, then reload:
          </p>
          <code className="mt-2 block rounded-lg bg-[#3a2716] p-3 text-left text-[11px] text-[#ffe9b8]">
            cd backend && uvicorn app.main:app --port 8000
          </code>
        </div>
      </div>
    );
  }

  // until the visitor does something, the world stays where the film left them
  const scene = arrived ? sceneFor(dataset.model, dataset.id) : ARRIVAL_SCENE;

  return (
    <div className="relative">
      {boot !== "live" && <BootFilm onMatch={reachMatch} onDone={finishFilm} />}
      {/* the character talks the visitor through the cabinet once the film has gone */}
      {boot === "live" && <Guide />}

      {/*
        One stage, full screen. The cabinet is the subject and stands on the
        painted world; the disc button sits on the left, the title above it, and
        everything else waits below the fold.
      */}
      <section
        aria-label="The jukebox"
        inert={boot !== "live" || deckOpen}
        className="stage-full relative flex w-full items-end justify-center overflow-hidden pb-6 pt-1 sm:pb-5"
      >
        <h1 className="sr-only">The Earth Information Jukebox</h1>

        <div
          ref={stageRef}
          className="relative z-10"
          style={{ width: "min(94vw, 800px, calc((100svh - 150px) * 0.854))" }}
        >
          <Cabinet
            datasets={datasets}
            selectedId={selectedId}
            powered={powered}
            playing={isPlaying}
            onPower={throwSwitch}
            onPlay={() => void togglePlay()}
            level={storeLevel}
            spectrum={spectrum}
            progress={progress}
            cradleRef={cradleRef}
          />

          {/* Cloud-shaped explanation bubble near the top of the jukebox, pointing left toward the dome */}
          <div className="pointer-events-auto absolute top-[5%] left-[calc(100%+18px)] z-30 hidden w-[clamp(225px,18vw,284px)] lg:block">
            {/* Fluffy cloud-puff lobes behind the main cloud body */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-3.5 left-6 h-10 w-16 rounded-full border-t border-[#fff6e0]/90 bg-[#fdf6e7]/95 shadow-sm"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -top-5 left-16 h-12 w-24 rounded-full border-t border-[#fff6e0]/90 bg-[#fffaf0]/95 shadow-sm"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -top-2.5 right-6 h-9 w-16 rounded-full border-t border-[#fff6e0]/90 bg-[#fdf6e7]/95 shadow-sm"
            />
            {/* Cloud pointer puffs trailing left toward the jukebox dome */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-3.5 top-9 h-5 w-6 -rotate-12 rounded-full border border-[#e3c38d]/80 bg-[#fbf0da]/95 shadow-md"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -left-7 top-11 h-3.5 w-4 rounded-full border border-[#e3c38d]/80 bg-[#fbf0da]/95 shadow-md"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -left-10 top-12 h-2.5 w-2.5 rounded-full border border-[#e3c38d]/80 bg-[#fbf0da]/95 shadow-sm"
            />

            <div
              className="relative rounded-[36px] border border-[#e3c38d]/85 px-4 py-3.5 shadow-[0_18px_38px_-14px_rgba(28,18,8,0.55),inset_0_2px_10px_rgba(255,255,255,0.85)] backdrop-blur-md"
              style={{
                background:
                  "radial-gradient(120% 110% at 50% 10%, rgba(255,252,244,0.97) 0%, rgba(250,238,212,0.95) 68%, rgba(241,221,182,0.93) 100%)",
              }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="font-display text-[8px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                  now playing
                </p>
                <span className="rounded-full bg-[#3a2716d9] px-2 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.14em] text-[#ffe9b8]">
                  {MODEL_WORD[dataset.model] ?? dataset.model}
                </span>
              </div>
              <p className="mt-0.5 font-display text-[15px] font-semibold leading-tight text-ink">
                {dataset.short}
              </p>
              <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-snug text-[#3a2a18d9]">
                {spec?.explain ?? dataset.description}
              </p>
              <button
                type="button"
                onClick={openDeck}
                aria-expanded={deckOpen}
                data-guide="deck"
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-[#ffd79a]/80 bg-[#3a2716] px-4 py-2.5 font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8] shadow-[0_8px_18px_-6px_rgba(28,18,8,0.7)] transition hover:scale-[1.02] hover:bg-[#52371f]"
              >
                <Compass size={14} className="text-[#ffd79a]" />
                Open Data Deck
              </button>
              {flying && (
                <p className="mt-1 text-center text-[7.5px] font-bold text-[#a2641f]">
                  disc in transit…
                </p>
              )}
            </div>
          </div>

          <Girl
            wrapRef={girlRef}
            pose={pose}
            weather={weatherFor(scene)}
            level={storeLevel}
            playing={isPlaying}
          />
        </div>

        {/* the record crate: a disc that opens into the whole collection */}
        <button
          type="button"
          onClick={openDeck}
          aria-expanded={deckOpen}
          className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border-2 border-[#b27a34] bg-[#fff0cf] px-4 py-3 font-display text-xs font-bold text-[#3a2819] shadow-lg lg:hidden"
        >
          <Compass size={16} /> Open Data Deck
        </button>

        <DiscSelector
          datasets={datasets}
          selectedId={selectedId}
          playing={isPlaying}
          powered={powered}
          onPick={(id) => void chooseDisc(id, true)}
          discRefs={discRefs}
        />
      </section>

      {/* Button-activated modal drawer with translucent background so the world shines through */}
      {/* portalled to <body>: inside <main> (z-10) it could never cover the
          site header (z-40), and the two bars overlapped */}
      {deckOpen &&
        createPortal(
          <div
            ref={deckRoot}
            role="dialog"
            aria-modal="true"
            aria-label="NASA Sonification Story and Frame Analysis Deck"
            className="deck-portal fixed inset-0 z-[70]"
            style={
              {
                "--ox": `${deckOrigin.x}px`,
                "--oy": `${deckOrigin.y}px`,
                pointerEvents: deck === "closing" ? "none" : undefined,
              } as React.CSSProperties
            }
          >
            {/* the deck: dimmed, blurred world + cards, revealed by the iris */}
            <div
              className={`deck-iris absolute inset-0 overflow-y-auto lg:flex lg:h-full lg:flex-col lg:overflow-hidden bg-[#120c07]/45 backdrop-blur-[4px] ${
                deck === "open" ? "deck-in" : ""
              }`}
              onClick={(e) => {
                if (e.target === e.currentTarget) closeDeck();
              }}
            >
              <div className="deck-item sticky top-0 z-30 border-b border-[#ffd79a]/30 bg-[#161009]/92 px-4 py-2.5 backdrop-blur-md sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      ref={deckBack}
                      type="button"
                      onClick={closeDeck}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#ffd79a]/60 bg-[#2a1d11] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#ffe9b8] transition hover:bg-[#3a2818]"
                    >
                      <ArrowLeft size={13} />
                      Back to Jukebox Stage
                    </button>
                    <div className="hidden sm:block">
                      <p className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-[#ffd79a]">
                        NASA Earth Information Jukebox · Data &amp; Sonification
                        Story
                      </p>
                      <p className="font-display text-[13px] font-semibold text-[#ffe9b8]">
                        {dataset.title}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void togglePlay()}
                      disabled={
                        snapshot.mode === "explore" || mainScoreQuery.isLoading
                      }
                      title={
                        snapshot.mode === "explore"
                          ? "Move over the map to listen in Explore mode"
                          : undefined
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#ffd79a] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2a1b0e] transition hover:bg-[#ffe6bc]"
                    >
                      {isPlaying ? (
                        <Pause size={12} />
                      ) : (
                        <Play size={12} className="translate-x-[0.5px]" />
                      )}
                      {isPlaying ? "Pause Sonification" : "Play Sonification"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:h-0 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                <NowPlaying
                  dataset={dataset}
                  spec={spec}
                  loading={mainScoreQuery.isLoading || mainTrackQuery.isLoading}
                  playing={isPlaying}
                  progress={progress}
                  onToggle={() => void togglePlay()}
                />
              </div>
            </div>
            {/* the brass rim riding the edge of the iris */}
            <div
              aria-hidden
              className="deck-rim pointer-events-none absolute inset-0"
            />
            {/* the flare bursting out of the button */}
            <div
              ref={deckFlare}
              aria-hidden
              className="pointer-events-none absolute h-40 w-40 rounded-full opacity-0"
              style={{
                left: deckOrigin.x,
                top: deckOrigin.y,
                background:
                  "radial-gradient(closest-side, rgba(255,246,214,.95), rgba(255,207,125,.6) 40%, rgba(255,160,70,.2) 70%, transparent)",
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
