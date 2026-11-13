// Demo catalogue: one synthetic track per EIC theme.
// Colormap anchors here are DATA colours (they imitate the source visualization's colorbar),
// not UI theme colours, so they are exempt from the theme-token rule.

import type { Legend, ThemeId } from "@/lib/api/types";
import { clamp01 } from "@/lib/format";

import { bump, fbm } from "./noise";
import { cities, field, fires, isLand, moisture } from "./world";

export interface DemoTrackDef {
  id: string;
  title: string;
  theme: ThemeId;
  summary: string;
  description: string;
  date_range: string;
  frame_labels: string[];
  legend: Legend;
  /** Normalized value 0..1, or null for "no data" (e.g. land on an ocean product). */
  generate: (u: number, v: number, t: number) => number | null;
}

type RGB = [number, number, number];
function ramp(colors: RGB[]): Legend["anchors"] {
  return colors.map((rgb, i) => ({ position: i / (colors.length - 1), rgb }));
}

const years = (from: number, count: number, step = 1) =>
  Array.from({ length: count }, (_, i) => String(from + i * step));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const months = (year: number) => MONTHS.map((m) => `${m} ${year}`);

export const DEMO_TRACKS: DemoTrackDef[] = [
  {
    id: "rising-seas",
    title: "Rising Seas",
    theme: "sea_level",
    summary: "Twelve years of sea surface height, climbing year after year.",
    description:
      "A world map of how far the sea surface sits above or below its long-term average. Land is blank. Early frames are mostly near average; later frames turn higher almost everywhere, with a warm-water bulge that comes and goes in the Pacific-like basin.",
    date_range: "2014 to 2025",
    frame_labels: years(2014, 12),
    legend: {
      label: "Sea surface height anomaly",
      unit: "cm",
      min: -15,
      max: 15,
      anchors: ramp([
        [5, 48, 97],
        [67, 147, 195],
        [247, 247, 247],
        [214, 96, 77],
        [103, 0, 31],
      ]),
    },
    generate: (u, v, t) => {
      if (isLand(u, v)) return null;
      const eddies = fbm(u, v, t * 3, 101, 5, 4) - 0.5;
      const pulse = bump(u, v, 0.1, 0.5, 0.06) * Math.sin(t * Math.PI * 3) * 0.18;
      return clamp01(0.4 + 0.32 * t + 0.4 * eddies + pulse);
    },
  },
  {
    id: "breathing-cities",
    title: "Breathing Cities",
    theme: "air_quality",
    summary: "Nitrogen dioxide over a year: city plumes that swell in winter.",
    description:
      "A world map of nitrogen dioxide, a pollutant from traffic and industry. Bright spots sit over cities. In the northern winter months the plumes grow and drift east; in summer they shrink.",
    date_range: "January to December 2024",
    frame_labels: months(2024),
    legend: {
      label: "Nitrogen dioxide column",
      unit: "×10¹⁵ molec/cm²",
      min: 0,
      max: 20,
      anchors: ramp([
        [0, 0, 4],
        [81, 18, 124],
        [183, 55, 121],
        [252, 137, 97],
        [252, 253, 191],
      ]),
    },
    generate: (u, v, t) => {
      const winter = 0.55 + 0.45 * Math.cos(t * Math.PI * 2);
      const north = v < 0.5 ? winter : 1.1 - winter * 0.6;
      const drift = (u - t * 0.03 + 1) % 1;
      const plumes = field(cities(), drift, v, 0.022) * north;
      return clamp01(0.06 + 0.1 * fbm(u, v, t * 2, 202, 6, 3) + 0.75 * plumes);
    },
  },
  {
    id: "fire-season",
    title: "Fire Season",
    theme: "wildfires",
    summary: "Fires flare up across two continents, then burn out.",
    description:
      "A world map of fire intensity over twelve weeks. Most land is dark. Fires appear as bright points, grow for a few weeks, then fade. The north burns first, then the south.",
    date_range: "12 weeks, summer 2024",
    frame_labels: Array.from({ length: 12 }, (_, i) => `Week ${i + 1}`),
    legend: {
      label: "Fire radiative power",
      unit: "MW",
      min: 0,
      max: 500,
      anchors: ramp([
        [35, 23, 27],
        [120, 28, 10],
        [220, 80, 10],
        [250, 190, 40],
        [255, 250, 220],
      ]),
    },
    generate: (u, v, t) => {
      if (!isLand(u, v)) return null;
      let heat = 0;
      for (const f of fires()) {
        const age = (t - f.start) / f.length;
        if (age < 0 || age > 1) continue;
        const life = Math.sin(age * Math.PI);
        heat += f.weight * life * bump(u, v, f.u, f.v, 0.012 + 0.02 * age);
      }
      return clamp01(0.03 + 0.05 * fbm(u, v, 0, 303, 8, 2) + heat);
    },
  },
  {
    id: "carbon-climb",
    title: "The Carbon Climb",
    theme: "greenhouse_gases",
    summary: "Carbon dioxide rising everywhere, a little more each year.",
    description:
      "A world map of carbon dioxide in the air. The whole planet gets steadily higher from frame to frame. The northern half, where most emissions happen, stays slightly higher than the south.",
    date_range: "2014 to 2025",
    frame_labels: years(2014, 12),
    legend: {
      label: "Carbon dioxide",
      unit: "ppm",
      min: 395,
      max: 428,
      anchors: ramp([
        [68, 1, 84],
        [59, 82, 139],
        [33, 145, 140],
        [94, 201, 98],
        [253, 231, 37],
      ]),
    },
    generate: (u, v, t) => {
      const north = (0.5 - v) * 0.12;
      const sources = field(cities(), u, v, 0.05) * 0.05;
      return clamp01(0.12 + 0.68 * t + north + sources + 0.06 * (fbm(u, v, t * 2, 404, 3, 3) - 0.5));
    },
  },
  {
    id: "draining-aquifers",
    title: "Draining Aquifers",
    theme: "water",
    summary: "Underground water slowly drains in a few dry regions.",
    description:
      "A world map of water stored on and under land, compared with average. Oceans are blank. Three regions grow steadily drier over the years while one wet region gains water.",
    date_range: "2014 to 2025",
    frame_labels: years(2014, 12),
    legend: {
      label: "Water storage anomaly",
      unit: "cm",
      min: -20,
      max: 20,
      anchors: ramp([
        [140, 81, 10],
        [216, 179, 101],
        [245, 245, 245],
        [90, 180, 172],
        [1, 102, 94],
      ]),
    },
    generate: (u, v, t) => {
      if (!isLand(u, v)) return null;
      const dry = field(cities().slice(0, 3), u, v, 0.05) * 0.5 * t;
      const wet = bump(u, v, cities()[15]?.u ?? 0.7, cities()[15]?.v ?? 0.55, 0.06) * 0.35 * t;
      return clamp01(0.5 + 0.25 * (fbm(u, v, t, 505, 4, 3) - 0.5) - dry + wet);
    },
  },
  {
    id: "growing-season",
    title: "Growing Season",
    theme: "agriculture",
    summary: "Green-up and harvest: plant health month by month.",
    description:
      "A world map of vegetation greenness on land. The tropics stay green all year. Northern farmland greens up in spring, peaks in July and browns after harvest; the south does the opposite.",
    date_range: "January to December 2024",
    frame_labels: months(2024),
    legend: {
      label: "Vegetation index (NDVI)",
      unit: "index",
      min: 0,
      max: 0.9,
      anchors: ramp([
        [166, 97, 26],
        [223, 194, 125],
        [200, 220, 130],
        [90, 170, 70],
        [0, 104, 55],
      ]),
    },
    generate: (u, v, t) => {
      if (!isLand(u, v)) return null;
      if (v > 0.9) return 0.02;
      const season = Math.sin(((t * 11) / 12) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; // peaks mid-year
      const lat = 0.5 - v;
      const hemi = lat > 0.08 ? season : lat < -0.08 ? 1 - season : 0.85;
      return clamp01(0.08 + 0.85 * moisture(u, v) * (0.35 + 0.65 * hemi));
    },
  },
  {
    id: "living-planet",
    title: "Living Planet",
    theme: "biodiversity",
    summary: "Where life is richest, and where it is slipping away.",
    description:
      "A world map of a species richness index on land. Rainforest belts near the equator are richest. Over two decades, a few tropical areas lose richness as forest is cleared.",
    date_range: "2000 to 2022",
    frame_labels: years(2000, 12, 2),
    legend: {
      label: "Species richness index",
      unit: "index",
      min: 0,
      max: 100,
      anchors: ramp([
        [255, 255, 204],
        [161, 218, 180],
        [65, 182, 196],
        [44, 127, 184],
        [37, 52, 148],
      ]),
    },
    generate: (u, v, t) => {
      if (!isLand(u, v)) return null;
      if (v > 0.9) return 0.01;
      const loss = field(cities().slice(14, 18), u, v, 0.045) * 0.45 * t;
      return clamp01(0.05 + 0.9 * moisture(u, v) - loss);
    },
  },
  {
    id: "night-lights",
    title: "Night Lights",
    theme: "energy",
    summary: "Cities glowing brighter as the world uses more power.",
    description:
      "A world map of light at night. Almost everything is dark except cities, which form bright clusters. Over the years the clusters grow larger and brighter.",
    date_range: "2014 to 2025",
    frame_labels: years(2014, 12),
    legend: {
      label: "Night light radiance",
      unit: "nW/cm²/sr",
      min: 0,
      max: 60,
      anchors: ramp([
        [0, 0, 0],
        [40, 30, 90],
        [180, 120, 40],
        [255, 220, 120],
        [255, 255, 240],
      ]),
    },
    generate: (u, v, t) => {
      if (!isLand(u, v)) return null;
      const glow = field(cities(), u, v, 0.012 + 0.008 * t) * (0.55 + 0.45 * t);
      return clamp01(0.01 + 0.9 * glow);
    },
  },
  {
    id: "storm-track",
    title: "Storm Track",
    theme: "disasters",
    summary: "A tropical cyclone spins up, strengthens and makes landfall.",
    description:
      "A map of rainfall over three days as a tropical cyclone crosses an ocean basin. A spiral of heavy rain forms, tightens and intensifies, then weakens after it reaches land in the north-west.",
    date_range: "3 days, every 6 hours",
    frame_labels: Array.from({ length: 12 }, (_, i) => `Day ${Math.floor(i / 4) + 1}, ${String((i % 4) * 6).padStart(2, "0")}:00`),
    legend: {
      label: "Rain rate",
      unit: "mm/h",
      min: 0,
      max: 50,
      anchors: ramp([
        [247, 251, 255],
        [198, 219, 239],
        [107, 174, 214],
        [33, 113, 181],
        [8, 48, 107],
      ]),
    },
    generate: (u, v, t) => {
      const cu = 0.38 - 0.1 * t;
      const cv = 0.42 - 0.12 * t;
      let du = u - cu;
      if (du > 0.5) du -= 1;
      if (du < -0.5) du += 1;
      const dv = (v - cv) * 0.5;
      const r = Math.sqrt(du * du + dv * dv);
      const theta = Math.atan2(dv, du);
      const strength = Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.85 + 0.15;
      const arms = 0.55 + 0.45 * Math.cos(3 * theta - r * 90);
      const storm = Math.exp(-(r * r) / (2 * 0.035 * 0.035)) * arms * strength;
      const drizzle = Math.max(0, fbm(u, v, t * 4, 909, 6, 3) - 0.55) * 0.6;
      return clamp01(drizzle + storm);
    },
  },
];
