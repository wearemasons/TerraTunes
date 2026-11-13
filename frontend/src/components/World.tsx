import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../lib/world'
import { SCENE_ART } from '../lib/world'
import { useUI } from '../lib/store'

/**
 * The world behind the cabinet.
 *
 * One hand-painted backdrop per phenomenon, cross-faded rather than swapped,
 * topped with live weather that is drawn rather than painted: rain with
 * individual streaks and splash rings, multi-branch lightning, drifting cumulus
 * with lit bellies, aurora curtains, pollen and ash and blown leaves, fireflies
 * and window lights, sea mist, heat shimmer, sun shafts and a flock of birds.
 * Everything is a layer of the same scene, so choosing a record changes the
 * place you are standing in — and the whole world leans, very slightly, when
 * you move.
 */
export function World({ scene, powered, level }: { scene: Scene; powered: boolean; level: number }) {
  const reduceMotion = useUI((s) => s.reduceMotion)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  // pre-warm the next backdrop so a new record dissolves instead of flashing
  useEffect(() => {
    const img = new Image()
    img.src = scene.art
  }, [scene.art])

  // a shallow parallax: the sky moves least, the light on the ground most
  useEffect(() => {
    if (reduceMotion) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      setTilt({ x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduceMotion])

  const shift = (d: number) =>
    reduceMotion ? undefined : `translate3d(${(-tilt.x * d).toFixed(2)}%, ${(-tilt.y * d * 0.5).toFixed(2)}%, 0)`

  const day = !scene.dark

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* ---- the painted backdrop, cross-faded on scene change ---- */}
      <div className="absolute -inset-[2%]" style={{ transform: shift(0.7), transition: 'transform .5s ease-out' }}>
        {SCENE_ART.map((art) => {
          const on = scene.art === art
          if (on && loaded !== art) queueMicrotask(() => setLoaded(art))
          return (
            <img
              key={art}
              src={art}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: on ? 1 : 0,
                transform: on ? 'scale(1.02)' : 'scale(1)',
                transition: 'opacity 1.2s ease, transform 14s linear',
              }}
            />
          )
        })}
      </div>

      {/* ---- a slow grade so every sky reads at the same exposure ---- */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: scene.dark
            ? 'linear-gradient(to bottom, rgba(6,10,20,.34) 0%, rgba(6,10,20,.10) 42%, rgba(8,10,14,.42) 100%)'
            : 'linear-gradient(to bottom, rgba(255,240,200,.06) 0%, rgba(255,236,196,.02) 45%, rgba(60,44,20,.20) 100%)',
        }}
      />

      {/* ---- sun shafts: light coming through the weather ---- */}
      {day && <Rays scene={scene} />}

      {/* ---- cumulus: painted clouds drifting in front of the art ---- */}
      <div className="absolute inset-0" style={{ transform: shift(1.5), transition: 'transform .6s ease-out' }}>
        <Clouds scene={scene} />
      </div>

      {/* ---- birds, only where it is daylight ---- */}
      {day && <Flock scene={scene} still={reduceMotion} />}

      {/* ---- heat shimmer over dry ground ---- */}
      {(scene.kind === 'heat' || scene.kind === 'ozone') && <Shimmer />}

      {/* ---- sea mist and rain fog, low on the ground ---- */}
      {(scene.kind === 'sea' || scene.kind === 'rain' || scene.kind === 'haze') && <Mist scene={scene} />}

      {/* ---- aurora curtains ---- */}
      {scene.aurora > 0 && <Aurora intensity={scene.aurora} />}

      {/* ---- rain: streaks with splash rings ---- */}
      {scene.rain > 0 && <Rain count={scene.rain} />}

      {/* ---- snow / spray ---- */}
      {scene.snow > 0 && <Snow count={scene.snow} />}

      {/* ---- lightning: branches and a whole-sky flash ---- */}
      {scene.lightning > 0 && <Lightning perMinute={scene.lightning} />}

      {/* ---- pollen, ash, spray, blown leaves ---- */}
      {scene.motes > 0 && <Motes count={scene.motes} color={scene.moteColor} />}

      {/* ---- fireflies, and the window lights of a city at dusk ---- */}
      {scene.fireflies > 0 && <Fireflies count={scene.fireflies} city={scene.kind === 'traffic' || scene.kind === 'night'} />}

      {/* ---- the cabinet's light on the ground ---- */}
      <div
        className="absolute inset-x-0 bottom-0 h-[46%] transition-opacity duration-700"
        style={{
          background: `radial-gradient(60% 100% at 50% 100%, ${scene.glow} 0%, transparent 72%)`,
          opacity: powered ? 0.55 + Math.min(0.3, level * 1.6) : 0.1,
          transform: shift(2.4),
        }}
      />

      {/* ---- vignette ---- */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(118% 92% at 50% 46%, transparent 44%, ${scene.vignette} 100%)`,
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ clouds */

function Clouds({ scene }: { scene: Scene }) {
  if (scene.cloudCount <= 0) return null
  return (
    <div className="absolute inset-0">
      {Array.from({ length: scene.cloudCount }, (_, i) => {
        const seed = (i * 97) % 100
        const top = 2 + ((seed * 7) % 44)
        const scale = 0.5 + ((seed * 13) % 70) / 100
        const dur = (90 + ((seed * 31) % 90)) / scene.cloudSpeed
        const delay = -((seed * 17) % dur)
        return (
          <div
            key={i}
            className="cloud absolute"
            style={{
              top: `${top}%`,
              width: `${18 * scale}vw`,
              height: `${7 * scale}vw`,
              left: '-30vw',
              opacity: scene.cloudOpacity * (0.6 + ((seed % 30) / 100)),
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
              ['--drift' as string]: `${140 + scale * 40}vw`,
            }}
          >
            <CloudBlob colour={scene.cloud} />
          </div>
        )
      })}
    </div>
  )
}

/** one cumulus: a stack of soft lobes with a lit belly and a shadowed base */
function CloudBlob({ colour }: { colour: string }) {
  return (
    <svg viewBox="0 0 200 78" className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.95" />
          <stop offset="55%" stopColor={colour} stopOpacity="0.72" />
          <stop offset="100%" stopColor="#8fa6b4" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <g fill="url(#cl)">
        <ellipse cx="52" cy="50" rx="44" ry="24" />
        <ellipse cx="95" cy="38" rx="46" ry="30" />
        <ellipse cx="140" cy="50" rx="42" ry="23" />
        <ellipse cx="168" cy="58" rx="26" ry="15" />
        <ellipse cx="30" cy="60" rx="26" ry="14" />
      </g>
    </svg>
  )
}

/* -------------------------------------------------------------------- rays */

/** shafts of light, raked from the top corner the art puts its sun in */
function Rays({ scene }: { scene: Scene }) {
  const beams = [
    { x: 6, w: 13, o: 0.13, d: 17 },
    { x: 22, w: 8, o: 0.1, d: 23 },
    { x: 38, w: 16, o: 0.09, d: 19 },
    { x: 62, w: 9, o: 0.11, d: 26 },
    { x: 78, w: 14, o: 0.08, d: 21 },
  ]
  return (
    <div className="absolute inset-0 overflow-hidden opacity-80 mix-blend-screen" style={{ filter: 'blur(6px)' }}>
      {beams.map((b, i) => (
        <span
          key={i}
          className="absolute -top-[10%] block origin-top"
          style={{
            left: `${b.x}%`,
            width: `${b.w}%`,
            height: '92%',
            transform: 'skewX(-11deg)',
            background: `linear-gradient(to bottom, ${scene.cloud} 0%, rgba(255,246,220,${b.o}) 42%, transparent 88%)`,
            maskImage: 'linear-gradient(to bottom, #000 0%, transparent 92%)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, transparent 92%)',
            animation: `ray-breathe ${b.d}s ease-in-out infinite alternate`,
            animationDelay: `${-i * 3.5}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ flock */

function Flock({ scene, still }: { scene: Scene; still: boolean }) {
  const birds = [
    { top: 16, dur: 46, delay: -8, scale: 1, drift: 6 },
    { top: 21, dur: 58, delay: -26, scale: 0.72, drift: 4 },
    { top: 12, dur: 71, delay: -47, scale: 0.55, drift: 8 },
  ]
  return (
    <div className="absolute inset-0 overflow-hidden">
      {birds.map((b, i) => (
        <span
          key={i}
          className="bird absolute left-[-6vw]"
          style={{
            top: `${b.top}%`,
            width: `${18 * b.scale}px`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            animationPlayState: still ? 'paused' : 'running',
            ['--bob' as string]: `${b.drift}px`,
            opacity: 0.72,
          }}
        >
          <svg viewBox="0 0 40 14" className="w-full" fill="none" stroke={scene.dark ? '#dbe7f0' : '#3a3126'} strokeWidth="1.6">
            <path className="wing" d="M2 9 Q10 2 20 9 Q30 2 38 9" />
          </svg>
        </span>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- shimmer */

function Shimmer() {
  return (
    <div
      className="absolute inset-x-0 bottom-[26%] h-[9%] opacity-40 mix-blend-overlay"
      style={{
        background:
          'repeating-linear-gradient(to right, rgba(255,255,240,.0) 0 14px, rgba(255,250,225,.5) 14px 26px, rgba(255,255,240,0) 26px 40px)',
        maskImage: 'linear-gradient(to top, #000 10%, transparent 92%)',
        WebkitMaskImage: 'linear-gradient(to top, #000 10%, transparent 92%)',
        filter: 'blur(3px)',
        animation: 'shimmer 6.5s ease-in-out infinite alternate',
      }}
    />
  )
}

/* ------------------------------------------------------------------- mist */

function Mist({ scene }: { scene: Scene }) {
  const bands = [
    { bottom: 4, h: 16, dur: 34, o: 0.34, delay: 0 },
    { bottom: 12, h: 12, dur: 47, o: 0.24, delay: -18 },
    { bottom: 22, h: 9, dur: 61, o: 0.16, delay: -33 },
  ]
  return (
    <div className="absolute inset-x-0 bottom-0 h-[34%] overflow-hidden">
      {bands.map((b, i) => (
        <span
          key={i}
          className="absolute left-[-40%] block h-full w-[180%]"
          style={{
            bottom: `${b.bottom}%`,
            height: `${b.h}%`,
            background: `radial-gradient(60% 100% at 50% 60%, ${scene.cloud} 0%, transparent 74%)`,
            opacity: b.o,
            filter: 'blur(10px)',
            animation: `mist-drift ${b.dur}s linear infinite`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- aurora */

function Aurora({ intensity }: { intensity: number }) {
  const curtains = [
    { x: 12, w: 34, hue: '#5cf0c0', d: 26 },
    { x: 34, w: 42, hue: '#79ffd6', d: 34 },
    { x: 58, w: 30, hue: '#b48cff', d: 22 },
    { x: 74, w: 26, hue: '#6ee7ff', d: 30 },
  ]
  return (
    <div className="absolute inset-x-0 top-0 h-[68%] opacity-90" style={{ filter: 'blur(1px)' }}>
      {curtains.map((c, i) => (
        <div
          key={i}
          className="absolute top-0 h-full"
          style={{
            left: `${c.x}%`,
            width: `${c.w}%`,
            background: `linear-gradient(to bottom, transparent 0%, ${c.hue}${Math.round(
              40 + intensity * 55,
            ).toString(16)} 26%, ${c.hue}55 58%, transparent 92%)`,
            maskImage: 'radial-gradient(60% 100% at 50% 0%, #000 20%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(60% 100% at 50% 0%, #000 20%, transparent 78%)',
            transform: 'skewX(-9deg)',
            animation: `aurora-drift ${c.d}s ease-in-out infinite alternate`,
            animationDelay: `${-i * 3}s`,
            mixBlendMode: 'screen',
          }}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- rain */

function Rain({ count }: { count: number }) {
  const drops = Array.from({ length: count }, (_, i) => {
    const seed = (i * 137) % 997
    return {
      left: (seed % 1000) / 10,
      delay: -((seed % 400) / 100) * 1.6,
      dur: 0.55 + ((seed % 30) / 100),
      len: 12 + ((seed % 26) | 0),
      op: 0.2 + ((seed % 45) / 100),
      sway: ((seed % 7) - 3) * 0.9,
    }
  })
  const splashes = Array.from({ length: Math.round(count / 5) }, (_, i) => {
    const seed = (i * 271) % 991
    return {
      left: (seed % 1000) / 10,
      delay: -((seed % 300) / 100) * 1.4,
      dur: 0.9 + ((seed % 40) / 100),
      size: 12 + ((seed % 22) | 0),
    }
  })
  return (
    <div className="absolute inset-0 overflow-hidden">
      {drops.map((d, i) => (
        <span
          key={i}
          className="rain-streak absolute top-[-12%] block"
          style={{
            left: `${d.left}%`,
            height: d.len,
            width: 1.3,
            background: 'linear-gradient(to bottom, rgba(220,240,255,0), rgba(226,244,255,.95))',
            opacity: d.op,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
            transform: `rotate(${9 + d.sway}deg)`,
          }}
        />
      ))}
      {/* splash rings where the rain lands */}
      {splashes.map((s, i) => (
        <span
          key={`s${i}`}
          className="splash absolute bottom-[2%] rounded-[50%] border border-[#dff2ff]"
          style={{
            left: `${s.left}%`,
            width: s.size,
            height: s.size * 0.34,
            opacity: 0,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- snow */

function Snow({ count }: { count: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const seed = (i * 211) % 983
        return (
          <span
            key={i}
            className="absolute top-[-5%] rounded-full bg-white"
            style={{
              left: `${(seed % 1000) / 10}%`,
              width: 2 + (seed % 3),
              height: 2 + (seed % 3),
              opacity: 0.35 + (seed % 50) / 100,
              animation: `snow-fall ${7 + (seed % 9)}s linear infinite`,
              animationDelay: `${-((seed % 70) / 10)}s`,
            }}
          />
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- lightning */

function Lightning({ perMinute }: { perMinute: number }) {
  const [flash, setFlash] = useState(0)
  const [bolt, setBolt] = useState<string>('')
  const timer = useRef<number>(0)

  useEffect(() => {
    // a real storm does not flash on a metronome: Poisson gaps
    const meanGap = 60000 / Math.max(1, perMinute)
    const tick = () => {
      const gap = -Math.log(Math.random()) * meanGap + 900
      timer.current = window.setTimeout(() => {
        setBolt(makeBolt())
        setFlash((f) => f + 1)
        tick()
      }, gap)
    }
    tick()
    return () => window.clearTimeout(timer.current)
  }, [perMinute])

  return (
    <div key={flash} className="absolute inset-0 overflow-hidden">
      <div className="lightning-flash absolute inset-0 bg-[#dfeaff]" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ filter: 'drop-shadow(0 0 6px rgba(190,220,255,.95))' }}
      >
        <path d={bolt} fill="none" stroke="#f2f8ff" strokeWidth="0.55" strokeLinejoin="round" className="bolt-strike" />
        <path d={bolt} fill="none" stroke="#bcd9ff" strokeWidth="1.6" strokeLinejoin="round" opacity="0.35" className="bolt-strike" />
      </svg>
    </div>
  )
}

function makeBolt() {
  const x0 = 25 + Math.random() * 50
  let x = x0
  let y = 0
  let d = `M${x.toFixed(2)} 0`
  while (y < 46) {
    y += 3 + Math.random() * 5
    x += (Math.random() - 0.5) * 9
    d += ` L${x.toFixed(2)} ${y.toFixed(2)}`
    if (Math.random() < 0.3) {
      // a fork
      let fx = x
      let fy = y
      let fd = ` M${fx.toFixed(2)} ${fy.toFixed(2)}`
      for (let i = 0; i < 4; i++) {
        fy += 2 + Math.random() * 3
        fx += (Math.random() - 0.5) * 12
        fd += ` L${fx.toFixed(2)} ${fy.toFixed(2)}`
      }
      d += fd
    }
  }
  return d
}

/* ------------------------------------------------------------------- motes */

function Motes({ count, color }: { count: number; color: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const seed = (i * 313) % 977
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${(seed % 1000) / 10}%`,
              bottom: `${(seed % 40) / 2}%`,
              width: 2 + (seed % 4),
              height: 2 + (seed % 4),
              background: color,
              opacity: 0.35 + (seed % 40) / 100,
              filter: 'blur(0.4px)',
              animation: `mote-drift ${12 + (seed % 14)}s ease-in-out infinite`,
              animationDelay: `${-((seed % 90) / 10)}s`,
            }}
          />
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- fireflies */

/** golden blinkers in summer grass; steady window lights in a city at dusk */
function Fireflies({ count, city }: { count: number; city: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const seed = (i * 181) % 971
        const top = city ? 40 + ((seed % 22) / 2) : 45 + (seed % 50) / 2
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${(seed % 1000) / 10}%`,
              top: `${top}%`,
              width: city ? 2 : 3 + (seed % 3),
              height: city ? 2 : 3 + (seed % 3),
              background: city ? '#ffd8a0' : '#ffe9a0',
              boxShadow: city ? '0 0 5px 1px rgba(255,200,120,.5)' : '0 0 8px 3px rgba(255,222,130,.55)',
              animation: city ? `twinkle ${3 + (seed % 5)}s ease-in-out infinite` : `firefly ${6 + (seed % 8)}s ease-in-out infinite`,
              animationDelay: `${-((seed % 80) / 10)}s`,
            }}
          />
        )
      })}
    </div>
  )
}
