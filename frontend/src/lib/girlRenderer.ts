import { isGirlTransition, nextGirlMotion } from "./girlMotion";
import type { GirlRequest, GirlState } from "./girlMotion";

export interface GirlAsset {
  video: string;
  still: string;
  duration: number;
}
export interface GirlAssets {
  width: number;
  height: number;
  fps: number;
  states: Record<GirlState, GirlAsset>;
}

/** One visible RGBA surface. Every draw clears old alpha before painting. */
export class GirlRenderer {
  private video: HTMLVideoElement | null = null;
  private generation = 0;
  private frameId = 0;
  private videoFrameId = 0;
  private timer = 0;
  private disposed = false;
  private playing = false;
  private reduced = false;
  private state: GirlState = "standing";
  private requestedProgress = 0;
  private painted = false;
  private context: CanvasRenderingContext2D | null;

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: GirlAssets,
    private onState: (state: GirlState) => void,
  ) {
    canvas.width = assets.width;
    canvas.height = assets.height;
    this.context = canvas.getContext("2d");
  }

  update(playing: boolean, reduced: boolean): void {
    if (this.disposed) return;
    const wasReduced = this.reduced;
    this.playing = playing;
    this.reduced = reduced;
    if (wasReduced && !reduced) {
      this.begin({
        state: playing ? "sitting" : "standing",
        progress: 0,
        still: true,
      });
      return;
    }
    const duration = this.video?.duration ?? 0;
    const progress =
      this.video && Number.isFinite(duration) && duration > 0
        ? this.video.currentTime / duration
        : this.requestedProgress;
    const request = nextGirlMotion(this.state, playing, progress, reduced);
    if (request) {
      if (reduced && wasReduced && request.state === this.state) return;
      this.begin(request);
    } else if (this.generation === 0) {
      this.begin({
        state: playing ? "sitting" : "standing",
        progress: 0,
        still: true,
      });
    }
  }

  private stopMedia(): void {
    window.clearTimeout(this.timer);
    cancelAnimationFrame(this.frameId);
    if (this.video) {
      if (this.videoFrameId && this.video.cancelVideoFrameCallback)
        this.video.cancelVideoFrameCallback(this.videoFrameId);
      this.video.pause();
      this.video.onloadeddata =
        this.video.onseeked =
        this.video.onended =
        this.video.onerror =
        this.video.oncanplay =
          null;
      this.video.removeAttribute("src");
      this.video.load();
    }
    this.video = null;
    this.frameId = this.videoFrameId = 0;
  }

  private begin(request: GirlRequest): void {
    this.generation += 1;
    const id = this.generation;
    this.stopMedia();
    this.state = request.state;
    this.requestedProgress = request.progress;
    this.onState(this.state);
    this.canvas.dataset.girlState = this.state;
    const asset = this.assets.states[this.state];
    // Idle art is a single settled frame. Replaying the source plate here
    // caused the old pointing/headphone gestures to loop forever. Only the
    // two transition states are temporal media.
    const shouldStill = request.still || !isGirlTransition(request.state);
    let videoDrawn = false;
    const valid = () => !this.disposed && this.generation === id;
    const paint = (source: CanvasImageSource, time = 0) => {
      if (!valid() || !this.context) return;
      // Alpha video must never be composited over a different pose's still.
      this.context.clearRect(0, 0, this.assets.width, this.assets.height);
      this.context.drawImage(
        source,
        0,
        0,
        this.assets.width,
        this.assets.height,
      );
      this.painted = true;
      this.canvas.dataset.girlAsset = request.state;
      this.canvas.dataset.girlTime = time.toFixed(3);
    };
    const still = new Image();
    still.onload = () => {
      // Keep the last decoded frame during a reversed transition; the new
      // clip's first still is not the matching interrupted pose.
      if (
        valid() &&
        !videoDrawn &&
        (shouldStill ||
          !this.painted ||
          (!isGirlTransition(request.state) && request.progress === 0))
      )
        paint(still);
    };
    still.src = asset.still;
    if (shouldStill) {
      this.canvas.dataset.girlMode = "still";
      return;
    }
    const video = document.createElement("video");
    this.video = video;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = !isGirlTransition(request.state);
    this.canvas.dataset.girlMode = "loading";
    let prepared = false;
    let lastTime = -1;
    let lastPaint = -Infinity;
    let loopStarted = false;
    let playPending = false;
    let attempts = 0;
    const fail = () => {
      if (!valid()) return;
      if (isGirlTransition(request.state)) {
        this.begin({
          state: this.playing ? "sitting" : "standing",
          progress: 0,
          still: true,
        });
      } else {
        this.stopMedia();
        this.canvas.dataset.girlMode = "fallback";
        // A late image load is guarded by the same generation.
        if (still.complete && still.naturalWidth) paint(still);
      }
    };
    const draw = () => {
      if (!valid()) return;
      const now = performance.now();
      if (
        now - lastPaint >= 1000 / this.assets.fps &&
        video.readyState >= 2 &&
        !video.seeking &&
        video.currentTime !== lastTime
      ) {
        try {
          paint(video, video.currentTime);
          videoDrawn = true;
          lastTime = video.currentTime;
          lastPaint = now;
          this.canvas.dataset.girlMode = "video";
        } catch {
          fail();
          return;
        }
      }
      // Detached video elements can omit compositor frame callbacks. Sampling
      // at the asset's fps works even when only the canvas is in the DOM.
      this.frameId = requestAnimationFrame(draw);
    };
    const start = () => {
      if (
        !valid() ||
        playPending ||
        video.seeking ||
        video.readyState < 2 ||
        attempts >= 2
      )
        return;
      attempts += 1;
      playPending = true;
      void video
        .play()
        .then(() => {
          playPending = false;
          if (valid() && !loopStarted) {
            loopStarted = true;
            draw();
          }
        })
        .catch(() => {
          playPending = false;
          if (valid() && attempts >= 2) fail();
        });
    };
    video.onloadeddata = () => {
      if (!valid() || prepared) return;
      prepared = true;
      if (request.progress >= 0.9999 && isGirlTransition(request.state)) {
        this.begin({
          state: this.playing ? "sitting" : "standing",
          progress: 0,
          still: true,
        });
        return;
      }
      if (request.progress > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(
          video.duration - 1 / this.assets.fps,
          request.progress * video.duration,
        );
      } else start();
    };
    video.onseeked = start;
    video.oncanplay = () => {
      if (prepared) start();
    };
    video.onended = () => {
      if (!valid() || !isGirlTransition(request.state)) return;
      // Preserve the last transition frame until the matching idle loop is ready.
      if (video.readyState >= 2) paint(video, video.currentTime);
      this.begin({
        state: this.playing ? "sitting" : "standing",
        progress: 0,
        still: this.reduced,
      });
    };
    video.onerror = fail;
    this.timer = window.setTimeout(
      () => {
        if (valid() && (isGirlTransition(request.state) || !videoDrawn)) fail();
      },
      (isGirlTransition(request.state)
        ? asset.duration * (1 - request.progress) + 3
        : 6) * 1000,
    );
    video.src = asset.video;
    video.load();
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.stopMedia();
  }
}
