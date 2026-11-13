import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Upload } from "lucide-react";
import { api, imgFromFile } from "../lib/api";
import type { Spec } from "../lib/audio/phenomena";
import { player, usePlayer } from "@main/audio/use-player";
import type { ThemeId } from "@main/lib/api/types";
import { useUI } from "../lib/store";
import { FrameScanner } from "../components/FrameScanner";
import { Spectrum } from "../components/Spectrum";
import type { AnalyzeResponse } from "../lib/types";

const MODELS = [
  ["wind", "Wind", "inspect airflow imagery"],
  ["storm", "Storm", "inspect rain imagery"],
  ["fire", "Fire", "inspect heat imagery"],
  ["ocean", "Ocean", "inspect ocean imagery"],
  ["city", "City", "inspect city imagery"],
  ["canopy", "Canopy", "inspect vegetation imagery"],
  ["plume", "Plume", "inspect plume imagery"],
  ["space", "Space", "inspect astronomical imagery"],
] as const;

const SAMPLES = [
  ["precipitation", "storm"],
  ["carbon-monoxide", "fire"],
  ["wind-speed", "wind"],
  ["sea-surface-temperature", "ocean"],
  ["nitrogen-oxides", "city"],
  ["vegetation", "canopy"],
] as const;

/**
 * Scan any frame: upload or pick a bundled NASA frame, inspect its image features and
 * score luminance with main’s mapping, and hear main’s Orchestra preset.
 */
export function ScanPage() {
  const [result, setResult] = useState<
    (AnalyzeResponse & { id?: string }) | null
  >(null);
  const [model, setModel] = useState<string>("wind");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const snapshot = usePlayer();
  const playing = snapshot.status === "playing";
  const energy: Float32Array | null = null;
  const inputRef = useRef<HTMLInputElement>(null);
  const announce = useUI((s) => s.announce);
  const setPlayingStore = useUI((s) => s.setPlaying);

  useEffect(() => {
    player.pause();
    return () => {
      player.unload();
      setPlayingStore(false);
    };
  }, [setPlayingStore]);
  useEffect(() => setPlayingStore(playing), [playing, setPlayingStore]);
  const loadResult = (value: AnalyzeResponse | Spec) => {
    const score = value.terraScore;
    if (!score) throw new Error("No main-engine score returned");
    player.setPreset("orchestra");
    player.setMode("scan");
    const theme =
      "terraDetail" in value
        ? (value.terraDetail?.theme ?? "weather")
        : "weather";
    player.load({ trackId: score.track_id, score, theme: theme as ThemeId });
  };

  const runFile = async (file: File) => {
    try {
      setBusy(true);
      setError("");
      setPreview(await imgFromFile(file));
      const res = await api.analyze(file, model);
      setResult(res);
      loadResult(res);
      announce(`${file.name} measured and read as ${model}. ${res.explain}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  const runSample = async (id: string, m: string) => {
    try {
      setBusy(true);
      setModel(m);
      const spec = await api.spec(id);
      setResult({ ...spec, filename: id, width: 0, height: 0, id });
      setPreview(api.framePngUrl(id));
      loadResult(spec);
      announce(`${id}: ${spec.explain}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (!result) return;
    player.toggle();
  };

  return (
    <div className="mx-auto max-w-[1180px] px-3 py-4 sm:px-5">
      <header className="tt-paper mb-3 p-3.5 sm:p-4">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-ink-soft">
          measure · map · synthesise
        </p>
        <h1 className="mt-0.5 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Read any frame
        </h1>
        <p className="mt-1.5 max-w-2xl text-[12px] font-semibold leading-relaxed text-[#3a2a18bf]">
          Bundled NASA frames use their calibrated main-engine score. Uploaded
          photos use luminance and are explicitly artistic, not scientific
          measurements. Main’s Orchestra plays both.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-2.5">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void runFile(f);
            }}
            className="tt-paper flex min-h-36 flex-col items-center justify-center gap-2 border-dashed p-4 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void runFile(f);
              }}
            />
            <Upload size={18} className="text-[#7c6144b2]" />
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-full border-2 border-[#a9773d] bg-gradient-to-b from-[#ffe9b8] to-[#e0a95f] px-3.5 py-1.5 text-[11.5px] font-bold text-ink shadow-[0_2px_0_#a9773d] transition active:translate-y-[1px] active:shadow-none"
            >
              choose a frame
            </button>
            <p className="font-display text-[9px] font-bold uppercase tracking-wider text-[#7c6144b2]">
              png · jpg · webp · drag or drop
            </p>
            {busy && (
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#a2641f]">
                <Loader2 size={11} className="animate-spin" /> measuring…
              </p>
            )}
            {error && (
              <p className="text-[10.5px] font-semibold text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="tt-paper p-2.5">
            <p className="mb-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-soft">
              visual inspection label (uploads remain luminance-based)
            </p>
            <div className="grid grid-cols-2 gap-1">
              {MODELS.map(([key, label, blurb]) => (
                <button
                  key={key}
                  onClick={() => setModel(key)}
                  aria-pressed={model === key}
                  className={`rounded-lg px-2 py-1 text-left transition ${
                    model === key
                      ? "bg-[#e8b96f73] ring-2 ring-[#a9773d]"
                      : "bg-[#fff8e899] hover:bg-[#fff8e8]"
                  }`}
                >
                  <span className="block text-[10.5px] font-bold text-ink">
                    {label}
                  </span>
                  <span className="block truncate text-[8.5px] font-semibold text-ink-soft">
                    {blurb}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="tt-paper p-2.5">
            <p className="mb-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-soft">
              or read a bundled NASA frame
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {SAMPLES.map(([id, m]) => (
                <button
                  key={id}
                  onClick={() => void runSample(id, m)}
                  className="overflow-hidden rounded-lg border-2 border-[#d8b077] transition hover:border-[#a9773d]"
                  aria-label={`Read ${id} as ${m}`}
                >
                  <img
                    src={api.frameUrl(id)}
                    alt=""
                    className="h-12 w-full object-cover"
                  />
                  <span className="block truncate bg-[#3a2716] px-1 py-0.5 text-[8px] font-semibold text-[#ffe9b8]">
                    {m} · {id}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {preview && (
            <div className="overflow-hidden rounded-[18px] border-2 border-[#a9773d]">
              <img
                src={preview}
                alt="Frame being measured"
                className="max-h-56 w-full bg-black/40 object-contain"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          {!result && (
            <div className="tt-paper flex h-full min-h-48 flex-col items-center justify-center gap-1.5 p-5 text-center">
              <p className="font-display text-[13px] font-semibold text-ink-soft">
                Measurements appear here
              </p>
              <p className="max-w-xs text-[10.5px] font-semibold leading-relaxed text-[#7c6144cc]">
                A 6 × 12 grid of cells, each carrying brightness, saturation,
                hue, texture, gradient, and the colour fractions (hot / green /
                water / white / dark) that the phenomenon models read.
              </p>
            </div>
          )}

          {result && (
            <>
              <FrameScanner
                imageUrl={
                  result.id ? api.framePngUrl(result.id) : (preview ?? "")
                }
                cells={result.grid.cells}
                cols={result.grid.cols}
                rows={result.grid.rows}
                model={result.model}
                energy={energy}
              />

              <div className="tt-paper p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[13px] font-semibold text-ink">
                      {result.title}
                    </p>
                    <p className="font-display text-[9px] font-bold uppercase tracking-wider text-ink-soft">
                      {result.model} · main Orchestra ·{" "}
                      {result.duration.toFixed(1)}s
                    </p>
                  </div>
                  <button
                    onClick={() => void toggle()}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-[#a9773d] bg-gradient-to-b from-[#ffe9b8] to-[#e0a95f] px-2.5 py-1.5 text-[11px] font-bold text-ink shadow-[0_2px_0_#a9773d] transition active:translate-y-[1px] active:shadow-none"
                  >
                    {playing ? (
                      <Pause size={11} fill="currentColor" />
                    ) : (
                      <Play size={11} fill="currentColor" />
                    )}
                    {playing ? "Pause" : "Play"}
                  </button>
                </div>
                <p className="mt-1.5 text-[10.5px] font-semibold leading-relaxed text-[#3a2a18cc]">
                  {result.explain}
                </p>
              </div>

              <div className="h-20 rounded-[16px] border-2 border-[#d8b077] bg-[#3a2716] p-1.5">
                <Spectrum
                  accent="#ffcf7d"
                  label={
                    playing ? "live output" : "press play to hear this frame"
                  }
                />
              </div>

              <div className="tt-paper p-2.5">
                <p className="mb-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-soft">
                  mapping
                </p>
                <p className="text-[10px] font-semibold leading-snug text-[#3a2a18cc]">
                  {result.mapping}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
