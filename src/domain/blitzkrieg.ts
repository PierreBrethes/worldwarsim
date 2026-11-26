import type { Medium, MovementType } from './ids';
import { refusalOf, type Column, type MovementAim, type OrderRefusal } from './movement-orders';
import type { Asset } from './nation-assets';

/**
 * **La Guerre éclair** (ADR 0039 §6) : une attaque allemande à terre porte deux cibles. La
 * pastille, l'ordre (`movements.attack`) et le départ de la seconde jambe (`convex/movement/
 * blitzkrieg.ts`) lisent ces deux fonctions.
 */
export type ChainRefusal =
  | 'NO_BLITZKRIEG'
  /** Une marche, un raid, une capture n'enchaînent pas : la Guerre éclair est une attaque. */
  | 'CHAIN_ATTACK_ONLY'
  /** « À terre » (décision de Pierre du 04/11) : des routes sans passage en mer ni en l'air. */
  | 'CHAIN_ASHORE_ONLY'
  /** **Une colonne poursuivie n'est pas un lieu** (décision de Pierre du 26/11) : la poursuite
   *  finit où la cible est rattrapée, et la seconde jambe n'aurait nulle part d'où partir. */
  | 'CHAIN_POSITION_ONLY';

export type SecondTargetRefusal = ChainRefusal | 'SAME_TARGET' | OrderRefusal;

type Legs = ReadonlyArray<{ readonly medium: Medium }>;

/** L'ordre tel que la rose le propose : une attaque sans mission, ou autre chose ; sa cible quand
 *  elle est connue. */
type ChainOrder = {
  readonly type: MovementType;
  readonly mission: { readonly kind: string };
  readonly aim?: { readonly kind: string };
};

/** `legs` : la route de la jambe, `null` tant que l'aperçu ne l'a pas rendue. */
export function chainRefusalOf(
  asset: Asset | null,
  order: ChainOrder,
  legs: Legs | null,
): ChainRefusal | null {
  if (asset !== 'blitzkrieg') return 'NO_BLITZKRIEG';
  if (order.type !== 'attack' || order.mission.kind !== 'march') return 'CHAIN_ATTACK_ONLY';
  if (order.aim?.kind === 'track') return 'CHAIN_POSITION_ONLY';
  return legs === null || legs.every((leg) => leg.medium === 'land') ? null : 'CHAIN_ASHORE_ONLY';
}

/** L'identité d'une visée : deux cibles distinctes ne se nomment pas pareil. */
const keyOf = (aim: MovementAim): string => {
  switch (aim.kind) {
    case 'point':
      return `point:${String(aim.lon)},${String(aim.lat)}`;
    case 'region':
      return `region:${aim.regionId}`;
    case 'outpost':
      return `outpost:${aim.outpostId}`;
    case 'camp':
      return `camp:${aim.campId}`;
    case 'objective':
      return `objective:${aim.objectiveId}`;
    case 'strategic':
      return `strategic:${aim.pointId}`;
    case 'track':
      return `track:${aim.movementId}`;
    case 'building':
      return `building:${aim.buildingId}`;
  }
};

/**
 * **La seconde cible**, pesée depuis le point de la première : ce qu'une attaque peut viser
 * (`refusalOf`), distinct de la première. « À terre » se lit sur chaque route, par
 * `chainRefusalOf` : celle de la seconde n'est connue qu'après la pesée de sa cible. `column`
 * est la colonne qui s'y tiendra — à l'ordre, celle qui part ; au départ de la jambe, celle qui a
 * tenu le terrain, ses coups relus. `first.aim` manque au départ : l'ordre a déjà dit que les deux
 * différaient.
 */
export function secondTargetRefusalOf(
  asset: Asset | null,
  first: { readonly aim?: MovementAim; readonly legs: Legs | null },
  second: MovementAim,
  column: Column,
): SecondTargetRefusal | null {
  const chain = chainRefusalOf(
    asset,
    { type: 'attack', mission: { kind: 'march' }, ...(first.aim ? { aim: first.aim } : {}) },
    first.legs,
  );
  if (chain !== null) return chain;
  if (first.aim !== undefined && keyOf(first.aim) === keyOf(second)) return 'SAME_TARGET';
  return refusalOf('attack', second, column);
}
