import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Compass, Pause, Play } from 'lucide-react'
import { api } from '../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { phenomena } from '../lib/audio/phenomena'
import { mechanism } from '../lib/audio/mechanism'
import { useUI } from '../lib/store'
import { flyDisc } from '../lib/discFlight'
import { Cabinet } from '../components/Cabinet'
import { DiscSelector } from '../components/DiscSelector'
import { Intro } from '../components/Intro'
import { NowPlaying } from '../components/NowPlaying'
import { Girl } from '../components/Girl'
import { sceneFor } from '../lib/world'
import { LoadingDoor } from '../components/LoadingDoor'

const DECK_OPEN_MS = 820
/** closing replays the opening backwards at this speed */
const DECK_CLOSE_SPEED = 1.7
/** slow start, fast middle, long soft landing: reads as the iris "pouring" open */
const DECK_EASE = 'cubic-bezier(.7,0,.18,1)'

const MODEL_WORD: Record<string, string> = {
  wind: 'Airflow',
  storm: 'Storm',
  fire: 'Fire',
  ocean: 'Ocean',
  city: 'City lights',
  canopy: 'Canopy',
  plume: 'Plume',
  space: 'Deep space',
}

export function JukeboxPage() {
  const datasetsQuery = useQuery({ queryKey: ['datasets'], queryFn: api.datasets })
  const {
    powered,
    setPowered,
    selectedId,
    select,
    started,
    setStarted,
    isPlaying,
    setPlaying,
    volume,
    announce,
    setLevel,
    level: storeLevel,
  } = useUI()

  const [spectrum, setSpectrum] = useState<number[]>([])
  const [progress, setProgress] = useState(0)
  const [flying, setFlying] = useState(false)
  /*
   * The Data Deck opens like a portal out of the button that summoned it: an
   * iris (`--deck-r`, one animated radius) reveals the deck, a brass rim rides
   * the edge of the iris, a flare bursts from the button, then the deck's
   * cards fade in one after another. Closing plays the same animations
   * backwards, faster, and the iris collapses back into the button.
   */
  const [deck, setDeck] = useState<'closed' | 'open' | 'closing'>('closed')
  const [deckOrigin, setDeckOrigin] = useState({ x: 0, y: 0 })
  const deckOpener = useRef<HTMLButtonElement | null>(null)
  const deckBack = useRef<HTMLButtonElement>(null)
  const deckRoot = useRef<HTMLDivElement>(null)
  const deckFlare = useRef<HTMLDivElement>(null)
  const deckAnims = useRef<Animation[]>([])
  const cradleRef = useRef<HTMLDivElement>(null)
  const discRefs = useRef<Record<string, HTMLElement | null>>({})

  const openDeck = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (deckAnims.current.length) return // already opening, open or closing
    const r = e.currentTarget.getBoundingClientRect()
    deckOpener.current = e.currentTarget
    setDeckOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    setDeck('open')
  }, [])

  const closeDeck = useCallback(() => setDeck((d) => (d === 'open' ? 'closing' : d)), [])

  // start the opening before the first paint, so the deck never flashes in full
  useLayoutEffect(() => {
    if (deck !== 'open' || deckAnims.current.length) return
    const root = deckRoot.current
    if (!root) return
    const { x, y } = deckOrigin
    // far enough to clear the farthest corner of the screen, at any window size
    const R = Math.hypot(Math.max(x, screen.width - x), Math.max(y, screen.height - y)) + 40
    const quick = useUI.getState().reduceMotion
    const iris = root.animate([{ '--deck-r': '0px' }, { '--deck-r': `${R}px` }] as Keyframe[], {
      duration: quick ? 1 : DECK_OPEN_MS,
      easing: DECK_EASE,
      fill: 'forwards',
    })
    const anims = [iris]
    if (deckFlare.current && !quick) {
      anims.push(
        deckFlare.current.animate(
          [
            { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.95 },
            { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 },
          ],
          { duration: DECK_OPEN_MS * 0.8, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
        ),
      )
    }
    deckAnims.current = anims
    let t = 0
    void iris.finished.then(
      () => {
        if (iris.playbackRate > 0) t = window.setTimeout(() => deckBack.current?.focus({ preventScroll: true }), 0)
      },
      () => {},
    )
    return () => window.clearTimeout(t)
  }, [deck, deckOrigin])

  // close: run the very same animations backwards (from wherever they are, so
  // closing mid-opening never jumps), then unmount and hand focus back
  useEffect(() => {
    if (deck !== 'closing') return
    const anims = deckAnims.current
    if (!anims.length) {
      setDeck('closed')
      return
    }
    for (const a of anims) {
      a.playbackRate = DECK_CLOSE_SPEED
      a.reverse()
    }
    let alive = true
    void Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (!alive) return
        deckAnims.current = []
        setDeck('closed')
        deckOpener.current?.focus({ preventScroll: true })
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [deck])

  const deckOpen = deck !== 'closed'

  useEffect(() => {
    if (!deckOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDeck()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deckOpen, closeDeck])

  const datasets = datasetsQuery.data ?? []
  const dataset = datasets.find((d) => d.id === selectedId) ?? datasets[0]

  const queryClient = useQueryClient()

  // measure the loaded record in the background as soon as one is chosen; the
  // needle drop only waits for this query, never for a re-render
  const specQuery = useQuery({
    queryKey: ['spec', selectedId],
    queryFn: () => api.spec(selectedId),
    enabled: Boolean(selectedId),
    staleTime: 0,
  })

  const spec = specQuery.data ?? null

  // Prime the player with the measured spec, but never yank a record that is
  // already turning: `load()` stops the transport.
  useEffect(() => {
    if (spec && !phenomena.isPlaying && phenomena.getSpec() !== spec) phenomena.load(spec)
  }, [spec])

  useEffect(() => {
    phenomena.setVolume(volume)
  }, [volume])

  // meter + halo data
  useEffect(() => {
    let raf = 0
    let last = 0
    let idle = false
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 80) return
      last = t
      // nothing is turning: publish silence once, then stop touching state so
      // the page (and the intro above it) is not re-rendered 12 times a second
      if (!phenomena.isPlaying) {
        if (idle) return
        idle = true
        setLevel(0)
        setProgress(phenomena.progress)
        setSpectrum((s) => (s.length ? [] : s))
        return
      }
      idle = false
      setLevel(phenomena.getLevel())
      setProgress(phenomena.progress)
      const d = phenomena.getFrequencyData()
      if (d) {
        const out: number[] = []
        for (let i = 0; i < 26; i++) out.push(d[Math.floor((i / 26) * d.length * 0.5)] / 255)
        setSpectrum(out)
      } else {
        setSpectrum((s) => (s.length ? [] : s))
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [setLevel])

  const play = useCallback(async () => {
    if (!spec) return
    await phenomena.init()
    if (phenomena.getSpec() !== spec) phenomena.load(spec)
    mechanism.needle()
    await phenomena.play(0)
    setPlaying(true)
    announce(`${dataset.short} is playing. ${spec.explain}`)
  }, [spec, dataset, setPlaying, announce])

  const togglePlay = useCallback(async () => {
    if (!powered) return
    if (isPlaying) {
      phenomena.stop()
      setPlaying(false)
      announce('Needle lifted.')
      return
    }
    await play()
  }, [powered, isPlaying, play, setPlaying, announce])

  const throwSwitch = useCallback(() => {
    void mechanism.unlock()
    if (!powered) {
      mechanism.switchOn()
      setPowered(true)
      setStarted(true)
      announce('Cabinet on. Loading a record…')
      // light up, then load a disc and drop the needle on its own
      window.setTimeout(() => void chooseRef.current(useUI.getState().selectedId, true, true), 720)
    } else {
      mechanism.switchOff()
      phenomena.stop()
      setPlaying(false)
      setPowered(false)
      announce('Cabinet off.')
    }
  }, [powered, setPowered, setStarted, setPlaying, announce])

  /** Pull a disc out of the crate; it flies into the cradle, then plays. */
  const chooseDisc = useCallback(
    async (id: string, autoPlay = true, forceFly = false) => {
      if (!powered) {
        setPowered(true)
        setStarted(true)
        mechanism.switchOn()
      }
      const prev = selectedId
      if (id === prev && !forceFly) {
        if (autoPlay && !isPlaying) void play()
        return
      }
      const from = discRefs.current[id]?.getBoundingClientRect()
      const to = cradleRef.current?.getBoundingClientRect()
      select(id)
      mechanism.transport()
      phenomena.stop()
      setPlaying(false)
      if (from && to) {
        setFlying(true)
        await flyDisc({ from, to, labelUrl: api.frameUrl(id), duration: 780, lift: 120 })
        setFlying(false)
      }
      mechanism.index(1)
      announce(`Disc loaded: ${datasets.find((d) => d.id === id)?.short ?? id}.`)
      if (autoPlay) {
        // measure the new disc, then drop the needle on it
        try {
          const next = await queryClient.fetchQuery({
            queryKey: ['spec', id],
            queryFn: () => api.spec(id),
            staleTime: 1000 * 60 * 30,
          })
          await phenomena.init()
          phenomena.load(next)
          mechanism.needle()
          await phenomena.play(0)
          setPlaying(true)
          announce(`Playing ${datasets.find((d) => d.id === id)?.short ?? id}. ${next.explain}`)
        } catch {
          /* the spec query will surface the error in the strip */
        }
      }
    },
    [powered, selectedId, isPlaying, play, select, setPowered, setStarted, setPlaying, announce, datasets, queryClient],
  )

  const chooseRef = useRef(chooseDisc)
  chooseRef.current = chooseDisc

  // the cut scene plays once per visit; returning to this route skips it
  const [introOn, setIntroOn] = useState(() => !useUI.getState().started)

  /** the cut scene is leaving: start the stage arriving underneath it */
  const leaveIntro = useCallback(() => {
    setStarted(true)
    announce('The Earth Information Jukebox. Throw the brass switch to load a record.')
  }, [setStarted, announce])

  /** the cut scene has faded out: drop its layer */
  const finishIntro = useCallback(() => setIntroOn(false), [])

  if (datasetsQuery.isLoading) return <LoadingDoor />

  if (datasetsQuery.isError || !dataset) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="tt-paper max-w-md p-6 text-center">
          <h2 className="font-display text-lg font-semibold text-ink">The jukebox is unplugged</h2>
          <p className="mt-1 text-[12px] font-semibold text-ink-soft">
            Start the engine, then reload:
          </p>
          <code className="mt-2 block rounded-lg bg-[#3a2716] p-3 text-left text-[11px] text-[#ffe9b8]">
            cd backend && uvicorn app.main:app --port 8000
          </code>
        </div>
      </div>
    )
  }

  const scene = sceneFor(dataset.model, dataset.id)
  return (
    <>
    {/* outside the animated wrapper: a transformed ancestor would re-anchor
        this fixed layer and its opacity would hide the cross-fade */}
    {introOn && <Intro onLeave={leaveIntro} onDone={finishIntro} />}
    <div className="relative">

      {/*
        One stage, full screen. The cabinet is the subject and stands on the
        painted world; the disc button sits on the left, the title above it, and
        everything else waits below the fold.
      */}
      <section
        aria-label="The jukebox"
        className="stage-full relative flex w-full items-end justify-center overflow-hidden pb-6 pt-1 sm:pb-5"
      >
        <h1 className="sr-only">The Earth Information Jukebox</h1>

        <div className="relative z-10" style={{ width: 'min(94vw, 800px, calc((100svh - 150px) * 0.854))' }}>
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
                  'radial-gradient(120% 110% at 50% 10%, rgba(255,252,244,0.97) 0%, rgba(250,238,212,0.95) 68%, rgba(241,221,182,0.93) 100%)',
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
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-[#ffd79a]/80 bg-[#3a2716] px-4 py-2.5 font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8] shadow-[0_8px_18px_-6px_rgba(28,18,8,0.7)] transition hover:scale-[1.02] hover:bg-[#52371f]"
              >
                <Compass size={14} className="text-[#ffd79a]" />
                Open Data Deck
              </button>
              {flying && <p className="mt-1 text-center text-[7.5px] font-bold text-[#a2641f]">disc in transit…</p>}
            </div>
          </div>

          <Girl
            pose={!started ? 'greet' : isPlaying ? 'listen' : 'point'}
            weather={scene.rain ? 'rain' : scene.kind === 'storm' ? 'wind' : 'calm'}
            level={storeLevel}
            playing={isPlaying}
          />
        </div>

        {/* the record crate: a disc that opens into the whole collection */}
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
      {deckOpen && createPortal(
        <div
          ref={deckRoot}
          role="dialog"
          aria-modal="true"
          aria-label="NASA Sonification Story and Frame Analysis Deck"
          className="deck-portal fixed inset-0 z-[70]"
          style={
            {
              '--ox': `${deckOrigin.x}px`,
              '--oy': `${deckOrigin.y}px`,
              pointerEvents: deck === 'closing' ? 'none' : undefined,
            } as React.CSSProperties
          }
        >
          {/* the deck: dimmed, blurred world + cards, revealed by the iris */}
          <div
            className={`deck-iris absolute inset-0 overflow-y-auto lg:flex lg:flex-col bg-[#120c07]/45 backdrop-blur-[4px] ${
              deck === 'open' ? 'deck-in' : ''
            }`}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDeck()
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
                    NASA Earth Information Jukebox · Data &amp; Sonification Story
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
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#ffd79a] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2a1b0e] transition hover:bg-[#ffe6bc]"
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} className="translate-x-[0.5px]" />}
                  {isPlaying ? 'Pause Sonification' : 'Play Sonification'}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:min-h-0 lg:flex-1">
            <NowPlaying
              dataset={dataset}
              spec={spec}
              loading={specQuery.isLoading}
              playing={isPlaying}
              progress={progress}
              onToggle={() => void togglePlay()}
            />
          </div>
          </div>
          {/* the brass rim riding the edge of the iris */}
          <div aria-hidden className="deck-rim pointer-events-none absolute inset-0" />
          {/* the flare bursting out of the button */}
          <div
            ref={deckFlare}
            aria-hidden
            className="pointer-events-none absolute h-40 w-40 rounded-full opacity-0"
            style={{
              left: deckOrigin.x,
              top: deckOrigin.y,
              background:
                'radial-gradient(closest-side, rgba(255,246,214,.95), rgba(255,207,125,.6) 40%, rgba(255,160,70,.2) 70%, transparent)',
            }}
          />
        </div>,
        document.body,
      )}

    </div>
    </>
  )
}
