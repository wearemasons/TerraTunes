import { type ChartConfig, ChartContainer } from "@my-better-t-app/ui/components/chart";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import type { FrameScore, Score } from "@/lib/api/types";
import { midiToName } from "@/lib/format";

import { usePlayheadStep } from "./use-playhead";

const config = {
  note: { label: "Note", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function contourSummary(frame: FrameScore): string {
  const notes = frame.column_notes;
  const sounding = notes.filter((n) => n >= 0);
  if (sounding.length === 0) return "This frame is silent: no data along the sweep.";
  const lo = Math.min(...sounding);
  const hi = Math.max(...sounding);
  const peak = notes.indexOf(hi);
  const where = peak < notes.length / 3 ? "west" : peak > (notes.length * 2) / 3 ? "east" : "middle";
  const silent = notes.length - sounding.length;
  return `Melody spans ${midiToName(lo)} to ${midiToName(hi)}, highest in the ${where}.${silent ? ` ${silent} of ${notes.length} slices are silent.` : ""}`;
}

export function PitchContour({ score, frame }: { score: Score; frame: FrameScore }) {
  const playhead = usePlayheadStep();
  const root = score.key.root_midi;
  const data = frame.column_notes.map((note, i) => ({ step: i + 1, note: note < 0 ? null : note }));
  const steps = frame.column_notes.length;
  const activeStep = playhead && playhead.frame === frame.index && playhead.stepsPerFrame === steps ? playhead.step + 1 : null;

  return (
    <figure className="grid gap-2" aria-labelledby="contour-caption">
      <ChartContainer config={config} className="aspect-auto h-36 w-full" aria-hidden="true">
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="step"
            tickLine={false}
            axisLine={false}
            ticks={[1, steps]}
            tickFormatter={(v: number) => (v === 1 ? "West" : "East")}
          />
          <YAxis
            domain={[root, root + 36]}
            ticks={[root, root + 12, root + 24, root + 36]}
            tickFormatter={(v: number) => midiToName(v)}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          {activeStep ? <ReferenceLine x={activeStep} stroke="var(--color-note)" strokeOpacity={0.5} strokeWidth={8} /> : null}
          <Line
            dataKey="note"
            type="stepAfter"
            stroke="var(--color-note)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <figcaption id="contour-caption" className="text-sm text-muted-foreground">
        {contourSummary(frame)}
      </figcaption>
    </figure>
  );
}
