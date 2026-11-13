import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

const POSES = ['/art/pose-greet-sprite.webp', '/art/pose-point-sprite.webp', '/art/pose-listen-sprite.webp']
const LINES = ['Oh — you made it.', 'That one. The wooden one. It plays the planet.', 'Sit with me. Listen.']
const HOLD_MS = [2600, 2200, 2200]
/** how long the exit takes: bars slide off, the meadow settles, the layer fades */
const LEAVE_MS = 1000
const EASE = 'cubic-bezier(.4,0,.2,1)'

/**
 * The opening cut scene.
 *
 * Three hand-drawn frames of the girl, over the same meadow the World paints.
 * On exit the letterbox bars slide off-screen, the meadow eases back to the
 * World's framing (scale 1), and the layer cross-fades onto the live stage,
 * which starts arriving underneath at the same moment (`onLeave`). `onDone`
 * fires once the fade is over so the parent can unmount this layer.
 */
export function Intro({ onLeave, onDone }: { onLeave: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState(0) // 0 greet, 1 point, 2 listen, 3 leaving
  const [pushed, setPushed] = useState(false)
  const leaving = phase === 3

  // keep the latest callbacks without re-arming the timers when they change
  const cb = useRef({ onLeave, onDone })
  cb.current = { onLeave, onDone }

  // decode every pose up front so a pose change never shows a blank frame
  useEffect(() => {
    for (const src of POSES) {
      const img = new Image()
      img.src = src
      void img.decode?.().catch(() => {})
    }
    // start the slow push-in on the next frame so the transition runs
    const raf = requestAnimationFrame(() => setPushed(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (leaving) {
      cb.current.onLeave()
      const t = window.setTimeout(() => cb.current.onDone(), LEAVE_MS)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setPhase((p) => p + 1), HOLD_MS[phase])
    return () => window.clearTimeout(t)
  }, [phase, leaving])

  const shown = Math.min(phase, 2)
  // the meadow pushes in slowly while the scene plays, then settles back to
  // the World's own framing so the hand-off has no jump
  const meadowTransform = leaving
    ? 'scale(1) translate3d(0,0,0)'
    : pushed
      ? 'scale(1.12) translate3d(-1%,-1.5%,0)'
      : 'scale(1.02) translate3d(0,0,0)'

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${LEAVE_MS * 0.7}ms ${EASE} ${LEAVE_MS * 0.3}ms`,
        pointerEvents: leaving ? 'none' : undefined,
      }}
      aria-label="Introduction"
    >
      <img
        src="/art/world-meadow.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
        style={{
          transform: meadowTransform,
          transition: `transform ${leaving ? LEAVE_MS : 9000}ms ${leaving ? EASE : 'ease-out'}`,
        }}
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_45%,transparent_35%,rgba(16,12,6,.55)_100%)]"
        style={{ opacity: leaving ? 0 : 1, transition: `opacity ${LEAVE_MS}ms ${EASE}` }}
      />

      {/* letterbox bars: they slide off the frame when the scene ends */}
      <div
        className="absolute inset-x-0 top-0 h-[7vh] bg-[#0a0805] will-change-transform"
        style={{ transform: leaving ? 'translateY(-100%)' : 'none', transition: `transform ${LEAVE_MS * 0.7}ms ${EASE}` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[7vh] bg-[#0a0805] will-change-transform"
        style={{ transform: leaving ? 'translateY(100%)' : 'none', transition: `transform ${LEAVE_MS * 0.7}ms ${EASE}` }}
      />

      {/* everything in the frame fades first, so only the meadow is left to hand over */}
      <div style={{ opacity: leaving ? 0 : 1, transition: `opacity ${LEAVE_MS * 0.4}ms ease-out` }}>
        {/* the girl, cut out and animated, standing left of frame */}
        <div
          key={shown}
          className="absolute bottom-[22vh] left-[6vw] flex h-[42vh] items-end md:bottom-[7vh] md:left-[7vw] md:h-[66vh]"
          style={{ animation: 'intro-figure 700ms ease-out both' }}
        >
          <img
            src={POSES[shown]}
            alt="A girl in a mustard hoodie and brass headphones, greeting you, then pointing at the jukebox."
            className="h-full w-auto object-contain object-bottom drop-shadow-[0_24px_40px_rgba(10,8,4,.6)]"
            style={{
              transition: 'transform .7s cubic-bezier(.34,1.56,.64,1)',
              transform: shown === 1 ? 'translateX(-2%)' : 'none',
            }}
          />
        </div>

        {/* her line, in a hand-lettered plate, in the right half of the frame */}
        <div className="absolute inset-x-0 bottom-[13vh] flex justify-center px-3 md:inset-x-auto md:bottom-auto md:left-[56%] md:top-[42%] md:block md:w-[38vw] md:max-w-[440px] md:px-0">
          <p
            key={`line-${shown}`}
            className="max-w-[34ch] rounded-2xl border border-[#ffe9b8]/45 px-5 py-3 text-center font-display text-[clamp(15px,1.9vw,22px)] font-semibold leading-snug text-[#fff3d4] shadow-[0_18px_40px_-18px_rgba(0,0,0,.9)] backdrop-blur-md"
            style={{ animation: 'line-in 520ms ease-out both', background: 'rgba(18,14,8,.9)' }}
          >
            {LINES[shown]}
          </p>
        </div>

        <button
          onClick={() => setPhase(3)}
          disabled={leaving}
          className="absolute bottom-[8.5vh] left-1/2 -translate-x-1/2 rounded-full border border-[#ffe9b8]/40 bg-[#120e08]/70 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffe9b8] transition hover:bg-[#120e08]/90"
        >
          skip <ChevronDown size={11} className="ml-1 inline" />
        </button>

        {/* frame counter, like a title card */}
        <div className="absolute right-4 top-[8vh] font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-[#ffe9b8]/60">
          {String(shown + 1).padStart(2, '0')} / 03
        </div>
      </div>
    </div>
  )
}
