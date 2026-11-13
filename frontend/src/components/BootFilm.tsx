import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlignLeft, ChevronDown, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { BOOT_CUES, BOOT_FILM, BOOT_HINT, BOOT_TRANSCRIPT, cueAt } from '../lib/boot'
import { useUI } from '../lib/store'

type Status = 'waiting' | 'rolling' | 'frozen' | 'still'

/**
 * The opening film, playing once, before the cabinet is ever touched.
 *
 * It arrives with sound: the narration, the score and one window of genuine
 * NASA sonification. Browsers refuse to start audio before a visitor has touched
 * anything, so when that refusal happens the captions keep telling the story and
 * the first click, tap or key anywhere starts the voice where the picture
 * already is. Nothing waits for a permission nobody asked for.
 *
 * Muting is one control, always on screen, and the whole narration is readable
 * as text. With reduced motion the film never rolls at all: one held frame, the
 * text, and silence until it is asked for.
 *
 * At `matchAt` the picture freezes on the frame that the live page is composed
 * like, the cross-fade starts, and the last sentence finishes over the real
 * cabinet. If the film cannot load, or motion is reduced, the same frame is
 * shown as a still with the text beside it: nothing about the fallback loses
 * the story.
 */
export function BootFilm({ onMatch, onDone }: { onMatch: () => void; onDone: () => void }) {
  const reduceMotion = useUI((s) => s.reduceMotion)
  const highContrast = useUI((s) => s.highContrast)
  const announce = useUI((s) => s.announce)

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const matchedRef = useRef(false)
  const doneRef = useRef(false)

  const [status, setStatus] = useState<Status>(reduceMotion ? 'still' : 'waiting')
  const [caption, setCaption] = useState(-1)
  const [narration, setNarration] = useState(true)
  /** true once the browser has actually let the voice through */
  const [heard, setHeard] = useState(false)
  const [paused, setPaused] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [reading, setReading] = useState(false)

  /** the overlay never keeps you waiting: skip, and the cabinet is yours */
  const finish = useCallback(
    (quick = false) => {
      if (doneRef.current) return
      doneRef.current = true
      const v = videoRef.current
      const a = audioRef.current
      if (v) v.pause()
      if (a) a.pause()
      if (!matchedRef.current) {
        matchedRef.current = true
        onMatch()
      }
      window.setTimeout(onDone, quick ? 260 : 0)
    },
    [onDone, onMatch],
  )

  // A still film is not a film: with motion reduced we show the one frame the
  // page already matches, and let the reader take the story at their own pace.
  useEffect(() => {
    if (!reduceMotion || status !== 'waiting') return
    setStatus('still')
  }, [reduceMotion, status])

  useEffect(() => {
    if (status === 'still') skipRef.current?.focus()
  }, [status])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'still') {
        e.preventDefault()
        finish(true)
      }
      if (e.key === 'Escape' && reading) setReading(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, reading, status])

  // Keep the caption on the spoken line, and hand over when the picture reaches
  // the frame the live cabinet is drawn to match.
  useEffect(() => {
    if (status !== 'rolling') return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const v = videoRef.current
      if (!v) return
      const t = v.currentTime
      setCaption(cueAt(t))
      const a = audioRef.current
      if (a && !a.paused && Math.abs(a.currentTime - t) > 0.12) a.currentTime = t
      if (t >= BOOT_FILM.matchAt) {
        cancelAnimationFrame(raf)
        v.pause()
        setStatus('frozen')
        if (!matchedRef.current) {
          matchedRef.current = true
          onMatch()
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [status, onMatch])

  // Once the picture has frozen, let go when the cross-fade is done — or when
  // the last sentence is, if the narration was turned on. This lives in its own
  // effect because the fade itself changes the status, and a timer set inside
  // the effect it invalidates would be cleared the moment it was started.
  useEffect(() => {
    if (status !== 'frozen') return
    const hold = narration
      ? (BOOT_FILM.audioEnd - BOOT_FILM.matchAt) * 1000 + 320
      : BOOT_FILM.fadeMs
    const id = window.setTimeout(() => finish(), hold)
    return () => window.clearTimeout(id)
  }, [status, narration, finish])

  /**
   * Ask for the sound. If autoplay is blocked, the next gesture gets it: the
   * picture keeps running, so a silent opening still opens.
   */
  const tryNarration = useCallback(
    (quiet = false) => {
      const a = audioRef.current
      const v = videoRef.current
      if (!a || !v) return
      a.currentTime = v.currentTime
      a
        .play()
        .then(() => setHeard(true))
        .catch(() => {
          if (quiet) return
          setNarration(false)
          const wake = () => {
            window.removeEventListener('pointerdown', wake)
            window.removeEventListener('keydown', wake)
            setNarration(true)
            void tryNarration(true)
          }
          window.addEventListener('pointerdown', wake)
          window.addEventListener('keydown', wake)
        })
    },
    [],
  )

  const startRolling = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    try {
      await v.play()
      setNeedsGesture(false)
      setStatus('rolling')
      tryNarration()
    } catch {
      // some browsers refuse even a silent video: ask once, in plain sight
      setNeedsGesture(true)
      setStatus('rolling')
    }
  }, [tryNarration])

  const toggleNarration = useCallback(async () => {
    const a = audioRef.current
    const v = videoRef.current
    if (!a || !v) return
    if (a.paused) {
      a.currentTime = v.currentTime
      await a.play()
      setNarration(true)
      setHeard(true)
      announce('Narration on. The words are also on screen as captions.')
    } else {
      a.pause()
      setNarration(false)
      announce('Narration off. The captions tell the same story.')
    }
  }, [announce])

  const togglePause = useCallback(() => {
    const v = videoRef.current
    const a = audioRef.current
    if (!v || status === 'frozen') return
    if (v.paused) {
      void v.play()
      if (narration && a) void a.play()
      setPaused(false)
    } else {
      v.pause()
      if (narration && a) a.pause()
      setPaused(true)
    }
  }, [narration, status])

  const frozen = status === 'frozen'
  const isStill = status === 'still'
  const gone = frozen ? 0 : 1

  // the film belongs to the whole window, not to the page it is introducing:
  // inside <main> it would sit in that stacking context and the header, with
  // its own z-index, would paint over the picture
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="TerraTunes opening film"
      aria-hidden={frozen}
      className="fixed inset-0 z-[60] overflow-hidden bg-[#0a0805]"
      style={{
        opacity: isStill ? 1 : gone,
        transition: `opacity ${BOOT_FILM.fadeMs}ms cubic-bezier(.4,0,.2,1), visibility 0s linear ${BOOT_FILM.fadeMs}ms`,
        // an invisible overlay must not sit between the visitor and the cabinet
        pointerEvents: frozen ? 'none' : undefined,
        visibility: frozen ? 'hidden' : undefined,
        // no drift on the film: the live page is the thing that moves onto the
        // film's framing (src/lib/matchCut.ts), and scaling this overlay would
        // change the crop the match was measured against
      }}
    >
      {!isStill && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={BOOT_FILM.video}
          poster={BOOT_FILM.poster}
          muted
          autoPlay
          playsInline
          preload="auto"
          aria-hidden
          onCanPlay={() => void (videoRef.current?.paused ? startRolling() : setStatus('rolling'))}
          onError={() => setStatus('still')}
        />
      )}

      {/* the sound lives beside the picture, not inside it: the film can freeze
          on its match frame while the last sentence is still being said */}
      {!isStill && (
        <audio
          ref={audioRef}
          src={BOOT_FILM.audio}
          preload="auto"
          aria-hidden
          onEnded={() => setNarration(false)}
        />
      )}

      {/* one frame, held: the fallback and the reduced-motion path are the same
          image the live page is built to match */}
      {isStill && (
        <img src="/art/boot-match.webp" alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(85%_70%_at_50%_45%,transparent_38%,rgba(10,8,5,.6)_100%)]" />
      {!isStill && (
        <>
          <div className="absolute inset-x-0 top-0 h-[6vh] bg-[#0a0805]" />
          <div className="absolute inset-x-0 bottom-0 h-[6vh] bg-[#0a0805]" />
        </>
      )}

      {/* the controls: all of them reachable, none of them required */}
      <div className="absolute right-3 top-[7vh] z-10 flex items-center gap-1.5 rounded-full border border-[#ffe9b8]/30 bg-[#120e08]/80 p-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() => void toggleNarration()}
          disabled={isStill}
          aria-pressed={narration}
          aria-label={narration ? 'Turn the narration off' : 'Hear the narration'}
          title={narration ? (heard ? 'Narration on' : 'Sound is waiting for a click') : 'Hear the narration'}
          className="rounded-full p-2 text-[#ffe9b8] transition hover:bg-[#ffe9b8]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#fff0c4] disabled:opacity-40"
        >
          {narration ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button
          type="button"
          onClick={togglePause}
          disabled={isStill || frozen}
          aria-label={paused ? 'Resume the film' : 'Pause the film'}
          className="rounded-full p-2 text-[#ffe9b8] transition hover:bg-[#ffe9b8]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#fff0c4] disabled:opacity-40"
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          type="button"
          onClick={() => setReading((r) => !r)}
          aria-expanded={reading}
          aria-label="Read the film as text"
          className="rounded-full p-2 text-[#ffe9b8] transition hover:bg-[#ffe9b8]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#fff0c4]"
        >
          <AlignLeft size={15} />
        </button>
      </div>

      {/* the narration, as a readable page, not only as timed captions */}
      {reading && (
        <div className="absolute inset-x-0 top-0 z-20 flex min-h-[40vh] items-center justify-center bg-[#0a0805]/88 p-6 backdrop-blur-md">
          <div className="max-w-[46ch]">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-[#ffd79a]">
              the film, in words
            </p>
            <ol className="mt-3 space-y-2.5">
              {BOOT_CUES.map((c) => (
                <li
                  key={c.text}
                  className="border-l-2 border-[#ffd79a]/50 pl-3 font-display text-[15px] leading-snug text-[#fff3d4]"
                >
                  {c.text}
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setReading(false)}
              className="mt-4 rounded-full border border-[#ffe9b8]/45 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* captions: the story on screen whether or not the sound is on */}
      {!isStill && (
        <div className="absolute inset-x-0 bottom-[13vh] z-10 flex justify-center px-4" aria-live="polite">
          <p
            key={caption}
            className={`max-w-[38ch] rounded-2xl px-4 py-2.5 text-center font-display text-[clamp(14px,1.8vw,20px)] font-semibold leading-snug shadow-[0_16px_36px_-16px_rgba(0,0,0,.9)] ${
              highContrast ? 'border-2 border-[#fff3d4] bg-[#000] text-[#fff]' : 'bg-[#120e08]/78 text-[#fff3d4] backdrop-blur-md'
            } ${caption < 0 ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
            style={{ animation: caption >= 0 ? 'boot-line 460ms ease-out both' : undefined }}
          >
            {caption >= 0 ? BOOT_CUES[caption].text : ''}
          </p>
        </div>
      )}

      {isStill && (
        <div className="absolute inset-x-0 bottom-0 top-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-[42ch] font-display text-[clamp(15px,2vw,21px)] font-semibold leading-snug text-[#fff3d4]">
            {BOOT_TRANSCRIPT}
          </p>
          <button
            ref={skipRef}
            type="button"
            onClick={() => finish(true)}
            className="rounded-full border border-[#ffd79a]/70 bg-[#3a2716] px-5 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffe9b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff0c4]"
          >
            Enter the jukebox
          </button>
        </div>
      )}

      {/* autoplay is never assumed, not even for a silent picture */}
      {needsGesture && status === 'rolling' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0805]/70">
          <button
            type="button"
            onClick={() => void startRolling()}
            className="rounded-full border border-[#ffd79a]/70 bg-[#3a2716] px-5 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffe9b8]"
          >
            Play the opening film
          </button>
        </div>
      )}

      {frozen && (
        <p className="absolute inset-x-0 bottom-[9vh] z-10 animate-[rise-in_.5s_ease-out_both] text-center font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffe9b8]/85">
          {BOOT_HINT}
        </p>
      )}

      {/* sound is the default; if the browser is holding it back, say so */}
      {!isStill && narration && !heard && (
        <p className="absolute bottom-[7vh] left-4 z-10 rounded-full border border-[#ffe9b8]/30 bg-[#120e08]/70 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8]/80">
          Click once for the narration
        </p>
      )}
      {!isStill && !narration && (
        <p className="absolute bottom-[7vh] left-4 z-10 rounded-full border border-[#ffe9b8]/30 bg-[#120e08]/70 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8]/80">
          {BOOT_SOUND_OFF}
        </p>
      )}

      <button
        type="button"
        onClick={() => finish(true)}
        className="absolute bottom-[6.5vh] left-1/2 z-10 -translate-x-1/2 rounded-full border border-[#ffe9b8]/40 bg-[#120e08]/70 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffe9b8] transition hover:bg-[#120e08]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff0c4]"
      >
        {isStill ? 'skip' : 'skip to the cabinet'} <ChevronDown size={11} className="ml-1 inline" />
      </button>
    </div>,
    document.body,
  )
}
import { BOOT_SOUND_OFF } from '../lib/boot'
