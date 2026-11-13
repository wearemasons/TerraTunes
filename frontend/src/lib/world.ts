/**
 * The world behind the cabinet.
 *
 * Every record stands in a place that *is* the thing it measures: sea surface
 * temperature is watched from a cliff over the water, not from under an aurora;
 * fine particulates hang over a smothered valley; wind flattens a ridge of
 * grass. Each scene is one hand-painted backdrop plus the live weather drawn on
 * top of it — rain, drifting cloud, aurora curtains, pollen, ash, spray.
 *
 * `arrival` is the one exception: it is the world the opening film leaves you
 * in, so the last frame of the film and the first frame of the page are the same
 * place. It stands in until the visitor throws the switch, then dissolves into
 * the record's own weather.
 */

export type SceneKind =
  | 'arrival'
  | 'meadow'
  | 'heat'
  | 'wind'
  | 'rain'
  | 'haze'
  | 'ozone'
  | 'firefront'
  | 'traffic'
  | 'sea'
  | 'canopy'
  | 'storm'
  | 'night'
  | 'aurora'
  | 'fire'
  | 'space'

export interface Scene {
  kind: SceneKind
  /** the painted backdrop behind the cabinet */
  art: string
  /** one line naming the place, for the status strip and for announcements */
  label: string
  /** one line of weather, spoken rather than shown */
  weather: string
  /** true when the art is dark and any UI over it must be light */
  dark: boolean
  cloud: string
  cloudCount: number
  cloudOpacity: number
  cloudSpeed: number
  rain: number
  snow: number
  motes: number
  moteColor: string
  lightning: number
  aurora: number
  fireflies: number
  /** how strongly the cabinet's own light pools on the ground */
  glow: string
  vignette: string
}

type SceneInit = Partial<Scene> & {
  art: string
  label: string
  weather: string
  dark: boolean
}

const BASE: Omit<Scene, 'art' | 'label' | 'weather' | 'dark' | 'kind'> = {
  cloud: '#fffaf0',
  cloudCount: 6,
  cloudOpacity: 0.7,
  cloudSpeed: 1,
  rain: 0,
  snow: 0,
  motes: 0,
  moteColor: '#ffe9a8',
  lightning: 0,
  aurora: 0,
  fireflies: 0,
  glow: 'rgba(255,190,110,.55)',
  vignette: 'rgba(74,53,33,.30)',
}

const mk = (kind: SceneKind, init: SceneInit): Scene => ({ kind, ...BASE, ...init })

export const SCENES: Record<SceneKind, Scene> = {
  arrival: mk('arrival', {
    art: '/art/world-arrival.webp',
    label: 'Aurora lake',
    weather: 'night over the water, aurora moving',
    dark: true,
    cloud: '#8fb8c8',
    cloudCount: 2,
    cloudOpacity: 0.2,
    cloudSpeed: 0.4,
    motes: 18,
    moteColor: '#cfe8ff',
    aurora: 1,
    fireflies: 10,
    glow: 'rgba(190,255,220,.6)',
    vignette: 'rgba(6,16,26,.55)',
  }),
  meadow: mk('meadow', {
    art: '/art/world-meadow.webp',
    label: 'Golden meadow',
    weather: 'late light, pollen drifting',
    dark: false,
    cloudCount: 7,
    cloudOpacity: 0.75,
    motes: 24,
  }),
  heat: mk('heat', {
    art: '/art/world-heat.webp',
    label: 'Ripe summer field',
    weather: 'high sun, heat shimmer, building cumulus',
    dark: false,
    cloudCount: 5,
    cloudOpacity: 0.85,
    cloudSpeed: 0.7,
    motes: 30,
    moteColor: '#ffe4a0',
    glow: 'rgba(255,206,120,.6)',
    vignette: 'rgba(96,68,26,.26)',
  }),
  wind: mk('wind', {
    art: '/art/world-wind.webp',
    label: 'Windswept ridge',
    weather: 'stiff wind, grass laid flat, blown leaves',
    dark: false,
    cloud: '#ffffff',
    cloudCount: 9,
    cloudOpacity: 0.55,
    cloudSpeed: 3.4,
    motes: 20,
    moteColor: '#bfe08a',
    glow: 'rgba(210,235,255,.45)',
    vignette: 'rgba(46,66,54,.3)',
  }),
  rain: mk('rain', {
    art: '/art/world-rain.webp',
    label: 'Squall over the valley',
    weather: 'rain shafts on the hills, puddles forming',
    dark: true,
    cloud: '#dfe6e2',
    cloudCount: 9,
    cloudOpacity: 0.92,
    cloudSpeed: 1.8,
    rain: 110,
    lightning: 0.35,
    motes: 10,
    moteColor: '#dff2ff',
    glow: 'rgba(255,176,96,.5)',
    vignette: 'rgba(20,32,30,.5)',
  }),
  haze: mk('haze', {
    art: '/art/world-haze.webp',
    label: 'Smothered valley',
    weather: 'still air, fine particles, sun a pale disc',
    dark: false,
    cloud: '#e6dac4',
    cloudCount: 7,
    cloudOpacity: 0.5,
    cloudSpeed: 0.4,
    motes: 28,
    moteColor: '#d9cdb6',
    glow: 'rgba(255,196,130,.4)',
    vignette: 'rgba(78,66,48,.42)',
  }),
  ozone: mk('ozone', {
    art: '/art/world-ozone.webp',
    label: 'Amber haze plain',
    weather: 'hot, windless, photochemical orange',
    dark: false,
    cloud: '#ffd9a0',
    cloudCount: 6,
    cloudOpacity: 0.42,
    cloudSpeed: 0.5,
    motes: 16,
    moteColor: '#ffcf90',
    glow: 'rgba(255,170,80,.55)',
    vignette: 'rgba(112,66,22,.38)',
  }),
  firefront: mk('firefront', {
    art: '/art/world-firefront.webp',
    label: 'Fire on the ridge',
    weather: 'smoke columns, ash falling, red sun',
    dark: true,
    cloud: '#c9a87e',
    cloudCount: 6,
    cloudOpacity: 0.78,
    cloudSpeed: 0.9,
    motes: 34,
    moteColor: '#d8c2a8',
    glow: 'rgba(255,140,60,.72)',
    vignette: 'rgba(52,28,12,.55)',
  }),
  traffic: mk('traffic', {
    art: '/art/world-traffic.webp',
    label: 'City at dusk',
    weather: 'rush hour, exhaust dome, lights coming on',
    dark: true,
    cloud: '#8fa5b8',
    cloudCount: 4,
    cloudOpacity: 0.3,
    cloudSpeed: 0.5,
    motes: 10,
    moteColor: '#ffcf9a',
    fireflies: 24,
    glow: 'rgba(255,180,110,.7)',
    vignette: 'rgba(22,14,26,.58)',
  }),
  sea: mk('sea', {
    art: '/art/world-sea.webp',
    label: 'Warm water, high cliff',
    weather: 'bright swell, spray, currents in colour',
    dark: false,
    cloud: '#ffffff',
    cloudCount: 5,
    cloudOpacity: 0.65,
    cloudSpeed: 1.2,
    motes: 14,
    moteColor: '#dff2ff',
    glow: 'rgba(140,220,235,.5)',
    vignette: 'rgba(24,62,74,.34)',
  }),
  canopy: mk('canopy', {
    art: '/art/world-canopy.webp',
    label: 'Green to the horizon',
    weather: 'growing season, wet air, fields and forest',
    dark: false,
    cloudCount: 6,
    cloudOpacity: 0.72,
    cloudSpeed: 0.8,
    motes: 26,
    moteColor: '#d7f0a8',
    fireflies: 14,
    glow: 'rgba(180,235,150,.45)',
    vignette: 'rgba(40,72,38,.32)',
  }),
  storm: mk('storm', {
    art: '/art/world-storm.webp',
    label: 'Ghibli storm',
    weather: 'hurricane — rain coming in sideways',
    dark: true,
    cloud: '#dfe6e2',
    cloudCount: 11,
    cloudOpacity: 0.95,
    cloudSpeed: 2.4,
    rain: 150,
    lightning: 1,
    glow: 'rgba(255,176,96,.5)',
    vignette: 'rgba(22,34,32,.52)',
  }),
  night: mk('night', {
    art: '/art/world-night.webp',
    label: 'City night',
    weather: 'clear night, towns glowing',
    dark: true,
    cloud: '#8fa5b8',
    cloudCount: 4,
    cloudOpacity: 0.28,
    cloudSpeed: 0.6,
    fireflies: 18,
    glow: 'rgba(255,190,110,.75)',
    vignette: 'rgba(8,14,24,.6)',
  }),
  aurora: mk('aurora', {
    art: '/art/world-aurora.webp',
    label: 'Aurora night',
    weather: 'aurora over the sea ice',
    dark: true,
    cloud: '#8fb8c8',
    cloudCount: 3,
    cloudOpacity: 0.22,
    cloudSpeed: 0.5,
    snow: 40,
    aurora: 1,
    glow: 'rgba(190,255,220,.6)',
    vignette: 'rgba(6,16,26,.58)',
  }),
  fire: mk('fire', {
    art: '/art/world-fire.webp',
    label: 'Smoke summer',
    weather: 'haze and drifting ash',
    dark: true,
    cloud: '#e8d6bd',
    cloudCount: 8,
    cloudOpacity: 0.6,
    cloudSpeed: 0.9,
    motes: 30,
    moteColor: '#d8c2a8',
    glow: 'rgba(255,150,60,.7)',
    vignette: 'rgba(70,44,22,.46)',
  }),
  space: mk('space', {
    art: '/art/world-space.webp',
    label: 'Deep space',
    weather: 'above the atmosphere',
    dark: true,
    cloud: '#9aa6d8',
    cloudCount: 5,
    cloudOpacity: 0.35,
    cloudSpeed: 0.7,
    glow: 'rgba(190,200,255,.5)',
    vignette: 'rgba(6,8,20,.62)',
  }),
}

/** the nine records we actually ship, each in the place it measures */
const BY_ID: Record<string, SceneKind> = {
  'surface-temperature': 'heat',
  'wind-speed': 'wind',
  precipitation: 'rain',
  'fine-particulates': 'haze',
  'surface-ozone': 'ozone',
  'carbon-monoxide': 'firefront',
  'nitrogen-oxides': 'traffic',
  'sea-surface-temperature': 'sea',
  vegetation: 'canopy',
  // kept for catalog entries that may arrive later
  'ocean-currents': 'sea',
  'perpetual-ocean': 'sea',
  'night-lights': 'night',
  'hurricane-maria': 'storm',
  lightning: 'rain',
  'atmospheric-river': 'rain',
  'wildfire-smoke': 'firefront',
  'caldwell-73': 'space',
}

/** what an uploaded frame is heard as, when there is no record to look up */
const BY_MODEL: Record<string, SceneKind> = {
  storm: 'rain',
  fire: 'firefront',
  city: 'traffic',
  canopy: 'canopy',
  plume: 'haze',
  ocean: 'sea',
  space: 'space',
  wind: 'wind',
}

export function sceneFor(model: string, id?: string): Scene {
  if (id && BY_ID[id]) return SCENES[BY_ID[id]]
  return SCENES[BY_MODEL[model] ?? 'meadow']
}

/** the world the opening film hands over to, before a record is chosen */
export const ARRIVAL_SCENE = SCENES.arrival

/** how hard the weather should blow the character, from the scene she stands in */
export function weatherFor(scene: Scene): 'calm' | 'wind' | 'rain' {
  if (scene.rain > 0) return 'rain'
  if (scene.kind === 'wind') return 'wind'
  return 'calm'
}

/** every backdrop, so the cross-fader can pre-warm the next one */
export const SCENE_ART: readonly string[] = [...new Set(Object.values(SCENES).map((s) => s.art))]
