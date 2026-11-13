import { AspectRatio } from "@my-better-t-app/ui/components/aspect-ratio";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";

import { player } from "@/audio/player";
import { usePlayer } from "@/audio/use-player";
import { FrameCanvas } from "@/features/visuals/frame-canvas";
import { prepareCanvas, useCanvasSize } from "@/hooks/use-canvas-size";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { FrameScore, Legend, ModeId, ValueGrid } from "@/lib/api/types";
import { GRID_MAX, NO_DATA } from "@/lib/api/types";
import { themeColor, useThemeVersion } from "@/lib/theme-colors";

export interface Cell {
  col: number;
  row: number;
}

interface FrameStageProps {
  grid: ValueGrid | undefined;
  legend: Legend;
  imageUrl: string | null;
  frame: FrameScore | undefined;
  mode: ModeId;
  cursor: Cell | null;
  onCursorChange: (cell: Cell, source: "keyboard" | "pointer") => void;
  onReadValue: () => void;
  readoutId: string;
}

/** Normalized value (0..1) at a cell, or null when there is no data. */
export function cellValue(grid: ValueGrid | undefined, cell: Cell | null): number | null {
  if (!grid || !cell) return null;
  const raw = grid.cells[cell.row * grid.cols + cell.col] ?? NO_DATA;
  return raw === NO_DATA ? null : raw / GRID_MAX;
}

function Overlay({ frame, mode, cursor, grid }: Pick<FrameStageProps, "frame" | "mode" | "cursor" | "grid">) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(wrapRef);
  const { status } = usePlayer();
  const reduced = useReducedMotion();
  const themeVersion = useThemeVersion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = prepareCanvas(canvas, size);
    if (!ctx) return;
    const primary = themeColor("primary");
    const band = themeColor("primary", 0.22);
    const halo = themeColor("background");
    const { width: w, height: h } = size;
    let raf = 0;

    const ring = (x: number, y: number, r: number) => {
      ctx.lineWidth = 4;
      ctx.strokeStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = primary;
      ctx.stroke();
    };

    const paint = () => {
      ctx.clearRect(0, 0, w, h);
      const playhead = status === "playing" ? player.getPlayhead() : null;

      if (playhead && mode === "scan") {
        const colW = w / playhead.stepsPerFrame;
        ctx.fillStyle = band;
        ctx.fillRect(playhead.step * colW, 0, colW, h);
        if (!reduced) {
          const x = playhead.progress * w;
          ctx.fillStyle = halo;
          ctx.fillRect(x - 2, 0, 4, h);
          ctx.fillStyle = primary;
          ctx.fillRect(x - 1, 0, 2, h);
        }
      }

      if (frame?.hotspot && mode !== "explore") {
        ring(frame.hotspot.x * w, frame.hotspot.y * h, 9 + frame.hotspot.strength * 6);
      }

      if (mode === "explore" && cursor && grid) {
        const cw = w / grid.cols;
        const ch = h / grid.rows;
        const x = cursor.col * cw;
        const y = cursor.row * ch;
        ctx.fillStyle = themeColor("primary", 0.12);
        ctx.fillRect(x + cw / 2 - 0.5, 0, 1, h);
        ctx.fillRect(0, y + ch / 2 - 0.5, w, 1);
        ctx.lineWidth = 4;
        ctx.strokeStyle = halo;
        ctx.strokeRect(x, y, cw, ch);
        ctx.lineWidth = 2;
        ctx.strokeStyle = primary;
        ctx.strokeRect(x, y, cw, ch);
      }

      if (status === "playing") raf = requestAnimationFrame(paint);
    };

    paint();
    return () => cancelAnimationFrame(raf);
  }, [size, status, mode, frame, cursor, grid, reduced, themeVersion]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}

export function FrameStage(props: FrameStageProps) {
  const { grid, legend, imageUrl, frame, mode, cursor, onCursorChange, onReadValue, readoutId } = props;
  const lastPointer = useRef(0);
  const cols = grid?.cols ?? 64;
  const rows = grid?.rows ?? 32;

  const cellFromPointer = (event: PointerEvent<HTMLDivElement>): Cell => {
    const rect = event.currentTarget.getBoundingClientRect();
    const col = Math.min(cols - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * rows)));
    return { col, row };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now - lastPointer.current < 60) return;
    const cell = cellFromPointer(event);
    if (cursor && cell.col === cursor.col && cell.row === cursor.row) return;
    lastPointer.current = now;
    onCursorChange(cell, "pointer");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const stepSize = event.shiftKey ? 4 : 1;
    const current = cursor ?? { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stepSize, 0],
      ArrowRight: [stepSize, 0],
      ArrowUp: [0, -stepSize],
      ArrowDown: [0, stepSize],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      event.stopPropagation();
      onCursorChange(
        {
          col: (current.col + move[0] + cols) % cols, // longitude wraps
          row: Math.min(rows - 1, Math.max(0, current.row + move[1])),
        },
        "keyboard",
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onReadValue();
    }
  };

  const label = frame?.description ?? "Loading frame";

  return (
    <AspectRatio ratio={cols / rows} className="overflow-hidden bg-muted ring-1 ring-foreground/10">
      <div role="img" aria-label={label} className="absolute inset-0">
        <FrameCanvas grid={grid} legend={legend} imageUrl={imageUrl} />
      </div>
      <Overlay frame={frame} mode={mode} cursor={cursor} grid={grid} />
      {mode === "explore" ? (
        <div
          data-explore-surface
          role="application"
          aria-roledescription="explorable map"
          aria-label="Explore the map. Use arrow keys to move one cell, Shift plus arrows for bigger steps, Enter to read the value."
          aria-describedby={readoutId}
          tabIndex={0}
          className="absolute inset-0 cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onKeyDown={onKeyDown}
          onPointerMove={onPointerMove}
          onPointerDown={(event) => {
            event.currentTarget.focus();
            onCursorChange(cellFromPointer(event), "pointer");
          }}
          onFocus={() => {
            if (!cursor) onCursorChange({ col: Math.floor(cols / 2), row: Math.floor(rows / 2) }, "keyboard");
          }}
        />
      ) : null}
    </AspectRatio>
  );
}
