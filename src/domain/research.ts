import { DAMAGE_TABLE, RESEARCH_SPEC, type LineKey } from '../../convex/constants';
import { profileOf } from './combat';
import { shortfallOf } from './economy';
import { levelSpeed } from './level-speed';
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
 * une unité, une tuile, une ligne d'usine, un slot de mouvement, et ne touche à aucun
 * chiffre. Tout ce qu'aucune carte ne nomme est ouvert au départ. Mondiale seule : la Blitz garde son catalogue.
 */
type Unlock =
  | { readonly kind: 'role'; readonly role: UnitRole; readonly tier: UnitTier }
  | { readonly kind: 'building'; readonly key: BuildingKey }
  /** Une ligne de l'usine, nommée par ce qu'elle fait : le pétrole synthétique. */
  | { readonly kind: 'line'; readonly output: 'oil' }
  /** Un slot de mouvement de plus (`movementSlots`). */
  | { readonly kind: 'slot' };

type Branch = 'land' | 'sea' | 'air' | 'industry';

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
  syntheticOil: { branch: 'industry', unlocks: [{ kind: 'line', output: 'oil' }], after: [] },
  listening: {
    branch: 'industry',
    unlocks: [{ kind: 'building', key: 'listening' }],
    after: [],
  },
  transmissions1: { branch: 'industry', unlocks: [{ kind: 'slot' }], after: [] },
  transmissions2: { branch: 'industry', unlocks: [{ kind: 'slot' }], after: ['transmissions1'] },
  transmissions3: { branch: 'industry', unlocks: [{ kind: 'slot' }], after: ['transmissions2'] },
};

/** Les slots de mouvement qu'ouvrent ces cartes : un par carte Transmissions acquise. */
export const slotCardsOf = (researched: ReadonlyArray<ResearchCard>): ReadonlyArray<ResearchCard> =>
  RESEARCH_CARDS.filter(
    (card) =>
      researched.includes(card) &&
      RESEARCH_TREE[card].unlocks.some((unlock) => unlock.kind === 'slot'),
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

/** La carte qui manque pour mettre cette ligne sur l'usine, `null` quand rien ne la retient. */
export const lineLockOf = (
  line: LineKey,
  researched: ReadonlyArray<ResearchCard>,
): ResearchCard | null =>
  lockOf((unlock) => unlock.kind === 'line' && unlock.output === line, researched);

/** La carte qui manque pour poser cette tuile, `null` quand rien ne la retient. */
export const buildingLockOf = (
  key: BuildingKey,
  researched: ReadonlyArray<ResearchCard>,
): ResearchCard | null =>
  lockOf((unlock) => unlock.kind === 'building' && unlock.key === key, researched);

/** **Trois cartes au plus sur le Centre** (#165) : la carte qui court et deux qui attendent. */
export const RESEARCH_QUEUE_MAX = 3;

export type ResearchRefusal =
  | {
      readonly code: 'RESEARCH_DONE' | 'RESEARCH_QUEUED' | 'RESEARCH_AFTER';
      readonly card: ResearchCard;
    }
  | { readonly code: 'RESEARCH_FULL' }
  | { readonly code: 'RESEARCH_NEEDS_CENTER' }
  | {
      readonly code: 'INSUFFICIENT_RESOURCE';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

export type ResearchSituation = {
  readonly researched: ReadonlyArray<ResearchCard>;
  /** La carte qui court, qu'elle avance ou qu'elle attende son Centre. */
  readonly running: ResearchCard | null;
  /** Les cartes qui attendent leur tour, dans l'ordre. */
  readonly queued: ReadonlyArray<ResearchCard>;
  /** Le niveau de son Centre de recherche (`searcherLevel`), `null` sans Centre. */
  readonly centerLevel: number | null;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
};

/**
 * **Ce que le Centre de recherche refuse de poser**, lu par la fenêtre de l'arbre avant le geste
 * et par `research.start` après : déjà acquise, déjà dans la file, une carte d'abord (acquise ou
 * devant elle dans la file), file pleine, pas de Centre, puis le prix. Chaque refus nomme la
 * carte que sa phrase dit.
 */
export function researchRefusalOf(
  card: ResearchCard,
  situation: ResearchSituation,
): ResearchRefusal | null {
  if (situation.researched.includes(card)) return { code: 'RESEARCH_DONE', card };
  const inFile = [...(situation.running === null ? [] : [situation.running]), ...situation.queued];
  if (inFile.includes(card)) return { code: 'RESEARCH_QUEUED', card };
  const missing = RESEARCH_TREE[card].after.find(
    (first) => !situation.researched.includes(first) && !inFile.includes(first),
  );
  if (missing !== undefined) return { code: 'RESEARCH_AFTER', card: missing };
  if (inFile.length >= RESEARCH_QUEUE_MAX) return { code: 'RESEARCH_FULL' };
  if (situation.centerLevel === null) return { code: 'RESEARCH_NEEDS_CENTER' };
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

export type ResearchUnqueueRefusal = {
  readonly code: 'RESEARCH_RUNNING' | 'RESEARCH_NOT_QUEUED' | 'RESEARCH_NEEDED';
  readonly card: ResearchCard;
};

/**
 * **Ce qui empêche de retirer une carte de la file** : celle qui court ne se retire pas, une
 * carte absente non plus, ni celle qu'une carte en attente derrière elle demande (`card` nomme
 * alors cette dernière).
 */
export function researchUnqueueRefusalOf(
  card: ResearchCard,
  file: { readonly running: ResearchCard | null; readonly queued: ReadonlyArray<ResearchCard> },
): ResearchUnqueueRefusal | null {
  if (file.running === card) return { code: 'RESEARCH_RUNNING', card };
  if (!file.queued.includes(card)) return { code: 'RESEARCH_NOT_QUEUED', card };
  const needing = file.queued.find((other) => RESEARCH_TREE[other].after.includes(card));
  return needing === undefined ? null : { code: 'RESEARCH_NEEDED', card: needing };
}

/**
 * **Une carte posée** : ce qu'il lui reste à courir, et depuis quand elle court — `null` quand
 * son Centre manque et qu'elle attend. Ce qui est payé et couru n'est jamais perdu.
 */
export type RunningResearch = {
  readonly card: ResearchCard;
  /** Sa durée au niveau du Centre qui l'a prise ; absente, celle du premier niveau. */
  readonly totalMs?: number;
  readonly remainingMs: number;
  readonly since: number | null;
};

/** La durée d'une carte, accélérée au niveau du Centre de recherche qui la prend (ADR 0031). Elle
 *  se fixe à la pose : élever le Centre accélère la carte suivante. */
export const researchMs = (card: ResearchCard, centerLevel = 1): number =>
  RESEARCH_SPEC[card].hours * 3_600_000 * levelSpeed(centerLevel);

/**
 * **L'heure de fin prévue des cartes qui attendent** : chacune court après la précédente, à la
 * durée du niveau du Centre d'aujourd'hui (la vraie se fixe à son démarrage). `null` tant que la
 * carte en cours attend son Centre.
 */
export const researchScheduleOf = (
  running: RunningResearch,
  queued: ReadonlyArray<ResearchCard>,
  centerLevel: number | null,
  now: number,
): ReadonlyArray<number | null> => {
  let at = researchProgressOf(running, now).finishesAt;
  return queued.map((card) => {
    if (at === null) return null;
    at += researchMs(card, centerLevel ?? 1);
    return at;
  });
};

export function researchProgressOf(
  running: RunningResearch,
  now: number,
): { readonly share: number; readonly finishesAt: number | null } {
  const total = running.totalMs ?? researchMs(running.card);
  const left =
    running.since === null
      ? running.remainingMs
      : // An hour read just before the server's own counts nothing as run.
        Math.max(0, running.remainingMs - Math.max(0, now - running.since));
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
 * qu'il n'en reçoit. De tout ce qui contre ses unités, une unité de départ, sinon une carte de
 * sa branche avant les autres, puis la moins chère, puis la plus courte. `null` pour une carte
 * qui n'ouvre aucune arme — une unité dont la ligne de la table est vide ne tire pas, comme le
 * transport aérien —, ou que rien ne contre.
 */
export function counterOf(
  card: ResearchCard,
): { readonly start: UnitRole } | { readonly card: ResearchCard } | null {
  const weapons = unitsOf(card).filter(
    (unit) => Object.keys(DAMAGE_TABLE[profileOf(unit.role, unit.tier)]).length > 0,
  );
  const counters = (units: ReadonlyArray<{ role: UnitRole; tier: UnitTier }>) =>
    units.some((unit) => weapons.some((weapon) => beats(unit, weapon)));
  const start = STARTING_UNITS.find((unit) => counters([unit]));
  if (start !== undefined) return { start: start.role };
  const branch = RESEARCH_TREE[card].branch;
  const elsewhere = (other: ResearchCard) => (RESEARCH_TREE[other].branch === branch ? 0 : 1);
  const best = RESEARCH_CARDS.filter((other) => other !== card && counters(unitsOf(other))).sort(
    (a, b) =>
      elsewhere(a) - elsewhere(b) ||
      researchWeight(a) - researchWeight(b) ||
      RESEARCH_SPEC[a].hours - RESEARCH_SPEC[b].hours,
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
 * **Mon Centre de recherche qui cherche** : un Centre à soi, debout et jamais pris, le plus haut
 * s'il y en a deux ; `null` sans Centre, et la carte posée attend. Un Centre pris à un autre ne
 * cherche pas pour son preneur. La seule lecture, de l'écran comme du serveur.
 */
export const searcherOf = <
  B extends { readonly key: BuildingKey; readonly level: number; readonly captured?: boolean },
>(
  buildings: ReadonlyArray<B>,
): B | null =>
  buildings
    .filter((building) => building.key === 'researchCenter' && building.captured !== true)
    .reduce<B | null>(
      (best, building) => (best === null || building.level > best.level ? building : best),
      null,
    );

/** Le niveau de ce Centre, `null` sans lui. */
export const searcherLevel = (
  buildings: ReadonlyArray<{
    readonly key: BuildingKey;
    readonly level: number;
    readonly captured?: boolean;
  }>,
): number | null => searcherOf(buildings)?.level ?? null;
