import type { PresetId, Score, TrackDetail, TrackSummary, ValueGrid } from "./types";

/** Everything the UI needs from the calibrated backend API. */
export interface DataSource {
  kind: "api";
  listTracks(): Promise<TrackSummary[]>;
  getTrack(id: string): Promise<TrackDetail>;
  getScore(id: string, preset: PresetId): Promise<Score>;
  getGrid(id: string, frame: number): Promise<ValueGrid>;
  /** Image URL for a frame, or null when frames are drawn from the value grid. */
  frameImageUrl(id: string, frame: number): string | null;
}

export class NotFoundError extends Error {
  override name = "NotFoundError";
}

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API_URL = "/api";

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" } });
  if (response.status === 404) throw new NotFoundError(path);
  if (!response.ok) throw new ApiError(`Request failed: ${path}`, response.status);
  return (await response.json()) as T;
}

interface GridResponse {
  cols: number;
  rows: number;
  cells_b64: string;
  real_min: number;
  real_max: number;
  unit: string;
}

function createApiSource(): DataSource {
  const enc = encodeURIComponent;
  return {
    kind: "api",
    listTracks: () => getJson<TrackSummary[]>("/tracks"),
    getTrack: (id) => getJson<TrackDetail>(`/tracks/${enc(id)}`),
    getScore: (id, preset) => getJson<Score>(`/tracks/${enc(id)}/score?preset=${enc(preset)}`),
    async getGrid(id, frame) {
      const data = await getJson<GridResponse>(`/tracks/${enc(id)}/frames/${frame}/grid`);
      return { ...data, cells: decodeBase64(data.cells_b64) };
    },
    frameImageUrl: (id, frame) => `${API_URL}/tracks/${enc(id)}/frames/${frame}`,
  };
}

let sourcePromise: Promise<DataSource> | null = null;

/** The calibrated API is the only source; unavailable data must not be presented as demo data. */
export function getSource(): Promise<DataSource> {
  sourcePromise ??= Promise.resolve(createApiSource());
  return sourcePromise;
}
