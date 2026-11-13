import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, Loader2, MapPin, Pause, Play, Volume2 } from 'lucide-react'
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

/** the colour bands of the scale, bottom of the stack first */
const BANDS = [
  { key: 'cool', colour: '#5da9e9', label: 'Cool', voice: 'drone foundation' },
  { key: 'mid', colour: '#4ade80', label: 'Mid', voice: 'low-pass pluck + fifths' },
  { key: 'hot', colour: '#f59e0b', label: 'Warm', voice: 'upper values' },
] as const

/**
 * The Data Deck.
 *
 * A one-screen dashboard on desktop: the story across the top, then three
 * columns. The frame (sized to the height that is left) with its contour and
 * tension charts; the listening notes over the sound bands; the grid
 * measurements, the frame series and the record switcher. Below `lg` it falls
 * back to a single scrolling column.
 */
export function NowPlaying({
  dataset,
  spec,
  loading,
  playing,
  progress = 0,
  onToggle,
}: {
  dataset: Dataset
  spec: Spec | null
  loading: boolean
  playing: boolean
  progress?: number
  onToggle: () => void
}) {
  const [showGrid, setShowGrid] = useState(true)
  const [manualFrame, setManualFrame] = useState<number | null>(null)
  const [infoTab, setInfoTab] = useState<'key' | 'regions' | 'transcript'>('key')
  // the frame's own aspect ratio, so the overlays stay locked to the picture
  const [frameRatio, setFrameRatio] = useState(2)

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
  const scanX = playing ? (playTime % 4.0) / 4.0 : null
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

  const topCells = useMemo(
    () =>
      [...cells]
        .sort((a, b) => (b[signal] as number) - (a[signal] as number) || b.brightness - a.brightness)
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

  /*
   * The sound bands, rebuilt: the measured share of cool / mid / warm values
   * in every slice of the map, west → east, stacked so you can read the mix of
   * the sweep at a glance, with the peak surge as a line on top. Straight from
   * the measured bins: no carrier, no mirroring, no decoration.
   */
  const bands = useMemo(() => {
    const w = activeWaves
    if (!w || !w.peak.length) return null
    const n = w.peak.length
    const x = (i: number) => ((i / Math.max(1, n - 1)) * 100).toFixed(2)
    const stackMax = Math.max(1e-6, ...w.cool.map((c, i) => c + (w.mid[i] ?? 0) + (w.hot[i] ?? 0)))
    const H = 92
    let base = new Array<number>(n).fill(0)
    const areas = BANDS.map((b) => {
      const vals = w[b.key]
      const top = base.map((v, i) => v + (vals[i] ?? 0))
      const up = top.map((v, i) => `${x(i)},${(100 - (v / stackMax) * H).toFixed(2)}`)
      const down = base.map((v, i) => `${x(i)},${(100 - (v / stackMax) * H).toFixed(2)}`).reverse()
      base = top
      return { ...b, points: [...up, ...down].join(' ') }
    })
    const peakLine = w.peak.map((v, i) => `${x(i)},${(100 - Math.min(1, v) * H).toFixed(2)}`).join(' ')
    const bin = scanX !== null ? Math.min(n - 1, Math.max(0, Math.round(scanX * (n - 1)))) : null
    const share = (k: 'cool' | 'mid' | 'hot', i: number) => {
      const t = (w.cool[i] ?? 0) + (w.mid[i] ?? 0) + (w.hot[i] ?? 0)
      return t > 0 ? (w[k][i] ?? 0) / t : 0
    }
    const mean = (k: 'cool' | 'mid' | 'hot') => {
      let s = 0
      for (let i = 0; i < n; i++) s += share(k, i)
      return s / n
    }
    const readout =
      bin !== null
        ? { where: 'at the playhead', cool: share('cool', bin), mid: share('mid', bin), hot: share('hot', bin), peak: w.peak[bin] ?? 0 }
        : { where: 'whole frame', cool: mean('cool'), mid: mean('mid'), hot: mean('hot'), peak: Math.max(...w.peak, 0) }
    return { areas, peakLine, readout }
  }, [activeWaves, scanX])

  return (
    <section
      id="now-playing"
      aria-label="The record on the turntable"
      className="relative z-10 flex flex-col gap-3 px-3 pb-6 pt-3 sm:px-6 lg:h-full lg:min-h-0 lg:pb-4"
    >
      {/* ================= the story + the instruments ================= */}
      <div className="glass-card shrink-0 p-3.5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.95fr)]">
          <div className="min-w-0">
            <p className="font-display text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#8a5a1c]">
              the earth story · {detail?.date_range ?? dataset.year_range}
            </p>
            <h2 className="mt-0.5 font-display text-[21px] font-semibold leading-tight text-ink">{dataset.title}</h2>
            <p
              className="mt-1 text-[13px] font-semibold leading-snug text-[#3a2a18e6] lg:line-clamp-3"
              title={detail?.description ?? dataset.description}
            >
              {detail?.description ?? dataset.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Instrument
              tone="#2563eb"
              tag="Cool / Foundation"
              name="Root + Fifth Drone"
              text={`Lowpass-filtered 3-oscillator drone (${score?.key.root ?? 'D'}2 + 5th + tension).`}
            />
            <Instrument
              tone="#15803d"
              tag="West → East Scan"
              name="Lowpass Melody Pluck"
              text="Theme oscillator with dynamic cutoff & harmonized scale fifths."
            />
            <Instrument
              tone="#8a5a1c"
              tag="Pulse & Density"
              name="Rhythm Hit (Noise / Tick)"
              text="6 kHz highpass noise hat or 1800→600 Hz sine tick driven by density."
            />
            <Instrument
              tone="#b91c1c"
              tag="Hotspots & Peaks"
              name="Inharmonic Hotspot Bell"
              text="3-partial bell [1, 2.76, 5.4] + steep peak surge on anomalies."
              hot
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* ================= column 1 · the frame ================= */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <div className="glass-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#d8b077]/60 px-3.5 py-2">
              <div className="min-w-0">
                <Eyebrow>
                  the frame · NASA SVS {dataset.svs_id || 'EIC'} · {frameScore?.label ?? `Frame ${activeFrame + 1}`}
                </Eyebrow>
                <p className="truncate font-display text-[17px] font-semibold leading-tight text-ink">{dataset.title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setShowGrid((v) => !v)}
                  aria-pressed={showGrid}
                  className="rounded-full border border-[#c9a268] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8a5a1c] transition hover:bg-[#fff8e8]"
                >
                  {showGrid ? 'hide grid' : 'show grid'}
                </button>
                <button
                  onClick={onToggle}
                  aria-label={playing ? 'Pause' : 'Play'}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3a2716] text-[#ffe9b8] transition hover:bg-[#5a3f22]"
                >
                  {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>
              </div>
            </div>

            {/* the picture is sized to the space left, overlays locked to it */}
            <div className="deck-frame-stage flex min-h-[200px] flex-1 items-center justify-center bg-[#3a2716]/10">
              <div className="deck-frame-box" style={{ ['--ar' as string]: String(frameRatio) }}>
                <img
                  src={api.framePngUrl(dataset.id, activeFrame)}
                  alt={frameScore?.description || dataset.accessibility}
                  className="block h-full w-full object-fill"
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                    if (w && h) setFrameRatio(w / h)
                  }}
                />
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
                        />
                      ))}
                    </div>
                    <div className="absolute inset-x-0 top-0 flex justify-between px-2 pt-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffe9b8]/80">
                      <span>scan →</span>
                      <span>{dataset.sensor}</span>
                    </div>
                  </div>
                )}
                {scanX !== null && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#ffe9b8] shadow-[0_0_12px_2px_rgba(255,215,154,.9)]"
                    style={{ left: `${(scanX * 100).toFixed(2)}%` }}
                  />
                )}
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
                    <Loader2 size={24} className="animate-spin text-[#ffd79a]" />
                  </div>
                )}
              </div>
            </div>

            {detail && (
              <div className="shrink-0 border-t border-[#d8b077]/50 bg-[#fff8e8]/50 px-3.5 py-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#8a5a1c]">
                  <span className="font-display uppercase tracking-[0.14em]">
                    {detail.legend.label} ({detail.legend.unit})
                  </span>
                  <span className="font-mono text-[12px]">
                    {detail.legend.min.toFixed(1)} → {detail.legend.max.toFixed(1)} {detail.legend.unit}
                  </span>
                </div>
                <div className="mt-1 h-3 w-full rounded-full border border-[#a9773d]/60" style={{ background: legendGradient }} />
              </div>
            )}

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#d8b077]/60 px-3.5 py-2">
              <a href={api.framePngUrl(dataset.id, activeFrame)} download={`${dataset.id}-f${activeFrame}.webp`} className={PILL}>
                <Download size={12} /> frame
              </a>
              <a href={api.renderWavUrl(dataset.id)} download className={PILL}>
                <Volume2 size={12} /> the same sound, as a wav
              </a>
              {dataset.svs_url && (
                <a href={dataset.svs_url} target="_blank" rel="noreferrer" className={PILL}>
                  <ExternalLink size={12} /> nasa svs
                </a>
              )}
              <span className="ml-auto max-w-[46ch] truncate text-right text-[11px] font-semibold text-[#3a2a18a6]" title={dataset.credit}>
                {dataset.credit}
              </span>
            </div>
          </div>

          {/* pitch contour & tension timeline */}
          {score && (
            <div className="glass-card grid shrink-0 gap-3 p-3 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>pitch contour · west → east</Eyebrow>
                  <span className="font-mono text-[11px] font-bold text-[#7c6144]">
                    {score.key.root} {score.key.scale.replace('_', ' ')} · {score.key.bpm} bpm
                  </span>
                </div>
                <div className="mt-1.5 h-[72px] rounded-lg border border-[#d8b077]/70 bg-[#3a2716] p-1.5">
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
                      <path d={contourPath} fill="none" stroke="#ffcf7d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {scanX !== null && <line x1={scanX * 100} x2={scanX * 100} y1={0} y2={100} stroke="#fff6e0" strokeWidth="1.2" />}
                  </svg>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>tension & change · {score.frames.length} frames</Eyebrow>
                  <span className="font-mono text-[11px] font-bold text-[#7c6144]">
                    frame {activeFrame + 1}/{score.frames.length}
                  </span>
                </div>
                <div className="mt-1.5 flex h-[72px] items-end gap-0.5 rounded-lg border border-[#d8b077]/70 bg-[#3a2716] p-1.5">
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
        </div>

        {/* ================= column 2 · listening notes + sound bands ================= */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <div className="glass-card flex min-h-[260px] flex-1 flex-col p-3.5 lg:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#d8b077]/50 pb-2">
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
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                      infoTab === id ? 'bg-[#3a2716] text-[#ffe9b8]' : 'text-[#8a5a1c] hover:bg-[#fff8e8]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {manualFrame !== null && (
                <button
                  onClick={() => setManualFrame(null)}
                  className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#a2641f] underline"
                >
                  sync to playhead
                </button>
              )}
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1" role="tabpanel">
              {infoTab === 'key' && (
                <div>
                  <p className="text-[14px] font-semibold leading-snug text-[#3a2a18]">{spec?.mapping ?? 'Measuring the frame…'}</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#3a2a18d9]">{spec?.explain ?? dataset.description}</p>
                  {detail?.audio_key && (
                    <p className="mt-2 rounded-lg bg-[#fff8e8]/80 p-2.5 text-[12.5px] font-semibold leading-relaxed text-[#5a3f22]">
                      {detail.audio_key}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip label={`${spec?.layers.length ?? 0} physical layers`} />
                    {score && <Chip label={`${score.key.root} ${score.key.scale.replace('_', ' ')}`} />}
                    <Chip label={`${dataset.year_range}`} />
                  </div>
                </div>
              )}

              {infoTab === 'regions' && (
                <div className="space-y-2.5">
                  <p className="text-[13.5px] font-semibold leading-snug text-[#3a2a18d9]">
                    {frameScore?.description ?? dataset.description}
                  </p>
                  {frameScore?.layers?.alerts.length ? (
                    <div className="space-y-1">
                      <Eyebrow tone="#a2641f">threshold alerts</Eyebrow>
                      {frameScore.layers.alerts.map((a, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-[#d8b077] bg-[#fff8e8] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#3a2a18]"
                        >
                          <span className="font-bold text-[#a2641f]">{a.label}</span> — {a.region} ({Math.round(a.share * 100)}% of area)
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {frameScore?.layers?.regions.length ? (
                    <div className="space-y-1">
                      <Eyebrow>strongest regions</Eyebrow>
                      {frameScore.layers.regions.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 rounded-lg bg-[#fff8e8]/75 px-2.5 py-1.5 text-[12.5px] font-semibold text-[#3a2a18]"
                        >
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} className="text-[#a2641f]" /> {r.region} ({r.where})
                          </span>
                          <span className="font-mono text-[12px] font-bold text-[#8a5a1c]">
                            {r.value.toFixed(1)} {detail?.legend.unit ?? ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {infoTab === 'transcript' && (
                <ul className="space-y-1">
                  {(detail?.transcript ?? []).map((entry) => (
                    <li key={entry.frame}>
                      <button
                        type="button"
                        onClick={() => setManualFrame(entry.frame)}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition ${
                          entry.frame === activeFrame ? 'bg-[#3a2716] text-[#ffe9b8]' : 'bg-[#fff8e8]/70 text-[#3a2a18] hover:bg-[#fff8e8]'
                        }`}
                      >
                        {entry.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* the sound bands (rebuilt): the measured mix of the sweep */}
          {bands && (
            <div className="glass-card shrink-0 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <Eyebrow>sound bands · west → east</Eyebrow>
                <span className="font-mono text-[11px] font-bold text-[#7c6144]">{bands.readout.where}</span>
              </div>
              <div className="relative mt-1.5 h-28 overflow-hidden rounded-lg border border-[#d8b077]/70 bg-[#170f08]">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
                  {[25, 50, 75].map((y) => (
                    <line key={y} x1={0} x2={100} y1={y} y2={y} stroke="rgba(255,233,184,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  ))}
                  {bands.areas.map((a) => (
                    <polygon key={a.key} points={a.points} fill={a.colour} fillOpacity={0.62} />
                  ))}
                  <polyline
                    points={bands.peakLine}
                    fill="none"
                    stroke="#ff6b4a"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {scanX !== null && (
                    <line x1={scanX * 100} x2={scanX * 100} y1={0} y2={100} stroke="#fff6e0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
                <span className="pointer-events-none absolute left-2 top-1 font-mono text-[10px] font-bold text-[#ffe9b8]/60">W</span>
                <span className="pointer-events-none absolute right-2 top-1 font-mono text-[10px] font-bold text-[#ffe9b8]/60">E</span>
              </div>
              <dl className="mt-2 grid grid-cols-4 gap-1.5">
                {BANDS.map((b) => (
                  <BandStat key={b.key} colour={b.colour} label={b.label} voice={b.voice} value={bands.readout[b.key]} />
                ))}
                <BandStat colour="#ff6b4a" label="Peak" voice="hotspot bell" value={bands.readout.peak} line />
              </dl>
            </div>
          )}
        </div>

        {/* ================= column 3 · grid, series, records ================= */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <div className="glass-card min-h-0 flex-1 overflow-y-auto p-3.5 lg:min-h-[230px]">
            <Eyebrow>what the grid measured</Eyebrow>
            <div className="mt-1.5 h-14 rounded-lg border border-[#d8b077]/70 bg-[#3a2716] p-1.5">
              <Spectrum accent="#ffcf7d" label={playing ? 'live output spectrum' : 'no signal — the transport is stopped'} />
            </div>
            {spec ? (
              <>
                <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1.5 border-t border-[#d8b077]/70 pt-2">
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
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8a5a1c]">{k}</span>
                      <span className="font-mono text-[13px] font-bold leading-tight text-[#3a2a18d9]">{Number(v).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 font-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8a5a1c]">
                  loudest cells · {String(signal)} <span className="normal-case">(and measured brightness)</span>
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {topCells.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12px] font-semibold text-[#3a2a18cc]">
                      <span className="w-14 shrink-0 font-mono text-[11px] text-[#8a5a1c]">
                        r{c.row + 1} c{c.col + 1}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#c49a5d]/45">
                        <span
                          className="block h-full rounded-full bg-[#8a5a1c]"
                          style={{ width: `${Math.round((c[signal] as number) * 100)}%` }}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right font-mono text-[11px] leading-tight">
                        {(c[signal] as number).toFixed(2)}
                        <span className="ml-1 text-[#8a5a1c]">{Math.round(c.brightness * 99)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-[12px] font-semibold text-[#3a2a18a6]">the engine is measuring the frame…</p>
            )}
          </div>

          {series.length > 0 && (
            <div className="glass-card shrink-0 p-3.5">
              <Eyebrow>
                the series · {series.length} sampled frames ({totalFrames} total)
              </Eyebrow>
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
                      <span className="block bg-[#3a2716]/85 px-1 py-0.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-[#ffe9b8]">
                        {s.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

const PILL =
  'inline-flex items-center gap-1 rounded-full border border-[#c9a268] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8a5a1c] transition hover:bg-[#fff8e8]'

function Eyebrow({ children, tone = '#8a5a1c' }: { children: React.ReactNode; tone?: string }) {
  return (
    <p className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: tone }}>
      {children}
    </p>
  )
}

function Instrument({ tone, tag, name, text, hot }: { tone: string; tag: string; name: string; text: string; hot?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        hot ? 'border-[#ff6b4a]/55 bg-[#fff2eb]/90' : 'border-[#d8b077]/60 bg-[#fff8ea]/80'
      }`}
    >
      <p className="font-display text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tone }}>
        {tag}
      </p>
      <p className="mt-0.5 font-display text-[14px] font-semibold leading-tight text-ink">{name}</p>
      <p className="mt-0.5 text-[12px] font-semibold leading-snug text-[#5a3f22]">{text}</p>
    </div>
  )
}

function BandStat({
  colour,
  label,
  voice,
  value,
  line,
}: {
  colour: string
  label: string
  voice: string
  value: number
  line?: boolean
}) {
  return (
    <div className="min-w-0 rounded-lg bg-[#fff8e8]/75 px-2 py-1.5">
      <dt className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink">
        <span className={line ? 'h-0.5 w-3 rounded-full' : 'h-2.5 w-2.5 rounded-sm'} style={{ background: colour }} />
        {label}
        <span className="ml-auto font-mono text-[12px]">{Math.round(value * 100)}%</span>
      </dt>
      <dd className="truncate text-[10.5px] font-semibold text-[#5a3f22]" title={voice}>
        {voice}
      </dd>
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#3a2716]/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#ffe9b8]">
      {label}
    </span>
  )
}
