import { Alert, AlertDescription, AlertTitle } from "@my-better-t-app/ui/components/alert";
import { Crosshair } from "lucide-react";

import type { Legend, ValueGrid } from "@/lib/api/types";
import { formatLatLon, formatValue } from "@/lib/format";
import { legendValue } from "@/lib/legend";

import { type Cell, cellValue } from "./frame-stage";

export function readoutText(grid: ValueGrid | undefined, cell: Cell | null, legend: Legend): string {
  if (!grid || !cell) return "Move over the map, or focus it and use the arrow keys.";
  const where = formatLatLon((cell.col + 0.5) / grid.cols, (cell.row + 0.5) / grid.rows);
  const value = cellValue(grid, cell);
  if (value === null) return `${where}: no data here.`;
  const real = legendValue(value, legend);
  return `${where}: ${legend.label.toLowerCase()} ${formatValue(real)} ${legend.unit}.`;
}

export function ExploreReadout({ id, grid, cell, legend }: { id: string; grid: ValueGrid | undefined; cell: Cell | null; legend: Legend }) {
  return (
    <Alert>
      <Crosshair aria-hidden="true" />
      <AlertTitle>Explore mode</AlertTitle>
      {/* Not a live region: the explicit "read value" key announces, so moving stays quiet. */}
      <AlertDescription id={id} className="text-sm text-foreground tabular-nums">
        {readoutText(grid, cell, legend)}
      </AlertDescription>
    </Alert>
  );
}
