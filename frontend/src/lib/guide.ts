/**
 * The character's guided tour of the jukebox.
 *
 * Every line is a real recording of one voice, and every step waits for the
 * visitor to actually do the thing she just described before moving on, so the
 * tour is a guided action rather than a lecture they have to sit through.
 * Durations are measured from the delivered audio files.
 */
export type GuideWait =
  | "none"
  /** the cabinet switch was thrown */
  | "powered"
  /** a record reached the platter */
  | "loaded"
  /** the needle is down and sound is running */
  | "playing"
  /** the data deck is on screen */
  | "deck";

export interface GuideStep {
  id: string;
  audio: string;
  /** seconds of speech, measured from the delivered file */
  duration: number;
  caption: string;
  /** what the bubble says while waiting for the visitor to act */
  nudge: string;
  /** `data-guide` value of the control to ring, if any */
  target?: string;
  wait: GuideWait;
  /** what to tell a screen reader when this step is reached */
  announce: string;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "welcome",
    audio: "/voice/guide/01-welcome.m4a",
    duration: 9.28,
    caption:
      "Hey. Welcome to Terra Tunes. I keep this jukebox — and what it plays is the planet. Give me a minute, and I’ll show you how.",
    nudge: "Ready when you are.",
    wait: "none",
    announce: "Guided tour started. Press Escape at any time to stop it.",
  },
  {
    id: "power",
    audio: "/voice/guide/02-power.m4a",
    duration: 8.52,
    caption:
      "It starts down here, with the little brass switch at the bottom left of the cabinet. That’s the power. Flip it, and the whole thing wakes up.",
    nudge: "Your turn — flip the brass switch.",
    target: "power",
    wait: "powered",
    announce: "The tour is pointing at the power switch.",
  },
  {
    id: "crate",
    audio: "/voice/guide/03-crate.m4a",
    duration: 12.76,
    caption:
      "Bottom right is the crate. Nine records, nine worlds — temperature, wind, rain, haze, fire, traffic, the sea. Pick one and it flies straight onto the platter.",
    nudge: "Open the crate and pick a record.",
    target: "crate",
    wait: "loaded",
    announce: "The tour is pointing at the record crate.",
  },
  {
    id: "play",
    audio: "/voice/guide/04-play.m4a",
    duration: 14.76,
    caption:
      "Now press the jewel in the middle of the speaker. The needle drops, and the map starts to sing. It reads west to east, one note per slice — high notes are the hot places, quiet stretches are where there’s no data to play.",
    nudge: "Press the jewel to drop the needle.",
    target: "needle",
    wait: "playing",
    announce: "The tour is pointing at the play jewel.",
  },
  {
    id: "deck",
    audio: "/voice/guide/05-deck.m4a",
    duration: 10.8,
    caption:
      "Wondering what you’re actually hearing? Open the data deck. You’ll find the frame itself, the colour scale, the measurements behind every note, and a written transcript of the piece.",
    nudge: "Open the data deck when you like.",
    target: "deck",
    wait: "deck",
    announce: "The tour is pointing at the data deck button.",
  },
  {
    id: "scan",
    audio: "/voice/guide/06-scan.m4a",
    duration: 11.76,
    caption:
      "And there’s a page called Scan a frame. Bring your own picture — a satellite shot, a heat map, anything — and the same engine reads it left to right and turns it into sound.",
    nudge: "That page is up in the navigation.",
    target: "scan",
    wait: "none",
    announce: "The tour is pointing at the Scan a frame page.",
  },
  {
    id: "outro",
    audio: "/voice/guide/07-outro.m4a",
    duration: 9.96,
    caption:
      "That’s everything. Take your time with it. If you’d rather I stopped talking, press Escape, or use the guide button at the top of the page. Enjoy the record.",
    nudge: "Thanks for listening.",
    wait: "none",
    announce: "The guided tour is finished.",
  },
];

export const GUIDE_LAST = GUIDE_STEPS.length - 1;

/** wait this long after a line before the bubble nudges, in ms */
export const GUIDE_NUDGE_MS = 6000;
/** then, if nothing happens at all, let the tour move on so it never traps anyone */
export const GUIDE_GIVE_UP_MS = 22000;

/** tour lines are ducked under this much of the record's volume */
export const GUIDE_DUCK = 0.3;
