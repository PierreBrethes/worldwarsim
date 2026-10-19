import { RESEARCH_SPEC } from '../../convex/constants';
import { blitzOnly } from './blitz';
import { shortfallOf } from './economy';
import type { BuildingKey, ResearchCard, ResourceKey, UnitRole, UnitTier } from './ids';

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
  /** Les cartes de ce qui la contre : elles coûtent et durent moins (`research.test.ts`). */
  readonly counteredBy: ReadonlyArray<ResearchCard>;
};

const role = (unit: UnitRole, tier: UnitTier = 1): Unlock => ({ kind: 'role', role: unit, tier });

export const RESEARCH_TREE: Readonly<Record<ResearchCard, CardSpec>> = {
  infantryMk2: { branch: 'land', unlocks: [role('infantry', 2)], after: [], counteredBy: [] },
  armor: {
    branch: 'land',
    unlocks: [role('armor')],
    after: ['infantryMk2'],
    counteredBy: ['infantryMk2'],
  },
  armorMk2: { branch: 'land', unlocks: [role('armor', 2)], after: ['armor'], counteredBy: [] },
  artillery: { branch: 'land', unlocks: [role('artillery')], after: [], counteredBy: [] },
  escort: { branch: 'sea', unlocks: [role('escort')], after: [], counteredBy: [] },
  carrier: {
    branch: 'sea',
    unlocks: [role('carrier')],
    after: ['escort', 'aviation'],
    counteredBy: ['escort', 'aviation'],
  },
  aviation: {
    branch: 'air',
    unlocks: [{ kind: 'building', key: 'airfield' }, role('fighter')],
    after: [],
    counteredBy: [],
  },
  bomber: {
    branch: 'air',
    unlocks: [role('bomber')],
    after: ['aviation'],
    counteredBy: ['aviation'],
  },
  airlift: { branch: 'air', unlocks: [role('airTransport')], after: ['aviation'], counteredBy: [] },
  syntheticOil: { branch: 'industry', unlocks: [{ kind: 'line' }], after: [], counteredBy: [] },
  listening: {
    branch: 'industry',
    unlocks: [{ kind: 'building', key: 'listening' }],
    after: [],
    counteredBy: [],
  },
};

const CARDS = Object.keys(RESEARCH_TREE) as ReadonlyArray<ResearchCard>;

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
  CARDS.find((card) => !researched.includes(card) && RESEARCH_TREE[card].unlocks.some(matches)) ??
  null;

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
