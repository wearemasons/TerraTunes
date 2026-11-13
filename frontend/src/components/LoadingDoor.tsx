import { useEffect, useState } from 'react'
import { useUI } from '../lib/store'

const WAITINGS = [
  'winding the cabinet…',
  'measuring the frames…',
  'scoring what the satellites saw…',
  'lowering the needle…',
]

/**
 * The wait, made short by being worth looking at.
 *
 * A record turns, the tonearm rocks over the label, and a caption changes every
 * couple of seconds so nobody wonders whether anything is happening. With
 * reduced motion the record simply sits there and the first caption stays: the
 * message is the point, not the movement.
 */
export function LoadingDoor({ label }: { label?: string }) {
  const reduceMotion = useUI((s) => s.reduceMotion)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (label || reduceMotion) return
    const t = window.setInterval(() => setI((v) => (v + 1) % WAITINGS.length), 2300)
    return () => window.clearInterval(t)
  }, [label, reduceMotion])

  const text = label ?? WAITINGS[i]

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[52vh] flex-col items-center justify-center gap-3.5 text-ink-soft"
    >
      <div className="relative" style={{ width: 112, height: 112 }}>
        {/* the record, seen from above at a slight tilt */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            transform: 'perspective(320px) rotateX(34deg)',
            background:
              'repeating-radial-gradient(circle at 50% 50%, #1a1410 0 1.6px, #241b15 1.6px 3.2px)',
            boxShadow: '0 12px 22px -10px rgba(20,12,4,.85), inset 0 0 0 1px rgba(255,232,180,.22)',
            animation: reduceMotion ? undefined : 'disc-spin 3.4s linear infinite',
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle at 40% 32%, #f7dfa9, #d9a860 62%, #a9752f)' }}
          />
          <div className="absolute left-1/2 top-1/2 h-[7%] w-[7%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#20160c]" />
        </div>
        {/* the tonearm, rocking as if it is finding its groove */}
        <svg
          viewBox="0 0 60 60"
          className="absolute -right-2 -top-1 h-16 w-16 origin-[78%_18%] text-[#c9a05e]"
          style={{ animation: reduceMotion ? undefined : 'arm-search 3.4s ease-in-out infinite' }}
          aria-hidden
        >
          <circle cx="47" cy="11" r="5" fill="currentColor" opacity=".9" />
          <path d="M47 11 L23 34" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M23 34 l-5 7" stroke="#f4e2b6" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      </div>

      <p className="font-display text-sm font-semibold">{text}</p>
      <div className="h-[3px] w-40 overflow-hidden rounded-full bg-[#c9a05e]/30">
        <div
          className="h-full w-1/3 rounded-full bg-[#b57a3a]"
          style={{ animation: reduceMotion ? undefined : 'door-travel 1.6s ease-in-out infinite' }}
        />
      </div>
    </div>
  )
}
