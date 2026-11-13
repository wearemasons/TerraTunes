import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@my-better-t-app/ui/components/chart";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";

import { player } from "@/audio/player";
import type { Legend, Score } from "@/lib/api/types";
import { formatSigned, formatValue } from "@/lib/format";

const config = {
  tension: { label: "Change (tension)", color: "var(--chart-2)" },
  mean: { label: "Average value", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function timelineSummary(score: Score, legend: Legend): string {
  const frames = score.frames;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) return "";
  const real = (v: number) => legend.min + v * (legend.max - legend.min);
  const peak = frames.reduce((a, b) => (b.tension > a.tension ? b : a), first);
  const delta = real(last.stats.mean) - real(first.stats.mean);
  return `Average ${legend.label.toLowerCase()} goes from ${formatValue(real(first.stats.mean))} to ${formatValue(real(last.stats.mean))} ${legend.unit} (${formatSigned(delta)}). The fastest change is at ${peak.label}.`;
}

export function TensionTimeline({ score, legend, frame }: { score: Score; legend: Legend; frame: number }) {
  const data = score.frames.map((f) => ({
    index: f.index,
    label: f.label,
    tension: Number(f.tension.toFixed(3)),
    mean: Number(f.stats.mean.toFixed(3)),
  }));
  const current = data[frame];

  return (
    <figure className="grid gap-2" aria-labelledby="timeline-caption">
      {/* Mouse shortcut for seeking; keyboard users have the frame slider. */}
      <ChartContainer config={config} className="aspect-auto h-32 w-full" aria-hidden="true">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
          onClick={(state) => {
            const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : Number(state?.activeTooltipIndex);
            if (Number.isFinite(index)) player.seek(index);
          }}
          className="cursor-pointer"
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis domain={[0, 1]} hide />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          {current ? <ReferenceLine x={current.label} stroke="var(--foreground)" strokeDasharray="3 3" /> : null}
          <Bar dataKey="tension" fill="var(--color-tension)" radius={0} isAnimationActive={false} />
          <Line dataKey="mean" type="monotone" stroke="var(--color-mean)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
      <figcaption id="timeline-caption" className="text-sm text-muted-foreground">
        {timelineSummary(score, legend)}
      </figcaption>
    </figure>
  );
}
