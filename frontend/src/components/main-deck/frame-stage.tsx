import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { buildLut, gridToImageData } from "@main/lib/colormap";
import type {
  FrameScore,
  Legend,
  ModeId,
  ValueGrid,
} from "@main/lib/api/types";
import { GRID_MAX, NO_DATA } from "@main/lib/api/types";
import {
  formatLatLon,
  formatValue,
  lowerFirst,
  midiToName,
} from "@main/lib/format";
import { legendValue } from "@main/lib/legend";
import type { Cell, ExploreProps } from "./types";
import { useDeckPlayhead } from "./playhead";
import { sliceMaximum } from "./scan-value";

function BaseCanvas({
  grid,
  legend,
  imageUrl,
  showImage,
}: {
  grid: ValueGrid | undefined;
  legend: Legend;
  imageUrl: string | null;
  showImage: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let image: HTMLImageElement | null = null;
    let observer: ResizeObserver | undefined;
    const paint = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (showImage && image) {
        ctx.drawImage(image, 0, 0, rect.width, rect.height);
        return;
      }
      if (grid) {
        const source = document.createElement("canvas");
        source.width = grid.cols;
        source.height = grid.rows;
        source
          .getContext("2d")
          ?.putImageData(gridToImageData(grid, buildLut(legend)), 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, 0, 0, rect.width, rect.height);
        return;
      }
      ctx.fillStyle = "#27190e";
      ctx.fillRect(0, 0, rect.width, rect.height);
    };
    if (imageUrl) {
      image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = paint;
      image.src = imageUrl;
    } else paint();
    paint();
    observer = new ResizeObserver(paint);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => {
      observer?.disconnect();
      if (image) image.onload = null;
    };
  }, [grid, legend, imageUrl, showImage]);
  return (
    <canvas ref={canvasRef} className="deck-frame-canvas" aria-hidden="true" />
  );
}

function cellValue(
  grid: ValueGrid | undefined,
  cell: Cell | null,
): number | null {
  if (!grid || !cell) return null;
  const raw = grid.cells[cell.row * grid.cols + cell.col] ?? NO_DATA;
  return raw === NO_DATA ? null : raw / GRID_MAX;
}

function ExploreSurface({
  grid,
  cell,
  onCellChange,
  onReadValue,
  readoutId,
}: ExploreProps) {
  const lastPointer = useRef(0);
  const cols = grid?.cols ?? 64;
  const rows = grid?.rows ?? 32;
  const fromPointer = (event: PointerEvent<HTMLDivElement>): Cell => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      col: Math.min(
        cols - 1,
        Math.max(
          0,
          Math.floor(((event.clientX - rect.left) / rect.width) * cols),
        ),
      ),
      row: Math.min(
        rows - 1,
        Math.max(
          0,
          Math.floor(((event.clientY - rect.top) / rect.height) * rows),
        ),
      ),
    };
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 4 : 1;
    const current = cell ?? {
      col: Math.floor(cols / 2),
      row: Math.floor(rows / 2),
    };
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = movement[event.key];
    if (delta) {
      event.preventDefault();
      event.stopPropagation();
      onCellChange(
        {
          col: (current.col + delta[0] + cols) % cols,
          row: Math.min(rows - 1, Math.max(0, current.row + delta[1])),
        },
        "keyboard",
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onReadValue();
    }
  };
  return (
    <div
      className="deck-explore-surface"
      role="application"
      aria-roledescription="explorable map"
      aria-label="Explore the map. Use arrow keys to move one cell, Shift plus arrows for bigger steps, Enter to read the value."
      aria-describedby={readoutId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        const now = performance.now();
        if (now - lastPointer.current < 60) return;
        const next = fromPointer(event);
        if (cell && next.col === cell.col && next.row === cell.row) return;
        lastPointer.current = now;
        onCellChange(next, "pointer");
      }}
      onPointerDown={(event) => {
        event.currentTarget.focus();
        onCellChange(fromPointer(event), "pointer");
      }}
      onFocus={() => {
        if (!cell)
          onCellChange(
            { col: Math.floor(cols / 2), row: Math.floor(rows / 2) },
            "keyboard",
          );
      }}
    />
  );
}

export function FrameStage({
  grid,
  legend,
  imageUrl,
  frame,
  mode,
  showImage,
  showGrid,
  cursor,
  onCursorChange,
  onReadValue,
  readoutId,
}: {
  grid: ValueGrid | undefined;
  legend: Legend;
  imageUrl: string | null;
  frame: FrameScore | undefined;
  mode: ModeId;
  showImage: boolean;
  showGrid: boolean;
  cursor: Cell | null;
  onCursorChange: (cell: Cell, source: "pointer" | "keyboard") => void;
  onReadValue: () => void;
  readoutId: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const scanReadout = useRef<HTMLParagraphElement>(null);
  const [fit, setFit] = useState<{ width: number; height: number } | null>(
    null,
  );
  const playhead = useDeckPlayhead();
  const cols = grid?.cols ?? 64;
  const rows = grid?.rows ?? 32;
  useLayoutEffect(() => {
    const host = wrap.current;
    if (!host) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (!desktop.matches) {
        setFit(null);
        return;
      }
      const textHeight = scanReadout.current
        ? scanReadout.current.offsetHeight + 7
        : 0;
      const availableHeight = Math.max(1, host.clientHeight - textHeight);
      const width = Math.max(
        1,
        Math.min(host.clientWidth, (availableHeight * cols) / rows),
      );
      const height = (width * rows) / cols;
      setFit((old) =>
        old &&
        Math.abs(old.width - width) < 0.5 &&
        Math.abs(old.height - height) < 0.5
          ? old
          : { width, height },
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    if (scanReadout.current) observer.observe(scanReadout.current);
    desktop.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", update);
    };
  }, [cols, rows, mode]);
  const explore = mode === "explore";
  const steps = playhead?.stepsPerFrame ?? frame?.column_notes.length ?? 16;
  const step = playhead?.step ?? 0;
  const slice = sliceMaximum(grid, step, steps);
  const midi = frame?.column_notes[step] ?? -1;
  const noteLabel = midi < 0 ? "silence / no data" : midiToName(midi);
  const maxLabel = slice
    ? `${formatValue(legendValue(slice.normalized, legend))} ${legend.unit}`
    : "no data";
  const readout =
    cursor && grid
      ? (() => {
          const value = cellValue(grid, cursor);
          const where = formatLatLon(
            (cursor.col + 0.5) / grid.cols,
            (cursor.row + 0.5) / grid.rows,
          );
          return value === null
            ? `${where}: no data here.`
            : `${where}: ${lowerFirst(legend.label)} ${formatValue(legendValue(value, legend))} ${legend.unit}.`;
        })()
      : "Move over the map, or focus it and use the arrow keys.";
  return (
    <div ref={wrap} className="deck-frame-wrap">
      <div
        className="deck-frame-media"
        style={{
          aspectRatio: `${cols}/${rows}`,
          ...(fit
            ? { width: fit.width, height: fit.height, flex: "0 0 auto" }
            : {}),
        }}
      >
        <BaseCanvas
          grid={grid}
          legend={legend}
          imageUrl={imageUrl}
          showImage={showImage}
        />
        {showGrid && grid && (
          <div
            className="deck-grid-overlay"
            style={{
              gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
              gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
            }}
            aria-hidden="true"
          >
            {Array.from({ length: grid.cols * grid.rows }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        )}
        {playhead && mode === "scan" && (
          <>
            <div
              data-scan-band
              style={{
                position: "absolute",
                insetBlock: 0,
                left: `${(playhead.step / playhead.stepsPerFrame) * 100}%`,
                width: `${100 / playhead.stepsPerFrame}%`,
                background: "rgba(255, 209, 111, .22)",
                borderInline: "1px solid rgba(255, 235, 190, .28)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
            <div
              className="deck-playhead"
              style={{ left: `${playhead.progress * 100}%` }}
              aria-hidden="true"
            />
          </>
        )}
        {frame?.hotspot && mode !== "explore" && (
          <div
            className="deck-hotspot"
            style={{
              left: `${frame.hotspot.x * 100}%`,
              top: `${frame.hotspot.y * 100}%`,
              width: `${18 + frame.hotspot.strength * 12}px`,
              height: `${18 + frame.hotspot.strength * 12}px`,
            }}
            aria-label="Frame hotspot"
          />
        )}
        {mode === "scan" && (
          <>
            {slice && grid && (
              <div
                data-slice-maximum
                style={{
                  position: "absolute",
                  left: `${((slice.col + 0.5) / grid.cols) * 100}%`,
                  top: `${((slice.row + 0.5) / grid.rows) * 100}%`,
                  width: 9,
                  height: 9,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  border: "2px solid #fff5cf",
                  background: "#d9821e",
                  boxShadow: "0 0 0 2px #39210c",
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              />
            )}
            <div
              data-scan-value-badge
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                padding: "6px 9px",
                border: "1px solid #d6a457",
                borderRadius: 8,
                background: "rgba(41,25,13,.92)",
                color: "#fff0cc",
                fontSize: 11,
                pointerEvents: "none",
                maxWidth: "calc(100% - 20px)",
              }}
            >
              <b>{maxLabel}</b>
              <span style={{ opacity: 0.85 }}> slice max · {noteLabel}</span>
            </div>
          </>
        )}
        {explore && (
          <ExploreSurface
            grid={grid}
            legend={legend}
            cell={cursor}
            onCellChange={onCursorChange}
            onReadValue={onReadValue}
            readoutId={`${readoutId}-live`}
          />
        )}
        {explore && cursor && (
          <div
            className="deck-cursor-cell"
            style={{
              left: `${(cursor.col / cols) * 100}%`,
              top: `${(cursor.row / rows) * 100}%`,
              width: `${100 / cols}%`,
              height: `${100 / rows}%`,
            }}
            aria-hidden="true"
          />
        )}
      </div>
      {mode === "scan" && (
        <p
          ref={scanReadout}
          data-scan-readout
          style={{
            width: "100%",
            flex: "0 0 auto",
            margin: "7px 0 0",
            display: "flex",
            gap: "6px 16px",
            flexWrap: "wrap",
            fontSize: 11,
            color: "#684823",
          }}
        >
          <span>
            Current slice {step + 1}/{steps} · {frame?.label}
          </span>
          <span>
            Highest {lowerFirst(legend.label)}: <b>{maxLabel}</b>
          </span>
          <span>
            Scored note: <b>{noteLabel}</b>
            {midi >= 0 ? ` · MIDI ${midi}` : ""}
          </span>
        </p>
      )}
      <p className="sr-only" id={`${readoutId}-live`}>
        {readout}
      </p>
    </div>
  );
}
