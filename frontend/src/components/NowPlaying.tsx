import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, MapPin, Pause, Play, Volume2 } from 'lucide-react'
import { api } from '../lib/api'
import type { Dataset } from '../lib/types'
import type { Spec, SpecCell } from '../lib/audio/phenomena'
import { Spectrum } from './Spectrum'

/** the one measured quantity each physical model is driven by */
const SIGNAL: Record<string, keyof SpecCell> = {
  wind: 'turbulence',
  storm: 'white',
  fire: 'hot',
  ocean: 'water',
  city: 'rel',
  canopy: 'green',
  plume: 'white',
  space: 'brightness',
}

/**
 * What scrolls up under the cabinet.
 *
 * The record's real NASA frame, the measurement grid, live scanline + hotspot
 * reticle, calibrated colorbar legend, pitch contour, tension timeline,
 * regions/alerts, transcript, and frame series.
 */
export function NowPlaying({
  dataset,
  spec,
  loading,
  playing,
  progress = 0,
  onToggle,
  onPick,
  datasets,
}: {
  dataset: Dataset
  spec: Spec | null
  loading: boolean
  playing: boolean
  progress?: number
  onToggle: () => void
  onPick: (id: string) => void
  datasets: Dataset[]
}) {
  const [showGrid, setShowGrid] = useState(true)
  const [manualFrame, setManualFrame] = useState<number | null>(null)
  const [infoTab, setInfoTab] = useState<'key' | 'regions' | 'transcript'>('key')

  useEffect(() => {
    setManualFrame(null)
  }, [dataset.id])

  const detail = spec?.terraDetail
  const score = spec?.terraScore
  const series = dataset.series ?? []
  const cells = spec?.grid.cells ?? []
  const totalFrames = score?.frames.length ?? dataset.frameCount ?? 1

  // Sync displayed frame to playback when playing (4.0 s per frame in sweep mode), unless user picked one
  const playTime = progress * (spec?.duration ?? 0)
  const playingFrame = Math.min(totalFrames - 1, Math.floor(playTime / 4.0))
  const scanX = playing ? ((playTime % 4.0) / 4.0) : null
  const activeFrame = manualFrame ?? (playing ? playingFrame : 0)
  const frameScore = score?.frames[activeFrame] ?? score?.frames[0]

  const frameWavesQuery = useQuery({
    queryKey: ['frame-waves', dataset.id, activeFrame],
    queryFn: () => api.frameWaves(dataset.id, activeFrame),
    enabled: Boolean(spec?.terraDetail),
    staleTime: 60_000,
  })
  const activeWaves = frameWavesQuery.data ?? spec?.colorWaves

  const signal = SIGNAL[spec?.model ?? dataset.model] ?? 'brightness'
  const recordIndex = Math.max(0, datasets.findIndex((d) => d.id === dataset.id))
  const prevRecord = datasets[(recordIndex - 1 + datasets.length) % datasets.length]
  const nextRecord = datasets[(recordIndex + 1) % datasets.length]

  const topCells = useMemo(
    () =>
      [...cells]
        .sort(
          (a, b) =>
            (b[signal] as number) - (a[signal] as number) || b.brightness - a.brightness,
        )
        .slice(0, 4),
    [cells, signal],
  )

  const legendGradient = useMemo(() => {
    const anchors = detail?.legend.anchors ?? []
    if (!anchors.length) return 'linear-gradient(to right, #1f3b73, #f4d06f, #b83227)'
    const stops = [...anchors]
      .sort((a, b) => a.position - b.position)
      .map((a) => `rgb(${a.rgb[0]} ${a.rgb[1]} ${a.rgb[2]}) ${(a.position * 100).toFixed(1)}%`)
    return `linear-gradient(to right, ${stops.join(', ')})`
  }, [detail])

  const contourPath = useMemo(() => {
    const notes = frameScore?.column_notes ?? []
    if (!notes.length) return ''
    const valid = notes.filter((n) => n >= 0)
    const minN = valid.length ? Math.min(...valid) : 48
    const maxN = valid.length ? Math.max(...valid) : 84
    const span = Math.max(12, maxN - minN)
    return notes
      .map((n, i) => {
        const x = (i / Math.max(1, notes.length - 1)) * 100
        const y = n < 0 ? 94 : 90 - ((n - minN) / span) * 78
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [frameScore])

  const wavePaths = useMemo(() => {
    const w = activeWaves
    if (!w) return null
    // Bipolar analog audio waveform centered at y=50 with subtle harmonic carrier modulation
    const toAnalogMirror = (arr: number[], phase = 0, scale = 44) => {
      if (!arr.length) return { top: '', bottom: '', area: '' }
      const topPts: [number, number][] = []
      const botPts: [number, number][] = []
      for (let i = 0; i < arr.length; i++) {
        const x = (i / Math.max(1, arr.length - 1)) * 100
        const v = Math.min(1, Math.max(0, arr[i] ?? 0))
        const carrier = 0.72 + 0.28 * Math.sin(i * 1.45 + phase)
        const amp = Math.max(0.8, v * scale * carrier)
        topPts.push([x, 50 - amp])
        botPts.push([x, 50 + amp])
      }
      const smooth = (pts: [number, number][]) => {
        let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1]!
          const [x1, y1] = pts[i]!
          const cx = ((x0 + x1) / 2).toFixed(1)
          d += ` C${cx},${y0.toFixed(1)} ${cx},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
        }
        return d
      }
      const top = smooth(topPts)
      const revBot = [...botPts].reverse()
      let area = top + ` L${revBot[0]![0].toFixed(1)},${revBot[0]![1].toFixed(1)}`
      for (let i = 1; i < revBot.length; i++) {
        const [x0, y0] = revBot[i - 1]!
        const [x1, y1] = revBot[i]!
        const cx = ((x0 + x1) / 2).toFixed(1)
        area += ` C${cx},${y0.toFixed(1)} ${cx},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
      }
      area += ' Z'
      return { top, bottom: smooth(botPts), area }
    }
    const cool = toAnalogMirror(w.cool, 0.0, 32)
    const mid = toAnalogMirror(w.mid, 1.3, 34)
    const hot = toAnalogMirror(w.hot, 2.2, 38)
    const peak = toAnalogMirror(w.peak, 0.7, 46)
    const scanBin =
      scanX !== null ? Math.min(w.peak.length - 1, Math.max(0, Math.round(scanX * (w.peak.length - 1)))) : 0
    const scanPeak = scanX !== null ? (w.peak[scanBin] ?? 0) : Math.max(...w.peak, 0)
    return { cool, mid, hot, peak, scanPeak }
  }, [activeWaves, scanX])

  return (
    <section id="now-playing" aria-label="The record on the turntable" className="relative z-10 px-3 pb-16 pt-2 sm:px-6">
      {/* ---------------- NASA Earth Story & Multi-Instrument Sonification Banner ---------------- */}
      <div className="mx-auto mb-3 max-w-[1220px] glass-card p-3.5">
        <div className="grid gap-3 md:grid-cols-[1.2fr_1.8fr]">
          <div>
            <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
              the earth story · {detail?.date_range ?? dataset.year_range}
            </p>
            <h2 className="mt-0.5 font-display text-[17px] font-semibold leading-snug text-ink">
              {dataset.title}
            </h2>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[#3a2a18e6]">
              {detail?.description ?? dataset.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-[#d8b077]/60 bg-[#fff8ea]/80 p-2">
              <p className="font-display text-[8px] font-bold uppercase tracking-[0.16em] text-[#2563eb]">
                Cool / Foundation
              </p>
              <p className="mt-0.5 font-display text-[11.5px] font-semibold text-ink">
                Root + Fifth Drone
              </p>
              <p className="mt-0.5 text-[9.5px] font-semibold leading-snug text-[#5a3f22]">
                Lowpass-filtered 3-oscillator drone ({score?.key.root ?? 'D'}2 + 5th + tension).
              </p>
            </div>
            <div className="rounded-lg border border-[#d8b077]/60 bg-[#fff8ea]/80 p-2">
              <p className="font-display text-[8px] font-bold uppercase tracking-[0.16em] text-[#15803d]">
                West → East Scan
              </p>
              <p className="mt-0.5 font-display text-[11.5px] font-semibold text-ink">
                Lowpass Melody Pluck
              </p>
              <p className="mt-0.5 text-[9.5px] font-semibold leading-snug text-[#5a3f22]">
                Theme oscillator with dynamic cutoff &amp; harmonized scale fifths.
              </p>
            </div>
            <div className="rounded-lg border border-[#d8b077]/60 bg-[#fff8ea]/80 p-2">
              <p className="font-display text-[8px] font-bold uppercase tracking-[0.16em] text-[#8a5a1c]">
                Pulse &amp; Density
              </p>
              <p className="mt-0.5 font-display text-[11.5px] font-semibold text-ink">
                Rhythm Hit (Noise / Tick)
              </p>
              <p className="mt-0.5 text-[9.5px] font-semibold leading-snug text-[#5a3f22]">
                6 kHz highpass noise hat or 1800→600 Hz sine tick driven by density.
              </p>
            </div>
            <div className="rounded-lg border border-[#ff6b4a]/55 bg-[#fff2eb]/90 p-2">
              <p className="font-display text-[8px] font-bold uppercase tracking-[0.16em] text-[#b91c1c]">
                Hotspots &amp; Peaks
              </p>
              <p className="mt-0.5 font-display text-[11.5px] font-semibold text-ink">
                Inharmonic Hotspot Bell
              </p>
              <p className="mt-0.5 text-[9.5px] font-semibold leading-snug text-[#5a3f22]">
                3-partial bell [1, 2.76, 5.4] + steep peak surge on anomalies.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1220px] items-start gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ---------------- left column: the frame, legend, contour & timeline --------- */}
        <div className="flex flex-col gap-3">
          <div className="glass-card self-start overflow-hidden p-0 w-full">
            <div className="flex items-center justify-between gap-2 border-b border-[#d8b077]/60 px-3 py-2">
              <div className="min-w-0">
                <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                  the frame · NASA SVS {dataset.svs_id || 'EIC'} · {frameScore?.label ?? `Frame ${activeFrame + 1}`}
                </p>
                <p className="truncate font-display text-[15px] font-semibold leading-tight text-ink">
                  {dataset.title}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setShowGrid((v) => !v)}
                  aria-pressed={showGrid}
                  className="rounded-full border border-[#c9a268] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#8a5a1c] transition hover:bg-[#fff8e8]"
                >
                  {showGrid ? 'hide grid' : 'show grid'}
                </button>
                <button
                  onClick={onToggle}
                  aria-label={playing ? 'Pause' : 'Play'}
                  className="rounded-full bg-[#3a2716] p-1.5 text-[#ffe9b8] transition hover:bg-[#5a3f22]"
                >
                  {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                </button>
              </div>
            </div>

            <div className="relative bg-[#0f0c08]">
              <img
                src={api.framePngUrl(dataset.id, activeFrame)}
                alt={frameScore?.description || dataset.accessibility}
                className="block h-auto w-full object-contain"
              />
              {/* the measured grid: one box per cell, bright cells glow */}
              {showGrid && spec && (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${spec.grid.cols}, 1fr)`,
                      gridTemplateRows: `repeat(${spec.grid.rows}, 1fr)`,
                    }}
                  >
                    {spec.grid.cells.map((c) => (
                      <div
                        key={`${c.row}-${c.col}`}
                        title={`row ${c.row + 1}, column ${c.col + 1} · brightness ${Math.round(
                          c.brightness * 99,
                        )} · texture ${Math.round(c.turbulence * 99)}`}
                        className="pointer-events-auto relative border border-[#ffe9b8]/15 transition-colors hover:border-[#ffe9b8]/80"
                        style={{ background: `rgba(255,214,130,${c.brightness * 0.22})` }}
                      >
                        <span className="absolute bottom-0.5 left-0.5 font-mono text-[7px] font-bold leading-none text-[#fff6e0] opacity-0 transition-opacity hover:opacity-100">
                          {Math.round(c.brightness * 99)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-x-0 top-0 flex justify-between px-1.5 pt-0.5 font-mono text-[7.5px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8]/80">
                    <span>scan →</span>
                    <span>{dataset.sensor}</span>
                  </div>
                </div>
              )}

              {/* live scanline playhead */}
              {scanX !== null && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#ffe9b8] shadow-[0_0_12px_2px_rgba(255,215,154,.9)]"
                  style={{ left: `${(scanX * 100).toFixed(2)}%` }}
                />
              )}

              {/* hotspot reticle */}
              {frameScore?.hotspot && (
                <div
                  aria-hidden
                  title={`Peak hotspot (${Math.round(frameScore.hotspot.x * 100)}%, ${Math.round(frameScore.hotspot.y * 100)}%)`}
                  className="pointer-events-none absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#ffe9b8] bg-[#f0821e]/30 shadow-[0_0_12px_rgba(240,130,30,.9)]"
                  style={{
                    left: `${(frameScore.hotspot.x * 100).toFixed(1)}%`,
                    top: `${(frameScore.hotspot.y * 100).toFixed(1)}%`,
                  }}
                />
              )}

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0f0c08]/50">
                  <Loader2 size={22} className="animate-spin text-[#ffd79a]" />
                </div>
              )}
            </div>

            {/* calibrated colorbar legend */}
            {detail && (
              <div className="border-t border-[#d8b077]/50 bg-[#fff8e8]/50 px-3 py-2">
                <div className="flex items-center justify-between text-[9px] font-bold text-[#8a5a1c]">
                  <span className="font-display uppercase tracking-[0.16em]">
                    {detail.legend.label} ({detail.legend.unit})
                  </span>
                  <span className="font-mono">
                    {detail.legend.min.toFixed(1)} → {detail.legend.max.toFixed(1)} {detail.legend.unit}
                  </span>
                </div>
                <div
                  className="mt-1 h-2.5 w-full rounded-full border border-[#a9773d]/60"
                  style={{ background: legendGradient }}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-[#d8b077]/60 px-3 py-2">
              <a
                href={api.framePngUrl(dataset.id, activeFrame)}
                download={`${dataset.id}-f${activeFrame}.webp`}
                className="inline-flex items-center gap-1 rounded-full border border-[#c9a268] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#8a5a1c] transition hover:bg-[#fff8e8]"
              >
                <Download size={10} /> frame
              </a>
              <a
                href={api.renderWavUrl(dataset.id)}
                download
                className="inline-flex items-center gap-1 rounded-full border border-[#c9a268] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#8a5a1c] transition hover:bg-[#fff8e8]"
              >
                <Volume2 size={10} /> the same sound, as a wav
              </a>
              {dataset.svs_url && (
                <a
                  href={dataset.svs_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[#c9a268] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#8a5a1c] transition hover:bg-[#fff8e8]"
                >
                  <ExternalLink size={10} /> nasa svs
                </a>
              )}
              <span className="ml-auto max-w-[46ch] text-right text-[9px] font-semibold leading-tight text-[#3a2a18a6]">
                {dataset.credit}
              </span>
            </div>
          </div>

          {/* ---------------- pitch contour & tension timeline ---------------- */}
          {score && (
            <div className="glass-card grid gap-3 p-3 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between">
                  <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                    pitch contour · west → east
                  </p>
                  <span className="font-mono text-[8.5px] font-bold text-[#7c6144]">
                    {score.key.root} {score.key.scale.replace('_', ' ')} · {score.key.bpm} bpm
                  </span>
                </div>
                <div className="mt-1.5 h-20 rounded-lg border border-[#d8b077]/70 bg-[#3a2716] p-1.5">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                    {frameScore?.layers?.column_intensity.map((v, i, arr) => (
                      <rect
                        key={i}
                        x={(i / arr.length) * 100}
                        y={100 - v * 90}
                        width={100 / arr.length - 0.6}
                        height={v * 90}
                        fill="rgba(240,130,30,0.35)"
                      />
                    ))}
                    {contourPath && (
                      <path
                        d={contourPath}
                        fill="none"
                        stroke="#ffcf7d"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {scanX !== null && (
                      <line
                        x1={scanX * 100}
                        x2={scanX * 100}
                        y1={0}
                        y2={100}
                        stroke="#fff6e0"
                        strokeWidth="1.2"
                      />
                    )}
                  </svg>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                    tension & change · {score.frames.length} frames
                  </p>
                  <span className="font-mono text-[8.5px] font-bold text-[#7c6144]">
                    frame {activeFrame + 1}/{score.frames.length}
                  </span>
                </div>
                <div className="mt-1.5 flex h-20 items-end gap-0.5 rounded-lg border border-[#d8b077]/70 bg-[#3a2716] p-1.5">
                  {score.frames.map((f, i) => {
                    const active = i === activeFrame
                    const h = Math.max(14, Math.round((0.35 * f.stats.mean + 0.65 * f.tension + 0.15) * 85))
                    return (
                      <button
                        key={f.index}
                        type="button"
                        onClick={() => setManualFrame(i)}
                        title={`${f.label} · mean ${f.stats.mean.toFixed(2)} · tension ${f.tension.toFixed(2)}`}
                        aria-label={`Inspect frame ${i + 1}: ${f.label}`}
                        className={`flex-1 rounded-t transition-all ${
                          active ? 'bg-[#ffcf7d]' : 'bg-[#c99a52]/55 hover:bg-[#ffe9b8]/80'
                        }`}
                        style={{ height: `${Math.min(100, h)}%` }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          {/* ---------------- analog audio waveform & peak intensity spike ---------------- */}
          {wavePaths && (
            <div className="glass-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                  analog audio waveform · peak surge ({Math.round(wavePaths.scanPeak * 100)}%)
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[8.5px] font-bold">
                  <span className="inline-flex items-center gap-1 text-[#2563eb]">
                    <span className="h-2 w-2 rounded-full bg-[#5da9e9]" /> Cool · Drone Foundation
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#15803d]">
                    <span className="h-2 w-2 rounded-full bg-[#4ade80]" /> Mid · Lowpass Pluck + Fifths
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#b91c1c]">
                    <span className="h-2 w-2 rounded-full bg-[#ff6b4a]" /> Peak · Hotspot Bell &amp; Surge
                  </span>
                </div>
              </div>
              <div className="relative mt-1.5 h-32 rounded-lg border border-[#d8b077]/70 bg-[#170f08] p-1.5">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                  {/* Center zero line & +/- dynamic threshold guides */}
                  <line x1={0} x2={100} y1={50} y2={50} stroke="rgba(255,233,184,0.22)" strokeWidth="0.6" />
                  <line x1={0} x2={100} y1={22} y2={22} stroke="rgba(255,107,74,0.18)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
                  <line x1={0} x2={100} y1={78} y2={78} stroke="rgba(255,107,74,0.18)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
                  {/* Symmetric analog waveform lobes */}
                  <path d={wavePaths.cool.area} fill="rgba(93,169,233,0.18)" />
                  <path d={wavePaths.mid.area} fill="rgba(74,222,128,0.16)" />
                  <path d={wavePaths.peak.area} fill="rgba(255,107,74,0.30)" />
                  <path d={wavePaths.cool.top} fill="none" stroke="#5da9e9" strokeWidth="1.2" />
                  <path d={wavePaths.cool.bottom} fill="none" stroke="#5da9e9" strokeWidth="1.2" />
                  <path d={wavePaths.mid.top} fill="none" stroke="#4ade80" strokeWidth="1.2" />
                  <path d={wavePaths.mid.bottom} fill="none" stroke="#4ade80" strokeWidth="1.2" />
                  <path d={wavePaths.hot.top} fill="none" stroke="#f59e0b" strokeWidth="0.9" strokeDasharray="1.8 1.2" />
                  <path d={wavePaths.hot.bottom} fill="none" stroke="#f59e0b" strokeWidth="0.9" strokeDasharray="1.8 1.2" />
                  <path d={wavePaths.peak.top} fill="none" stroke="#ff6b4a" strokeWidth="2.0" />
                  <path d={wavePaths.peak.bottom} fill="none" stroke="#ff6b4a" strokeWidth="2.0" />
                  {scanX !== null && (
                    <line
                      x1={scanX * 100}
                      x2={scanX * 100}
                      y1={0}
                      y2={100}
                      stroke="#fff6e0"
                      strokeWidth="1.4"
                    />
                  )}
                </svg>
                <span className="pointer-events-none absolute right-2 top-1.5 font-mono text-[8px] font-bold text-[#ff8b6e]/80">
                  +PEAK
                </span>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[8px] text-[#ffe9b8]/55">
                  0 dB
                </span>
                <span className="pointer-events-none absolute bottom-1.5 right-2 font-mono text-[8px] font-bold text-[#ff8b6e]/80">
                  -PEAK
                </span>
              </div>
              <p className="mt-1 text-[9px] font-semibold text-[#5a3f22]">
                Quiet whisper near 0 dB on calm areas; steep analog waveform blooms sharply at concentrated high-value peaks.
              </p>
            </div>
          )}
        </div>

        {/* ---------------- right column: detailed analysis, tabs, series, record switcher ---------------- */}
        <div className="flex flex-col gap-3">
          <div className="glass-card p-3">
            <div className="flex items-center justify-between gap-2 border-b border-[#d8b077]/50 pb-2">
              <div className="flex gap-1" role="tablist" aria-label="Track details">
                {(
                  [
                    ['key', 'Audio Key'],
                    ['regions', 'Regions & Alerts'],
                    ['transcript', 'Transcript'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={infoTab === id}
                    onClick={() => setInfoTab(id)}
                    className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] transition ${
                      infoTab === id
                        ? 'bg-[#3a2716] text-[#ffe9b8]'
                        : 'text-[#8a5a1c] hover:bg-[#fff8e8]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {manualFrame !== null && (
                <button
                  onClick={() => setManualFrame(null)}
                  className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#a2641f] underline"
                >
                  sync to playhead
                </button>
              )}
            </div>

            {infoTab === 'key' && (
              <div className="mt-2">
                <p className="text-[11.5px] font-semibold leading-snug text-[#3a2a18cc]">
                  {spec?.mapping ?? 'Measuring the frame…'}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#3a2a18d9]">
                  {spec?.explain ?? dataset.description}
                </p>
                {detail?.audio_key && (
                  <p className="mt-1.5 rounded-lg bg-[#fff8e8]/80 p-2 text-[10px] font-semibold leading-relaxed text-[#5a3f22]">
                    {detail.audio_key}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Chip label={`${spec?.layers.length ?? 0} physical layers`} />
                  {score && <Chip label={`${score.key.root} ${score.key.scale.replace('_', ' ')}`} />}
                  <Chip label={`${dataset.year_range}`} />
                </div>
              </div>
            )}

            {infoTab === 'regions' && (
              <div className="mt-2 space-y-2">
                <p className="text-[10.5px] font-semibold leading-snug text-[#3a2a18d9]">
                  {frameScore?.description ?? dataset.description}
                </p>
                {frameScore?.layers?.alerts.length ? (
                  <div className="space-y-1">
                    <p className="font-display text-[8.5px] font-bold uppercase tracking-[0.16em] text-[#a2641f]">
                      threshold alerts
                    </p>
                    {frameScore.layers.alerts.map((a, i) => (
                      <div key={i} className="rounded-lg border border-[#d8b077] bg-[#fff8e8] px-2 py-1 text-[10px] font-semibold text-[#3a2a18]">
                        <span className="font-bold text-[#a2641f]">{a.label}</span> — {a.region} ({Math.round(a.share * 100)}% of area)
                      </div>
                    ))}
                  </div>
                ) : null}
                {frameScore?.layers?.regions.length ? (
                  <div className="space-y-1">
                    <p className="font-display text-[8.5px] font-bold uppercase tracking-[0.16em] text-[#8a5a1c]">
                      strongest regions
                    </p>
                    {frameScore.layers.regions.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-[#fff8e8]/75 px-2 py-1 text-[10px] font-semibold text-[#3a2a18]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={10} className="text-[#a2641f]" /> {r.region} ({r.where})
                        </span>
                        <span className="font-mono text-[9.5px] font-bold text-[#8a5a1c]">
                          {r.value.toFixed(1)} {detail?.legend.unit ?? ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {infoTab === 'transcript' && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                {(detail?.transcript ?? []).map((entry) => (
                  <li key={entry.frame}>
                    <button
                      type="button"
                      onClick={() => setManualFrame(entry.frame)}
                      className={`w-full rounded-lg px-2 py-1 text-left text-[10px] leading-snug transition ${
                        entry.frame === activeFrame
                          ? 'bg-[#3a2716] text-[#ffe9b8]'
                          : 'bg-[#fff8e8]/70 text-[#3a2a18] hover:bg-[#fff8e8]'
                      }`}
                    >
                      {entry.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="glass-card p-3">
            <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
              what the grid measured
            </p>
            <div className="mt-1.5 h-16 rounded-lg border border-[#d8b077]/70 bg-[#3a2716] p-1.5">
              <Spectrum
                accent="#ffcf7d"
                label={playing ? 'live output spectrum' : 'no signal — the transport is stopped'}
              />
            </div>
            {spec ? (
              <>
                <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1 border-t border-[#d8b077]/70 pt-2">
                  {[
                    ['brightness', spec.frame_stats.brightness],
                    ['texture', spec.frame_stats.turbulence],
                    ['saturation', spec.frame_stats.saturation],
                    ['hot px', spec.frame_stats.hot],
                    ['green', spec.frame_stats.green],
                    ['water', spec.frame_stats.water],
                    ['white', spec.frame_stats.white],
                    ['dark', spec.frame_stats.dark],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex flex-col">
                      <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-[#8a5a1c]">
                        {k}
                      </span>
                      <span className="font-mono text-[10px] font-bold leading-none text-[#3a2a18d9]">
                        {Number(v).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-2 font-display text-[8.5px] font-bold uppercase tracking-[0.16em] text-[#8a5a1c]">
                  loudest cells · {String(signal)} <span className="normal-case">(and measured brightness)</span>
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {topCells.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-[10px] font-semibold text-[#3a2a18cc]">
                      <span className="w-14 shrink-0 font-mono text-[9px] text-[#8a5a1c]">
                        r{c.row + 1} c{c.col + 1}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#c49a5d]/45">
                        <span
                          className="block h-full rounded-full bg-[#8a5a1c]"
                          style={{ width: `${Math.round((c[signal] as number) * 100)}%` }}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right font-mono text-[9px] leading-tight">
                        {(c[signal] as number).toFixed(2)}
                        <span className="ml-1 text-[#8a5a1c]">
                          {Math.round(c.brightness * 99)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-[10px] font-semibold text-[#3a2a18a6]">
                the engine is measuring the frame…
              </p>
            )}
          </div>

          {/* ---------------- the frame series ---------------- */}
          {series.length > 0 && (
            <div className="glass-card p-3">
              <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                the series · {series.length} sampled frames ({totalFrames} total)
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {series.map((s) => {
                  const fIdx = s.frameIndex ?? 0
                  return (
                    <button
                      key={s.asset}
                      onClick={() => setManualFrame(fIdx)}
                      aria-pressed={activeFrame === fIdx}
                      className={`overflow-hidden rounded-lg border-2 transition ${
                        activeFrame === fIdx ? 'border-[#8a5a1c]' : 'border-transparent hover:border-[#c9a268]'
                      }`}
                    >
                      <img
                        src={api.assetUrl(dataset.id, s.asset)}
                        alt={`${dataset.title}, ${s.label}`}
                        className="block aspect-[16/9] w-full object-cover"
                      />
                      <span className="block bg-[#3a2716]/85 px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-[0.1em] text-[#ffe9b8]">
                        {s.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-[9.5px] font-semibold leading-snug text-[#3a2a18a6]">
                Each frame in the series is measured by the same engine. Click any frame above or on the timeline to inspect it.
              </p>
            </div>
          )}

          {/* ---------------- change the record from down here ---------------- */}
          <div className="glass-card p-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPick(prevRecord.id)}
                aria-label={`Previous record: ${prevRecord.short}`}
                title={prevRecord.short}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#c9a268] bg-[#fff8e8]/70 text-[#8a5a1c] transition hover:bg-[#fff8e8] active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a5a1c]">
                  change the record
                </p>
                <p className="truncate font-display text-[13.5px] font-semibold leading-tight text-ink">
                  {dataset.short}
                </p>
                <p className="font-mono text-[9px] font-bold text-[#7c6144]">
                  record {recordIndex + 1} of {datasets.length}
                </p>
              </div>
              <button
                onClick={() => onPick(nextRecord.id)}
                aria-label={`Next record: ${nextRecord.short}`}
                title={nextRecord.short}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#c9a268] bg-[#fff8e8]/70 text-[#8a5a1c] transition hover:bg-[#fff8e8] active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 border-t border-[#d8b077]/60 pt-2">
              {datasets.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onPick(d.id)}
                  aria-pressed={d.id === dataset.id}
                  className={`rounded-full border px-2 py-1 text-[9.5px] font-bold transition ${
                    d.id === dataset.id
                      ? 'border-[#8a5a1c] bg-[#3a2716] text-[#ffe9b8]'
                      : 'border-[#c9a268] bg-[#fff8e8]/70 text-[#3a2a18] hover:bg-[#fff8e8]'
                  }`}
                >
                  {d.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#3a2716]/85 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#ffe9b8]">
      {label}
    </span>
  )
}
