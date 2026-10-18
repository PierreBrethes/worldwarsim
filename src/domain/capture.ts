import { CAPTURE_MINUTES } from '../../convex/constants';
import type { BuildingKey, UnitRole } from './ids';
import type { TimeWindow } from './rest-window';
import type { SeasonMode } from './season-mode';
import { DEFAULT_HQ_CAPTURE_HOURS } from './operation-order';

/**
 * **La capture** (décision du 14/10, `WWS/CONTEXT.md`) : une infanterie tient un bâtiment ou un
 * avant-poste adverse, et au bout du temps il change de propriétaire. Une règle pure, lue par la
 * rose, par la mutation et par la carte — le serveur date, le client interpole, et c'est la même
 * horloge des deux côtés.
 */
export type CaptureTarget =
  { readonly kind: 'building'; readonly key: BuildingKey } | { readonly kind: 'outpost' };

export type CaptureRefusal =
  'EMPTY_MOVEMENT' | 'FRIENDLY_TARGET' | 'CAPTURE_NEEDS_INFANTRY' | 'CAPTURE_ON_FOOT';

/** **Le QG se capture dans les deux modes**, et sa chute élimine (B10, M2a). **En Blitz
 *  l'infanterie capture à pied** (retour de Pierre, 15/10) : une unité est un transport et ce
 *  qu'il porte, et on fait descendre l'infanterie avant. */
export function captureRefusalOf(
  roles: ReadonlyArray<UnitRole>,
  isMine: boolean,
  mode: SeasonMode,
): CaptureRefusal | null {
  if (roles.length === 0) return 'EMPTY_MOVEMENT';
  if (isMine) return 'FRIENDLY_TARGET';
  if (!roles.includes('infantry')) return 'CAPTURE_NEEDS_INFANTRY';
  return mode === 'blitz' && roles.some((role) => role !== 'infantry') ? 'CAPTURE_ON_FOOT' : null;
}

const isHq = (target: CaptureTarget): boolean => target.kind === 'building' && target.key === 'hq';

/** `hqCaptureHours` : le réglage du salon d'une Mondiale (M15), que seul son QG lit. */
export function captureDurationMs(
  mode: SeasonMode,
  target: CaptureTarget,
  hqCaptureHours: number = DEFAULT_HQ_CAPTURE_HOURS,
): number {
  if (!isHq(target)) return CAPTURE_MINUTES[mode][target.kind] * 60_000;
  return mode === 'blitz' ? CAPTURE_MINUTES.blitz.hq * 60_000 : hqCaptureHours * 3_600_000;
}

/** La durée qu'une infanterie à ce rythme mettrait, hors plage de repos. */
export const captureDurationAt = (
  mode: SeasonMode,
  target: CaptureTarget,
  rate: number,
  hqCaptureHours?: number,
): number => captureDurationMs(mode, target, hqCaptureHours) / rate;

export const isHqSite = (site: {
  readonly kind: 'building' | 'outpost';
  readonly building?: BuildingKey;
}): boolean => site.kind === 'building' && site.building === 'hq';

/**
 * **La vitesse est la force de la meilleure infanterie présente** — pleine, la vitesse de base ;
 * à moitié, la moitié. La meilleure et non la somme : deux compagnies entamées ne capturent pas
 * plus vite qu'une seule intacte, et une recrue fraîche relève le rythme d'une troupe usée.
 * Zéro sans infanterie, et c'est l'annulation.
 */
export const captureRate = (
  troops: ReadonlyArray<{
    readonly role: UnitRole;
    readonly strength: number;
    readonly nominalStrength: number;
  }>,
): number =>
  Math.max(
    0,
    ...troops
      .filter((troop) => troop.role === 'infantry' && troop.nominalStrength > 0)
      .map((troop) => troop.strength / troop.nominalStrength),
  );

/**
 * L'état d'une capture à un instant : ce qui est fait (`progress`, 0 à 1) à `at`, et le rythme
 * qui court depuis. Une perte de force ne remet rien à zéro : on relit `progress` à l'heure de la
 * perte et on repart de là au nouveau rythme.
 */
export type CaptureClock = {
  readonly progress: number;
  readonly at: number;
  readonly rate: number;
  readonly durationMs: number;
  /** La plage de repos du défenseur (Mondiale) ; `null` en Blitz. */
  readonly rest: TimeWindow | null;
};

export const progressAt = (clock: CaptureClock, instant: number): number =>
  Math.min(
    1,
    clock.progress +
      (clock.rate * activeMs(clock.at, Math.max(clock.at, instant), clock.rest)) / clock.durationMs,
  );

export const completesAt = (clock: CaptureClock): number =>
  afterActive(
    clock.at,
    Math.ceil(((1 - clock.progress) * clock.durationMs) / clock.rate),
    clock.rest,
  );

const DAY = 86_400_000;

/** La plage du jour `day` (jours UTC depuis l'époque), qui peut déborder sur le lendemain. */
function restOf(day: number, rest: TimeWindow): readonly [number, number] {
  const start = day * DAY + rest.startMinutes * 60_000;
  const end =
    day * DAY + rest.endMinutes * 60_000 + (rest.endMinutes <= rest.startMinutes ? DAY : 0);
  return [start, end];
}

function activeMs(from: number, to: number, rest: TimeWindow | null): number {
  if (rest === null || rest.startMinutes === rest.endMinutes) return to - from;
  let resting = 0;
  for (let day = Math.floor(from / DAY) - 1; day <= Math.floor(to / DAY); day += 1) {
    const [start, end] = restOf(day, rest);
    resting += Math.max(0, Math.min(end, to) - Math.max(start, from));
  }
  return to - from - resting;
}

function afterActive(from: number, active: number, rest: TimeWindow | null): number {
  if (rest === null || rest.startMinutes === rest.endMinutes) return from + active;
  let instant = from;
  let left = active;
  for (let day = Math.floor(from / DAY) - 1; ; day += 1) {
    const [start, end] = restOf(day, rest);
    if (end <= instant) continue;
    if (start > instant) {
      if (start - instant >= left) return instant + left;
      left -= start - instant;
    }
    instant = end;
  }
}

/** The capture a side is running at a point, unless it has stopped: the one reading of "this
 *  troop is busy capturing", for the idle list and the poster alike. */
export function capturingAt<
  C extends { side: string; stoppedAt: number | null; point: readonly [number, number] },
>(captures: ReadonlyArray<C>, point: readonly [number, number]): C | undefined {
  return captures.find(
    (capture) =>
      capture.side === 'capturer' &&
      capture.stoppedAt === null &&
      capture.point[0] === point[0] &&
      capture.point[1] === point[1],
  );
}
