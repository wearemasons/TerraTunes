import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api";

const METHOD = [
  {
    n: "01",
    title: "Start with NASA’s measurements",
    body: "Each record uses frames from the NASA Scientific Visualization Studio product linked on its sleeve. The painted backgrounds and opening film are illustration, not scientific data. The frames and their source credits remain available in the Data Deck.",
  },
  {
    n: "02",
    title: "Recover values from the colourbar",
    body: "NumPy and Pillow match image colours against each track’s calibrated colourbar in CIELAB colour space. A 96 × 48 grid keeps median scale positions. Colours outside the matching tolerance are no data, not low values. Compression, missing pixels and the calibration limit what can be inferred.",
  },
  {
    n: "03",
    title: "Let the data choose the notes",
    body: "This comparison branch uses the engine from main. Calibrated column values select pitch; extreme-value share shapes level and brightness, and frame-to-frame tension pushes the tempo. Scan travels west to east with stereo position, Overview summarizes each frame, and Explore probes a local cell.",
  },
  {
    n: "04",
    title: "Separate the music from the measurement",
    body: "Orchestra plays the Clear tone’s data notes on recorded instruments, with an ensemble chosen for each visualization. Bass, chords and movement are accompaniment derived from those notes, not extra scientific measurements. Clear tone strips away that accompaniment. Musical adds the theme’s synthetic timbres, rhythm and accents.",
  },
];

const INSTRUMENTS = [
  [
    "Orchestra",
    "Recorded instruments",
    "The same Clear tone data melody on a graph-specific lead instrument, with bass, chord and movement parts derived from the notes. VSCO-2 Community Edition samples are CC0. The Data Deck lists who plays what.",
  ],
  [
    "Clear tone",
    "Focused data pitch",
    "A plain tone follows the calibrated column values without orchestral accompaniment. It is the reference option for comparing the data melody with the ensemble.",
  ],
  [
    "Musical",
    "Theme timbres and rhythm",
    "Synthetic instruments, rhythmic density, tension and hotspot accents provide a more expressive view. The audio key describes the measured channels and the limits of that interpretation.",
  ],
];

export function AboutPage() {
  const { data } = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });

  return (
    <div className="mx-auto max-w-[1100px] px-3 pb-12 pt-2 sm:px-5">
      <header className="tt-paper mb-3 p-4 sm:p-6">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-ink-soft">
          NASA Space Apps Challenge 2026 · The Earth Information Jukebox
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          A jukebox that plays the Earth
        </h1>
        <p className="mt-2 max-w-[68ch] text-[13px] font-semibold leading-relaxed text-ink-soft">
          {data?.length ?? 9} records made from NASA visualizations. This branch
          pairs main’s engine with the illustrated jukebox and its complete
          scientific controls. The cabinet is the interface; the audio key
          explains what the music can—and cannot—tell you.
        </p>
      </header>

      <section
        className="grid gap-2.5 sm:grid-cols-2"
        aria-label="The measurement and mapping process"
      >
        {METHOD.map((m) => (
          <article key={m.n} className="tt-paper p-3.5">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-ink-soft">
              {m.n}
            </p>
            <h2 className="mt-0.5 font-display text-[17px] font-semibold text-ink">
              {m.title}
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
              {m.body}
            </p>
          </article>
        ))}
      </section>

      <section className="tt-paper mt-3 p-3.5 sm:p-5">
        <h2 className="font-display text-xl font-semibold text-ink">
          Three sounds, one measured map
        </h2>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
          {INSTRUMENTS.map(([name, channel, description]) => (
            <article key={name}>
              <h3 className="font-display text-[17px] font-semibold text-ink">
                {name}
              </h3>
              <p className="font-display text-[10px] font-bold text-ink-soft">
                {channel}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="tt-paper mt-3 p-3.5 sm:p-5">
        <h2 className="font-display text-xl font-semibold text-ink">
          What a scan tells you
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
          Sixteen scan steps traverse a frame from west to east. Timing follows
          the track’s tempo and measured tension, not a fixed four-second clock.
          Each step summarizes a longitude strip; Explore can read a single cell
          when north–south location matters. This traversal is geography, not
          observation time. Averaging can hide local peaks or cancel opposite
          changes. Scanning is one exploration method, not a claim of ideal
          sonification.
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
          No-data values are marked separately from low values. A previously
          played note or the musical accompaniment can still ring; silence alone
          is not an exact missing-data test. The Data Deck keeps the values,
          dates, regions and transcript alongside the sound. Accessibility
          controls are implemented, but this candidate has not been validated
          with blind or low-vision listeners.
        </p>
      </section>

      <section className="tt-paper mt-3 p-3.5 sm:p-5">
        <h2 className="font-display text-xl font-semibold text-ink">
          The records
        </h2>
        <p className="mt-1 text-[11.5px] font-semibold text-ink-soft">
          Each sleeve links to the NASA product it came from, with its credit
          line.
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {(data ?? []).map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-2 rounded-xl border border-ink-soft/20 p-2"
            >
              <img
                src={api.frameUrl(d.id)}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="truncate font-display text-[11.5px] font-bold text-ink">
                  {d.short}
                </p>
                <p className="text-[10px] font-semibold text-ink-soft">
                  {d.svs_id ? `SVS ${d.svs_id}` : "source page"} · {d.sensor}
                </p>
                {d.svs_url && (
                  <a
                    href={d.svs_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-ink underline"
                  >
                    <ExternalLink size={9} /> Open the source
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="tt-paper mt-3 p-3.5 sm:p-5">
        <h2 className="font-display text-xl font-semibold text-ink">
          Under the hood
        </h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">
          FastAPI serves main’s calibrated scores, natural-soundscape exports
          and recorded-instrument sample endpoints. The jukebox uses main’s Web
          Audio player directly; its analyser drives the live meters. Downloaded
          natural soundscapes are a separately labelled renderer, not a claim to
          be a capture of the current Orchestra playback. Uploaded photos use
          uncalibrated luminance mapping and are explicitly labelled artistic,
          not scientific. React, TanStack Router and Query, and Zustand drive
          the interface.
        </p>
      </section>
    </div>
  );
}
