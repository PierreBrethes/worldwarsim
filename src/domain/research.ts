import { DAMAGE_TABLE, RESEARCH_SPEC } from '../../convex/constants';
import { profileOf } from './combat';
import { blitzOnly } from './blitz';
import { shortfallOf } from './economy';
import {
  RESEARCH_CARDS,
  type BuildingKey,
  type ResearchCard,
  type ResourceKey,
  type UnitRole,
  type UnitTier,
} from './ids';

/**
 * **La recherche débloque, elle ne bonifie jamais** (ADR 0028 §5, décision 44a) : une carte ouvre
 * une unité, une tuile ou une ligne d'usine, et ne touche à aucun chiffre. Tout ce qu'aucune carte
 * ne nomme est ouvert au départ. Mondiale seule : la Blitz garde son catalogue.
 */
export type Unlock =
  | { readonly kind: 'role'; readonly role: UnitRole; readonly tier: UnitTier }
  | { readonly kind: 'building'; readonly key: BuildingKey }
  /** Le pétrole synthétique : l'usine ne connaît encore que les munitions. */
  | { readonly kind: 'line' };

export type Branch = 'land' | 'sea' | 'air' | 'industry';

type CardSpec = {
  readonly branch: Branch;
  readonly unlocks: ReadonlyArray<Unlock>;
  /** Toutes, avant de la poser. */
  readonly after: ReadonlyArray<ResearchCard>;
};

const role = (unit: UnitRole, tier: UnitTier = 1): Unlock => ({ kind: 'role', role: unit, tier });

export const RESEARCH_TREE: Readonly<Record<ResearchCard, CardSpec>> = {
  infantryMk2: { branch: 'land', unlocks: [role('infantry', 2)], after: [] },
  armor: {
    branch: 'land',
    unlocks: [role('armor')],
    after: ['infantryMk2'],
  },
  armorMk2: { branch: 'land', unlocks: [role('armor', 2)], after: ['armor'] },
  artillery: { branch: 'land', unlocks: [role('artillery')], after: [] },
  escort: { branch: 'sea', unlocks: [role('escort')], after: [] },
  carrier: {
    branch: 'sea',
    unlocks: [role('carrier')],
    after: ['escort', 'aviation'],
  },
  aviation: {
    branch: 'air',
    unlocks: [{ kind: 'building', key: 'airfield' }, role('fighter')],
    after: [],
  },
  bomber: {
    branch: 'air',
    unlocks: [role('bomber')],
    after: ['aviation'],
  },
  airlift: { branch: 'air', unlocks: [role('airTransport')], after: ['aviation'] },
  syntheticOil: { branch: 'industry', unlocks: [{ kind: 'line' }], after: [] },
  listening: {
    branch: 'industry',
    unlocks: [{ kind: 'building', key: 'listening' }],
    after: [],
  },
};

/**
 * **Une carte dont ce qu'elle ouvre n'existe pas encore en Mondiale** reste dans l'arbre, et sa
 * pose se refuse « à venir » : la ligne d'usine du pétrole synthétique, et l'artillerie, dont le
 * tir indirect ne sert qu'en Blitz (4.10). Lu sur `blitzOnly` : le jour où la Mondiale la tire,
 * la carte s'ouvre seule.
 */
export const comingSoon = (card: ResearchCard): boolean =>
  RESEARCH_TREE[card].unlocks.some(
    (unlock) => unlock.kind === 'line' || (unlock.kind === 'role' && blitzOnly(unlock.role)),
  );

const lockOf = (
  matches: (unlock: Unlock) => boolean,
  researched: ReadonlyArray<ResearchCard>,
): ResearchCard | null =>
  RESEARCH_CARDS.find(
    (card) => !researched.includes(card) && RESEARCH_TREE[card].unlocks.some(matches),
  ) ?? null;

/** La carte qui manque pour former ce rôle à ce palier, `null` quand rien ne le retient. */
export const roleLockOf = (
  unit: UnitRole,
  tier: UnitTier,
  researched: ReadonlyArray<ResearchCard>,
): ResearchCard | null =>
  lockOf(
    (unlock) => unlock.kind === 'role' && unlock.role === unit && unlock.tier === tier,
    researched,
  );

/** **La pièce d'un rôle à ce palier**, telle que l'atelier la sert : la seconde marque quand le
 *  rôle en a une, la première sinon. */
export const pieceAt = <Piece>(
  entry: { readonly unit: Piece; readonly unitTier2: Piece | null },
  tier: UnitTier,
): Piece => (tier === 2 && entry.unitTier2 !== null ? entry.unitTier2 : entry.unit);

/** La carte qui manque pour poser cette tuile, `null` quand rien ne la retient. */
export const buildingLockOf = (
  key: BuildingKey,
  researched: ReadonlyArray<ResearchCard>,
): ResearchCard | null =>
  lockOf((unlock) => unlock.kind === 'building' && unlock.key === key, researched);

export type ResearchRefusal =
  | {
      readonly code: 'RESEARCH_DONE' | 'RESEARCH_COMING' | 'RESEARCH_AFTER' | 'RESEARCH_BUSY';
      readonly card: ResearchCard;
    }
  | { readonly code: 'RESEARCH_NEEDS_HQ' }
  | {
      readonly code: 'INSUFFICIENT_RESOURCE';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

export type ResearchSituation = {
  readonly researched: ReadonlyArray<ResearchCard>;
  /** La carte posée, qu'elle avance ou qu'elle attende son QG : une seule à la fois. */
  readonly running: ResearchCard | null;
  /** Un QG à soi, debout et jamais capturé. */
  readonly hqHeld: boolean;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
};

/**
 * **Ce que le QG refuse de chercher**, lu par la carte qu'on lâche dessus avant le relâché et par
 * `research.start` après : déjà acquise, à venir, une carte d'abord, une autre en cours, pas de
 * QG, puis le prix. Chaque refus nomme la carte que sa phrase dit.
 */
export function researchRefusalOf(
  card: ResearchCard,
  situation: ResearchSituation,
): ResearchRefusal | null {
  if (situation.researched.includes(card)) return { code: 'RESEARCH_DONE', card };
  if (comingSoon(card)) return { code: 'RESEARCH_COMING', card };
  const missing = RESEARCH_TREE[card].after.find((first) => !situation.researched.includes(first));
  if (missing !== undefined) return { code: 'RESEARCH_AFTER', card: missing };
  if (situation.running !== null) return { code: 'RESEARCH_BUSY', card: situation.running };
  if (!situation.hqHeld) return { code: 'RESEARCH_NEEDS_HQ' };
  const short = shortfallOf(RESEARCH_SPEC[card].cost, (resource) => situation.stocks[resource]);
  if (short === null) return null;
  const available = situation.stocks[short.resource];
  return {
    code: 'INSUFFICIENT_RESOURCE',
    resource: short.resource,
    needed: available + short.missing,
    available,
  };
}

/**
 * **Une carte posée** : ce qu'il lui reste à courir, et depuis quand elle court — `null` quand
 * son QG manque et qu'elle attend. Ce qui est payé et couru n'est jamais perdu.
 */
export type RunningResearch = {
  readonly card: ResearchCard;
  readonly remainingMs: number;
  readonly since: number | null;
};

export const researchMs = (card: ResearchCard): number => RESEARCH_SPEC[card].hours * 3_600_000;

export function researchProgressOf(
  running: RunningResearch,
  now: number,
): { readonly share: number; readonly finishesAt: number | null } {
  const total = researchMs(running.card);
  const left =
    running.since === null
      ? running.remainingMs
      : Math.max(0, running.remainingMs - (now - running.since));
  return {
    share: total > 0 ? 1 - left / total : 1,
    finishesAt: running.since === null ? null : running.since + running.remainingMs,
  };
}

/** Les unités qu'une carte ouvre, telles que la table des dégâts les nomme. */
const unitsOf = (card: ResearchCard) =>
  RESEARCH_TREE[card].unlocks.flatMap((unlock) =>
    unlock.kind === 'role' ? [{ role: unlock.role, tier: unlock.tier }] : [],
  );

/** Ce qu'on forme sans aucune carte : infanterie MK1, camion, cargo. */
const STARTING_UNITS = (['infantry', 'landTransport', 'cargo'] as const).map((unit) => ({
  role: unit,
  tier: 1 as UnitTier,
}));

const beats = (
  one: { readonly role: UnitRole; readonly tier: UnitTier },
  other: { readonly role: UnitRole; readonly tier: UnitTier },
): boolean => {
  const a = profileOf(one.role, one.tier);
  const b = profileOf(other.role, other.tier);
  return (DAMAGE_TABLE[a]?.[b] ?? 0) > (DAMAGE_TABLE[b]?.[a] ?? 0);
};

/** Le poids d'un prix, toutes ressources confondues : de quoi dire qu'un contre coûte moins. */
export const researchWeight = (card: ResearchCard): number =>
  Object.values(RESEARCH_SPEC[card].cost).reduce((sum, amount) => sum + (amount ?? 0), 0);

/**
 * **Le contre d'une carte, lu dans `DAMAGE_TABLE`** : X contre Y quand X fait à Y plus de dégâts
 * qu'il n'en reçoit. De tout ce qui contre ses unités, une unité de départ, sinon la carte la
 * moins chère puis la plus courte. `null` pour une carte qui n'ouvre aucune unité, ou que rien ne
 * contre.
 */
export function counterOf(
  card: ResearchCard,
): { readonly start: UnitRole } | { readonly card: ResearchCard } | null {
  const weapons = unitsOf(card);
  const counters = (units: ReadonlyArray<{ role: UnitRole; tier: UnitTier }>) =>
    units.some((unit) => weapons.some((weapon) => beats(unit, weapon)));
  const start = STARTING_UNITS.find((unit) => counters([unit]));
  if (start !== undefined) return { start: start.role };
  const best = RESEARCH_CARDS.filter((other) => other !== card && counters(unitsOf(other))).sort(
    (a, b) =>
      researchWeight(a) - researchWeight(b) || RESEARCH_SPEC[a].hours - RESEARCH_SPEC[b].hours,
  )[0];
  return best === undefined ? null : { card: best };
}

/** Les cartes dont celle-ci est le contre (`counterOf`) : ce que sa ligne « contre » nomme. */
export const countersOf = (card: ResearchCard): ReadonlyArray<ResearchCard> =>
  RESEARCH_CARDS.filter((weapon) => {
    const counter = counterOf(weapon);
    return counter !== null && 'card' in counter && counter.card === card;
  });

/**
 * **Un QG à soi, debout et jamais pris** : lui seul cherche. Un QG pris à un autre ne cherche pas
 * pour son preneur ; lu par l'écran et par `research.start`.
 */
export const holdsHq = (
  buildings: ReadonlyArray<{
    readonly key: BuildingKey;
    readonly level: number;
    readonly captured?: boolean;
  }>,
): boolean =>
  buildings.some(
    (building) => building.key === 'hq' && building.captured !== true && building.level > 0,
  );
