import { BLITZ } from '../../convex/constants';
import type { BuildingKey, UnitRole } from './ids';
import type { SeasonMode } from './season-mode';
import { distanceKm, type LonLat } from './geo';
import type { PassMode } from './combat';
import { INTERCEPTION_SAMPLES, positionAt, type MarchingForce } from './interception';
import type { Theatre } from './theatres';

/**
 * **L'économie de la Blitz** (lot 4 des deux modes, 14/10) : une ressource, les fonds, et des
 * bâtiments qu'on capture au lieu de les bâtir. Règles pures, lues par la réglette, la modale de
 * site et le serveur ; les nombres vivent dans `BLITZ` (`convex/constants.ts`).
 */

export const incomePerMinute = (keys: Iterable<BuildingKey>): number => {
  let total = 0;
  for (const key of keys) total += BLITZ.fundsPerMinute[key] ?? 0;
  return total;
};

/** Ce que le joueur tenait à `at`, et le débit depuis : les fonds se lisent sans écriture. */
export type Funds = { readonly stock: number; readonly at: number; readonly perMinute: number };

export const fundsAt = (funds: Funds, now: number): number =>
  funds.stock + (funds.perMinute * Math.max(0, now - funds.at)) / 60_000;

const FORMED_BY: Readonly<Partial<Record<BuildingKey, ReadonlyArray<UnitRole>>>> = {
  hq: ['infantry'],
  barracks: ['infantry', 'armor', 'landTransport'],
  airfield: ['fighter', 'bomber', 'airTransport'],
  port: ['escort', 'cargo', 'carrier'],
};

export const rolesFormedBy = (key: BuildingKey): ReadonlyArray<UnitRole> => FORMED_BY[key] ?? [];

/** Les bâtiments qui forment ce rôle, pour le dire en toutes lettres à l'abaque. */
export const rolesFormingSites = (role: UnitRole): ReadonlyArray<BuildingKey> =>
  (Object.keys(FORMED_BY) as ReadonlyArray<BuildingKey>).filter((key) =>
    rolesFormedBy(key).includes(role),
  );

export type BlitzRecruitRefusal =
  'WRONG_PROJECTION_BUILDING' | 'TROOP_BOUND_REACHED' | 'INSUFFICIENT_FUNDS';

/** Une marque par rôle, aucun palier, aucun plafond affiché : le frein est le prix. */
export function blitzRecruitRefusalOf({
  site,
  role,
  funds,
  troops,
}: {
  readonly site: BuildingKey;
  readonly role: UnitRole;
  readonly funds: number;
  /** Debout et en file : la file n'est pas un endroit où garer l'armée que la borne refuse. */
  readonly troops: number;
}): BlitzRecruitRefusal | null {
  if (!rolesFormedBy(site).includes(role)) return 'WRONG_PROJECTION_BUILDING';
  if (troops >= BLITZ.troopBound) return 'TROOP_BOUND_REACHED';
  return funds < BLITZ.rolePrice[role] ? 'INSUFFICIENT_FUNDS' : null;
}

type Wounded = {
  readonly role: UnitRole;
  readonly strength: number;
  readonly nominalStrength: number;
};

/**
 * **Un pas de soin** : un dixième de la force rendu, payé au prorata du prix du rôle. `null` quand
 * la troupe est entière ou que les fonds ne couvrent pas le pas — on ne soigne pas à crédit.
 */
export function mendStep(
  troop: Wounded,
  funds: number,
): { readonly strength: number; readonly cost: number } | null {
  const missing = troop.nominalStrength - troop.strength;
  if (missing <= 0) return null;
  const gained = Math.min(missing, Math.ceil(troop.nominalStrength * BLITZ.mend.sharePerStep));
  const cost = Math.ceil(
    (BLITZ.rolePrice[troop.role] * BLITZ.mend.priceShare * gained) / troop.nominalStrength,
  );
  return cost > funds ? null : { strength: troop.strength + gained, cost };
}

/**
 * **Le pas de soin d'un joueur entier**, troupe après troupe, les fonds payés au fur et à mesure :
 * ce que le travail applique (`blitz.mend`) et ce que la vue annonce sont la même liste.
 */
export function mendPlan<T extends Wounded & { readonly id: string }>(
  wounded: ReadonlyArray<T>,
  funds: number,
): ReadonlyArray<{ readonly troop: T; readonly strength: number; readonly cost: number }> {
  let left = funds;
  return wounded.flatMap((troop) => {
    const step = mendStep(troop, left);
    if (step === null) return [];
    left -= step.cost;
    return [{ troop, ...step }];
  });
}

/**
 * **Ni construction, ni élévation, ni fondation en Blitz** (B4) : la rose ne propose pas ces
 * ordres et le serveur les refuse, par cette seule lecture. On n'y pille pas non plus — il n'y a
 * rien à rapporter d'une économie qui n'a qu'une ressource.
 */
export const notInBlitz = (mode: SeasonMode): 'NOT_IN_BLITZ' | null =>
  mode === 'blitz' ? 'NOT_IN_BLITZ' : null;

/**
 * **A Blitz crosses its theatre in a quarter of an hour or so** (B1, 14/10): the pace is read off
 * the theatre rather than written per theatre, so a box redrawn tomorrow keeps the evening.
 *
 * @a-mesurer the decision says 15 to 20 minutes; nothing has played one yet
 */
export const BLITZ_CROSSING_MINUTES = 18;

export function withinTheatre(theatre: Theatre, [lon, lat]: LonLat): boolean {
  const { west, south, east, north } = theatre.box;
  if (lat < south || lat > north) return false;
  return [lon, lon + 360].some((candidate) => candidate >= west && candidate <= east);
}

function spanKm(theatre: Theatre): number {
  const { west, south, east, north } = theatre.box;
  const middle = (south + north) / 2;
  return Math.max(
    distanceKm([west, south], [west, north]),
    distanceKm([west, middle], [west + (east - west) / 2, middle]) * 2,
  );
}

/** What a thousand kilometres of land cost on this theatre's clock. */
export const theatreMinutesPer1000Km = (theatre: Theatre): number =>
  (BLITZ_CROSSING_MINUTES * 1000) / spanKm(theatre);

export type PursuitVerdict = 'strike' | 'lost' | 'chase';

/** **Contact first, sight second** (B18): what stands within reach is struck, seen or not. */
export function pursuitVerdict({
  gapKm,
  seen,
  reachKm,
}: {
  gapKm: number;
  seen: boolean;
  reachKm: number;
}): PursuitVerdict {
  if (gapKm <= reachKm) return 'strike';
  return seen ? 'chase' : 'lost';
}

/**
 * The first instant in `[from, to]` the two forces stand within `reachKm`, or `null`. Sampled, not
 * solved: a closed form on two broken great-circle paths is a quartic per pair of segments, and
 * one step of error weighs nothing against a reach nobody has measured.
 * The medium is not read — a pursuit is an order, and the table of damage says who can touch.
 */
export function contactAt(
  a: MarchingForce,
  b: MarchingForce,
  reachKm: number,
  from: number,
  to: number,
  samples = INTERCEPTION_SAMPLES,
): number | null {
  for (let index = 0; index <= samples; index += 1) {
    const at = from + ((to - from) * index) / samples;
    if (distanceKm(positionAt(a, at), positionAt(b, at)) <= reachKm) return at;
  }
  return null;
}

/** **Charge against charge is a shock** (B17): both fire together when each was aimed at the
 *  other. Whoever strikes a target posed, or busy chasing somebody else, has the initiative. */
export const passModeOf = (
  attackerTroopIds: ReadonlyArray<string>,
  targetPursues: string | null,
): PassMode =>
  targetPursues !== null && attackerTroopIds.includes(targetPursues) ? 'shock' : 'initiative';
