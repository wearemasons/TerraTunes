/**
 * Match-moving the live page onto the last frame of the opening film.
 *
 * A cross-fade only reads as "the same moment" if the two pictures agree about
 * where things are. The film puts the cabinet right of centre and the girl large
 * in the left foreground; the app centres a tall cabinet and keeps her small at
 * its foot. Fading between those two is a double image of a jukebox.
 *
 * So the film is not re-cut. Instead, at the instant the picture freezes — while
 * the overlay is still fully opaque and none of this can be seen — the live
 * cabinet and the live girl are transformed so that their rectangles on screen
 * land exactly on the film's, using the same object-cover crop the browser used
 * to paint the film. The dissolve then runs between two aligned images. When the
 * film has gone, the page eases back to its own framing over the next beat, so
 * what the visitor reads is a camera pulling gently out of the film into the app.
 *
 * The arithmetic is done in viewport pixels against measured rectangles, so it
 * survives any window size, and the girl's transform is corrected for the scale
 * already applied to her parent — she sits inside the cabinet container, so her
 * own numbers have to be divided back out through it.
 */

/** a box as fractions of the film frame */
export interface NormBox {
  l: number
  t: number
  w: number
  h: number
}

/** which point of the box is pinned */
export type Anchor = 'top-left' | 'bottom-center'

export interface Framing {
  /** the film's intrinsic size, in px */
  frame: readonly [number, number]
  cabinet: NormBox
  girl: NormBox
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** where the film's whole frame sits once object-cover has cropped it */
function cropRect(vw: number, vh: number, frame: readonly [number, number]): Box {
  const [fw, fh] = frame
  const s = Math.max(vw / fw, vh / fh)
  const w = fw * s
  const h = fh * s
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }
}

function targetBox(box: NormBox, crop: Box): Box {
  return { x: crop.x + box.l * crop.w, y: crop.y + box.t * crop.h, w: box.w * crop.w, h: box.h * crop.h }
}

function pin(b: Box, anchor: Anchor) {
  return anchor === 'top-left' ? { x: b.x, y: b.y } : { x: b.x + b.w / 2, y: b.y + b.h }
}

/**
 * The transform to write on `wrapper` so that the thing drawn inside it
 * (`inner`, measured independently) lands on `target`.
 *
 * `parentK` is the scale already applied by an ancestor's match transform: a
 * local translate of d shows up on screen as d * parentK, so it is divided back
 * out here. Scales are clamped because a very short window would otherwise ask
 * for a cabinet stretched to twice its size, and the art is a raster.
 */
function fit(inner: Box, wrapper: Box, target: Box, anchor: Anchor, parentK: number, ease: 'full' | 'half' = 'full') {
  const need = target.w / inner.w
  // `half` is for the girl: in the film she is a close-up, and matching her size
  // exactly would mean blowing a 258px sprite up to three times its height. She
  // is instead moved to where she belongs and grown by the geometric mean —
  // enough that the two figures overlap through the dissolve, not enough to
  // turn her soft. A blurred soft figure is also a worse girl than a sharp one.
  const k = clamp(ease === 'half' ? Math.sqrt(need) : need, 0.32, 2.2)
  const o = { x: wrapper.x + wrapper.w / 2, y: wrapper.y + wrapper.h / 2 }
  const a = pin(inner, anchor)
  const t = pin(target, anchor)
  return {
    k,
    dx: (t.x - o.x - (a.x - o.x) * k) / parentK,
    dy: (t.y - o.y - (a.y - o.y) * k) / parentK,
  }
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

/**
 * Run the match-move. Returns a cleanup that puts every style back, because a
 * component that has borrowed the page's geometry must give it back.
 */
export function playMatchCut(opts: {
  stage: HTMLElement | null
  girl: HTMLElement | null
  framing: Framing
  /** how long to hold the film's framing — the length of the cross-fade */
  holdMs: number
  /** how long the page takes to settle into its own framing afterwards */
  settleMs: number
}): () => void {
  const { stage, girl, framing, holdMs, settleMs } = opts
  if (!stage) return () => {}
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}

  const crop = cropRect(window.innerWidth, window.innerHeight, framing.frame)
  const cabinetTarget = targetBox(framing.cabinet, crop)
  const girlTarget = targetBox(framing.girl, crop)

  const saved = new Map<HTMLElement, string>()
  const remember = (el: HTMLElement) => {
    saved.set(el, `${el.style.transform}|${el.style.transformOrigin}|${el.style.transition}`)
    el.style.transition = 'none'
    el.style.transform = ''
    el.style.transformOrigin = '50% 50%'
  }
  const restoreAll = () => {
    for (const [el, v] of saved) {
      const [transform, origin, transition] = v.split('|')
      el.style.transform = transform ?? ''
      el.style.transformOrigin = origin ?? ''
      el.style.transition = transition ?? ''
      el.style.filter = ''
    }
  }

  // measure both at identity: the girl is drawn inside the stage, so her sprite
  // has to be read from the element that actually paints her
  remember(stage)
  const stageSprite = stage
  const girlSprite = girl?.firstElementChild ?? null
  if (girl) remember(girl)

  const stageRect = boxOf(stageSprite)
  const f1 = fit(stageRect, stageRect, cabinetTarget, 'top-left', 1)
  stage.style.transform = `translate(${f1.dx.toFixed(1)}px, ${f1.dy.toFixed(1)}px) scale(${f1.k.toFixed(4)})`
  // A two-pixel softening over the dissolve: the two cabinets are within a few
  // percent of each other, and a blur that small reads as one picture coming
  // into focus rather than two pictures crossing.
  stage.style.filter = 'blur(2px)'

  const f2 = girl && girlSprite ? fit(boxOf(girlSprite), boxOf(girl), girlTarget, 'bottom-center', f1.k, 'half') : null
  if (girl && f2) {
    girl.style.transform = `translate(${f2.dx.toFixed(1)}px, ${f2.dy.toFixed(1)}px) scale(${f2.k.toFixed(4)})`
  }
  void stage.offsetWidth // the jump must be committed before the settle begins

  const settle = window.setTimeout(() => {
    const ease = `transform ${settleMs}ms cubic-bezier(.22,.9,.24,1), filter ${settleMs}ms linear`
    for (const el of [stage, girl]) {
      if (!el) continue
      el.style.transition = ease
      el.style.transform = ''
    }
  }, holdMs)

  const done = window.setTimeout(restoreAll, holdMs + settleMs + 80)

  return () => {
    window.clearTimeout(settle)
    window.clearTimeout(done)
    restoreAll()
  }
}
