/**
 * **Every number in this file is a placeholder**, and this is the one place to correct when the
 * simulator takes over — nothing numeric belongs anywhere else. The report calibrated on three
 * resources (ADR 0015) does not carry over. Orders of magnitude were chosen so a fresh nation
 * raises its first buildings within the first hours of the one season the game has (168 h since
 * ADR 0020 §11).
 *
 * **Première mesure des tables économiques, le 14/09/2026** : la chaîne de l’alliage — le débit
 * de la fonderie, le fer et le charbon qui la nourrissaient, la dotation — est lue sur
 * la grille du simulateur d'ouverture (108 cases, retiré le 17/10/2026) et non plus posée à
 * vue. Rapport : `WWS/docs/rapports/2026-09-14-chaine-de-l-alliage.md`. **Placeholder tout de
 * même** : une grille d'ouverture n'est pas une saison jouée, et rien ici n'a vu un combat.
 */

import type { SeasonMode } from '../src/domain/season-mode';
import type {
  BuildCostKey,
  BuildingKey,
  DepositKey,
  ResearchCard,
  ResourceKey,
  UnitRole,
} from '../src/domain/ids';
import type { CombatRules, DamageTable } from '../src/domain/combat';
import type { Conversion, FoundationDebt } from '../src/domain/economy';
import { MODE_RULES } from '../src/domain/season-mode';
import { COST_BY_MEDIUM, KM_PER_UNIT } from '../src/domain/routing';
import type { UnitTier } from '../src/domain/troops';
import { theatreKm, type Theatre } from '../src/domain/theatres';

export { NATIONS } from '../src/domain/ids';

export type Costs = Readonly<Partial<Record<ResourceKey, number>>>;

/**
 * Per hour and per level of the exploitation building sitting on the deposit, counted in what it
 * gives (`YIELD_OF`): a mine on iron brings up steel.
 *
 * **Le fer rend ce que la fonderie coulait** (ADR 0028 §1) : huit d'acier par heure au niveau 1,
 * le débit de l'ancienne fonderie, avec un bâtiment au lieu de deux.
 */
export const EXTRACTION_PER_HOUR: Readonly<Record<DepositKey, number>> = {
  food: 12,
  iron: 8,
  coal: 12,
  oil: 6,
};

/**
 * The one chain left (ADR 0028 §1): the arsenal, with two lines to assign. Ammunition casts a
 * round from a coal and a steel, both of which have a direct use of their own; synthetic oil
 * (after its card, `lineLockOf`) turns three coal into one barrel. Reassigning is free: a lot
 * is dropped and placed again, and drop returns nothing because nothing was taken.
 *
 * @a-mesurer one of each a round, three an hour and a level, and three coal for one oil: set by
 * eye (the card says "3 charbon pour 1 pétrole").
 */
export const FACTORY_LINES: Readonly<
  Record<'ammunition' | 'oil', Omit<Conversion, 'perHour' | 'by'> & { perHourPerLevel: number }>
> = {
  ammunition: {
    output: 'ammunition',
    inputs: [
      ['coal', 1],
      ['steel', 1],
    ],
    perHourPerLevel: 3,
  },
  oil: { output: 'oil', inputs: [['coal', 3]], perHourPerLevel: 3 },
};

/** A line is named by what it makes. */
export type LineKey = keyof typeof FACTORY_LINES;
export const LINE_KEYS = Object.keys(FACTORY_LINES) as ReadonlyArray<LineKey>;
/** The line a chain runs when no lot says otherwise. */
export const DEFAULT_LINE: LineKey = 'ammunition';

export type ChainKey = 'arsenal';

/**
 * **A chain that eats a matter spent elsewhere is commanded by the player.** An arsenal at level
 * 3 quietly takes 216 steel a day from a nation saving 430 for a carrier, and no screen names it.
 *
 * Written down rather than derived from the cost tables: coal appears in half the building bills,
 * so a derivation would command every chain and the decision would stop being one.
 */
export const COMMANDED_CHAINS: ReadonlyArray<ChainKey> = ['arsenal'];

export const isCommanded = (key: BuildingKey): boolean =>
  (COMMANDED_CHAINS as ReadonlyArray<string>).includes(key);

/**
 * Low by default so warehouses become necessary targets (fiche 02).
 * Each level raises all five ceilings; legacy depots count as warehouses.
 */
export const BASE_CAP = 400;

/**
 * **Dakar** (ADR 0032) : ce qu'un pillage laisse par ressource à son teneur, au lieu de `BASE_CAP`.
 *
 * @a-mesurer 600 de la décision du 20/10, jamais joué
 */
export const DAKAR_SPARED_PER_RESOURCE = 600;
export const STORAGE_CAP_PER_LEVEL = 600;

/**
 * **Steel plus the resource of the family** (ADR 0028 §2): coal for production (extractors,
 * arsenal, warehouse, headquarters) and for the port and the listening post, food for the
 * barracks, oil for the airfield. The outpost, priced below, is the one that costs food.
 *
 * @a-mesurer the second figure of the three extractors is new; set by eye against their steel,
 * and the research centre (#123) is set near the barracks
 */
export const BUILDING_SPEC: Readonly<
  Record<BuildingKey, { readonly cost: Costs; readonly minutes: number }>
> = {
  hq: { cost: { steel: 60, coal: 40 }, minutes: 45 },
  farm: { cost: { steel: 20, coal: 8 }, minutes: 20 },
  mine: { cost: { steel: 30, coal: 10 }, minutes: 30 },
  oilWell: { cost: { steel: 45, coal: 12 }, minutes: 40 },
  arsenal: { cost: { steel: 60, coal: 20 }, minutes: 55 },
  barracks: { cost: { steel: 40, food: 30 }, minutes: 40 },
  airfield: { cost: { steel: 70, oil: 20 }, minutes: 70 },
  port: { cost: { steel: 65, coal: 20 }, minutes: 65 },
  listening: { cost: { steel: 35, coal: 15 }, minutes: 40 },
  // De l'ordre de la caserne (#123), à mesurer comme le reste du barème.
  researchCenter: { cost: { steel: 45, coal: 30 }, minutes: 45 },
  warehouse: { cost: { steel: 30, coal: 10 }, minutes: 25 },
  // Legacy tariffs still price queued work, refunds and industry.
  depot: { cost: { steel: 40, coal: 15 }, minutes: 30 },
  // La ville de la Blitz ne se bâtit pas (`BUILDABLE_BUILDINGS`) : le barème l'exige, rien ne le lit.
  city: { cost: {}, minutes: 0 },
};

/**
 * **Une seule ligne de départ** (ADR 0020 §11). L'escarmouche et la campagne ont disparu le
 * 31/08 : sans horloge, une partie n'a plus de fin programmée, et ce sont les valeurs de la
 * campagne qui décrivent le jeu réel. Ce qui reste, ce sont ces quelques nombres — jamais une
 * table, jamais une clé de format posée à côté d'un taux d'extraction.
 */

/** Le niveau auquel le quartier général se pose — la première dette du socle depuis la décision
 *  1b du 13/09, et non plus un bâtiment planté sur la capitale (révision de l'ADR 0015). */
export const HQ_LEVEL_AT_LAUNCH = 1;
export const MAX_HQ_LEVEL = 5;

/**
 * **La première projection par mer doit tenir dans la dotation** (quartier général au niveau 2, caserne,
 * port, un cargo : la facture que `invariants.test.ts` calcule, sans chiffre gravé ici), et c'est la règle de design de la
 * décision 66a du 04/09 qui fixe la borne : une île ne doit pas être tarifée au-dessus de son
 * voisin. 400 laisse une marge à cette facture : la mine sur du fer, offerte au socle, rend
 * l'acier sans rien bâtir d'autre.
 */
export const STARTING_STEEL = 400;

/**
 * Oil is the one resource a nation can be born unable to make, so this reserve pays the *first
 * journey towards* oil, and running out of it is what drives the nations that lack it.
 *
 * No table per nation, deliberately: the asymmetry comes from the map, and eight hand-written
 * values would be eight more numbers to balance for an effect geography gives away free.
 *
 * @a-mesurer 90 depuis le modèle de #158, jamais joué
 */
export const STARTING_OIL = 90;

/**
 * **How many steps of rounds a nation can hand out before its arsenal has to exist**: a step
 * costs `SUPPLY_STEP_COST`, so eighty is eight steps — three riflemen rearmed, roughly.
 *
 * @a-mesurer never calibrated; the simulator does not model combat
 */
export const STARTING_AMMUNITION = 80;

/**
 * **The foundation is read off the ground, never off a list** (decision of 25/08): one extractor
 * per dry resource the player's own country holds, and a well **only** where there is oil — six
 * nations out of eight hold none, and a debt they could never place opens on nothing. The
 * `warehouse` and the `arsenal` left with it: they are what a player decides to do with a
 * ground, not what the ground carries.
 *
 * The order is fixed rather than natural, because a season has to name its debts in the same
 * order twice running: `me.foundation[0]` is what the card points at first.
 */
const FOUNDATION_ORDER: ReadonlyArray<DepositKey> = ['iron', 'coal', 'food', 'oil'];

/** Which extractor works which ground. The inverse of `EXPLOITED_DEPOSITS`, and the one place
 *  the *mine on two deposits* becomes two separate debts rather than one. */
export const FOUNDATION_EXTRACTORS: Readonly<Record<DepositKey, BuildingKey>> = {
  iron: 'mine',
  coal: 'mine',
  food: 'farm',
  oil: 'oilWell',
};

/** La dette et sa règle d'accord vivent dans le domaine pur, où les deux bouts les lisent
 *  (`src/domain/economy.ts`) ; ce fichier ne garde que la **liste**, qui est un chiffre. */
export type { FoundationDebt };
export { settlesDebt } from '../src/domain/economy';

/**
 * It takes the deposits rather than the nation on purpose: **this file is read by the client**,
 * and reaching for the map here would drag 312 kB of `region-index.json` into the bundle. The
 * join with a nation is `foundationOwed`, in `regions.ts`.
 *
 * **Le quartier général ouvre la liste** (décision 1b du 13/09, révision de l'ADR 0015) : il
 * n'est plus planté sur la capitale de 1940, il entre dans le socle comme première dette — et
 * comme rien d’autre ne se bâtit sans lui (`HQ_FIRST`), l’ordre n’est pas une
 * présentation, c'est la seule séquence que le serveur accepte.
 */
export const foundationFor = (deposits: ReadonlySet<DepositKey>): ReadonlyArray<FoundationDebt> => [
  { key: 'hq', deposit: null },
  ...FOUNDATION_ORDER.filter((deposit) => deposits.has(deposit)).map((deposit) => ({
    key: FOUNDATION_EXTRACTORS[deposit],
    deposit,
  })),
];

/**
 * **Ce qu'un niveau de plus coûte, en prix comme en durée** : chaque niveau multiplie ceux du
 * précédent (`buildCost`, `buildMinutes`).
 *
 * @a-mesurer 2,0 depuis le modèle de #158, jamais joué
 */
export const LEVEL_COST_FACTOR = 2.0;

/**
 * **Monter un avant-poste se tarife comme un bâtiment de projection du même niveau** (précision
 * du 15/09 de l'ADR 0020 §10). Le point de comparaison est le port : ce qu'on achète est de la
 * projection — un rayon, un emplacement, une portée de détection —, pas une filière. **Sa
 * seconde ressource est des vivres** (ADR 0028 §2), les mêmes qu'il mange ensuite.
 *
 * **Et c'est aussi le prix de la fondation** (révision du 15/09 de l'ADR 0020 §10) :
 * `buildCost('outpost', 1)` est ce que `movements.foundOutpostHere` débite, et
 * `buildMinutes('outpost', 1)` la durée du chantier. Un seul barème pour poser le point et pour
 * le monter — le frein d'expansion est ce prix par niveau, en place de l'entretien retiré, qui
 * vidait le stock de vivres sans que le joueur sache pourquoi. Le classement laisse le niveau 1
 * à zéro acier malgré ce prix (`convex/press.ts`) : le territoire est une part, pas de
 * l'acier.
 *
 * @a-mesurer calé sur le port, jamais mesuré sur une partie ; mesure attendue — avant-postes debout par joueur au jour 7 de la première saison (décision 7a du 15/09)
 */
export const OUTPOST_RAISE_SPEC: { readonly cost: Costs; readonly minutes: number } = {
  cost: { steel: 65, food: 20 },
  minutes: 65,
};

/** Les quinze bâtiments et l'élévation d'un avant-poste, au même barème de niveaux. */
const COST_SPEC: Readonly<
  Record<BuildCostKey, { readonly cost: Costs; readonly minutes: number }>
> = { ...BUILDING_SPEC, outpost: OUTPOST_RAISE_SPEC };

export function buildCost(key: BuildCostKey, level: number): Costs {
  const factor = LEVEL_COST_FACTOR ** (level - 1);
  return Object.fromEntries(
    Object.entries(COST_SPEC[key].cost).map(([resource, amount]) => [
      resource,
      Math.round(amount * factor),
    ]),
  );
}

export function buildMinutes(key: BuildCostKey, level: number): number {
  return Math.round(COST_SPEC[key].minutes * LEVEL_COST_FACTOR ** (level - 1));
}

/**
 * Enough to **deploy**, not to settle (fiche 02). The headquarters is not in the list — it stands
 * from the launch (ADR 0015). **The steel, the oil and the ammunition are missing on purpose**:
 * they are the three figures of the starting line, each named on its own above, and everything
 * else is shared. Never a figure per nation — the asymmetry comes from the map.
 *
 * **The kit covers the first projection in every resource of its bill** (ADR 0028 §2,
 * `invariants.test.ts`): by land and by sea, plus one tank. The coal is what the sea route eats
 * (the climb of the headquarters, the port, the cargo), hence 140.
 *
 * @a-mesurer the coal was 20 when only steel priced a projection; 140 is the sea route's bill
 */
export const STARTING_STOCK: Readonly<
  Record<Exclude<ResourceKey, 'steel' | 'oil' | 'ammunition'>, number>
> = {
  food: 120,
  coal: 140,
};

/** The whole endowment, the three figures of the starting line included — what `endow` hands
 *  out and what a test reads to say what a player opens with. */
export const STARTING_KIT: Readonly<Record<ResourceKey, number>> = {
  ...STARTING_STOCK,
  steel: STARTING_STEEL,
  oil: STARTING_OIL,
  ammunition: STARTING_AMMUNITION,
};

/**
 * ADR 0014 and `chiffrage-combat.md` §1, copied: 50 soldiers, 12 tanks, 6 ships. The carrier
 * counts its air group, not its hulls — at one hit point it would die at a stroke. Absent means
 * the tier does not exist for that role, and `troops.test.ts` holds this and `TIERS_BY_ROLE`
 * together rather than trusting them to stay in step.
 */
export const NOMINAL_STRENGTH: Readonly<
  Record<UnitRole, Readonly<Partial<Record<UnitTier, number>>>>
> = {
  infantry: { 1: 50, 2: 30 },
  armor: { 1: 12, 2: 6 },
  landTransport: { 1: 24 },
  artillery: { 1: 12 },
  fighter: { 1: 12 },
  bomber: { 1: 9 },
  airTransport: { 1: 6 },
  escort: { 1: 6 },
  cargo: { 1: 8 },
  carrier: { 1: 24 },
};

export function nominalStrength(role: UnitRole, tier: UnitTier): number {
  const strength = NOMINAL_STRENGTH[role][tier];
  if (strength === undefined) throw new Error(`no tier ${tier} for ${role}`);
  return strength;
}

/**
 * Resource cargo carried by one troop at full strength. This never seats another troop:
 * `LIFT_CAPACITY` remains the separate passenger rule used by crossings.
 *
 * @a-mesurer every role; no season simulation models plunder cargo yet
 */
export const CARRY_CAPACITY_BY_ROLE: Readonly<Record<UnitRole, number>> = {
  infantry: 40,
  armor: 0,
  landTransport: 120,
  artillery: 0,
  fighter: 0,
  bomber: 0,
  airTransport: 80,
  escort: 0,
  cargo: 240,
  carrier: 0,
};

/**
 * **The resource a role's family adds to its steel** (ADR 0028 §2): food for men, oil for land
 * machines and aircraft, coal for ships. Everything costs steel, plus this.
 */
export const FAMILY_RESOURCE_OF_ROLE: Readonly<Record<UnitRole, 'food' | 'oil' | 'coal'>> = {
  infantry: 'food',
  armor: 'oil',
  landTransport: 'oil',
  artillery: 'oil',
  fighter: 'oil',
  bomber: 'oil',
  airTransport: 'oil',
  escort: 'coal',
  cargo: 'coal',
  carrier: 'coal',
};

/**
 * Cost and duration of **one tier-1 troop**: its steel, its family's resource
 * (`FAMILY_RESOURCE_OF_ROLE`) and its minutes. A batch is a troop, so nothing here multiplies by
 * a count any more (ADR 0014).
 *
 * @a-mesurer the family figure is about a third of the steel for machines and ships, and ten
 * against eighteen for a rifleman; never played
 */
export const COST_BY_ROLE: Readonly<
  Record<UnitRole, { steel: number; family: number; minutes: number }>
> = {
  infantry: { steel: 18, family: 10, minutes: 20 },
  armor: { steel: 95, family: 30, minutes: 70 },
  landTransport: { steel: 40, family: 12, minutes: 45 },
  artillery: { steel: 80, family: 25, minutes: 60 },
  fighter: { steel: 110, family: 35, minutes: 90 },
  bomber: { steel: 160, family: 50, minutes: 120 },
  airTransport: { steel: 90, family: 30, minutes: 75 },
  escort: { steel: 175, family: 55, minutes: 180 },
  cargo: { steel: 120, family: 40, minutes: 100 },
  carrier: { steel: 430, family: 130, minutes: 480 },
};

/**
 * **Ce qu'une carte de recherche coûte et dure** (ADR 0028 §5, artefact du 18/10) : payée à la
 * pose, elle avance en heures de jeu sur le QG. Les prix de l'artefact sont décuplés pour tenir à
 * l'échelle des coûts du code (une caserne vaut 40 d'acier, la dotation 400) ; les durées sont
 * celles de l'artefact, 182 h pour une saison de 168 h (292 h avec les trois cartes Transmissions
 * et les deux cartes de file) — on ne finit pas l'arbre. Les cartes de file (ADR 0031) sont
 * chères et tardives : le prix du porte-avions, trente heures.
 *
 * **Le contre coûte moins et dure moins que l'arme qu'il contre** (`research.test.ts`).
 *
 * @a-mesurer l'artefact ×10, jamais joué
 */
export const RESEARCH_SPEC: Readonly<
  Record<ResearchCard, { readonly hours: number; readonly cost: Costs }>
> = {
  infantryMk2: { hours: 8, cost: { steel: 60, food: 40 } },
  armor: { hours: 16, cost: { steel: 120, oil: 60 } },
  armorMk2: { hours: 28, cost: { steel: 180, oil: 80 } },
  artillery: { hours: 12, cost: { steel: 100, oil: 40 } },
  escort: { hours: 12, cost: { steel: 120, coal: 60 } },
  carrier: { hours: 36, cost: { steel: 400, coal: 150 } },
  aviation: { hours: 12, cost: { steel: 100, oil: 60 } },
  bomber: { hours: 20, cost: { steel: 140, oil: 80 } },
  airlift: { hours: 10, cost: { steel: 80, oil: 40 } },
  syntheticOil: { hours: 18, cost: { steel: 100, coal: 100 } },
  listening: { hours: 10, cost: { steel: 60, coal: 60 } },
  transmissions1: { hours: 10, cost: { steel: 60, coal: 60 } },
  transmissions2: { hours: 16, cost: { steel: 100, coal: 90 } },
  transmissions3: { hours: 24, cost: { steel: 160, coal: 130 } },
};

/**
 * **Coups et plein, en crans** (ADR 0028 §3, précision du 18/10) : ce qu'une troupe porte pleine.
 * Les coups sont les passes qu'elle peut tirer ; le plein, la distance que ses moteurs couvrent
 * encore, en crans de `FUEL_STEP_KM`. Zéro : elle n'en a pas (un transport ne tire pas,
 * l'infanterie marche).
 *
 * @a-mesurer la table de la proposition (Q20), jamais jouée
 */
export const SUPPLY_BY_ROLE: Readonly<Record<UnitRole, { rounds: number; fuel: number }>> = {
  infantry: { rounds: 3, fuel: 0 },
  armor: { rounds: 2, fuel: 3 },
  landTransport: { rounds: 0, fuel: 4 },
  artillery: { rounds: 2, fuel: 2 },
  fighter: { rounds: 2, fuel: 3 },
  bomber: { rounds: 2, fuel: 3 },
  airTransport: { rounds: 0, fuel: 3 },
  escort: { rounds: 3, fuel: 6 },
  cargo: { rounds: 0, fuel: 6 },
  carrier: { rounds: 3, fuel: 6 },
};

/**
 * Ce que coûte un cran, coups ou plein, dans sa ressource (Q28).
 *
 * @a-mesurer la proposition le pose, aucune partie ne l'a joué
 */
export const SUPPLY_STEP_COST = 10;

/**
 * La route qu'un cran de plein couvre (≈ 1 h 20 de route en Mondiale).
 *
 * @a-mesurer ≈ 500 km de l'ADR 0028, jamais joué
 */
export const FUEL_STEP_KM = 500;

/**
 * **Singapour** (ADR 0032) : la part de plein que ses camions et ses cargos ne paient pas.
 *
 * @a-mesurer −20 % de la décision du 20/10, jamais joué
 */
export const SINGAPORE_FUEL_DISCOUNT_PCT = 20;

/**
 * **Narvik** (ADR 0032) : la part de son débit que produit encore une exploitation coupée du réseau
 * chez le teneur du point. Hors Narvik, une exploitation coupée ne produit rien.
 *
 * @a-mesurer 25 % de la décision du 20/10, jamais joué
 */
export const NARVIK_UNLINKED_SHARE = 0.25;

/**
 * **Bakou** (ADR 0032) : le temps qu'une troupe à l'arrêt, hors de toute ancre, met à reprendre
 * un cran de plein.
 *
 * @a-mesurer 12 h de la décision du 20/10, jamais joué
 */
export const BAKU_REFUEL_MS = 12 * 3_600_000;

/**
 * **Le dépôt d'avant-poste** (ADR 0028 §4, Q27-Q28) : munitions, pétrole et charbon, au total et
 * partagés librement, par niveau du point.
 *
 * @a-mesurer la proposition le pose, aucune partie ne l'a joué
 */
export const DEPOT_CAPACITY_PER_LEVEL = 400;

export const depotCapacity = (level: number): number =>
  DEPOT_CAPACITY_PER_LEVEL * Math.max(1, Math.trunc(level));

/**
 * **Une seule charge par transport** (ADR 0028 §4, Q27-Q28) : munitions, pétrole et charbon
 * partagés librement. Distincte du butin qu'il emporte (`CARRY_CAPACITY_BY_ROLE`) et des places
 * de ses passagers (ADR 0025). Zéro : ce n'est pas un transport.
 *
 * @a-mesurer la proposition le pose, aucune partie ne l'a joué
 */
export const LOAD_CAPACITY_BY_ROLE: Readonly<Record<UnitRole, number>> = {
  infantry: 0,
  armor: 0,
  landTransport: 200,
  artillery: 0,
  fighter: 0,
  bomber: 0,
  airTransport: 120,
  escort: 0,
  cargo: 800,
  carrier: 0,
};

/** **L'escale aérienne** (ADR 0028 §5) : un avant-poste de ce niveau reçoit l'avion, qui s'y
 *  charge, y livre et en repart comme d'un aérodrome. */
export const AIR_STOP_LEVEL = 2;

/** **Une tournée compte quatre arrêts au plus** (ADR 0028, précision du 18/10). */
export const TOUR_MAX_STOPS = 4;

/**
 * **Une tournée qui attend** au chargement (le plateau personnel manque, ou tous ses dépôts sont
 * pleins) regarde de nouveau à cet intervalle.
 *
 * @a-mesurer aucune partie ne l'a joué
 */
export const TOUR_RETRY_MINUTES = 30;

/**
 * **Une route refusée** au chargement autant de fois d'affilée arrête la tournée : elle ne
 * revient pas seule, à la différence d'un plateau à sec ou de dépôts pleins.
 *
 * @a-mesurer aucune partie ne l'a joué
 */
export const TOUR_ROAD_WAITS = 3;

export const TIER_2_FACTOR = 1.6;

/** Nearly inert since a batch became a single troop — the troop bound below bites first. Kept
 *  as a guard against an unbounded queue, not as a balance knob, and **never shown** (ADR 0027
 *  §5): served so the button says the refusal when it bites, with no figure ahead of time. */
export const MAX_QUEUED_BATCHES = 12;

/**
 * **The invisible bound of the Mondiale** (ADR 0027, 0028 §6): the economy is the brake, this
 * only keeps the server from carrying an unbounded army. It counts troops — never men — standing
 * and queued, and nothing shows it ahead of time; the refusal alone says it. Blitz keeps its own
 * (`BLITZ.troopBound`).
 *
 * @a-mesurer ADR 0028 §6 chiffre ~150 troupes par joueur ; à mesurer sur une saison avant de le tenir
 */
export const MONDIALE_TROOP_BOUND = 150;

export function recruitmentCost(
  role: UnitRole,
  tier: UnitTier,
): { readonly costs: Costs; readonly minutes: number } {
  const base = COST_BY_ROLE[role];
  const factor = tier === 2 ? TIER_2_FACTOR : 1;
  return {
    costs: {
      steel: Math.round(base.steel * factor),
      [FAMILY_RESOURCE_OF_ROLE[role]]: Math.round(base.family * factor),
    },
    minutes: Math.round(base.minutes * factor),
  };
}

/**
 * **The damage table of `chiffrage-combat.md` §2, copied literally**: the share of the defender's
 * nominal strength a full-strength attacker destroys in one pass, before modifiers. A **missing**
 * cell is "cannot reach", never a zero — ninety-three reachable couples out of a hundred and
 * forty-four, which `combat.test.ts` replays.
 *
 * Three deliberate departures from design sheet 08 must survive any edit: the token anti-air
 * value of mark-2 infantry (.06 to .12, so a pure air force pays *something*), the fighter as the
 * only air unit that beats the bomber (the escort only trades even with it, #158), and the
 * carrier's mediocre line — its strength is reach, not power.
 *
 * The counters it must keep (#126, #158, `combat.test.ts`): mark-2 infantry over mark-1 armour,
 * the fighter over the bomber, the escort over the fighter (naval anti-air), the escort and the
 * fighter over the carrier. One cycle only, and on purpose: rifle beats anti-tank, anti-tank
 * beats tank, tank beats rifle.
 *
 * @a-mesurer trois cases revues le 19/10 pour les contres (#126), jamais jouées
 */
export const DAMAGE_TABLE: DamageTable = {
  infantry1: {
    infantry1: 0.5,
    infantry2: 0.55,
    armor1: 0.15,
    armor2: 0.05,
    landTransport: 0.7,
    artillery: 0.7,
  },
  infantry2: {
    infantry1: 0.35,
    infantry2: 0.4,
    armor1: 0.65,
    armor2: 0.45,
    landTransport: 0.6,
    artillery: 0.6,
    fighter: 0.06,
    bomber: 0.1,
    airTransport: 0.12,
  },
  armor1: {
    infantry1: 0.7,
    /** #126, à mesurer : sous les 0,65 de l'antichar, pour que l'infanterie MK2 contre le blindé */
    infantry2: 0.55,
    armor1: 0.5,
    armor2: 0.25,
    landTransport: 0.85,
    artillery: 0.8,
  },
  armor2: {
    infantry1: 0.75,
    infantry2: 0.7,
    armor1: 0.75,
    armor2: 0.5,
    landTransport: 0.9,
    artillery: 0.85,
  },
  landTransport: {
    infantry1: 0.1,
    infantry2: 0.1,
    armor1: 0.05,
    armor2: 0.02,
    landTransport: 0.15,
    artillery: 0.1,
  },
  artillery: {
    infantry1: 0.6,
    infantry2: 0.55,
    armor1: 0.5,
    armor2: 0.4,
    landTransport: 0.7,
    artillery: 0.5,
    escort: 0.15,
    cargo: 0.3,
    carrier: 0.1,
  },
  fighter: {
    infantry1: 0.25,
    infantry2: 0.25,
    armor1: 0.1,
    armor2: 0.05,
    landTransport: 0.45,
    artillery: 0.3,
    fighter: 0.5,
    bomber: 0.75,
    airTransport: 0.85,
    escort: 0.1,
    cargo: 0.25,
    carrier: 0.12,
  },
  bomber: {
    infantry1: 0.45,
    infantry2: 0.45,
    armor1: 0.6,
    armor2: 0.55,
    landTransport: 0.6,
    artillery: 0.6,
    fighter: 0.08,
    bomber: 0.2,
    airTransport: 0.25,
    escort: 0.55,
    cargo: 0.6,
    carrier: 0.65,
  },
  airTransport: {},
  escort: {
    infantry1: 0.1,
    infantry2: 0.1,
    armor1: 0.05,
    armor2: 0.02,
    landTransport: 0.12,
    artillery: 0.15,
    /** Revu le 19/10 (#158), à mesurer : l'escorte est le contre du chasseur (DCA navale), à égalité avec le bombardier : sinon le cycle escorte > chasseur > bombardier revient */
    fighter: 0.12,
    bomber: 0.55,
    airTransport: 0.18,
    escort: 0.5,
    cargo: 0.7,
    carrier: 0.45,
  },
  cargo: { escort: 0.05, cargo: 0.1, carrier: 0.05 },
  carrier: {
    infantry1: 0.15,
    infantry2: 0.15,
    armor1: 0.08,
    armor2: 0.04,
    landTransport: 0.25,
    artillery: 0.2,
    /** #126, à mesurer : sous les 0,12 du chasseur, pour que le chasseur contre le porte-avions */
    fighter: 0.1,
    bomber: 0.35,
    airTransport: 0.45,
    escort: 0.3,
    cargo: 0.4,
    carrier: 0.3,
  },
};

/**
 * The modifiers of `chiffrage-combat.md` §4 a rule may read **today**. Two of the five are missing
 * on purpose: **the terrain**, because `RegionType` is classified for the eye, coarsely, and
 * `CLAUDE.md` forbids a rule reading it without its own ADR; and **the pincer** (×1.20),
 * because "two converging movements" is one number and three undecided definitions.
 *
 * **Une protection, à la Advance Wars** (décision de Pierre du 14/10/2026, C1) : depuis que
 * l'attaquant a l'initiative, la défense n'a plus que ses murs. Une troupe en garnison d'un
 * bâtiment, d'un avant-poste debout et en service ou d'un objectif **encaisse** cette part de
 * chaque coup, et riposte sans multiplicateur ; une pile posée en terrain libre ou en mer encaisse
 * tout. Le mur protège ce qu'il abrite : il ne tire pas.
 *
 * @a-mesurer rapport pertes attaquant / défenseur par engagement sur une saison
 */
export const GARRISON_DAMAGE_TAKEN = 0.7;

/** Design sheet 08 §3 : sous ce quart de son nominal, une troupe rompt le contact. */
export const ROUT_THRESHOLD = 0.25;

/**
 * **La salve bornée** (ADR 0028 §6) : ce qu'un tir indirect touche de l'escouade visée — un pion
 * seul prend un coup, une grosse escouade quatre. La parade à l'escouade monstre.
 *
 * @a-mesurer rien n'a encore tiré dans une Mondiale
 */
export const SALVO_TARGETS = 4;

export const COMBAT_RULES: CombatRules = {
  damage: DAMAGE_TABLE,
  garrisonDamageTaken: GARRISON_DAMAGE_TAKEN,
  routThreshold: ROUT_THRESHOLD,
  salvoTargets: SALVO_TARGETS,
};

/**
 * **How far each role sees** (ADR 0021, revision of 08/09/2026). Detection is passive and does
 * not become weapon range: only the order says whether a mobile contact becomes a pass.
 *
 * @a-mesurer every value; no season simulation models detection
 */
export const DETECTION_RANGE_KM: Readonly<Record<UnitRole, number>> = {
  infantry: 60,
  armor: 60,
  landTransport: 40,
  artillery: 60,
  fighter: 150,
  bomber: 100,
  airTransport: 80,
  escort: 120,
  cargo: 60,
  carrier: 200,
};

/**
 * **A stack sees as far as its best detector, never as their sum** (ADR 0021, revision of
 * 08/09/2026). These are starting points inherited from the abandoned posture brief, not
 * balance claims: the first campaign still has to measure all nine.
 */
export const detectionRangeOf = (roles: ReadonlyArray<UnitRole>, theatre: Theatre | null): number =>
  roles.reduce(
    (best, role) =>
      Math.max(
        best,
        theatre === null
          ? DETECTION_RANGE_KM[role]
          : theatreKm(theatre, BLITZ_SHARE.detection[role]),
      ),
    0,
  );

/**
 * **Rangoun** (ADR 0032) : la part de sa portée à laquelle un détecteur relève une tournée du
 * teneur.
 *
 * @a-mesurer mi-portée de la décision du 20/10 (Q23), jamais joué
 */
export const RANGOON_SIGHTING_SHARE = 0.5;

/**
 * **Ce qu'un détecteur de `radiusKm` relève d'une cible** : sa portée entière, ou sa part de
 * Rangoun quand la cible est une tournée du teneur. Le calcul complet, le calcul d'un seul joueur
 * et le cercle que le teneur voit autour de sa tournée la lisent tous ici.
 */
export const sightingReachKm = (radiusKm: number, rangoonTour: boolean): number =>
  rangoonTour ? radiusKm * RANGOON_SIGHTING_SHARE : radiusKm;

/**
 * **How close one has to stand to be found on arrival.** ADR 0019 §1: it replaces the containment
 * the server cannot compute, since it holds no polygons.
 *
 * Twenty-five kilometres is **an assumed starting point, never measured** — the same status as
 * the passive detection ranges and deliberately not the same value: detecting is seeing,
 * while an arrival is a place one walked to. Wider, aiming stops saying anything;
 * narrower, the point one clicks would have to land on a defender to find him.
 *
 * @a-mesurer an assumed starting point; nothing measures how close is close enough on arrival
 */
export const ARRIVAL_RADIUS_KM = 25;

/**
 * **The Blitz's distances, as shares of its theatre's span** (A2, `theatreKm`): cut so Europe
 * (4 225 km) keeps the Mondiale's kilometres, and every wider theatre widens them all alike — a
 * fixed 25 km of contact was a pinhead on the Pacific.
 *
 * @a-mesurer every share; nothing has played an evening
 */
export const BLITZ_SHARE = {
  contact: 0.0059,
  detection: {
    infantry: 0.0142,
    armor: 0.0142,
    landTransport: 0.0095,
    artillery: 0.0142,
    fighter: 0.0355,
    bomber: 0.0237,
    airTransport: 0.0189,
    escort: 0.0284,
    cargo: 0.0142,
    carrier: 0.0473,
  } as Readonly<Record<UnitRole, number>>,
  /** The artillery's reach, and the dead zone under it where it does not fire (B20). */
  fireRange: 0.0355,
  deadZone: 0.0118,
  /** « À faire maintenant » montre les villes neutres à cette part d'un de mes bâtiments. */
  nearCity: 0.142,
} as const;

/** **How close is contact**: the Mondiale's kilometres, or the Blitz's share of its theatre. */
export const contactKm = (theatre: Theatre | null): number =>
  theatre === null ? ARRIVAL_RADIUS_KM : theatreKm(theatre, BLITZ_SHARE.contact);

/**
 * **Le rechargement** (B19) : après une frappe, ce délai sans attaquer. La riposte ne le déclenche
 * pas. L'infanterie plus vive qu'un bombardier, une minute en moyenne. En Mondiale, seule
 * l'artillerie le lit, après une salve, aux mêmes valeurs (4.10) : ses crans bornent le reste.
 *
 * @a-mesurer toute la table, Blitz comme Mondiale ; rien n'a encore joué une soirée
 */
export const RELOAD_SECONDS_BY_ROLE: Readonly<Record<UnitRole, number>> = {
  infantry: 40,
  armor: 60,
  landTransport: 45,
  artillery: 120,
  fighter: 50,
  bomber: 90,
  airTransport: 60,
  escort: 60,
  cargo: 60,
  carrier: 75,
};

/**
 * **Le temps immobile qu'il faut à l'artillerie pour être en batterie** (B20) ; sa portée et sa
 * zone morte sont des parts du théâtre (`BLITZ_SHARE`). Un théâtre se traverse en 18 min, donc
 * partout la portée vaut quarante secondes de marche adverse, la zone morte treize, et la mise en
 * batterie le double de la portée : on voit venir, on tire une fois, et le contact arrive.
 *
 * @a-mesurer rien n'a encore joué une soirée
 */
export const INDIRECT_FIRE = { emplaceSeconds: 30 } as const;

/**
 * **En Mondiale, la portée et la zone morte de l'artillerie sont des kilomètres** (ADR 0028 §6) :
 * la zone morte passe le rayon d'arrivée (`ARRIVAL_RADIUS_KM`), pour qu'on ne tire jamais sur ce
 * qu'on touche ; la portée tient une région voisine.
 *
 * @a-mesurer rien n'a encore tiré dans une Mondiale
 */
export const MONDIALE_FIRE_REACH = { rangeKm: 150, deadZoneKm: 30 } as const;

/**
 * **Le pas d'une poursuite** (B18) : le plus long qu'un poursuivant reste sans regarder sa cible.
 * Le contact se date entre deux regards (`contactAt`), donc ce pas ne borne que la réaction à un
 * changement de cap.
 *
 * @a-mesurer à 200 km/min, quinze secondes font cinquante kilomètres
 */
export const PURSUIT_STEP_SECONDS = 15;

/**
 * **How far a listening station hears what moves** — design sheet 04's second detector.
 *
 * A hundred and twenty kilometres is a placement in the ordering the design asks for and nothing
 * more: longer than an infantry company's 60 km, because a station bought for forty minutes and
 * thirty-five of steel has to be worth more than a rifleman standing still. It hears and catches
 * nothing by itself.
 *
 * A station has no point of its own: it listens from its region's (`regionFacts`).
 *
 * @a-mesurer a rank in the ordering the design asks for, and nothing more
 */
export const LISTENING_STATION_RADIUS_KM = 120;

/**
 * **What the army eats an hour, by steps** (ADR 0028 §2, replacing the flat rate of
 * `consommation-continue.md` D1). Each troop pays the rate of its rank: one up to the tenth, two
 * up to the twenty-fifth, three beyond. `nominalStrength` is not the same unit from one role to
 * the next, so the rate still reads the head count and nothing else: a flat rate keeps
 * `chiffrage-combat.md` §5 for free (losing men is never an economy), and the steps are what
 * makes a large army pay for being large (`src/domain/upkeep.ts` reads them).
 *
 * A farm at level one grows twelve an hour, which feeds twelve troops of the first step.
 *
 * @a-mesurer the three rates and the two thresholds are set by eye against a farm at level one
 */
export const UPKEEP_STEPS: ReadonlyArray<{ readonly upTo: number; readonly rate: number }> = [
  { upTo: 10, rate: 1 },
  { upTo: 25, rate: 2 },
  { upTo: Number.POSITIVE_INFINITY, rate: 3 },
];

/**
 * **An outpost eats food on the personal board, by its level** (ADR 0028 §2): the brake on the
 * carpet of outposts, which the price alone did not hold. A standing point only; a site under
 * construction eats nothing yet.
 *
 * @a-mesurer set by eye: a level-one point against the twelve of a farm
 */
export const OUTPOST_FOOD_PER_HOUR_PER_LEVEL = 3;

/**
 * **A listening post burns coal as long as it listens** (ADR 0028 §2, R17): a station, and an
 * outpost given the listening specialization, each. Flat per post and not per level, since the
 * radius is what a level buys.
 *
 * @a-mesurer set by eye: a post against the twelve an hour of a coal mine at level one
 */
export const LISTENING_COAL_PER_HOUR = 1;

/**
 * **Ce que brûle la vigie d'un avant-poste** (ADR 0037 §2) : par niveau, parce que le rayon
 * qu'elle guette monte avec lui. Pris au stock national, comme la station d'écoute.
 *
 * @a-mesurer 1, 2, 3 par heure : un point contre les douze d'une mine de charbon au niveau 1
 */
export const LOOKOUT_COAL_PER_HOUR_PER_LEVEL = 1;

/**
 * What a troop eats **outside every anchor of its own** (ADR 0019 §4). Without it, "at its own
 * risk and peril" names no risk: a plain rate plus "nothing dies when dry" (D3) would make twenty
 * free sentinels the cheapest way to empty the fog (ADR 0005).
 *
 * **Two is an assumed starting point, never a measured value**, chosen so the rule exists and can
 * be measured. The known risk is that at ×2 the surcharge drowns in an economy where steel is the
 * bottleneck and food abundant; if the measurement says so, the value rises and the rule does not.
 *
 * @a-mesurer assumed; at ×2 the surcharge may drown in an economy where steel is the bottleneck
 */
export const UPKEEP_UNSUPPLIED_MULTIPLIER = 2;

/**
 * Design sheet 03. **Neither figure is in the design** — it says "temporarily" and "then an
 * immunity window" and stops there. Both are placeholders shaped only so the pair reads: a night
 * out of service, half a night of respite, on a 48-hour season. The immunity is what keeps the
 * rule from collapsing into a permanent shutdown by relays of cheap raids.
 *
 * @a-mesurer neither figure is in the design; shaped only so the pair reads on a 48-hour season
 */
export const OUTPOST_DISABLED_HOURS = 6;
export const OUTPOST_IMMUNITY_HOURS = 3;

/**
 * First playable values for the warehouse expedition. They establish the two separate waits —
 * holding the site, then keeping it out of service — but no simulation or game has balanced
 * either one.
 *
 * @a-mesurer starting points only; no simulation models plunder presence or warehouse downtime
 */
export const PLUNDER_HOURS_PRESENT = 2;
export const PLUNDER_DISABLED_HOURS = 12;

/**
 * **Le temps qu'une infanterie à pleine force met à capturer**, par mode et par cible (décision du
 * 14/10). Une troupe entamée va au prorata de sa force (`captureRate`), et en Mondiale la plage de
 * repos du défenseur ne compte pas. Le QG ne se capture qu'en Blitz.
 *
 * @a-mesurer « ≈ 6 h » et « ≈ 3 min » du grilling du 14/10, « ≈ 6 min » pour le QG (lot 6), jamais
 * joués
 */
export const CAPTURE_MINUTES = {
  /** Un point stratégique se prend comme un bâtiment : six heures (P1), à mesurer comme le reste. */
  mondiale: { building: 360, outpost: 360, point: 360 },
  /** Le QG de la Blitz, deux fois un bâtiment : sa chute élimine (B10), et le défenseur doit
   *  avoir le temps de revenir. */
  blitz: { building: 2.4, outpost: 2.4, hq: 4.8 },
} as const satisfies Record<SeasonMode, Record<'building' | 'outpost', number>> & {
  mondiale: { point: number };
  blitz: { hq: number };
};

/**
 * **Combien de temps une dernière position connue survit à ce qu'elle a vu** (ADR 0024 §2). Une
 * fenêtre de relevé qui s'est ouverte laisse une trace quoi qu'il arrive à la colonne — arrivée,
 * retour, déroute, destruction, sortie de portée — et cette trace vieillit : le brouillard rend
 * l'information périmée, pas éternelle, et vingt marches ne laissent pas vingt fantômes.
 *
 * Le même délai vaut pour un camp perdu de vue : ce sont deux souvenirs de la même sorte.
 *
 * @a-mesurer une journée, choisie pour qu'un relevé du soir serve encore au matin sur une saison
 * de 48 h ; rien ne mesure ce que vaut une information qui date
 */
export const LAST_KNOWN_HOURS = 24;

/**
 * A battlefield remainder gets one fixed window from the pass that created it. Collecting part
 * of it never starts a fresh window. A day, since marches went twelve times slower
 * (`MONDIALE_PACE`): two hours left no column but the victor's own the time to reach it.
 *
 * @a-mesurer provisional lifetime; no season simulation models crate discovery or collection
 */
export const LOOT_CRATE_HOURS = 24;

/**
 * The public rumor waits after the physical remainder appears, then names only a search disk.
 * Its public end remains the crate's original deadline even when the crate was collected early.
 *
 * @a-mesurer provisional disclosure delay and search radius; no season simulation models them
 */
export const LOOT_RUMOR_DELAY_MINUTES = 10;
export const LOOT_RUMOR_RADIUS_KM = 200;

/**
 * **Ce qu'un avant-poste ouvre autour de lui, et qui monte avec son niveau** (ADR 0020 §1,
 * révision du 31/08). Un rayon, jamais un compte de régions — c'est la seule forme que la règle
 * peut prendre (ADR 0015).
 *
 * Quatre cents kilomètres, la valeur d'avant, couvraient **le quart de la France** pour un seul
 * point posé : au premier contrôle visuel la tache d'un avant-poste de niveau 1 se lisait comme
 * une conquête. Cent vingt kilomètres est une poignée de départements, et le reste s'achète —
 * *là où je peux bâtir est là où je tiens* ne bouge pas, les deux montent ensemble.
 *
 * @a-mesurer placeholders assumés : mesurés sur ce qu'ils couvrent d'une carte, jamais sur une partie qu'ils auraient changée
 */
export const OUTPOST_REACH_KM_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 120,
  2: 180,
  3: 240,
};

/**
 * **Jusqu'où un avant-poste se monte** (précision du 15/09). C'est la table des rayons qui le
 * dit et non une seconde constante : un niveau qu'aucun rayon ne décrit serait un niveau qu'on
 * paie pour rien.
 */
export const OUTPOST_MAX_LEVEL = Object.keys(OUTPOST_REACH_KM_BY_LEVEL).length;

const MAX_REACH_LEVEL = OUTPOST_MAX_LEVEL;

/** Le rayon d'un point, par son niveau. Un niveau au-delà de la table garde le dernier rayon :
 *  une amélioration future ne doit pas rendre un point aveugle en attendant sa ligne. */
export const outpostReachKm = (level: number): number =>
  OUTPOST_REACH_KM_BY_LEVEL[Math.min(Math.max(Math.trunc(level), 1), MAX_REACH_LEVEL)]!;

/**
 * **What a logistics relay does to the stretch of road that passes it** (design sheet 03) — the
 * only specialization that touches travel time, and with it the arbitration the sheet names: an
 * army, or the means to project it.
 *
 * One and a half is shaped so the relay reads as a decision rather than a rounding: on a route
 * entirely under its reach it turns fourteen minutes per thousand kilometres into a little over
 * nine. Nothing simulates it. **It never touches an opponent**, and the reading is made at
 * departure like every other timing of the game.
 *
 * @a-mesurer shaped so the relay reads as a decision rather than a rounding
 */
export const RELAY_SPEED_MULTIPLIER = 1.5;

/**
 * **The base pace of movement**: 14 minutes per 1 000 km on land. It came out of a simulation
 * since retired, so it is no longer a measurement but the order of magnitude of the Blitz (Q3,
 * 14/10); the Mondiale runs it `MONDIALE_PACE` times slower. Everything else about a duration is
 * derived from it — a route already carries its cost in sea-equivalent units (ADR 0012), so the
 * minute price of one cost unit is this pace read back through the land multiplier. Two
 * hand-written numbers would drift, and a drift here moves every trip in the game.
 */
export const MINUTES_PER_1000_KM_ON_LAND = 14;

export const MINUTES_PER_ROUTE_UNIT =
  (MINUTES_PER_1000_KM_ON_LAND * KM_PER_UNIT) / (1000 * COST_BY_MEDIUM.land);

/**
 * **La Mondiale va douze fois moins vite que la mesure** (M5, 14/10) : une opération y dure une
 * demi à deux visites — Paris-Berlin ≈ 2 h 30. La mesure reste l'ordre de grandeur de la Blitz,
 * qui la relit à l'échelle de son théâtre (`pacedMinutes`).
 *
 * @a-mesurer posé par la fiche pour la saison test, jamais joué
 */
export const MONDIALE_PACE = 12;

/** Une route en minutes de Mondiale. */
export const routeMinutes = (costUnits: number): number =>
  Math.max(1, Math.round(costUnits * MINUTES_PER_ROUTE_UNIT * MONDIALE_PACE));

export const MAX_PLAYERS = MODE_RULES.mondiale.maxPlayers;

/** Design sheet 07. The duration is **fixed, not chosen**: the window forbids any arrival while
 *  it lasts, so a player who set its length would set how long he is untouchable. He picks when
 *  he sleeps, never how long. */
export const REST_WINDOW_MINUTES = 7 * 60;
/** En minutes **UTC**, comme tout ce qui touche la plage côté serveur : 23h00 à Paris l'été,
 *  22h00 l'hiver — la valeur d'avant, écrite dans le fuseau où le serveur la lit. */
export const DEFAULT_REST_START_MINUTES = 21 * 60;

export const restWindowFrom = (startMinutes: number) => ({
  startMinutes,
  endMinutes: (startMinutes + REST_WINDOW_MINUTES) % 1440,
});

export const DEFAULT_REST_WINDOW = restWindowFrom(DEFAULT_REST_START_MINUTES);

/**
 * **En deçà de quoi un second passage n'écrit rien.** Une observation n'écrit que les régions
 * dont le relevé *change* : même tenant et ligne récente, la ligne reste telle quelle. Sans ce
 * frein, une colonne qui fait l'aller-retour à travers un continent réécrit deux fois des
 * centaines de lignes pour la même information.
 *
 * Une heure : la date ne sert qu'à la fiche d'une région relevée (ADR 0033), qui la dit au jour
 * et à l'heure ; rafraîchir plus finement n'y changerait rien de lisible.
 *
 * @a-mesurer une durée lisible, rien de plus
 */
export const SURVEY_REFRESH_HOURS = 1;

/**
 * **Au bout de combien de temps un fondateur qui ne revient plus cesse d'être seul à pouvoir
 * clore.** Depuis l'ADR 0020 §9 la Domination est le seul terminateur automatique : un fondateur
 * qui abandonne sans capituler laisse une saison que personne ne peut finir, et le wipe manuel
 * devient le seul recours. Le pouvoir passe donc au doyen des belligérants — pas le titre, la
 * seule exclusivité (`seasons.conclude`).
 *
 * Quarante-huit heures, soit la plus courte des saisons : en deçà, une nuit et une journée de
 * travail suffisent à ouvrir la porte sur un fondateur qui joue encore.
 *
 * @a-mesurer choisi sur la cadence de visite d'un jeu asynchrone, jamais mesuré en partie
 */
export const FOUNDER_ABSENCE_HOURS = 48;

/**
 * **À quelle cadence au plus une présence s'écrit.** Une query ne peut pas écrire, donc la
 * présence est une mutation que le client appelle — et une mutation appelée à chaque
 * rafraîchissement du plateau serait un battement, avec l'invalidation de vue qui va avec.
 *
 * Trente minutes contre quarante-huit heures : la mesure est grossière de deux ordres de
 * grandeur sous le seuil qu'elle sert, ce qui est exactement ce qu'on lui demande.
 */
export const PRESENCE_THROTTLE_MIN = 30;

/**
 * **À partir de quand l'absence du fondateur se dit au plateau.** Une ligne, pas une surface — et
 * elle n'apparaît qu'à l'approche de la porte : afficher « absent depuis 3 h » dès la première
 * matinée ferait d'une absence ordinaire un événement, et de la fenêtre Nation un mouchard sur
 * les habitudes du fondateur.
 */
export const FOUNDER_ABSENCE_NOTICE_HOURS = 24;

/**
 * **À quelle cadence le classement paraît** (décision 80 du 06/09, qui révise les 2 h de la
 * décision 43). C'est la **seule constante nouvelle** que le classement introduit — tout le
 * reste de son barème se lit dans les tables qui existent déjà (`propositions/classement-bareme.md`
 * §1), et une grille de points par bâtiment ou par rôle serait une seconde table d'équilibrage
 * à tenir d'accord avec la première.
 *
 * Trois heures : assez long pour que la page ne soit pas un moniteur — entre deux éditions le
 * classement **ne bouge pas**, et c'est ce qui en fait un rendez-vous — assez court pour qu'une
 * journée de jeu en porte huit. La première paraît à `launchedAt + PRESS_EDITION_HOURS`, jamais
 * au lancement : au lancement il n'y a rien à dire.
 */
export const PRESS_EDITION_HOURS = 3;

/**
 * **Un archétype d'objectif neutre** : une garnison locale, un dépôt, un palier. Le palier est le
 * mot que le joueur lit — « forces irrégulières légères, organisées, retranchées » — et ce que la
 * répartition tire : les deux objectifs proches d'un siège sortent des faciles et des moyens, le
 * dur ne sort que des durs.
 */
export type ObjectiveTier = 'easy' | 'medium' | 'hard';

export type ObjectiveArchetype = {
  readonly key: string;
  readonly tier: ObjectiveTier;
  readonly garrison: ReadonlyArray<{ readonly role: UnitRole; readonly tier: UnitTier }>;
  readonly depot: Costs;
};

/**
 * **La palette des objectifs neutres** (`propositions/objectifs-neutres.md`, réécrit le
 * 17/09/2026). La saison en tire une partie — deux archétypes *faciles ou moyens* près de chaque
 * siège, un *dur* entre deux voisins — et c'est tout ce que le code sait d'eux.
 *
 * **C'est une table, jamais une branche.** Ajouter un archétype est une ligne ici, une planche
 * dans `src/emblems/objectives/manifest.ts` et trois phrases dans `fr.objectives` ; rien dans la
 * règle de pose, rien dans le combat, rien dans la vue. Le jour où un `switch` sur une clé
 * apparaît, la table a cessé d'être une table.
 *
 * @a-mesurer toute la table : par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h
 */
export const OBJECTIVE_ARCHETYPES: ReadonlyArray<ObjectiveArchetype> = [
  {
    key: 'abandonedStores',
    tier: 'easy',
    garrison: [
      { role: 'infantry', tier: 1 },
      { role: 'infantry', tier: 1 },
    ],
    depot: { steel: 60 },
  },
  {
    key: 'stalledConvoy',
    tier: 'medium',
    garrison: [
      { role: 'infantry', tier: 1 },
      { role: 'infantry', tier: 1 },
      { role: 'infantry', tier: 1 },
    ],
    depot: { steel: 150, ammunition: 40 },
  },
  {
    key: 'fuelDump',
    tier: 'medium',
    garrison: [
      { role: 'infantry', tier: 1 },
      { role: 'infantry', tier: 1 },
      { role: 'infantry', tier: 1 },
    ],
    depot: { steel: 150, oil: 60 },
  },
  {
    key: 'irregularArsenal',
    tier: 'hard',
    garrison: [
      { role: 'infantry', tier: 1 },
      { role: 'infantry', tier: 1 },
      { role: 'armor', tier: 1 },
    ],
    depot: { steel: 300, ammunition: 80 },
  },
];

/**
 * **L'archétype derrière une clé**, `null` pour une clé qu'aucune ligne ne décrit — un document
 * écrit avant qu'on retire une entrée de la palette. La carte et le serveur y lisent le palier et
 * le nom depuis **la même** table : un second tableau des paliers côté client aurait dit
 * « légères » d'une garnison que le serveur pose avec un blindé.
 */
export const objectiveArchetype = (key: string): ObjectiveArchetype | null =>
  OBJECTIVE_ARCHETYPES.find((archetype) => archetype.key === key) ?? null;

/**
 * **Peu, et disputés** — la seule chose que la proposition du 29/08 demandait, et la règle du
 * 06/09 (« 2 à 3 par saison, à moins de 1 500 km de deux QG ») ne la tenait pas : simulée sur les
 * 4 589 régions elle ne plaçait rien hors d'Europe. Ce qui la remplace répartit **par joueur** —
 * deux prises à sa portée, pour que le détour existe partout — et garde la dispute là où elle se
 * joue : un objectif **dur** par paire de voisins, au milieu de la route qui les sépare.
 *
 * Les quatre nombres se lisent ensemble : quinze cents kilomètres est une expédition d'une saison
 * de 48 h, trois cents sépare assez les deux prises d'un même joueur pour qu'il choisisse, huit
 * cents fait du dur un détour et non un sprint, et trois quarts dit qu'une paire dont l'un est
 * deux fois plus près que l'autre n'a pas d'objectif commun — elle en aurait un qui n'appartient
 * qu'au plus proche.
 *
 * **Quinze cents et non mille, et c'est la carte qui l'a dit** (mesure du 17/09, sur les huit
 * capitales de 1940 et les 4 589 régions) : à mille kilomètres de route, **Washington n'atteint
 * aucun sol sans siège et Tokyo n'en atteint qu'un** — les provinces canadiennes portent leur pôle
 * loin au nord et Cuba est à dix-huit cents. Deux nations sur huit n'auraient eu ni l'une ni
 * l'autre de leurs prises, c'est-à-dire aucun détour à faire, ce que ce lot existe précisément
 * pour créer. À quinze cents, les huit ont leurs deux. C'est la même mesure qui avait fait
 * abandonner la règle du 06/09 — et la même distance.
 *
 * @a-mesurer les quatre : mesure attendue — par archétype, combien réduits au jour 7 et combien ont vu deux joueurs en 24 h
 */
export const OBJECTIVE_NEAR_KM = 1_500;
export const OBJECTIVE_SPREAD_KM = 300;
export const OBJECTIVE_HARD_MIN_KM = 800;
export const OBJECTIVE_HARD_FAIRNESS = 0.75;

/**
 * **Combien de paires de voisins portent un objectif dur.** Chaque siège entre dans deux paires
 * au plus, donc à quatre joueurs il y en a quatre : c'est le plafond, pas une cible — un théâtre
 * où deux QG sont séparés par un océan en compte moins, et la dépêche de lancement le dit.
 */
export const OBJECTIVE_HARD_MAX = 4;

/**
 * **Ce que la garnison locale a dans ses caissons, par troupe.** Elle est ancrée partout
 * (`upkeepOf` ne lui compte aucune troupe hors ancrage), donc avant chaque passe elle reprend ses
 * coups sur cette dotation, dix par cran (ADR 0028 §3) : sans elle, la garnison serait à sec
 * après trois passes, ce qui ferait de l'objectif *facile* une formalité et de l'archétype un mot.
 *
 * Rien ne la remplit jamais — *elle ne se renforce jamais, ne se déroute pas, ne mange pas* —,
 * donc le chiffre est une réserve pour la saison et non un débit par heure.
 *
 * @a-mesurer une réserve tenue au doigt pour qu'une garnison ne tire jamais à sec sur une saison de 48 h
 */
export const OBJECTIVE_AMMUNITION_PER_TROOP = 200;

/**
 * **L'économie de la Blitz, en une table** (lot 4 des deux modes, 14/10). Une seule ressource,
 * les fonds, versée par minute par les villes et le QG tenus ; caserne, port et aérodrome
 * forment, ils ne rapportent rien. La carte de départ se tire au lancement dans le théâtre
 * (`src/domain/blitz-placement.ts`) : un QG et une caserne par joueur, le reste neutre.
 *
 * @a-mesurer toutes, posées pour qu'une partie de deux heures se lise sur le papier : le pécule
 * paie deux fantassins, une ville en paie un toutes les quatre minutes ; rien n'a été joué
 */
export const BLITZ = {
  startingFunds: 200,
  fundsPerMinute: { hq: 30, city: 15 } as Readonly<Partial<Record<BuildingKey, number>>>,
  rolePrice: {
    infantry: 60,
    landTransport: 90,
    armor: 180,
    artillery: 160,
    fighter: 200,
    bomber: 260,
    airTransport: 150,
    escort: 200,
    cargo: 140,
    carrier: 320,
  } as Readonly<Record<UnitRole, number>>,
  recruitMinutes: 0.8,
  /** La borne technique, jamais affichée (R10b) : le frein est l'économie. */
  troopBound: 80,
  mend: {
    stepMinutes: 0.8,
    /** La part de la force nominale rendue à chaque pas. */
    sharePerStep: 0.1,
    /** Ce que coûte une remise à neuf entière, en part du prix du rôle. */
    priceShare: 0.5,
  },
  map: {
    /** Le cercle des QG, posé sur la terre (A2) : son rayon en part du théâtre — 950 km en
     *  Europe —, et l'écart cible entre QG en est la corde. */
    hqRadius: 0.225,
    hqRadiusSpread: 0.5,
    /** Combien de tablées on tire au plus, chacune d'une région au hasard. */
    hqDraws: 1000,
    /** Combien de tablées régulières on éprouve en entier (E6 : une douzaine) avant de refuser. */
    hqTries: 12,
    /** Le plus court écart de route entre QG, en part du plus long, sous lequel on refuse. */
    hqEvenness: 0.6,
    /** L'écart permis, à pied, autour de la distance cible d'une caserne ou d'un neutre proche. */
    tolerance: 0.35,
    /** La caserne de départ, à soi, à cette part du théâtre (A2) en route depuis le QG — 120 km
     *  en Europe. */
    starting: [{ key: 'barracks', share: 0.0284 }],
    /** Les neutres proches de chaque QG, chacun à la même distance de route pour tous : 250, 450,
     *  350 et 400 km en Europe. */
    near: [
      { key: 'city', share: 0.0592 },
      { key: 'city', share: 0.1065 },
      { key: 'port', share: 0.0828 },
      { key: 'airfield', share: 0.0947 },
    ],
    /** Les neutres disputés, par paire de voisins, au milieu de la route qui les sépare. */
    disputed: ['city', 'airfield'],
    /** Le plus court écart à vol d'oiseau entre deux bâtiments posés — 80 km en Europe. */
    spread: 0.0189,
    fairness: 0.8,
  } as const,
} as const;
