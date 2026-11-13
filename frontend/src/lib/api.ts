import type { SpecCell, SpecLayer } from "./audio/phenomena";
import type {
  AnalyzeResponse,
  Dataset,
  Spec,
  TerraGridResponse,
  TerraScore,
  TerraTrackDetail,
  TerraTrackSummary,
} from "./types";

const BASE = "/api";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

function phenomenonToModel(
  phenomenon?: string,
  theme?: string,
): Dataset["model"] {
  switch (phenomenon) {
    case "rain":
      return "storm";
    case "fire":
      return "fire";
    case "traffic":
      return "city";
    case "surf":
      return "ocean";
    case "biophony":
      return "canopy";
    case "haze":
      return "plume";
    case "wind":
    case "temperature":
      return "wind";
    default:
      if (theme === "wildfires") return "fire";
      if (theme === "ocean") return "ocean";
      if (theme === "agriculture") return "canopy";
      if (theme === "air_quality") return "plume";
      return "wind";
  }
}

function themeToElement(theme: string): Dataset["element"] {
  switch (theme) {
    case "water":
    case "disasters":
      return "storms";
    case "wildfires":
      return "fire";
    case "ocean":
    case "sea_level":
      return "ocean";
    case "agriculture":
    case "biodiversity":
    case "energy":
      return "land";
    default:
      return "wind";
  }
}

function parseSvsId(url: string | null): string {
  if (!url) return "";
  const m = url.match(/\/(\d+)\/?$/);
  return m ? m[1] : "";
}

function sampleSeries(labels: string[]): Dataset["series"] {
  if (!labels.length) return [];
  const count = Math.min(6, labels.length);
  const out: Dataset["series"] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx =
      count === 1 ? 0 : Math.round((i / (count - 1)) * (labels.length - 1));
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push({
      asset: String(idx),
      label: labels[idx] ?? `Frame ${idx + 1}`,
      frameIndex: idx,
    });
  }
  return out;
}

function toDataset(s: TerraTrackSummary, d?: TerraTrackDetail): Dataset {
  const model = phenomenonToModel(d?.sound?.phenomenon, s.theme);
  const svsId = parseSvsId(s.source_url);
  const sensor = d
    ? `${d.legend.label} (${d.legend.unit})`
    : s.theme.replace("_", " ");
  return {
    id: s.id,
    title: s.title,
    short: s.title.replace(/\s*\([^)]*\)$/, ""),
    svs_id: svsId,
    svs_url: s.source_url ?? "",
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
  };
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildCellsFromGrid(
  grid: TerraGridResponse,
  detail: TerraTrackDetail,
  model: Dataset["model"],
): { cells: SpecCell[]; stats: Record<string, number> } {
  const raw = decodeBase64(grid.cells_b64);
  const targetRows = 6;
  const targetCols = 12;
  const cells: SpecCell[] = [];

  const rowStep = grid.rows / targetRows;
  const colStep = grid.cols / targetCols;

  const gridValues = new Float32Array(targetRows * targetCols);
  const gridCoverage = new Float32Array(targetRows * targetCols);

  for (let r = 0; r < targetRows; r++) {
    const r0 = Math.floor(r * rowStep);
    const r1 = Math.max(r0 + 1, Math.floor((r + 1) * rowStep));
    for (let c = 0; c < targetCols; c++) {
      const c0 = Math.floor(c * colStep);
      const c1 = Math.max(c0 + 1, Math.floor((c + 1) * colStep));
      let sum = 0;
      let valid = 0;
      let total = 0;
      let hotCount = 0;
      for (let rr = r0; rr < r1; rr++) {
        for (let cc = c0; cc < c1; cc++) {
          total++;
          const v = raw[rr * grid.cols + cc] ?? 255;
          if (v !== 255) {
            const norm = v / 250;
            sum += norm;
            valid++;
            if (norm > 0.72) hotCount++;
          }
        }
      }
      const mean = valid > 0 ? sum / valid : 0;
      gridValues[r * targetCols + c] = mean;
      gridCoverage[r * targetCols + c] = total > 0 ? valid / total : 0;
      const anchors = detail.legend.anchors;
      let sat = 0.5;
      let hue = 0.5;
      if (anchors.length >= 2 && valid > 0) {
        const idx = Math.min(
          anchors.length - 1,
          Math.floor(mean * (anchors.length - 1)),
        );
        const [R, G, B] = anchors[idx]?.rgb ?? [128, 128, 128];
        const mx = Math.max(R, G, B) / 255;
        const mn = Math.min(R, G, B) / 255;
        sat = mx > 0 ? (mx - mn) / mx : 0;
        hue = R >= G && R >= B ? 0.05 : G >= B ? 0.33 : 0.62;
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
        green: model === "canopy" ? Number(mean.toFixed(3)) : 0,
        water:
          model === "ocean" || model === "storm"
            ? Number((valid / Math.max(1, total)).toFixed(3))
            : 0,
        white:
          model === "storm" || model === "plume"
            ? Number((mean > 0.6 ? mean : 0).toFixed(3))
            : 0,
        dark: Number((1 - mean).toFixed(3)),
        rel: Number(mean.toFixed(3)),
      });
    }
  }

  let bSum = 0;
  let tSum = 0;
  let sSum = 0;
  let hSum = 0;
  let gSum = 0;
  let wSum = 0;
  let whSum = 0;
  let dSum = 0;

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < targetCols; c++) {
      const idx = r * targetCols + c;
      const v = gridValues[idx] ?? 0;
      const right =
        gridValues[r * targetCols + Math.min(targetCols - 1, c + 1)] ?? v;
      const down =
        gridValues[Math.min(targetRows - 1, r + 1) * targetCols + c] ?? v;
      const grad = Math.min(1, Math.hypot(right - v, down - v) * 2.5);
      const cell = cells[idx]!;
      cell.gradient = Number(grad.toFixed(3));
      cell.turbulence = Number(Math.min(1, grad * 1.15).toFixed(3));
      cell.edges = cell.turbulence;

      bSum += cell.brightness;
      tSum += cell.turbulence;
      sSum += cell.saturation;
      hSum += cell.hot;
      gSum += cell.green;
      wSum += cell.water;
      whSum += cell.white;
      dSum += cell.dark;
    }
  }

  const n = cells.length || 1;
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
  };
}

export function buildColorWaves(grid: TerraGridResponse): {
  cool: number[];
  mid: number[];
  hot: number[];
  peak: number[];
} {
  const raw = decodeBase64(grid.cells_b64);
  const bins = 48;
  const cool: number[] = [];
  const mid: number[] = [];
  const hot: number[] = [];
  const peak: number[] = [];

  for (let b = 0; b < bins; b++) {
    const c0 = Math.floor((b * grid.cols) / bins);
    const c1 = Math.max(c0 + 1, Math.floor(((b + 1) * grid.cols) / bins));
    let cCnt = 0;
    let mCnt = 0;
    let hCnt = 0;
    let valid = 0;
    let maxVal = 0;
    let sumVal = 0;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = c0; c < c1; c++) {
        const v = raw[r * grid.cols + c] ?? 255;
        if (v === 255) continue;
        valid++;
        const norm = v / 250;
        sumVal += norm;
        if (norm > maxVal) maxVal = norm;
        cCnt += Math.max(0, Math.min(1, (0.45 - norm) / 0.45));
        mCnt += Math.max(0, Math.min(1, 1 - Math.abs(norm - 0.5) / 0.35));
        hCnt += Math.max(0, Math.min(1, (norm - 0.55) / 0.45));
      }
    }
    const denom = Math.max(1, valid);
    const meanVal = sumVal / denom;
    const dynGate = Math.pow(meanVal, 1.35);
    const cv = (cCnt / denom) * (0.18 + 0.82 * dynGate);
    const mv = (mCnt / denom) * (0.2 + 0.8 * dynGate);
    const hv = hCnt / denom;
    // Low on calm/unchanged areas; steep analog spike on concentrated peak areas
    const pv = Math.min(
      1,
      Math.pow(meanVal, 2.2) * 0.45 +
        Math.pow(hv, 1.65) * 0.65 +
        Math.pow(Math.max(0, maxVal - 0.52) / 0.48, 2.15) * 0.92,
    );
    cool.push(Number(cv.toFixed(3)));
    mid.push(Number(mv.toFixed(3)));
    hot.push(Number(hv.toFixed(3)));
    peak.push(Number(pv.toFixed(3)));
  }
  return { cool, mid, hot, peak };
}

function scoreToLayers(score: TerraScore): SpecLayer[] {
  // Main scores contain calibrated frame metadata, not legacy browser voice events.
  void score;
  return [];
}
function mainScoreDuration(score: TerraScore): number {
  const stepSeconds = 60 / score.key.bpm / 2;
  return score.frames.reduce(
    (total, frame) =>
      total + (score.steps_per_frame * stepSeconds) / (1 + 0.2 * frame.tension),
    0,
  );
}

async function analyzeImageClient(
  file: File,
  model: string,
): Promise<AnalyzeResponse> {
  const dataUrl = await imgFromFile(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const cols = 12;
  const rows = 6;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 48;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const cells: SpecCell[] = [];
  const bw = canvas.width / cols;
  const bh = canvas.height / rows;
  const brightGrid = new Float32Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let hot = 0;
      let green = 0;
      let water = 0;
      let white = 0;
      let dark = 0;
      let count = 0;
      const x0 = Math.floor(c * bw);
      const x1 = Math.floor((c + 1) * bw);
      const y0 = Math.floor(r * bh);
      const y1 = Math.floor((r + 1) * bh);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * canvas.width + x) * 4;
          const R = (data[p] ?? 0) / 255;
          const G = (data[p + 1] ?? 0) / 255;
          const B = (data[p + 2] ?? 0) / 255;
          rSum += R;
          gSum += G;
          bSum += B;
          const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          if (R > 0.65 && R > G * 1.25 && R > B * 1.3) hot++;
          if (G > 0.35 && G > R * 1.15 && G > B * 1.15) green++;
          if (B > 0.35 && B > R * 1.15) water++;
          if (lum > 0.78) white++;
          if (lum < 0.2) dark++;
          count++;
        }
      }
      const n = count || 1;
      const R = rSum / n;
      const G = gSum / n;
      const B = bSum / n;
      const mx = Math.max(R, G, B);
      const mn = Math.min(R, G, B);
      const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      brightGrid[r * cols + c] = lum;
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
      });
    }
  }

  let bSum = 0;
  let tSum = 0;
  let sSum = 0;
  let hSum = 0;
  let gSum = 0;
  let wSum = 0;
  let whSum = 0;
  let dSum = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const v = brightGrid[idx] ?? 0;
      const right = brightGrid[r * cols + Math.min(cols - 1, c + 1)] ?? v;
      const down = brightGrid[Math.min(rows - 1, r + 1) * cols + c] ?? v;
      const grad = Math.min(1, Math.hypot(right - v, down - v) * 3);
      const cell = cells[idx]!;
      cell.gradient = Number(grad.toFixed(3));
      cell.turbulence = Number(grad.toFixed(3));
      cell.edges = Number(grad.toFixed(3));
      bSum += cell.brightness;
      tSum += cell.turbulence;
      sSum += cell.saturation;
      hSum += cell.hot;
      gSum += cell.green;
      wSum += cell.water;
      whSum += cell.white;
      dSum += cell.dark;
    }
  }

  const n = cells.length || 1;
  const form = new FormData();
  form.append("file", file);
  const analyzed = await json<{ calibrated: false; score: TerraScore }>(
    "/analyze",
    { method: "POST", body: form },
  );
  const score = analyzed.score;
  const duration = mainScoreDuration(score);

  return {
    filename: file.name,
    width: img.naturalWidth,
    height: img.naturalHeight,
    model,
    title: file.name,
    explain: `Client-side luminance measurement (${cols}×${rows} cells), scored by main’s engine and played by its Orchestra preset. This is an uncalibrated artistic mapping, not a scientific value reading.`,
    duration,
    layers: [],
    terraScore: score,
    mapping: `Luminance → main’s column pitch mapping · sixteen west-to-east steps · uncalibrated artistic upload`,
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
  };
}

export const api = {
  datasets: async (): Promise<Dataset[]> => {
    const summaries = await json<TerraTrackSummary[]>("/tracks");
    const details = await Promise.all(
      summaries.map((s) =>
        json<TerraTrackDetail>(`/tracks/${encodeURIComponent(s.id)}`).catch(
          () => undefined,
        ),
      ),
    );
    return summaries.map((s, i) => toDataset(s, details[i]));
  },

  dataset: async (id: string): Promise<Dataset> => {
    const d = await json<TerraTrackDetail>(`/tracks/${encodeURIComponent(id)}`);
    return toDataset(d, d);
  },

  /** The calibrated measurement grid plus the TerraTunes soundscape stream for playback. */
  spec: async (id: string, frame = 0): Promise<Spec> => {
    const enc = encodeURIComponent(id);
    const [detail, score, grid] = await Promise.all([
      json<TerraTrackDetail>(`/tracks/${enc}`),
      json<TerraScore>(`/tracks/${enc}/score?preset=orchestra`),
      json<TerraGridResponse>(`/tracks/${enc}/frames/${frame}/grid`),
    ]);
    const model = phenomenonToModel(detail.sound?.phenomenon, detail.theme);
    const { cells, stats } = buildCellsFromGrid(grid, detail, model);
    const duration = mainScoreDuration(score);
    return {
      model,
      title: detail.title,
      duration,
      layers: scoreToLayers(score),
      mapping: detail.audio_key,
      explain: detail.audio_key,
      grid: { cols: 12, rows: 6, cells },
      frame_stats: stats,
      audioUrl: detail.sound
        ? `${BASE}/tracks/${enc}/render?mode=sweep&format=mp3&melody=true&v=${encodeURIComponent(score.mapping_version)}`
        : undefined,
      terraDetail: detail,
      terraScore: score,
      colorWaves: buildColorWaves(grid),
    };
  },

  frameWaves: async (id: string, frame: number) => {
    const grid = await json<TerraGridResponse>(
      `/tracks/${encodeURIComponent(id)}/frames/${frame}/grid`,
    );
    return buildColorWaves(grid);
  },

  /** Thumbnail small enough for sleeves and disc labels. */
  frameUrl: (id: string) =>
    `${BASE}/tracks/${encodeURIComponent(id)}/thumbnail`,

  /** Full quality frame image, for the measurement view. */
  framePngUrl: (id: string, frame = 0) =>
    `${BASE}/tracks/${encodeURIComponent(id)}/frames/${frame}`,

  assetUrl: (id: string, asset: string) =>
    `${BASE}/tracks/${encodeURIComponent(id)}/frames/${asset}`,

  renderUrl: (id: string) =>
    `${BASE}/tracks/${encodeURIComponent(id)}/render?mode=sweep&format=mp3&melody=true`,

  /** Main backend natural soundscape export, not the browser Orchestra playback. */
  renderWavUrl: (id: string) =>
    `${BASE}/tracks/${encodeURIComponent(id)}/render?mode=sweep&format=wav&melody=true`,

  analyze: (file: File, model: string) => analyzeImageClient(file, model),
};

export function imgFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
