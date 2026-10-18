import { withinTheatre } from './blitz';
import type { Theatre } from './theatres';
import { captureRefusalOf, type CaptureRefusal } from './capture';
import { produces } from './economy';
import { firesIndirect } from './indirect-fire';
import type { BuildingKey, MovementType, UnitRole } from './ids';
import type { RouteMode } from './routing';
import { COST_BY_MEDIUM } from './routing';
import type { UnitDomain } from './troops';
import {
  boardedAll,
  DOMAIN_BY_ROLE,
  fareOf,
  garrisons,
  LAND_SEATS_PER_TRANSPORT,
  LIFT_CAPACITY,
  LIFT_COST,
  PROJECTION_BY_DOMAIN,
  seatsLeft,
  stackRows,
  unitsOf,
  type Seated,
} from './troops';

/**
 * What a movement is aimed at, as both sides of the wire name it. The compass rose in the map
 * and the mutations that refuse an order read **this** module — a second table of what is legal
 * is how a fan offers a type the server then turns down, and the fan is the one place a refusal
 * must never happen (ADR 0015: contextual, never greyed out).
 */
export type MovementAim =
  | {
      readonly kind: 'region';
      readonly regionId: string;
      readonly country: string;
      /** Son centroïde : le cadre d'une Blitz se lit sur lui (`OUTSIDE_THEATRE`). */
      readonly lon: number;
      readonly lat: number;
      /** @see the note on the point's own `surveyed`. */
      readonly surveyed: boolean;
    }
  /**
   * **Un camp adverse relevé** (ADR 0024 §4) : le seul objet mobile qu'un ordre puisse viser, et
   * il est visé comme une **position**. La colonne marche au point relevé ; à l'arrivée elle
   * engage ce qui s'y tient à `contactKm(théâtre)`, et si le camp est parti elle est bredouille.
   * La poursuite est l'intention « intercepter » de la V1, pas celle-ci.
   */
  | {
      readonly kind: 'camp';
      readonly campId: string;
      readonly lon: number;
      readonly lat: number;
      readonly hostCountry: string;
      /**
       * **Le milieu du relevé, lu sur la grille de routage** — les deux mêmes lectures qu'un
       * point, et pour la raison qui les y a mises : la règle doit répondre sans route et sans
       * carte (ADR 0015). Elles sont arrivées avec le large (18/09) : un camp mouillé en mer
       * était une cible qu'aucune flotte ne pouvait viser — `SEA_TARGET_REQUIRED` sur une
       * position qui *est* de la mer — donc la règle 4 n'avait aucune passe où s'appliquer.
       */
      readonly onLand: boolean;
      readonly coastal: boolean;
    }
  /**
   * **Un objectif neutre**, et la seule cible du jeu qu'on attaque **sans l'avoir relevée** — c'est
   * l'exception nommée de l'ADR 0024 §4, et elle tient parce que l'objectif est *public par
   * nature* : il est annoncé à tous au lancement, il est sur la carte de tous, et son dépôt
   * restant se lit. Il n'y a rien à percer.
   *
   * Ce que le brouillard garde est ce qui le tient : la garnison locale est une force posée comme
   * une autre, et elle ne se relève qu'en portée. On sait où aller, pas ce qu'on y trouvera.
   */
  | {
      readonly kind: 'objective';
      readonly objectiveId: string;
      readonly lon: number;
      readonly lat: number;
      readonly hostCountry: string;
    }
  | {
      readonly kind: 'outpost';
      readonly outpostId: string;
      readonly hostCountry: string;
      /** @see the note on the point's own `coastal`. */
      readonly coastal: boolean;
    }
  /**
   * **A place, not a thing** (ADR 0019 §1). It answers everywhere the other two cannot: on the
   * open sea, and above the regions' fade-in threshold where the map draws no region to click.
   *
   * It is deliberately **not resolved** into whatever happens to stand there. Resolving it at the
   * aim would tell the player there is an outpost where he believed he was pointing at empty
   * ground — the fan would leak what the fog exists to hide (ADR 0005). What stands there is
   * discovered by the arrival, like everything else.
   */
  | {
      readonly kind: 'point';
      readonly lon: number;
      readonly lat: number;
      /** Read on the routing grid, so an offshore click cannot become a walk on another coast. */
      readonly onLand: boolean;
      /**
       * **Le sol porte-t-il quelque chose que j'ai relevé ?** (ADR 0024 §4) — une installation
       * adverse relevée. C'est ce qui ouvre « attaquer » sur du sol, et rien d'autre : on
       * n'attaque pas du vide. Un objectif neutre ne passe pas par ici — il est public, donc il
       * est une visée à lui seul (`kind: 'objective'`).
       *
       * Il voyage avec la visée plutôt que d'être relu ici, pour la raison qui fait voyager
       * `coastal` : la règle doit répondre **sans base et sans carte** (ADR 0015), et le domaine
       * ne tient ni relevé ni polygone. Les deux bouts le remplissent avec la même fonction
       * (`carriesSurveyedInstallation`), donc la rose et le serveur disent le même mot.
       */
      readonly surveyed: boolean;
      /**
       * **Whether a hull can reach this exact spot** — `isCoastCell` on the routing grid and
       * nothing else: a coastline read off another source would say "coast" where Dijkstra finds
       * no water. It travels with the aim rather than being looked up here for the reason
       * `afloat` does — the rule must answer **without a route** (ADR 0015), and the domain holds
       * no grid. Both ends fill it from the same function, so the fan and the server agree.
       */
      readonly coastal: boolean;
    }
  /**
   * **A building of one's own, entered as a garrison** (decision 64b, 01/09) — the one aim that
   * is a thing rather than a place, and it is always **mine**: the server resolves nobody else's
   * building (`aimOf`), so nothing here has to ask. The key travels because the rule reads it
   * (`GARRISON_KEYS_BY_ROLE`), and the client holds it off the mast it clicked.
   */
  | { readonly kind: 'building'; readonly buildingId: string; readonly key: BuildingKey }
  /**
   * **Une colonne adverse en vue**, visée en Blitz seulement (B18) : l'attaquant la poursuit et
   * frappe au contact. Le relevé du fil répond — sa position à l'instant de l'ordre —, jamais la
   * colonne vraie ; ailleurs qu'en Blitz il n'y a rien à poursuivre.
   */
  | {
      readonly kind: 'track';
      readonly movementId: string;
      readonly lon: number;
      readonly lat: number;
      readonly hostCountry: string;
      readonly onLand: boolean;
      readonly coastal: boolean;
    };

/**
 * The column as the rule reads it: what it carries, and what its owner already holds. Plain
 * data rather than callbacks, because the server builds it from documents and the client from
 * `PlayerView` — a shape both can fill without either one importing the other.
 *
 * **Where the column stands no longer restricts what it may ask for** (ADR 0019 §1): it says
 * only which doors are open under its feet. `departureBuildings` is that ground — the projection
 * buildings standing exactly where the column sets out, empty for a column standing on a point.
 */
export type Column = {
  readonly roles: ReadonlyArray<UnitRole>;
  /** The regions carrying one of my buildings: marching on one of them is marching on myself. */
  readonly myRegionIds: ReadonlySet<string>;
  readonly myOutpostIds: ReadonlySet<string>;
  readonly departureBuildings: ReadonlySet<BuildingKey>;
  /**
   * **Whether the column is already in the water it would be asked to embark on.** Read off the
   * departure point and nowhere else, **on the routing grid** — the same cell the aim's `onLand`
   * was read on, so a point the fan accepted as water is water when the column leaves it again.
   * It was read off the polygon (`hostAtPoint === ''`) until 09/09, and the two geometries
   * disagree on every shore narrower than half a cell: a hull sent there sailed in and never
   * out. **Never stored** either: a column is a reading made at the moment an order is weighed,
   * and a troop's address is the only durable fact behind it. A persisted flag would be a second
   * truth to keep in step with `stationedAt`, which is exactly the divergence ADR 0015 exists to
   * forbid.
   */
  readonly afloat: boolean;
  /**
   * **Whether the ground it stands on is a shore a hull sails from** (ADR 0019 §2, revision of
   * 04/09). A column put ashore by a landing stands on a beach and not at a quay, and asking it
   * for a port to leave by would strand it exactly where `afloat` used to strand a fleet at sea
   * — the same **mouvement fantôme**, one medium further in. Read off the departure point with
   * the routing grid, never stored, like `afloat` beside it.
   */
  readonly coastal: boolean;
  /**
   * **Le rythme auquel cette pile capturerait** (`captureRate`) : la force de sa meilleure
   * infanterie. Absent, la pleine force — ce que la rose annonçait avant d'avoir les troupes.
   */
  readonly captureRate?: number;
  /** **Une Blitz** (lot 5) : absent, la Mondiale, où rien de ceci ne se lit. */
  readonly blitz?: {
    readonly theatre: Theatre;
    /** La troupe a frappé il y a moins que son rechargement : elle bouge, elle n'attaque pas. */
    readonly reloading: boolean;
    /** Mes bâtiments où se tient déjà une de mes troupes — une seule unité par bâtiment. */
    readonly occupiedBuildingIds: ReadonlySet<string>;
  };
};

export type OrderRefusal =
  | 'EMPTY_MOVEMENT'
  | 'FRIENDLY_TARGET'
  | 'INFANTRY_ONLY'
  | 'NO_PORT_AT_DEPARTURE'
  | 'NO_AIRFIELD_AT_DEPARTURE'
  | 'LANDING_NEEDS_A_COAST'
  | 'LAND_TARGET_REQUIRED'
  | 'SEA_TARGET_REQUIRED'
  /**
   * **Une pile en mer part par sa coque, ou elle ne part pas** (règle 3 du 18/09). Depuis que
   * rester en mer est un ordre, une troupe terrestre peut avoir une adresse sur l'eau et plus
   * rien pour la porter — le *mouvement fantôme* une quatrième fois. Le mot est à elle plutôt
   * qu'un `NO_LAND_ROUTE` qui parlerait d'une route que personne ne cherchait.
   */
  | 'NO_HULL_AT_SEA'
  /** **On ne fonde pas en mer** (règle 5 du 18/09) : le large est un sol que personne ne
   *  possède, donc il passait la seule condition que la fondation posait. */
  | 'NO_FOUNDING_AT_SEA'
  | 'NOT_ENOUGH_LIFT'
  /** **On ne descend d'un avion que dans un de ses aérodromes** (ADR 0025 §4). */
  | 'AIRFIELD_TARGET_REQUIRED'
  | 'OUTPOST_TARGET_ONLY'
  | 'POINT_TARGET_ONLY'
  | 'NOTHING_TO_ATTACK'
  | 'NOT_A_GARRISON_FOR'
  /** **Une réserve se porte**, et seule l'infanterie porte : un raid de blindés sur un objectif
   *  neutre en réduirait la garnison sans rien pouvoir rapporter. C'est le même mot que
   *  l'expédition de pillage refuse (`PlunderRefusal`), parce que c'est la même raison. */
  | 'INFANTRY_REQUIRED'
  | 'NOT_ORDERABLE'
  | 'ONE_UNIT_ONLY'
  | 'OUTSIDE_THEATRE'
  | 'UNIT_TARGET_ONLY'
  | 'RELOADING'
  | 'BUILDING_OCCUPIED'
  | 'INDIRECT_FIRE_ONLY';

export type PlunderAim = {
  readonly kind: 'building';
  readonly buildingId: string;
  readonly key: BuildingKey;
};

export type PlunderRefusal =
  'EMPTY_MOVEMENT' | 'FRIENDLY_TARGET' | 'INFANTRY_REQUIRED' | 'WAREHOUSE_TARGET_ONLY';

export type LootCollectionRefusal = 'NO_CARGO_CAPACITY';

export const isPlunderTarget = (key: BuildingKey): boolean =>
  key === 'warehouse' || key === 'depot' || produces(key);

/** S5a defines the future mission without adding it to `ORDERABLE_TYPES`. */
export function plunderRefusalOf(
  aim: PlunderAim,
  roles: ReadonlyArray<UnitRole>,
  isMine: boolean,
): PlunderRefusal | null {
  if (roles.length === 0) return 'EMPTY_MOVEMENT';
  if (!isPlunderTarget(aim.key)) return 'WAREHOUSE_TARGET_ONLY';
  if (isMine) return 'FRIENDLY_TARGET';
  return roles.includes('infantry') ? null : 'INFANTRY_REQUIRED';
}

/**
 * **Capturer** (décision du 14/10) : le refus de la capture, puis la porte de départ — la même
 * lecture pour la branche de la rose et pour `movements.capture`, rien de grisé.
 */
export function captureOrderRefusalOf(
  aim: MovementAim,
  column: Column,
  isMine: boolean,
): CaptureRefusal | OrderRefusal | null {
  const mode = column.blitz === undefined ? 'mondiale' : 'blitz';
  return captureRefusalOf(column.roles, isMine, mode) ?? closedGate(aim, column);
}

/** Collection is a march with one additional requirement: something selected must carry home. */
export const lootCollectionRefusalOf = (freeCapacity: number): LootCollectionRefusal | null =>
  freeCapacity > 0 ? null : 'NO_CARGO_CAPACITY';

/**
 * Whole public-order gate, shared by the rose and filing after the target has been authorised.
 *
 * **L'allégeance se tranche ici et nulle part ailleurs** : `refusalOf('attack')` la redemanderait
 * à `mine()`, qui tient tout bâtiment visé pour sien — l'hypothèse de la garnison (`aimOf` ne
 * résout que les mâts du joueur), fausse dès qu'un mât adverse devient une cible. Ce qui reste
 * du gabarit d'une marche est la porte de départ, et c'est exactement `closedGate`.
 */
export function plunderOrderRefusalOf(
  aim: PlunderAim,
  column: Column,
  isMine: boolean,
): PlunderRefusal | OrderRefusal | null {
  return plunderRefusalOf(aim, column.roles, isMine) ?? closedGate(aim, column);
}

/** A collection walks like a march and must retain positive capacity after existing cargo. */
export function lootCollectionOrderRefusalOf(
  aim: Extract<MovementAim, { kind: 'point' }>,
  column: Column,
  freeCapacity: number,
): OrderRefusal | LootCollectionRefusal | null {
  return refusalOf('march', aim, column) ?? lootCollectionRefusalOf(freeCapacity);
}

/**
 * **The movement slots, carried by the headquarters** (ADR 0006, reindexed by 0015). One slot
 * outlives the building: a nation always has one movement to make, even with its capital
 * flattened.
 *
 * It lives in the domain so that the count `convex/view.ts` serves and the count `march`
 * refuses on are one reading of one rule. They were two — a placeholder constant capped the
 * server at one movement while the banner promised `1 + hqLevel` — and a screen that promises
 * what the server turns down is exactly the fault ADR 0015 exists to forbid.
 *
 * **A return holds no slot**, and that is not said here: it is a property of the movement, not
 * of the ceiling, so the callers filter their own list before counting it.
 */
export const movementSlots = (hqLevel: number): number => 1 + hqLevel;

/**
 * The three marches a player orders. **The return is not among them**: it is created by the
 * resolution and by nothing else (`convex/movements.ts`), so it has no place in a fan of things
 * one can ask for — see the note in the brief's implementation.
 *
 * **The foundation left too**, and for a better reason than tidiness: one does not walk *at* a
 * place to found there, one founds where one already stands (`foundOutpostHere`). The recall
 * left with the origin that justified it (ADR 0019 §1). Both survive in `MovementType` because
 * columns already sent are still walking, and a document the schema can no longer read is a
 * worse tidiness than a word one no longer offers.
 *
 * **Le leurre a été retiré du jeu le 29/08/2026** (révision d'une décision livrée, fiche 04) :
 * il n'est plus ici, et il n'est plus nulle part ailleurs que dans le validateur Convex, qui
 * garde son littéral le temps d'un wipe. Ce qu'il emportait avec lui : la pile vide n'est plus
 * un ordre, elle redevient un refus franc (`EMPTY_MOVEMENT`, ci-dessous).
 *
 * The agent still waits for the fog surfaces and refuses as `NOT_ORDERABLE` rather than being
 * absent from the union, so the day it lands there is a branch to fill, not one to find.
 */
export const ORDERABLE_TYPES: ReadonlyArray<MovementType> = ['march', 'attack', 'raid'];

export function refusalOf(
  type: MovementType,
  aim: MovementAim,
  column: Column,
): OrderRefusal | null {
  /**
   * **Une pile vide ne part pas.** C'était la porte du leurre — le seul ordre dont le manifeste
   * était vide exprès — et le leurre a été retiré le 29/08/2026 : le refus redevient franc, pour
   * tous les types et sans exception. C'est aussi ce qui referme la porte dérobée que la fiche 04
   * signalait, « à zéro troupe » comme moyen d'obtenir une marche gratuite.
   */
  if (column.roles.length === 0) return 'EMPTY_MOVEMENT';
  switch (type) {
    /**
     * **The plain one, and the only one that refuses nothing for allegiance** (ADR 0019 §7): one
     * walks on one's own ground exactly as on somebody else's, which is what separates it from
     * an attack. Its target is a place — an outpost is a thing one comes to fight, and marching
     * *at* one would be an attack under another word — **or a building of one's own** (64b):
     * the same march, ending as a garrison rather than as a camp, and the table of 70b says
     * which role may end there.
     */
    case 'march':
      if (aim.kind === 'building' && column.blitz?.occupiedBuildingIds.has(aim.buildingId))
        return 'BUILDING_OCCUPIED';
      if (aim.kind === 'building') {
        return barredFrom(column.roles, aim.key) === null
          ? closedGate(aim, column)
          : 'NOT_A_GARRISON_FOR';
      }
      /**
       * **On entre dans son propre point** (décision de Pierre, 16/09), et c'est la même marche
       * que sur un mât : elle finit en garnison au lieu de finir en campagne devant. Un point
       * **adverse** reste ce qu'il était — on y va pour se battre, et marcher *sur* lui serait un
       * assaut sous un autre mot, ce que le raid et l'attaque disent déjà.
       */
      if (aim.kind === 'outpost') {
        return mine(aim, column) ? closedGate(aim, column) : 'POINT_TARGET_ONLY';
      }
      return aim.kind === 'point' ? closedGate(aim, column) : 'POINT_TARGET_ONLY';
    /**
     * **On n'attaque que ce qu'on a relevé** (ADR 0024 §4). Un camp et un avant-poste *sont* le
     * relevé ; un point et une région ne le sont que s'ils portent quelque chose de relevé. Sur
     * du vide la branche n'existe pas, et le serveur dit le même mot après le clic.
     */
    case 'attack':
      if (mine(aim, column)) return 'FRIENDLY_TARGET';
      /** **En Blitz, l'attaque vise une unité, pas un point** (B18). */
      if (column.blitz !== undefined) {
        if (aim.kind !== 'camp' && aim.kind !== 'track') return 'UNIT_TARGET_ONLY';
        /** **L'artillerie ne charge pas** (B20) : elle se tait au contact, et bombarde. */
        if (column.roles.some(firesIndirect)) return 'INDIRECT_FIRE_ONLY';
        if (column.blitz.reloading) return 'RELOADING';
        return closedGate(aim, column);
      }
      if (aim.kind === 'objective' && !column.roles.includes('infantry'))
        return 'INFANTRY_REQUIRED';
      return nothingToAttack(aim) ?? closedGate(aim, column);
    /** A raid marches at an outpost and at nothing else: it comes to put a point out of
     *  service, and a region has no point to disable. */
    case 'raid':
      if (aim.kind !== 'outpost') return 'OUTPOST_TARGET_ONLY';
      return mine(aim, column) ? 'FRIENDLY_TARGET' : closedGate(aim, column);
    default:
      return 'NOT_ORDERABLE';
  }
}

/**
 * **Founding is not a march any more, it is what a column does where it stands** (ADR 0019 §1).
 * The two rules are the ones the `outpost` movement carried, moved rather than rewritten:
 *
 * — **only infantry plants a point**: a tank column founds nothing. It is read on the **whole**
 *   pile now, and that is not a hardening: the pile is what stands on the ground, and the ship
 *   that ferried the founders is at sea, not among them. There is no crossing left to excuse.
 * — **one plants it away from home**: an outpost is what carries a build site beyond one's own
 *   ground (ADR 0004), so ground already carrying a building of mine has nothing to gain.
 *
 * What this **gains**, and it was nobody's plan: the player sees the terrain before choosing the
 * specialisation. He used to name it at departure, hours of marching from a place he had not
 * seen. Do not move that choice back to a departure to "simplify" — the choice being late is the
 * feature.
 */
export function foundingRefusal(
  roles: ReadonlyArray<UnitRole>,
  onMyGround: boolean,
  /**
   * **Le sol sous la pile, lu sur la grille de routage** — et il est arrivé avec le large
   * (règle 5 du 18/09). Tant qu'une colonne embarquée finissait sa route à la côte, « où l'on se
   * tient » était de la terre par construction ; une pile qui reste en mer plantait un point sur
   * l'eau, et elle y passait *parce que* le large n'est le sol de personne. Paramètre obligatoire
   * et sans défaut : un appelant qui l'oublie doit ne pas compiler, pas fonder au large.
   */
  onLand: boolean,
): OrderRefusal | null {
  if (roles.length === 0) return 'EMPTY_MOVEMENT';
  if (roles.some((role) => role !== 'infantry')) return 'INFANTRY_ONLY';
  if (!onLand) return 'NO_FOUNDING_AT_SEA';
  return onMyGround ? 'FRIENDLY_TARGET' : null;
}

/** What this column may ask for on this target — and nothing else ever reaches the fan. */
export function legalMovementTypes(aim: MovementAim, column: Column): ReadonlyArray<MovementType> {
  return ORDERABLE_TYPES.filter((type) => refusalOf(type, aim, column) === null);
}

/**
 * **The first role the building's door is shut to**, and the building — what the refusal names
 * (« un blindé n'entre pas dans une mine »). `null` when the whole column may enter. The table
 * is `GARRISON_KEYS_BY_ROLE`, and this is its only reader on either side of the wire.
 */
export function barredFrom(
  roles: ReadonlyArray<UnitRole>,
  key: BuildingKey,
): { readonly role: UnitRole; readonly building: BuildingKey } | null {
  const role = roles.find((candidate) => !garrisons(candidate, key));
  return role === undefined ? null : { role, building: key };
}

/**
 * What a refusal carries besides its code, so the sentence can name numbers and things: the
 * berths for `NOT_ENOUGH_LIFT`, the role and the building for `NOT_A_GARRISON_FOR`. The server
 * puts them in the error's data and the rose in its motive — one reading, two readers.
 */
export function refusalDetails(aim: MovementAim, column: Column): Record<string, unknown> {
  return {
    ...liftOf(column.roles),
    ...(aim.kind === 'building' ? (barredFrom(column.roles, aim.key) ?? {}) : {}),
  };
}

/**
 * A point is **never mine**, and that is the same refusal to resolve it: saying "those are your
 * own" about a coordinate would mean matching it against my regions, which is the resolution the
 * aim declines to perform. One walks at one's own ground by naming the region, deliberately.
 */
/** Ce qu'un assaut trouverait, tel que le relevé du joueur le donne — jamais l'état du plateau. */
const nothingToAttack = (aim: MovementAim): OrderRefusal | null => {
  switch (aim.kind) {
    /** `objective` est **l'exception nommée** de l'ADR 0024 §4 : un objectif est public par
     *  nature, donc il n'y a pas de relevé à exiger. Voir la note de `MovementAim`. */
    case 'camp':
    case 'outpost':
    case 'objective':
      return null;
    case 'track':
      return 'NOTHING_TO_ATTACK';
    case 'point':
    case 'region':
      return aim.surveyed ? null : 'NOTHING_TO_ATTACK';
    case 'building':
      /** Toujours sien (`aimOf`) : `mine` a déjà répondu avant d'arriver ici. */
      return 'NOTHING_TO_ATTACK';
  }
};

const mine = (aim: MovementAim, column: Column): boolean =>
  aim.kind === 'outpost'
    ? column.myOutpostIds.has(aim.outpostId)
    : aim.kind === 'building'
      ? /** Always: the aim exists only once the server has found the building among the player's
         *  own (`aimOf`), so an attack aimed at one is an attack on oneself by construction. */
        true
      : aim.kind === 'region' && column.myRegionIds.has(aim.regionId);

/**
 * **The door is read at departure, and the pile alone says which door** (ADR 0019 §2). A hull
 * demands a port, a wing an aerodrome, because those are their domains; a land column demands
 * nothing, because it walks. Nothing here consults a route, and that is what makes the fan
 * exact: ADR 0015 wants a refusal to be impossible in the fan, and a rule that needed a route
 * could only answer by guessing until the preview came back.
 *
 * The rule that used to make an infantry column owe a port as soon as its route touched the
 * water is gone — crossing is no longer something a trip does to a pile, it is something a
 * transport does for one, and `overloaded` below is where that is paid.
 *
 * `PROJECTION_BY_DOMAIN` answers which building goes with which domain; it is the table that
 * already gates recruitment, and there is no second one.
 */
const closedGate = (aim: MovementAim, column: Column): OrderRefusal | null => {
  if (column.blitz !== undefined) {
    /** **Une unité part seule** (B15, révisé le 15/10) : un transport part avec ce qu'il porte,
     *  ou qu'il prend au départ ; et nulle part hors de la boîte du théâtre (B1). */
    if (
      unitsOf(boardedAll(column.roles.map((role, rank) => ({ id: String(rank), role })))).length > 1
    )
      return 'ONE_UNIT_ONLY';
    const at = pointOfAim(aim);
    if (at !== null && !withinTheatre(column.blitz.theatre, at)) return 'OUTSIDE_THEATRE';
  }
  const domains = new Set(column.roles.map((role) => DOMAIN_BY_ROLE[role]));
  /** **En Blitz l'avion reste en l'air** (décision de Pierre, 15/10) : il repart d'où il est.
   *  Des passagers, eux, ne montent à bord que dans un aérodrome (ADR 0025). */
  if (
    domains.has('air') &&
    (column.blitz === undefined || domains.has('land')) &&
    !column.departureBuildings.has(PROJECTION_BY_DOMAIN.air)
  ) {
    return 'NO_AIRFIELD_AT_DEPARTURE';
  }
  if (domains.has('sea') && embarking(column, domains)) {
    if (!column.departureBuildings.has(PROJECTION_BY_DOMAIN.sea)) return 'NO_PORT_AT_DEPARTURE';
  }
  /**
   * **Le large ne se quitte qu'à bord** (règle 3 du 18/09). Il se lit **après** l'aérodrome,
   * parce qu'une aile à flot est une aile à une station et que son champ est ce qui lui manque ;
   * et avant tout le reste, parce que c'est la seule chose qu'aucune carte ne montre — le joueur
   * voit sa pile sur l'eau, il ne voit pas qu'elle n'a plus rien qui flotte.
   */
  if (column.afloat && !domains.has('sea')) return 'NO_HULL_AT_SEA';
  return overloaded(column) ?? destinationRefusal(aim, column);
};

/**
 * **A quay is what one takes to the water from, not what one sails from.** A fleet posted at sea
 * has no ground under it and never will — reading the port gate on it left every hull that
 * reached the open sea stranded there for the rest of the season, an address the game could
 * write and no order could ever leave.
 *
 * **The combined column is exempted too, and it is the same reason rather than a softening**:
 * the port was paid at the first departure (ADR 0019 §2), when the boots actually left the
 * ground for the water. Asking a second quay of a hull that never touched one again turned a
 * transport moored offshore into a **mouvement fantôme** — troops the game holds, places, feeds,
 * and cannot move. The passage of ADR 0013 stays bought where it is bought, at the embarkation,
 * and `overloaded` still counts the berths on every order.
 *
 * The air keeps its own clause because it is the one domain nothing is ever posted in: a wing
 * standing on water is a wing at a station, and its aerodrome is read as it always was.
 *
 * **La plage rejoint le large** (décision 72a, 04/09) : depuis qu'un débarquement pose la colonne
 * sur un point de côte, ce point est un départ comme un autre — elle y est venue par la mer.
 * Sans ce second cas, la révision du 27/08 aurait rendu par la côte le *mouvement fantôme*
 * qu'elle chassait du large. L'intérieur des terres, lui, ne fabrique toujours aucun quai.
 */
const embarking = (column: Column, domains: ReadonlySet<UnitDomain>): boolean =>
  (!column.afloat && !column.coastal) || domains.has('air');

/**
 * **Une colonne embarquée ne débarque que sur une côte** (décision 72a, 04/09). Le cargo qui
 * suivait ses passagers sur la jambe terrestre était l'aveu que le débarquement n'existait pas :
 * la mer n'était qu'un morceau du chemin et la plage se choisissait toute seule. Le refus rend
 * l'opération à ses deux temps — poser la colonne au bord de l'eau, puis marcher — et il se lit
 * **sans route**, comme les portes de domaine au-dessus (ADR 0015) : c'est tout le travail du
 * `coastal` que la cible porte.
 *
 * Un port ami passe parce qu'il *est* la côte ; un point et un avant-poste passent là où la
 * grille de routage trouve de l'eau à côté. Une région ne passe jamais : c'est un centroïde, et
 * un centroïde n'est le bord de rien.
 *
 * > **Révision du 18/09 — « un cargo peut rester en mer avec des unités dedans »** (décision de
 * > Pierre, ADR 0019 §2). Le **large** rejoint la côte parmi les destinations d'une colonne
 * > embarquée : elle y arrive, elle y reste, passagers à bord. Ce qui reste refusé est
 * > l'intérieur des terres, et pour la raison d'origine — la jambe terrestre après la mer
 * > n'existe toujours pas (ADR 0012, même révision). Le débarquement, lui, ne bouge pas d'un
 * > mot : il se vise, depuis la mer comme depuis la terre.
 * >
 * > La règle des deux modes de mer devient donc la même à la phrase près, et c'est voulu : un
 * > navire qui vise l'intérieur lit « un navire doit viser la mer, une côte ou un port », une
 * > colonne embarquée lit sa plage. Le sol refusé est le même, ce qu'on y attendait ne l'est pas.
 */
const destinationRefusal = (aim: MovementAim, column: Column): OrderRefusal | null => {
  const mode = routeModeOf(column.roles);
  if (
    mode === 'air' &&
    column.roles.some((role) => DOMAIN_BY_ROLE[role] === 'land') &&
    !(aim.kind === 'building' && aim.key === PROJECTION_BY_DOMAIN.air)
  )
    return 'AIRFIELD_TARGET_REQUIRED';
  if (mode === 'land' && atSea(aim)) return 'LAND_TARGET_REQUIRED';
  if (mode === 'naval' && !atSea(aim) && !shore(aim)) return 'SEA_TARGET_REQUIRED';
  return mode === 'combined' && !atSea(aim) && !shore(aim) ? 'LANDING_NEEDS_A_COAST' : null;
};

/**
 * **Le large, et rien qui s'en approche** : une visée que la grille de routage tient pour de
 * l'eau. Un point et un **camp relevé** peuvent l'être — une région est un centroïde, un
 * avant-poste et un mât sont sur la terre par construction — et c'est ce qui laisse les deux
 * modes de mer le lire du même mot.
 */
const atSea = (aim: MovementAim): boolean =>
  (aim.kind === 'point' || aim.kind === 'camp' || aim.kind === 'track') && !aim.onLand;

/** Ce qu'une visée porte de coordonnées ; un mât, une région et un point d'appui n'en portent pas. */
const pointOfAim = (aim: MovementAim): readonly [number, number] | null =>
  'lon' in aim ? [aim.lon, aim.lat] : null;

const shore = (aim: MovementAim): boolean => {
  switch (aim.kind) {
    case 'point':
    case 'camp':
    case 'track':
    case 'outpost':
      return aim.coastal;
    case 'building':
      return aim.key === PROJECTION_BY_DOMAIN.sea;
    default:
      return false;
  }
};

/**
 * **Crossing a medium that is not yours is an investment, not a surcharge** (design sheet 09):
 * a land troop takes to the water aboard a hull and to the sky aboard a wing, and there are only
 * so many places aboard. A fleet one has to build, protect, and can lose is what makes the
 * distant action structurally expensive — the lever ADR 0013 was kept for.
 *
 * It is only asked of a pile that actually leaves its own medium: a column of pure land walks,
 * and a fleet with no passenger owes nothing. An escort is not a ferry, so a column of infantry
 * and escorts is refused here — it is at sea with nothing to ride.
 */
export function liftOf(roles: ReadonlyArray<UnitRole>): {
  readonly needed: number;
  readonly offered: number;
} {
  return {
    needed: roles.reduce((sum, role) => sum + (LIFT_COST[role] ?? 0), 0),
    offered: roles.reduce((sum, role) => sum + (LIFT_CAPACITY[role] ?? 0), 0),
  };
}

const overloaded = (column: Column): OrderRefusal | null => {
  const domains = new Set(column.roles.map((role) => DOMAIN_BY_ROLE[role]));
  if (!domains.has('land') || (!domains.has('sea') && !domains.has('air'))) return null;
  return strandedIn(column.roles) ? 'NOT_ENOUGH_LIFT' : null;
};

/**
 * **A passenger that no single transport seats** (ADR 0025 §2) — read off the very assignment
 * that draws the pile and decides who drowns, never off a sum: two air transports offer four
 * places and still no seat for a three-place armour.
 */
export function strandedIn(roles: ReadonlyArray<UnitRole>): boolean {
  const pile = roles.map((role, rank) => ({ id: String(rank), role }));
  return stackRows(pile, new Set(pile.map((troop) => troop.id))).some(
    (row) => row.carrier === null && (LIFT_COST[row.troop.role] ?? 0) > 0,
  );
}

export type BoardingRefusal =
  | 'EMPTY_MOVEMENT'
  | 'LAND_TROOPS_ONLY'
  | 'NO_TRANSPORT_HERE'
  | 'AIRFIELD_BOARDING_ONLY'
  | 'TRUCK_SEATS_INFANTRY'
  | 'NOT_ENOUGH_LIFT';

/** Un embarquement tel que la rose et le serveur le lisent, chacun de son côté : ces troupes,
 *  dans ce transport, au point où il se tient. */
export type Boarding<T extends Seated = Seated> = {
  readonly riders: ReadonlyArray<T>;
  readonly carrier: T;
  /** Tout ce qui se tient au point du transport, les passagers déjà à bord et la colonne. */
  readonly pile: ReadonlyArray<T>;
  readonly atAirfield: boolean;
};

const faresOf = ({ riders, carrier, pile }: Boarding) =>
  riders.map((rider) => fareOf(carrier.role, rider, pile));

/**
 * **Embarquer, la règle entière** (ADR 0025, révisée le 15/10) — lue par la rose avant le geste
 * et par le serveur après lui. Un passager emporte sa propre cargaison : un camion chargé pèse
 * ses fusiliers.
 */
export function boardingRefusalOf(boarding: Boarding): BoardingRefusal | null {
  const { riders, carrier, pile, atAirfield } = boarding;
  if (riders.length === 0) return 'EMPTY_MOVEMENT';
  if (riders.some((rider) => DOMAIN_BY_ROLE[rider.role] !== 'land')) return 'LAND_TROOPS_ONLY';
  if (fareOf(carrier.role, { id: '', role: 'infantry' }, pile) === null) return 'NO_TRANSPORT_HERE';
  if (carrier.role === 'airTransport' && !atAirfield) return 'AIRFIELD_BOARDING_ONLY';
  const fares = faresOf(boarding);
  if (fares.some((fare) => fare === null)) return 'TRUCK_SEATS_INFANTRY';
  return boardingRefusalDetails(boarding).needed > seatsLeft(carrier, pile)
    ? 'NOT_ENOUGH_LIFT'
    : null;
}

export type DisembarkRefusal = 'NOT_ABOARD' | 'DISEMBARK_AT_SEA' | 'AIRFIELD_TARGET_REQUIRED';

/** **On débarque où l'on est** (15/10) : à terre ou à quai, jamais au large — il n'y a rien où
 *  poser le pied —, et d'un avion dans un de ses aérodromes seulement (ADR 0025 §4). */
export function disembarkRefusalOf({
  carrier,
  afloat,
  atAirfield,
}: {
  readonly carrier: UnitRole | null;
  readonly afloat: boolean;
  readonly atAirfield: boolean;
}): DisembarkRefusal | null {
  if (carrier === null) return 'NOT_ABOARD';
  if (afloat) return 'DISEMBARK_AT_SEA';
  return carrier === 'airTransport' && !atAirfield ? 'AIRFIELD_TARGET_REQUIRED' : null;
}

/** Ce que la phrase du refus nomme, et ce que le geste montre : les places demandées, et
 *  celles qui restent. */
export const boardingRefusalDetails = (boarding: Boarding) => ({
  needed: faresOf(boarding).reduce<number>((sum, fare) => sum + (fare ?? 0), 0),
  offered: seatsLeft(boarding.carrier, boarding.pile),
});

/**
 * **The terrain is read off the domains present, and the mix is the point.** A pile of pure land
 * walks and only walks; a pile of pure hulls sails; a pile that carries both is the one ADR 0012
 * wrote the combined trip for — march, embark, cross, land. That case used to be described as
 * unreachable; it is now **the only way to another continent**, which is exactly what makes a
 * transport worth building.
 *
 * A land column with no ship therefore routes `'land'`, and where the land leads nowhere it is
 * refused by `NO_LAND_ROUTE` — a name that at last says precisely what happened.
 *
 * A wing crosses what a hull and a boot cannot, so any air aboard flies the whole column. What
 * the water costs against the road is settled by `COST_BY_MEDIUM` and `TRANSFER_COST`, which is
 * why a short hop still prefers the road with nobody forbidding the sea.
 */
/**
 * **A land column whose infantry fits in its trucks rolls, and that is the whole effect of the
 * land transport** (note « le transport terrestre et l'allure », validated 19/08). The armour and
 * the trucks are motorized by nature — a tank column with no truck rolls — so **only the infantry
 * asks for a seat**, and "projecting infantry further" is exactly what that says.
 *
 * The pace is the **whole column's**, set on its slowest element, the same way the route is the
 * whole pile's: one infantry too many puts everybody at a walk. No individual pace, no column cut
 * in two — and no stored relation either, since there is nothing to decide.
 *
 * A column with no infantry is motorized on 0 ≤ 0, which is the tank column above and not an
 * accident of the arithmetic.
 */
export function motorized(roles: ReadonlyArray<UnitRole>): boolean {
  const seats = roles.filter((role) => role === 'landTransport').length * LAND_SEATS_PER_TRANSPORT;
  const walkers = roles
    .filter((role) => role === 'infantry')
    .reduce((sum) => sum + (LIFT_COST.infantry ?? 0), 0);
  return walkers <= seats;
}

/**
 * What a unit of ground costs this pile — the second reading of the composition, next to the
 * first. It sits here rather than in `routing.ts` for the reason `routeModeOf` does: the grid
 * knows how to weigh an edge, it does not know what a column is made of.
 */
export const landCostOf = (roles: ReadonlyArray<UnitRole>): number =>
  motorized(roles) ? COST_BY_MEDIUM.landMotorized : COST_BY_MEDIUM.land;

export function routeModeOf(roles: ReadonlyArray<UnitRole>): RouteMode {
  const domains = new Set(roles.map((role) => DOMAIN_BY_ROLE[role]));
  if (domains.has('air')) return 'air';
  if (!domains.has('sea')) return 'land';
  return domains.has('land') ? 'combined' : 'naval';
}
