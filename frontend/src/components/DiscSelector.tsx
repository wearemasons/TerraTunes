import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Disc3, X } from 'lucide-react'
import { api } from '../lib/api'
import type { Dataset } from '../lib/types'
import { sceneFor } from '../lib/world'
import { VinylDisc } from './VinylDisc'

/**
 * The record crate.
 *
 * It lives in the bottom right, out of the cabinet's way, and opens as a list
 * rather than a jumble of tiny discs: nine records, each with its NASA frame on
 * the label, what it measures, the years it covers, how many frames it has — and
 * the world the page will turn into if you choose it, because that is the real
 * difference between the records.
 */
export function DiscSelector({
  datasets,
  selectedId,
  playing,
  powered,
  onPick,
  discRefs,
}: {
  datasets: Dataset[]
  selectedId: string
  playing: boolean
  powered: boolean
  onPick: (id: string) => void
  discRefs: React.RefObject<Record<string, HTMLElement | null>>
}) {
  const [open, setOpen] = useState(false)
  // once you scroll down to the frame and the analysis, the crate steps aside
  const [scrolled, setScrolled] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const selected = datasets.find((d) => d.id === selectedId) ?? datasets[0]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 140)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    // start on the record that is actually playing, not on the first one
    const first = listRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
    ;(first ?? listRef.current?.querySelector<HTMLButtonElement>('button'))?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
      if (e.key === 'Tab') {
        // keep the wheel inside the panel while it is open
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
        if (!items.length) return
        const i = items.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && (i <= 0 || document.activeElement === panelRef.current)) {
          e.preventDefault()
          items[items.length - 1]?.focus()
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault()
          items[0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div
      className={`pointer-events-none absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2 transition-all duration-300 md:bottom-6 md:right-6 ${
        scrolled && !open ? 'pointer-events-none translate-y-3 opacity-0' : 'opacity-100'
      }`}
    >
      <div className="pointer-events-auto relative">
        {open &&
          createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-end p-2 sm:p-4">
              <div
                className="absolute inset-0 bg-[#0b0906]/45 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Choose a record from the crate"
                tabIndex={-1}
                className="dark-card relative flex max-h-[86vh] w-[min(96vw,720px)] flex-col overflow-hidden rounded-[26px] border border-[#e3c38d]/70 bg-[#fff8e8]/[.97] shadow-[0_44px_100px_-32px_rgba(0,0,0,.95)]"
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#e3c38d]/60 px-4 py-3">
                  <div>
                    <p className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                      <Disc3 size={13} /> the crate · {datasets.length} records
                    </p>
                    <p className="mt-0.5 max-w-[46ch] text-[11px] font-semibold leading-snug text-[#3a2a18cc]">
                      Each one is a year of NASA frames. Choosing one changes the sound, the picture and the world
                      behind the cabinet.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setOpen(false)
                      triggerRef.current?.focus()
                    }}
                    aria-label="Close the crate"
                    className="shrink-0 rounded-full border border-[#8a5a1c]/45 p-1.5 text-[#6b4517] transition hover:bg-[#e8b96f33]"
                  >
                    <X size={14} />
                  </button>
                </div>

                <ul ref={listRef} className="grid flex-1 gap-1.5 overflow-y-auto p-2.5 sm:grid-cols-2">
                  {datasets.map((d, i) => {
                    const active = d.id === selectedId
                    const world = sceneFor(d.model, d.id)
                    return (
                      <li key={d.id}>
                        <button
                          onClick={() => {
                            onPick(d.id)
                            setOpen(false)
                            triggerRef.current?.focus()
                          }}
                          aria-pressed={active}
                          aria-label={`Record ${i + 1}: ${d.title}${active ? ', on the turntable now' : ''}`}
                          className={`rack-slot flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition ${
                            active
                              ? 'border-[#a2641f] bg-[#ffe1ac]/80 shadow-[0_0_0_1px_rgba(162,100,31,.35),0_10px_22px_-12px_rgba(60,40,10,.7)]'
                              : 'border-[#e3c38d]/55 bg-[#fffdf6]/70 hover:border-[#a2641f]/70 hover:bg-[#ffedd0]'
                          }`}
                        >
                          <span
                            ref={(el) => {
                              discRefs.current[d.id] = el
                            }}
                            className="shrink-0"
                          >
                            <VinylDisc
                              id={d.id}
                              size={74}
                              spinning={active && playing}
                              labelUrl={api.frameUrl(d.id)}
                              title={d.short}
                              style={{ filter: 'drop-shadow(0 5px 8px rgba(0,0,0,.5))' }}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-1.5">
                              <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[#a2641f]">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <span className="truncate font-display text-[13.5px] font-semibold leading-tight text-[#2f2112]">
                                {d.short}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#3a2a18a6]">
                              {d.sensor} · {d.year_range}
                              {d.frameCount ? ` · ${d.frameCount} frames` : ''}
                            </span>
                            <span
                              className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] ${
                                active ? 'bg-[#3a2716] text-[#ffe9b8]' : 'bg-[#e8d3a5]/70 text-[#5d4016]'
                              }`}
                            >
                              {active ? (powered ? 'on the turntable' : 'cabinet off — will load') : world.label}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <p className="border-t border-[#e3c38d]/60 px-4 py-2 text-[10px] font-semibold text-[#3a2a18a6]">
                  Escape closes · the world behind the cabinet changes with the record
                </p>
              </div>
            </div>,
            document.body,
          )}

        {/* the button itself: one record, sized like a 12-inch single */}
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={open ? 'Close the crate' : `Choose a record — now playing ${selected?.short ?? ''}`}
          className="group relative block rounded-full outline-offset-4 transition-transform duration-200 hover:scale-[1.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffe9b8] active:scale-95"
        >
          <span
            className="absolute -inset-3 rounded-full opacity-70 blur-xl transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background: powered
                ? 'radial-gradient(circle, rgba(255,196,110,.55), transparent 70%)'
                : 'radial-gradient(circle, rgba(120,140,160,.3), transparent 70%)',
            }}
          />
          {selected && (
            <VinylDisc
              id={selected.id}
              size={98}
              spinning={playing}
              labelUrl={api.frameUrl(selected.id)}
              title={selected.short}
              style={{ filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.78))' }}
            />
          )}
          {!open && (
            <span className="pointer-events-none absolute right-1/2 top-1 mr-1 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-full border border-[#ffe9b84d] bg-[#120e08]/92 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8] shadow-lg">
              the crate · {datasets.length}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
