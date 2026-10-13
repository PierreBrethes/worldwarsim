/**
 * **Le jour et la nuit sont un décor, le même pour tous** (proposition de Pierre,
 * `table-etat-major.md`) : une fonction pure de l'heure, comme le vent. Rien ne la lit pour une
 * règle.
 *
 * Five hours, not a divisor of 24: with a period that divides the day, the player who logs on
 * every evening at 8 pm would always find the same sky. This one moves four hours a day.
 */
export const DAY_NIGHT_PERIOD_MS = 5 * 3_600_000;
const TWILIGHT_MS = 30 * 60_000;

const smoothstep = (edge: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x + edge) / (2 * edge)));
  return t * t * (3 - 2 * t);
};

/** 0 in full day, 1 in full night; dawn is centred on each period's start, dusk half-way. */
export function nightAt(epochMs: number): number {
  const phase = (((epochMs / DAY_NIGHT_PERIOD_MS) % 1) + 1) % 1;
  const fromDawn = ((phase + 0.25) % 1) - 0.25;
  const edge = TWILIGHT_MS / 2 / DAY_NIGHT_PERIOD_MS;
  return 1 - smoothstep(edge, fromDawn) + smoothstep(edge, fromDawn - 0.5);
}
