import { useEffect, useRef, useState } from 'react'
import { useUI } from '../lib/store'

/**
 * The girl by the cabinet.
 *
 * She is no longer a slideshow of cut-outs. Each pose is a short, seamlessly
 * looped clip — her hair and coat lifting in the wind, the turn of her arm as
 * she waves, the small settle of her shoulders while she listens — keyed out of
 * a green screen with alpha, so she stands in the same light as the world
 * behind her.
 *
 * Every clip has a painted still underneath it: if the video cannot be decoded
 * she is simply there, motionless, rather than missing. Motion is not allowed to
 * be the only way she exists.
 */

const POSE = {
  greet: { video: '/video/girl-greet.webm', still: '/art/girl-greet.webp', w: 242, h: 546 },
  point: { video: '/video/girl-point.webm', still: '/art/girl-point.webp', w: 288, h: 437 },
  listen: { video: '/video/girl-listen.webm', still: '/art/girl-listen.webp', w: 258, h: 387 },
} as const

export type GirlPose = keyof typeof POSE

export function Girl({
  pose = 'listen',
  weather = 'calm',
  level,
  playing,
  wrapRef,
}: {
  pose?: GirlPose
  weather?: 'calm' | 'wind' | 'rain'
  level: number
  playing: boolean
  /** handed to the opening film's match-move, which needs to know where she is */
  wrapRef?: React.Ref<HTMLDivElement>
}) {
  const reduceMotion = useUI((s) => s.reduceMotion)
  const [t, setT] = useState(0)
  const [shown, setShown] = useState<GirlPose[]>([pose])
  const [live, setLive] = useState<GirlPose | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // warm all three clips once, so changing pose is a cut and not a wait
  useEffect(() => {
    for (const p of Object.values(POSE)) {
      const img = new Image()
      img.src = p.still
    }
  }, [])

  useEffect(() => {
    if (reduceMotion) return
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      setT((now - t0) / 1000)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion])

  // cross-fade between poses instead of snapping a cut-out in
  useEffect(() => {
    setShown((prev) => (prev.includes(pose) ? prev : [...prev.filter((p) => p === pose), pose]))
    const hold = window.setTimeout(() => setShown((prev) => prev.filter((p) => p === pose)), 560)
    return () => window.clearTimeout(hold)
  }, [pose])

  // her hair and coat keep moving with the weather even when she is still
  const gust = weather === 'calm' ? 0.1 : weather === 'wind' ? 0.5 : 0.85
  const sway = Math.sin(t * (weather === 'rain' ? 1.5 : 0.85)) * gust + Math.sin(t * 0.33) * 0.12
  const bob = playing ? Math.sin(t * 1.6) * level * 0.5 : 0

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[46%] select-none" aria-hidden>
      {shown.map((p) => {
        const spec = POSE[p]
        const sitting = p === 'listen'
        const here = p === pose
        return (
          <div
            key={p}
            className={`absolute ${
              sitting
                ? 'bottom-[0%] left-[clamp(-56%,-19vw,-13%)] h-[clamp(160px,26vh,300px)] md:left-[clamp(-76%,-25vw,-18%)] md:h-[clamp(210px,38vh,400px)]'
                : 'bottom-[1%] left-[clamp(-52%,-17vw,-11%)] h-[clamp(230px,40vh,430px)] md:left-[clamp(-52%,-17vw,-11%)] md:h-[clamp(340px,58vh,620px)]'
            }`}
            style={{
              aspectRatio: `${spec.w} / ${spec.h}`,
              opacity: here ? 1 : 0,
              transform: `rotate(${(sway * 1.1 + bob * 0.25).toFixed(3)}deg)`, // no vertical bob (staging)
              transformOrigin: '50% 100%',
              filter: 'drop-shadow(0 14px 16px rgba(20,12,6,.5))',
              transition: 'opacity .5s ease',
            }}
          >
            {/* the painting: always there, fading out only once she moves */}
            <img
              src={spec.still}
              alt=""
              width={spec.w}
              height={spec.h}
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain object-bottom"
              style={{
                opacity: here && live === p ? 0 : 1,
                transition: 'opacity .7s ease',
                filter: weather === 'rain' ? 'brightness(.94) saturate(.95)' : undefined,
              }}
            />
            {here && !reduceMotion && (
              <video
                ref={videoRef}
                src={spec.video}
                className="absolute inset-0 h-full w-full object-contain object-bottom"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-hidden
                style={{ opacity: live === p ? 1 : 0, transition: 'opacity .7s ease' }}
                onPlaying={() => setLive(p)}
                onEnded={() => setLive(null)}
                onError={() => setLive(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
