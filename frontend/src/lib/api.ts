import type { SpecCell, SpecLayer, VoicePart } from './audio/phenomena'
import type {
  AnalyzeResponse,
  Dataset,
  Spec,
  TerraGridResponse,
  TerraScore,
  TerraTrackDetail,
  TerraTrackSummary,
} from './types'

const BASE = ((import.meta.env?.VITE_API_URL as string | undefined) ?? '/api').replace(/\/$/, '')

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

function phenomenonToModel(
  phenomenon?: string,
  theme?: string,
): Dataset['model'] {
  switch (phenomenon) {
    case 'rain':
      return 'storm'
    case 'fire':
      return 'fire'
    case 'traffic':
      return 'city'
    case 'surf':
      return 'ocean'
    case 'biophony':
      return 'canopy'
    case 'haze':
      return 'plume'
    case 'wind':
    case 'temperature':
      return 'wind'
    default:
      if (theme === 'wildfires') return 'fire'
      if (theme === 'ocean') return 'ocean'
      if (theme === 'agriculture') return 'canopy'
      if (theme === 'air_quality') return 'plume'
      return 'wind'
  }
}

function themeToElement(theme: string): Dataset['element'] {
  switch (theme) {
    case 'water':
    case 'disasters':
      return 'storms'
    case 'wildfires':
      return 'fire'
    case 'ocean':
    case 'sea_level':
      return 'ocean'
    case 'agriculture':
    case 'biodiversity':
    case 'energy':
      return 'land'
    default:
      return 'wind'
  }
}

function parseSvsId(url: string | null): string {
  if (!url) return ''
  const m = url.match(/\/(\d+)\/?$/)
  return m ? m[1] : ''
}

function sampleSeries(labels: string[]): Dataset['series'] {
  if (!labels.length) return []
  const count = Math.min(6, labels.length)
  const out: Dataset['series'] = []
  const seen = new Set<number>()
  for (let i = 0; i < count; i++) {
    const idx = count === 1 ? 0 : Math.round((i / (count - 1)) * (labels.length - 1))
    if (seen.has(idx)) continue
    seen.add(idx)
    out.push({
      asset: String(idx),
      label: labels[idx] ?? `Frame ${idx + 1}`,
      frameIndex: idx,
    })
  }
  return out
}

function toDataset(s: TerraTrackSummary, d?: TerraTrackDetail): Dataset {
  const model = phenomenonToModel(d?.sound?.phenomenon, s.theme)
  const svsId = parseSvsId(s.source_url)
  const sensor = d ? `${d.legend.label} (${d.legend.unit})` : s.theme.replace('_', ' ')
  return {
    id: s.id,
    title: s.title,
    short: s.title.replace(/\s*\([^)]*\)$/, ''),
    svs_id: svsId,
    svs_url: s.source_url ?? '',
    year_range: s.date_range,
    source_frame: `frames/0000.webp`,
    credit: s.credit,
    dataset_name: d?.legend.label ?? s.title,
    sensor,
    description: d?.description ?? s.summary,
    accessibility: d ? `${d.description} ${d.audio_key}` : s.summary,
    element: themeToElement(s.theme),
    model,
    series: d ? sampleSeries(d.frame_labels) : [],
    frameCount: s.frame_count,
  }
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function buildCellsFromGrid(
  grid: TerraGridResponse,
  detail: TerraTrackDetail,
  model: Dataset['model'],
): { cells: SpecCell[]; stats: Record<string, number> } {
  const raw = decodeBase64(grid.cells_b64)
  const targetRows = 6
  const targetCols = 12
  const cells: SpecCell[] = []

  const rowStep = grid.rows / targetRows
  const colStep = grid.cols / targetCols

  const gridValues = new Float32Array(targetRows * targetCols)
  const gridCoverage = new Float32Array(targetRows * targetCols)

  for (let r = 0; r < targetRows; r++) {
    const r0 = Math.floor(r * rowStep)
    const r1 = Math.max(r0 + 1, Math.floor((r + 1) * rowStep))
    for (let c = 0; c < targetCols; c++) {
      const c0 = Math.floor(c * colStep)
      const c1 = Math.max(c0 + 1, Math.floor((c + 1) * colStep))
      let sum = 0
      let valid = 0
      let total = 0
      let hotCount = 0
      for (let rr = r0; rr < r1; rr++) {
        for (let cc = c0; cc < c1; cc++) {
          total++
          const v = raw[rr * grid.cols + cc] ?? 255
          if (v !== 255) {
            const norm = v / 250
            sum += norm
            valid++
            if (norm > 0.72) hotCount++
          }
        }
      }
      const mean = valid > 0 ? sum / valid : 0
      gridValues[r * targetCols + c] = mean
      gridCoverage[r * targetCols + c] = total > 0 ? valid / total : 0
      const anchors = detail.legend.anchors
      let sat = 0.5
      let hue = 0.5
      if (anchors.length >= 2 && valid > 0) {
        const idx = Math.min(anchors.length - 1, Math.floor(mean * (anchors.length - 1)))
        const [R, G, B] = anchors[idx]?.rgb ?? [128, 128, 128]
        const mx = Math.max(R, G, B) / 255
        const mn = Math.min(R, G, B) / 255
        sat = mx > 0 ? (mx - mn) / mx : 0
        hue = R >= G && R >= B ? 0.05 : G >= B ? 0.33 : 0.62
      }
      cells.push({
        row: r,
        col: c,
        cx: (c + 0.5) / targetCols,
        cy: (r + 0.5) / targetRows,
        brightness: Number(mean.toFixed(3)),
        saturation: Number(sat.toFixed(3)),
        hue: Number(hue.toFixed(3)),
        turbulence: 0,
        edges: 0,
        gradient: 0,
        hot: Number((valid > 0 ? hotCount / valid : 0).toFixed(3)),
        green: model === 'canopy' ? Number(mean.toFixed(3)) : 0,
        water: model === 'ocean' || model === 'storm' ? Number((valid / Math.max(1, total)).toFixed(3)) : 0,
        white: model === 'storm' || model === 'plume' ? Number((mean > 0.6 ? mean : 0).toFixed(3)) : 0,
        dark: Number((1 - mean).toFixed(3)),
        rel: Number(mean.toFixed(3)),
      })
    }
  }

  let bSum = 0
  let tSum = 0
  let sSum = 0
  let hSum = 0
  let gSum = 0
  let wSum = 0
  let whSum = 0
  let dSum = 0

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < targetCols; c++) {
      const idx = r * targetCols + c
      const v = gridValues[idx] ?? 0
      const right = gridValues[r * targetCols + Math.min(targetCols - 1, c + 1)] ?? v
      const down = gridValues[Math.min(targetRows - 1, r + 1) * targetCols + c] ?? v
      const grad = Math.min(1, Math.hypot(right - v, down - v) * 2.5)
      const cell = cells[idx]!
      cell.gradient = Number(grad.toFixed(3))
      cell.turbulence = Number(Math.min(1, grad * 1.15).toFixed(3))
      cell.edges = cell.turbulence

      bSum += cell.brightness
      tSum += cell.turbulence
      sSum += cell.saturation
      hSum += cell.hot
      gSum += cell.green
      wSum += cell.water
      whSum += cell.white
      dSum += cell.dark
    }
  }

  const n = cells.length || 1
  return {
    cells,
    stats: {
      brightness: bSum / n,
      turbulence: tSum / n,
      saturation: sSum / n,
      hot: hSum / n,
      green: gSum / n,
      water: wSum / n,
      white: whSum / n,
      dark: dSum / n,
    },
  }
}

export function buildColorWaves(grid: TerraGridResponse): {
  cool: number[]
  mid: number[]
  hot: number[]
  peak: number[]
} {
  const raw = decodeBase64(grid.cells_b64)
  const bins = 48
  const cool: number[] = []
  const mid: number[] = []
  const hot: number[] = []
  const peak: number[] = []

  for (let b = 0; b < bins; b++) {
    const c0 = Math.floor((b * grid.cols) / bins)
    const c1 = Math.max(c0 + 1, Math.floor(((b + 1) * grid.cols) / bins))
    let cCnt = 0
    let mCnt = 0
    let hCnt = 0
    let valid = 0
    let maxVal = 0
    let sumVal = 0
    for (let r = 0; r < grid.rows; r++) {
      for (let c = c0; c < c1; c++) {
        const v = raw[r * grid.cols + c] ?? 255
        if (v === 255) continue
        valid++
        const norm = v / 250
        sumVal += norm
        if (norm > maxVal) maxVal = norm
        cCnt += Math.max(0, Math.min(1, (0.45 - norm) / 0.45))
        mCnt += Math.max(0, Math.min(1, 1 - Math.abs(norm - 0.5) / 0.35))
        hCnt += Math.max(0, Math.min(1, (norm - 0.55) / 0.45))
      }
    }
    const denom = Math.max(1, valid)
    const meanVal = sumVal / denom
    const dynGate = Math.pow(meanVal, 1.35)
    const cv = (cCnt / denom) * (0.18 + 0.82 * dynGate)
    const mv = (mCnt / denom) * (0.2 + 0.8 * dynGate)
    const hv = hCnt / denom
    // Low on calm/unchanged areas; steep analog spike on concentrated peak areas
    const pv = Math.min(
      1,
      Math.pow(meanVal, 2.2) * 0.45 +
        Math.pow(hv, 1.65) * 0.65 +
        Math.pow(Math.max(0, maxVal - 0.52) / 0.48, 2.15) * 0.92,
    )
    cool.push(Number(cv.toFixed(3)))
    mid.push(Number(mv.toFixed(3)))
    hot.push(Number(hv.toFixed(3)))
    peak.push(Number(pv.toFixed(3)))
  }
  return { cool, mid, hot, peak }
}

function scoreToLayers(score: TerraScore): SpecLayer[] {
  // Kept as an empty compatibility field: v14 scheduling is driven exclusively by voices.
  void score
  return []
}

const CLIENT_SCALES: Record<string, number[]> = {
  aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11], minor_pentatonic: [0, 3, 5, 7, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], whole_tone: [0, 2, 4, 6, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], major_pentatonic: [0, 2, 4, 7, 9],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], phrygian_dominant: [0, 1, 4, 5, 7, 8, 10],
}

function clientVoices(cells: SpecCell[], model: string): VoicePart[] {
  // Uncalibrated single-photo mirror of v15: D-root first-chord harmony, continuous measured
  // contours over a two-octave chord register, activity-driven density, and no invented flute line.
  const scaleName = model === 'ocean' || model === 'space' ? 'dorian'
    : model === 'storm' || model === 'fire' ? 'phrygian'
      : model === 'plume' ? 'aeolian'
        : model === 'canopy' ? 'major' : 'mixolydian'
  const scaleIntervals = CLIENT_SCALES[scaleName] ?? CLIENT_SCALES.dorian
  const minorScale = scaleIntervals.includes(3)
  const chordPcs = minorScale ? [2, 5, 9] : [2, 6, 9]
  const bases: Record<VoicePart['instrument'], number> = { bass: 26, harp: 50, flute: 62 }
  const minSpans: Record<VoicePart['instrument'], number> = { bass: 0.15, harp: 0.20, flute: 0.05 }
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const ladderFor = (instrument: VoicePart['instrument']) => {
    const base = bases[instrument]
    return Array.from({ length: 25 }, (_, offset) => base + offset).filter((midi) => chordPcs.includes(midi % 12))
  }
  const nearest = (target: number, ladder: number[]) => ladder.reduce((best, midi) =>
    Math.abs(midi - target) < Math.abs(best - target) ? midi : best, ladder[0] ?? 0)
  const continuousTargets = (
    values: number[],
    filled: boolean[],
    ladder: number[],
    minimumSpan: number,
  ) => {
    const observed = values.filter((_, i) => filled[i])
    if (!observed.length) return values.map(() => ladder[0] ?? 0)
    const lo = Math.min(...observed)
    const hi = Math.max(...observed)
    const span = Math.max(hi - lo, minimumSpan)
    const centre = (lo + hi) / 2
    return values.map((value, i) => filled[i]
      ? (ladder[0] ?? 0) + clamp(0.5 + (value - centre) / span) * ((ladder[ladder.length - 1] ?? 0) - (ladder[0] ?? 0))
      : ladder[0] ?? 0)
  }
  const quantile = (values: number[], q: number) => {
    if (!values.length) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const at = (sorted.length - 1) * q
    const lower = Math.floor(at)
    const upper = Math.ceil(at)
    return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (at - lower)
  }
  const slices = Array.from({ length: 8 }, (_, step) => {
    const part = cells.filter((c) => c.col >= Math.floor(step * 12 / 8) && c.col < Math.floor((step + 1) * 12 / 8))
    const values = part.map((cell) => cell.brightness)
    return {
      mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      peak: values.length ? Math.max(...values) : 0,
      filled: values.length > 0,
    }
  })
  const filled = slices.map((slice) => slice.filled)
  const activityRaw = slices.map((slice) => 0.65 * slice.peak + 0.35 * slice.mean)
  const activeValues = activityRaw.filter((_, i) => filled[i])
  const lo = quantile(activeValues, 0.10)
  const hi = quantile(activeValues, 0.90)
  const activity = activityRaw.map((value, i) => !filled[i] ? 0 : hi - lo < 0.05
    ? clamp(value)
    : clamp(0.15 * value + 0.85 * clamp((value - lo) / Math.max(hi - lo, 0.15))))
  const occupied = (instrument: VoicePart['instrument'], k: number) => {
    if (!filled[k]) return false
    if (instrument === 'bass') return k === 0 || !filled[k - 1] || k % 4 === 0 || (activity[k]! >= 0.30 && k % 2 === 0) || activity[k]! >= 0.62
    if (instrument === 'harp') return activity[k]! >= 0.12 && (k % 4 === 0 || (activity[k]! >= 0.35 && k % 2 === 0) || activity[k]! >= 0.58)
    return false
  }
  const makePart = (instrument: VoicePart['instrument'], values: number[]): VoicePart => {
    const ladder = ladderFor(instrument)
    const targets = continuousTargets(values, filled, ladder, minSpans[instrument])
    const notes = values.map((_, k) => occupied(instrument, k) ? nearest(targets[k]!, ladder) : -1)
    const gains = values.map((_, k) => filled[k] ? Number(({ bass: 0.95, harp: 0.90, flute: 0.72 }[instrument] * (0.08 + 0.92 * activity[k]! ** 1.4)).toFixed(6)) : 0)
    const durations = values.map((_, k) => notes[k] < 0 ? 0 : Number(Math.min(8 - k, { bass: 3.8, harp: 4.0, flute: 2.6 }[instrument] - { bass: 2.4, harp: 0.5, flute: 1.2 }[instrument] * activity[k]!).toFixed(4)))
    let last = -1
    notes.forEach((note, k) => {
      if (!filled[k]) last = -1
      else if (note >= 0) {
        if (last >= 0 && notes[last] === note) {
          durations[last] = Math.min(8 - last, k - last + durations[k]!)
          notes[k] = -1; durations[k] = 0
        } else last = k
      }
    })
    return { instrument, notes, gains, durations, values, pitch_targets: targets }
  }
  return [makePart('bass', slices.map((slice) => slice.mean)), makePart('harp', slices.map((slice) => slice.peak)), makePart('flute', slices.map(() => 0))]
}

/** Client-side pixel analyzer for uploaded images on `/scan`. */
async function analyzeImageClient(file: File, model: string): Promise<AnalyzeResponse> {
  const dataUrl = await imgFromFile(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const cols = 12
  const rows = 6
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 48
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const cells: SpecCell[] = []
  const bw = canvas.width / cols
  const bh = canvas.height / rows
  const brightGrid = new Float32Array(rows * cols)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let hot = 0
      let green = 0
      let water = 0
      let white = 0
      let dark = 0
      let count = 0
      const x0 = Math.floor(c * bw)
      const x1 = Math.floor((c + 1) * bw)
      const y0 = Math.floor(r * bh)
      const y1 = Math.floor((r + 1) * bh)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * canvas.width + x) * 4
          const R = (data[p] ?? 0) / 255
          const G = (data[p + 1] ?? 0) / 255
          const B = (data[p + 2] ?? 0) / 255
          rSum += R
          gSum += G
          bSum += B
          const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
          if (R > 0.65 && R > G * 1.25 && R > B * 1.3) hot++
          if (G > 0.35 && G > R * 1.15 && G > B * 1.15) green++
          if (B > 0.35 && B > R * 1.15) water++
          if (lum > 0.78) white++
          if (lum < 0.2) dark++
          count++
        }
      }
      const n = count || 1
      const R = rSum / n
      const G = gSum / n
      const B = bSum / n
      const mx = Math.max(R, G, B)
      const mn = Math.min(R, G, B)
      const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
      const sat = mx > 0 ? (mx - mn) / mx : 0
      brightGrid[r * cols + c] = lum
      cells.push({
        row: r,
        col: c,
        cx: (c + 0.5) / cols,
        cy: (r + 0.5) / rows,
        brightness: Number(lum.toFixed(3)),
        saturation: Number(sat.toFixed(3)),
        hue: R >= G && R >= B ? 0.05 : G >= B ? 0.33 : 0.62,
        turbulence: 0,
        edges: 0,
        gradient: 0,
        hot: Number((hot / n).toFixed(3)),
        green: Number((green / n).toFixed(3)),
        water: Number((water / n).toFixed(3)),
        white: Number((white / n).toFixed(3)),
        dark: Number((dark / n).toFixed(3)),
        rel: Number(lum.toFixed(3)),
      })
    }
  }

  let bSum = 0
  let tSum = 0
  let sSum = 0
  let hSum = 0
  let gSum = 0
  let wSum = 0
  let whSum = 0
  let dSum = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const v = brightGrid[idx] ?? 0
      const right = brightGrid[r * cols + Math.min(cols - 1, c + 1)] ?? v
      const down = brightGrid[Math.min(rows - 1, r + 1) * cols + c] ?? v
      const grad = Math.min(1, Math.hypot(right - v, down - v) * 3)
      const cell = cells[idx]!
      cell.gradient = Number(grad.toFixed(3))
      cell.turbulence = Number(grad.toFixed(3))
      cell.edges = Number(grad.toFixed(3))
      bSum += cell.brightness
      tSum += cell.turbulence
      sSum += cell.saturation
      hSum += cell.hot
      gSum += cell.green
      wSum += cell.water
      whSum += cell.white
      dSum += cell.dark
    }
  }

  const n = cells.length || 1
  const duration = 4
  const layers: SpecLayer[] = []
  const layerModel = model === 'storm' ? 'droplet' : model === 'fire' ? 'crackle' : model === 'ocean' ? 'swell' : model === 'space' ? 'scan' : 'turbulence'

  if (layerModel === 'droplet' || layerModel === 'crackle') {
    const events = cells
      .filter((c) => (layerModel === 'droplet' ? c.brightness > 0.25 : c.hot + c.brightness > 0.35))
      .map((c, i) => ({
        t: (c.cx * (duration - 1)) + ((i % 3) * 0.15),
        f: 450 + c.brightness * 1800,
        g: 0.18 + c.turbulence * 0.25,
        p: c.cx * 1.6 - 0.8,
        d: layerModel === 'crackle' ? 0.012 : 0.024,
      }))
    layers.push({
      kind: 'hit',
      model: layerModel,
      t0: 0,
      dur: duration,
      gain: 0.45,
      ...(layerModel === 'droplet' ? { drops: events } : { hits: events }),
    })
  } else if (layerModel === 'scan') {
    for (let c = 0; c < cols; c++) {
      const colCells = cells.filter((cell) => cell.col === c)
      const avg = colCells.reduce((a, b) => a + b.brightness, 0) / colCells.length
      layers.push({
        kind: 'tone',
        model: 'scan',
        t0: (c / cols) * duration,
        dur: duration / cols,
        gain: 0.15 + avg * 0.25,
        freq: 220 + avg * 660,
        pan: (c / (cols - 1)) * 1.6 - 0.8,
      })
    }
  } else {
    for (let r = 0; r < rows; r++) {
      const rowCells = cells.filter((cell) => cell.row === r)
      const avg = rowCells.reduce((a, b) => a + b.brightness, 0) / rowCells.length
      const turb = rowCells.reduce((a, b) => a + b.turbulence, 0) / rowCells.length
      layers.push({
        kind: layerModel === 'swell' ? 'swell' : 'noise',
        model: layerModel,
        t0: 0,
        dur: duration,
        gain: 0.08 + avg * 0.14,
        freq: 240 + (1 - r / rows) * 900,
        q: 1.4,
        gust: 0.5 + turb * 1.5,
        pan: (r / (rows - 1)) * 1.2 - 0.6,
      })
    }
  }

  return {
    filename: file.name,
    width: img.naturalWidth,
    height: img.naturalHeight,
    model,
    title: file.name,
    explain: `Client-side luminance measurement (${cols}×${rows} cells), played as a chord-constrained bass and harp with intensity-driven level. This is an uncalibrated artistic mapping, not a scientific value reading.`,
    duration,
    layers: [],
    voices: clientVoices(cells, model),
    mapping: `Brightness → bass pitch · peak brightness → harp pitch · eight west-to-east steps on a steady 0.5 s pulse (uncalibrated upload)`,
    grid: { cols, rows, cells },
    frame_stats: {
      brightness: bSum / n,
      turbulence: tSum / n,
      saturation: sSum / n,
      hot: hSum / n,
      green: gSum / n,
      water: wSum / n,
      white: whSum / n,
      dark: dSum / n,
    },
  }
}

export const api = {
  datasets: async (): Promise<Dataset[]> => {
    const summaries = await json<TerraTrackSummary[]>('/tracks')
    const details = await Promise.all(
      summaries.map((s) => json<TerraTrackDetail>(`/tracks/${encodeURIComponent(s.id)}`).catch(() => undefined)),
    )
    return summaries.map((s, i) => toDataset(s, details[i]))
  },

  dataset: async (id: string): Promise<Dataset> => {
    const d = await json<TerraTrackDetail>(`/tracks/${encodeURIComponent(id)}`)
    return toDataset(d, d)
  },

  /** The calibrated measurement grid plus the TerraTunes soundscape stream for playback. */
  spec: async (id: string, frame = 0): Promise<Spec> => {
    const enc = encodeURIComponent(id)
    const [detail, score, grid] = await Promise.all([
      json<TerraTrackDetail>(`/tracks/${enc}`),
      json<TerraScore>(`/tracks/${enc}/score?preset=musical`),
      json<TerraGridResponse>(`/tracks/${enc}/frames/${frame}/grid`),
    ])
    const model = phenomenonToModel(detail.sound?.phenomenon, detail.theme)
    const { cells, stats } = buildCellsFromGrid(grid, detail, model)
    const duration = score.frames.length * 4.0 + 1.5
    return {
      model,
      title: detail.title,
      duration,
      layers: scoreToLayers(score),
      mapping: detail.sound?.description ?? detail.audio_key,
      explain: detail.sound?.listening_guide ?? detail.audio_key,
      grid: { cols: 12, rows: 6, cells },
      frame_stats: stats,
      audioUrl: detail.sound
        ? `${BASE}/tracks/${enc}/render?mode=sweep&format=mp3&melody=true&v=${encodeURIComponent(score.mapping_version)}`
        : undefined,
      terraDetail: detail,
      terraScore: score,
      colorWaves: buildColorWaves(grid),
    }
  },

  frameWaves: async (id: string, frame: number) => {
    const grid = await json<TerraGridResponse>(`/tracks/${encodeURIComponent(id)}/frames/${frame}/grid`)
    return buildColorWaves(grid)
  },

  /** Thumbnail small enough for sleeves and disc labels. */
  frameUrl: (id: string) => `${BASE}/tracks/${encodeURIComponent(id)}/thumbnail`,

  /** Full quality frame image, for the measurement view. */
  framePngUrl: (id: string, frame = 0) => `${BASE}/tracks/${encodeURIComponent(id)}/frames/${frame}`,

  assetUrl: (id: string, asset: string) => `${BASE}/tracks/${encodeURIComponent(id)}/frames/${asset}`,

  renderUrl: (id: string) => `${BASE}/tracks/${encodeURIComponent(id)}/render?mode=sweep&format=mp3&melody=true`,

  /** The offline render of the same physical spec — same sound as the stream. */
  renderWavUrl: (id: string) => `${BASE}/tracks/${encodeURIComponent(id)}/render?mode=sweep&format=wav&melody=true`,

  analyze: (file: File, model: string) => analyzeImageClient(file, model),
}

export function imgFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
