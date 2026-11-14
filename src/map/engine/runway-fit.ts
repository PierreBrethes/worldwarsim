import { AIRFIELD } from '@/emblems/kits/manifest';
import { runwayMinimum } from './timelines/airfield';

/** A module of the runway, as the manifest lays it. */
export type RunwayModule = (typeof AIRFIELD.modules)[number];

/** **How much of the airfield's socle may stand in water before its runway is turned** (#436,
 *  Décisions du 04/11): the share of a grid laid on the socle. */
export const SOCLE_WET = 0.1;
/** The socle of `airfield.glb`, in its metres (read from the file, a socle 127,6 m by 90,5 m). */
const SOCLE = { x: 63.8, z0: -31.3, z1: 59.2 } as const;
/** The socle is read on a grid of so many cells a side. */
const SOCLE_SAMPLES = 7;
/** **A runway is read every so many metres along it**, on three lines across; a single sample in
 *  water spoils the metres it stands for. `@a-mesurer` */
const RUNWAY_SAMPLE_M = 5;
/** **Under so many metres a runway is not drawn** (Décisions du 06/11): the roll of the transport
 *  that leaves the farthest lane, at the pilot's worst. Read off `AIR`, not set. */
export const RUNWAY_MIN_M = runwayMinimum();

/** Every 15°, nearest the hashed turn first: an airfield's runway turned to find its land. */
export const RUNWAY_TURNS = Array.from(
  { length: 24 },
  (_, k) => (((k + 1) >> 1) * (k % 2 === 0 ? 1 : -1) * Math.PI) / 12,
);

const [HEAD, TAIL] = [AIRFIELD.modules.slice(0, 2), AIRFIELD.modules.slice(-2)];
const MIDDLE = AIRFIELD.modules.slice(2, -2);
/** How many modules the whole runway has. */
export const RUNWAY_MODULES = AIRFIELD.modules.length;

const lengthOf = (modules: ReadonlyArray<RunwayModule>): number =>
  modules.reduce((sum, [, metres]) => sum + metres, 0);

/** **The modules of a runway of `count` of them** (the whole one's `RUNWAY_MODULES`): its two ends
 *  and the stretch between them cut short, from the free end in; none for `0`. */
export function runwayModules(count: number): ReadonlyArray<RunwayModule> {
  if (count <= 0) return [];
  return [...HEAD, ...MIDDLE.slice(0, Math.max(0, count - HEAD.length - TAIL.length)), ...TAIL];
}

/** **How long a runway of `count` modules is**, in metres: none for `0`. */
export const runwayLength = (count: number): number => lengthOf(runwayModules(count));

/**
 * **How a runway sits on its land** (Décisions du 23/10 et du 06/11, #493): turned from its hashed
 * heading by `turn`, laid in mirror in x, and `modules` of it drawn (`0` for none).
 */
export type RunwayFit = {
  readonly turn: number;
  readonly mirrored: boolean;
  readonly modules: number;
};

/** Whether the point (`x`, `z`) of the airfield's metres, as it is drawn, turned `turn` from its
 *  hashed heading, stands on land. */
export type RunwayGround = (x: number, z: number, turn: number) => boolean;

type Reading = { readonly turn: number; readonly mirrored: boolean; socle: number; dry: number };

function read(onLand: RunwayGround, turn: number, mirrored: boolean): Reading {
  const side = mirrored ? -1 : 1;
  let wet = 0;
  for (let i = 0; i < SOCLE_SAMPLES; i++)
    for (let j = 0; j < SOCLE_SAMPLES; j++) {
      // At the middle of each cell: the edge rows would weigh a sliver of sea twice.
      const x = -SOCLE.x + (2 * SOCLE.x * (i + 0.5)) / SOCLE_SAMPLES;
      const z = SOCLE.z0 + ((SOCLE.z1 - SOCLE.z0) * (j + 0.5)) / SOCLE_SAMPLES;
      if (!onLand(x, z, turn)) wet++;
    }
  const { x1, z, half, length } = AIRFIELD.runway;
  // The metres of the runway dry from the hangars out, up to the first row with water in it.
  let dry: number = length;
  for (let reach = 0; reach < length && dry === length; reach += RUNWAY_SAMPLE_M)
    for (const across of [-1, 0, 1])
      if (!onLand(side * (x1 - reach - RUNWAY_SAMPLE_M / 2), z + (across * 2 * half) / 3, turn))
        dry = reach;
  return { turn, mirrored, socle: wet / SOCLE_SAMPLES ** 2, dry };
}

/** The modules a runway dry over `dry` metres keeps: whole ones, `0` under the minimum. */
function modulesDry(dry: number): number {
  let count = RUNWAY_MODULES;
  while (count > 0 && runwayLength(count) > dry) count--;
  return runwayLength(count) < RUNWAY_MIN_M ? 0 : count;
}

/**
 * **The runway's way onto its land** (#493): the other side first (mirror in x), then turned by
 * steps of 15°, nearest the hashed heading first, then cut short — the one of all these that
 * keeps the longest runway, the first when several do. A socle in water more than `SOCLE_WET`
 * is worse than any runway; short of `RUNWAY_MIN_M` the runway is not drawn.
 */
export function fitRunway(onLand: RunwayGround): RunwayFit {
  const sides = [
    { turn: 0, mirrored: false },
    { turn: 0, mirrored: true },
    ...RUNWAY_TURNS.slice(1).map((turn) => ({ turn, mirrored: false })),
  ];
  const readings: Reading[] = [];
  for (const { turn, mirrored } of sides) {
    const reading = read(onLand, turn, mirrored);
    readings.push(reading);
    if (reading.socle <= SOCLE_WET && reading.dry === AIRFIELD.runway.length)
      return { turn, mirrored, modules: RUNWAY_MODULES };
  }
  const dryOnes = readings.filter(({ socle }) => socle <= SOCLE_WET);
  const best = (dryOnes.length > 0 ? dryOnes : readings).reduce((a, b) =>
    dryOnes.length > 0
      ? b.dry > a.dry
        ? b
        : a
      : b.socle < a.socle || (b.socle === a.socle && b.dry > a.dry)
        ? b
        : a,
  );
  return { turn: best.turn, mirrored: best.mirrored, modules: modulesDry(best.dry) };
}
