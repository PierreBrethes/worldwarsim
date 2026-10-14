import { CAPTURE_MINUTES } from '../../convex/constants';
import type { BuildingKey, UnitRole } from './ids';
import type { TimeWindow } from './rest-window';
import type { SeasonMode } from './season-mode';

/**
 * **La capture** (décision du 14/10, `WWS/CONTEXT.md`) : une infanterie tient un bâtiment ou un
 * avant-poste adverse, et au bout du temps il change de propriétaire. Une règle pure, lue par la
 * rose, par la mutation et par la carte — le serveur date, le client interpole, et c'est la même
 * horloge des deux côtés.
 */
export type CaptureTarget =
  { readonly kind: 'building'; readonly key: BuildingKey } | { readonly kind: 'outpost' };

export type CaptureRefusal =
  'EMPTY_MOVEMENT' | 'FRIENDLY_TARGET' | 'HQ_NOT_CAPTURABLE' | 'CAPTURE_NEEDS_INFANTRY';

/** **Le QG ne se capture qu'en Blitz**, où sa chute élimine (B10) ; en Mondiale il attend la
 *  victoire par les QG. */
export function captureRefusalOf(
  target: CaptureTarget,
  roles: ReadonlyArray<UnitRole>,
  isMine: boolean,
  mode: SeasonMode,
): CaptureRefusal | null {
  if (roles.length === 0) return 'EMPTY_MOVEMENT';
  if (isMine) return 'FRIENDLY_TARGET';
  if (isHq(target) && mode === 'mondiale') return 'HQ_NOT_CAPTURABLE';
  return roles.includes('infantry') ? null : 'CAPTURE_NEEDS_INFANTRY';
}

const isHq = (target: CaptureTarget): boolean => target.kind === 'building' && target.key === 'hq';

export const captureDurationMs = (mode: SeasonMode, target: CaptureTarget): number =>
  (mode === 'blitz' && isHq(target)
    ? CAPTURE_MINUTES.blitz.hq
    : CAPTURE_MINUTES[mode][target.kind]) * 60_000;

/** La durée qu'une infanterie à ce rythme mettrait, hors plage de repos. */
export const captureDurationAt = (mode: SeasonMode, target: CaptureTarget, rate: number): number =>
  captureDurationMs(mode, target) / rate;

/** Le site d'une capture est-il un QG — en Blitz, celui dont la chute élimine (B10). */
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
