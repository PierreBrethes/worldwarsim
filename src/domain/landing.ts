import type { LonLat } from './geo';
import type { Nation } from './ids';

/**
 * **La une joue des scènes, jamais une partie** (page publique, 14/10/2026). Tout ce qu'elle
 * montre est écrit ici, à la main, et ne lit rien du serveur : la course que le défilement fait
 * avancer, les temps de l'assaut, l'heure que le soleil prend. Le moteur de la page et ses
 * coupures lisent les mêmes fonctions, donc le fanion et le tableau ne peuvent pas se contredire.
 */

export type RacePoint = 'gibraltar' | 'malta' | 'suez' | 'istanbul' | 'narvik' | 'baku' | 'lisbon';

export const RACE_POINTS: Readonly<Record<RacePoint, LonLat>> = {
  gibraltar: [-5.35, 36.14],
  malta: [14.51, 35.9],
  suez: [32.55, 29.97],
  istanbul: [28.98, 41.01],
  narvik: [17.43, 68.44],
  baku: [49.87, 40.41],
  lisbon: [-9.14, 38.72],
};

/** The four belligerents of the race, in the order the table breaks a tie. */
const RACE_NATIONS: ReadonlyArray<Nation> = ['uk', 'germany', 'italy', 'ussr'];

/** Who takes which point, at which share of the page's scroll — Malta changes hands last. */
const RACE_SCHEDULE: ReadonlyArray<readonly [RacePoint, Nation, number]> = [
  ['gibraltar', 'uk', 0.1],
  ['malta', 'italy', 0.18],
  ['narvik', 'germany', 0.26],
  ['suez', 'uk', 0.34],
  ['baku', 'ussr', 0.42],
  ['istanbul', 'germany', 0.5],
  ['lisbon', 'uk', 0.58],
  ['malta', 'uk', 0.7],
];

/** Points held for a day running take the season. */
export const RACE_TO_WIN = 4;
const DAY_MINUTES = 24 * 60;
const COUNTDOWN_FROM = 0.7;

export type RaceState = {
  readonly holders: Readonly<Partial<Record<RacePoint, Nation>>>;
  /** Most points first; a tie keeps `RACE_NATIONS`' order. */
  readonly standings: ReadonlyArray<{ readonly nation: Nation; readonly points: RacePoint[] }>;
  readonly day: number;
  /** Minutes until the leader wins, once it holds `RACE_TO_WIN`; `null` before. */
  readonly countdown: number | null;
};

export function raceAt(progress: number): RaceState {
  const holders: Partial<Record<RacePoint, Nation>> = {};
  for (const [point, nation, at] of RACE_SCHEDULE) if (progress >= at) holders[point] = nation;
  const standings = RACE_NATIONS.map((nation) => ({
    nation,
    points: (Object.keys(RACE_POINTS) as RacePoint[]).filter((point) => holders[point] === nation),
  })).sort((a, b) => b.points.length - a.points.length);
  const leading = standings[0]!.points.length >= RACE_TO_WIN;
  const share = (progress - COUNTDOWN_FROM) / (1 - COUNTDOWN_FROM);
  return {
    holders,
    standings,
    day: leading ? 5 : 1 + Math.floor(Math.min(1, Math.max(0, progress)) * 6),
    countdown: leading ? Math.max(0, DAY_MINUTES - Math.round(share * (DAY_MINUTES - 60))) : null,
  };
}

/**
 * **L'assaut, en secondes depuis l'ordre** (révision du 14/10 : l'attaquant frappe le premier).
 * L'ordre se lit, la frappe part, ce qui reste riposte, le défenseur se replie une fois, après,
 * puis l'infanterie marche à la ville et la capture.
 */
export const ASSAULT = {
  strike: 1.8,
  riposte: 3.2,
  rout: 4.4,
  walk: 5.8,
  capture: 7.6,
  taken: 9.8,
  again: 16,
} as const;

const ASSAULT_STEPS = ['order', 'strike', 'riposte', 'rout', 'capture'] as const;
export type AssaultStep = (typeof ASSAULT_STEPS)[number];

export function assaultStepAt(seconds: number): AssaultStep {
  if (seconds < ASSAULT.strike) return 'order';
  if (seconds < ASSAULT.riposte) return 'strike';
  if (seconds < ASSAULT.rout) return 'riposte';
  if (seconds < ASSAULT.walk) return 'rout';
  return 'capture';
}

/** How far the capture has gone, 0 to 1. */
export const captureShareAt = (seconds: number): number =>
  Math.min(1, Math.max(0, (seconds - ASSAULT.capture) / (ASSAULT.taken - ASSAULT.capture)));

const HOUR_MS = 3_600_000;
const DAY_UTC_HOUR = 10;
const NIGHT_FROM_UTC_HOUR = 14;
const NIGHT_SPAN_HOURS = 13;

const atUtcHour = (today: number, hour: number): number => {
  const day = new Date(today);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour);
};

/** Hors de la chronique, la table est au matin : la une ne s'ouvre pas sur une Europe éteinte. */
export const dayInstant = (today: number): number => atUtcHour(today, DAY_UTC_HOUR);

/** **La chronique fait tourner le vrai soleil** : de 14 h à 3 h UTC du jour, au fil du défilement. */
export const nightInstant = (progress: number, today: number): number =>
  atUtcHour(today, NIGHT_FROM_UTC_HOUR) +
  Math.min(1, Math.max(0, progress)) * NIGHT_SPAN_HOURS * HOUR_MS;

/** **Les lumières de la nuit de l'accueil** : la sélection cuite à la main d'avant l'atlas des
 *  villes (#440), gardée telle quelle — l'accueil ne charge pas l'atlas. */
// prettier-ignore
export const LANDING_LIGHTS: ReadonlyArray<LonLat> = [
  [-0.13, 51.51], [2.35, 48.86], [13.4, 52.52], [37.62, 55.75], [12.5, 41.9], [16.37, 48.21],
  [-3.7, 40.42], [21.01, 52.23], [19.04, 47.5], [14.42, 50.09], [4.9, 52.37], [4.35, 50.85],
  [12.57, 55.68], [18.07, 59.33], [10.75, 59.91], [24.94, 60.17], [30.32, 59.94], [30.52, 50.45],
  [23.73, 37.98], [28.98, 41.01], [26.1, 44.43], [20.46, 44.82], [23.32, 42.7], [-9.14, 38.72],
  [-2.24, 53.48], [-4.25, 55.86], [-6.26, 53.35], [5.37, 43.3], [4.84, 45.76], [9.19, 45.46],
  [11.58, 48.14], [9.99, 53.55], [6.96, 50.94], [7.01, 51.46], [13.74, 51.05], [2.17, 41.39],
  [14.27, 40.85], [44.0, 56.33], [49.12, 55.79], [36.23, 49.99], [39.72, 47.23], [60.6, 56.84],
  [44.51, 40.18], [49.87, 40.41], [31.24, 30.04], [29.92, 31.2], [35.21, 31.77], [44.36, 33.31],
  [51.39, 35.69], [46.68, 24.71], [-7.59, 33.57], [3.06, 36.75], [10.17, 36.81], [36.82, -1.29],
  [3.38, 6.52], [18.42, -33.92], [28.05, -26.2], [72.88, 19.08], [88.36, 22.57], [77.21, 28.61],
  [80.27, 13.08], [67.0, 24.86], [74.35, 31.55], [100.5, 13.75], [106.85, -6.21], [103.85, 1.29],
  [120.98, 14.6], [121.47, 31.23], [116.4, 39.9], [113.26, 23.13], [114.17, 22.32], [104.07, 30.67],
  [114.3, 30.59], [123.43, 41.8], [126.98, 37.57], [139.69, 35.69], [135.5, 34.69], [130.4, 33.59],
  [151.21, -33.87], [144.96, -37.81], [174.76, -36.85], [-74.0, 40.71], [-87.63, 41.88],
  [-118.24, 34.05], [-122.42, 37.77], [-77.04, 38.9], [-75.16, 39.95], [-71.06, 42.36],
  [-83.05, 42.33], [-90.07, 29.95], [-79.38, 43.65], [-73.57, 45.5], [-99.13, 19.43],
  [-82.37, 23.13], [-58.38, -34.6], [-43.17, -22.91], [-46.63, -23.55], [-70.67, -33.45],
  [-77.04, -12.05], [-74.07, 4.71], [-66.9, 10.49],
];

/** The cities whose names the night writes, once their dusk has passed. */
export const NIGHT_CITIES = {
  paris: [2.35, 48.86],
  london: [-0.12, 51.5],
  berlin: [13.4, 52.52],
  rome: [12.5, 41.9],
  madrid: [-3.7, 40.42],
  moscow: [37.6, 55.75],
  warsaw: [21, 52.23],
  cairo: [31.24, 30.04],
  istanbul: [28.98, 41.01],
  stockholm: [18.07, 59.33],
} as const satisfies Record<string, LonLat>;
