import type {
  FrameScore,
  Legend,
  Score,
  TrackDetail,
  ValueGrid,
} from "@main/lib/api/types";

export interface Cell {
  col: number;
  row: number;
}
export interface DeckData {
  track: TrackDetail;
  score: Score;
  frame: FrameScore | undefined;
  grid: ValueGrid | undefined;
  imageUrl: string | null;
  frameIndex: number;
}
export interface ExploreProps {
  grid: ValueGrid | undefined;
  legend: Legend;
  cell: Cell | null;
  onCellChange: (cell: Cell, source: "pointer" | "keyboard") => void;
  onReadValue: () => void;
  readoutId: string;
}
export type PlayerLike = ReturnType<
  typeof import("@main/audio/use-player").usePlayer
>;
