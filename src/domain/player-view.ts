import type { LonLat } from './geo';
import type {
  BuildCostKey,
  BuildingKey,
  DepositKey,
  Detector,
  MovementType,
  ResourceKey,
  Specialization,
  UnitRole,
  UnitTier,
} from './ids';
import type { ChainState } from './economy';
import type { ComputedRoute } from './routing';
import type { ResourceAmounts } from './loot';

export type { ChainState, MovementType, UnitRole };

export type Stack = Partial<Record<UnitRole, number>>;

export type CargoView = {
  readonly loot: ResourceAmounts;
  readonly carried: number;
  readonly capacity: number;
  readonly free: number;
};

export type OwnMovementMission =
  | {
      readonly kind: 'plunder';
      readonly phase: 'outbound' | 'presence';
      readonly buildingId: string;
      readonly presenceEndsAt: number | null;
    }
  | { readonly kind: 'collection'; readonly sightingId: string }
  | { readonly kind: 'cargoReturn'; readonly regionId: string }
  | null;

/**
 * What intelligence has pierced of an enemy movement. A nested union rather than a boolean
 * with optional fields: until the breakthrough happens, the card structurally has neither a
 * type nor a composition to leak.
 */
export type MovementIdentification =
  | { readonly pierced: false }
  | { readonly pierced: true; readonly type: MovementType; readonly stack: Stack };

/**
 * The four display states of an arc. The discriminated union is the fog of war's guardrail:
 * an enemy arc structurally has neither `type` nor `stack`, so they cannot be displayed by
 * accident.
 *
 * `route` is present in all four states, enemy included: the medium — land, sea or air — of a
 * detected movement is visible (design sheet 04). The thread would betray it anyway. The type
 * and the composition stay out of reach.
 * `from` and `to` remain alongside: on a movement of mine they are the declared endpoints, not the
 * polyline followed. **On an enemy arc they are the two ends of the stretch that was watched** —
 * the destination is not served at all (design sheet 04, decision 4a of 13/09/2026), and the two
 * states below carry nothing that could be mistaken for one.
 */
export type ArcView =
  | {
      readonly state: 'mine';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      // `…Country` names the `world.json` country, in English: it is the key that selects the
      // country on the map. `…Label` is what gets printed, in French. Both exist because
      // Natural Earth has no translations while the screen is French; mixing them up would
      // put "United Kingdom" back on a card.
      readonly originCountry: string;
      readonly destinationCountry: string;
      readonly originLabel: string;
      readonly destinationLabel: string;
      readonly type: MovementType;
      readonly stack: Stack;
      /**
       * The troops this movement carries. They keep their address — a movement never takes it
       * from them — so without this list the widget would offer a marching column to a second
       * order, from the very building it left.
       */
      readonly troopIds: ReadonlyArray<string>;
      /** Exact cargo and mission data exist only on the owner's branch of the arc union. */
      readonly cargo?: CargoView;
      readonly mission?: OwnMovementMission;
      readonly minutesLeft: number;
      /**
       * An arrival falling inside the target's rest window stalls the movement at the
       * border: it only resolves when the window ends. `null` when resolution happens on
       * arrival — see `windowExit`.
       */
      readonly borderWait: { readonly resolutionInMinutes: number } | null;
      readonly progress: number;
    }
  | {
      readonly state: 'enemyDetected';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      readonly suspectedNation: string | null;
      /** **What of mine caught it**, and the region of the station when it was one. It says
       *  nothing about the column — it is a fact about my own board — and it is what turns a
       *  sighting into a reason to have built the thing that made it. */
      readonly detector: Detector;
      readonly detectorRegion: string | null;
      /** Where the column was pointing **as it left the radius**, which is what a window's close
       *  reveals: the far end of the thread served is not a destination. */
      readonly headingDegrees: number;
      /**
       * The heading, prolonged over what the column has left to walk, falls on my territory or
       * one of my outposts: the card turns critical. An **estimate** since decision 4a — no
       * destination is served — and the card already says « estimé ».
       */
      readonly headingAtMe: boolean;
      readonly identification: MovementIdentification;
      /** When the arrival is due. It times the label's countdown and nothing else: the arrival
       *  lies past the end of the thread drawn. */
      readonly estimatedMinutesLeft: number | null;
      /** How long the watch still runs. **It is what paces the pawn**: the pion must reach the
       *  end of the watched stretch when the window closes, not when the column lands. */
      readonly watchMinutesLeft: number;
      readonly progress: number;
    }
  | {
      readonly state: 'lastKnown';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      readonly detector: Detector;
      readonly detectorRegion: string | null;
      readonly headingDegrees: number;
      readonly seenMinutesAgo: number;
      readonly progress: number;
    }
  | {
      readonly state: 'seaControl';
      readonly id: string;
      readonly from: LonLat;
      readonly to: LonLat;
      readonly route: ComputedRoute;
      readonly progress: number;
    };

/**
 * **Un camp adverse relevé** (ADR 0024 §1). Le pendant immobile d'un arc adverse, et la même
 * garantie par la forme : il n'y a **structurellement** ni composition, ni effectif, ni nation à
 * afficher par distraction. Ce qu'il porte est ce qu'un guetteur peut honnêtement rapporter — un
 * endroit, un milieu, deux dates — plus le détecteur, qui est un fait du plateau de l'observateur.
 *
 * `lastKnown` est le camp perdu de vue : `seenMinutesAgo` le date alors, et il vaut `null` tant
 * qu'une portée le couvre.
 */
export type CampView = {
  readonly id: string;
  readonly point: LonLat;
  readonly medium: 'land' | 'sea' | 'air';
  readonly since: number;
  readonly seenMinutesAgo: number | null;
  readonly detector: Detector;
  readonly detectorRegion: string | null;
  readonly lastKnown: boolean;
};

/**
 * **Where a troop stands, and the map is one of the answers** (ADR 0019 §1): a building, the
 * outpost a column founded, a plain point of the map, or nothing standing at all. A discriminated
 * union rather than an id and a kind beside it — a point carries coordinates no id has, `home`
 * carries nothing, and the compiler is what keeps a reader from asking one for the other.
 *
 * `country` is the host of the point as every rule keys it, an `adm0_a3`, empty on the open sea
 * (`hostAtPoint`). It travels with the address because the screen names the place a column was
 * left in — "en campagne · Arabie saoudite" — and the client holds no geometry to find it.
 */
export type TroopStation =
  | { readonly kind: 'building'; readonly buildingId: string }
  | { readonly kind: 'outpost'; readonly outpostId: string }
  | {
      readonly kind: 'point';
      readonly lonLat: LonLat;
      /** Whose ground, read on the polygon — for the sentence (« postée en Arabie »), never for
       *  a rule: the two readings below answer the rules, on the routing grid. */
      readonly country: string;
      /**
       * **La pile est-elle sur l'eau ?** Lu sur la grille de routage, la même cellule que
       * `onLand` à la visée — et non déduit de `country === ''` : le polygone et la grille se
       * contredisent sur toute bande côtière plus étroite qu'une demi-cellule, et une coque posée
       * là était à flot pour la visée et à terre pour le départ, sans quai pour la saison.
       */
      readonly afloat: boolean;
      /**
       * **Le sol sous elle est-il une plage ?** Servi par le serveur comme `country` l'est, et
       * pour la même raison : le client ne tient aucune géométrie, et une seconde lecture de la
       * côte serait une seconde réponse. C'est ce qui laisse une coque débarquée repartir sans
       * quai (ADR 0019 §2, révision du 04/09).
       */
      readonly coastal: boolean;
    }
  | { readonly kind: 'home' };

/**
 * One troop, as its owner sees it (ADR 0014). Its hit points **are** its strength, read
 * against the nominal it was formed at: "32 / 50 soldats" is the whole health bar.
 *
 * `stationedAt` is its address, `home` meaning the troop whose building is gone. No enemy troop
 * ever travels in this list.
 */
export type TroopView = {
  readonly id: string;
  readonly role: UnitRole;
  readonly tier: UnitTier;
  readonly strength: number;
  readonly nominalStrength: number;
  readonly stationedAt: TroopStation;
  /**
   * **Whether it is fed at the plain rate** (ADR 0019 §4): on national soil, or inside the reach
   * of one of its owner's standing outposts. `false` is a troop eating
   * `UPKEEP_UNSUPPLIED_MULTIPLIER` times the flat rate, and it travels per troop because that is
   * where the player looks — a surcharge only visible on an accounting screen is the invisible
   * punishment D3 refused for attrition.
   */
  readonly supplied: boolean;
};

export type OutpostView = {
  readonly id: string;
  readonly hostCountry: string;
  readonly lonLat: LonLat;
  /**
   * **La région où il se tient**, qu'il tient, couvre et atteint quelle que soit sa taille
   * (précision de l'ADR 0020 du 04/09). Servie par le serveur : le client n'a ni polygone ni
   * index des régions, et les points plantés avant le champ se relisent par la géographie
   * — `null` est un point que même ce repli ne place pas.
   */
  readonly regionId: string | null;
  readonly specialization: Specialization;
  readonly level: number;
  readonly garrison: number;
  /** A raid puts a point out of service for a while; `null` is a point that is standing. It is
   *  **deactivated**, never taken — nothing here says who put it out. */
  readonly disabledMinutesLeft: number | null;
  readonly isMine: boolean;
  /**
   * **Le métier du point est-il scellé ?** La fondation part du clic droit et pose « relais » —
   * le serveur exige un mot à l'insertion — et le panneau de l'avant-poste permet d'en changer
   * tant qu'aucune passe ne l'a lu (`specializationServed`, `convex/movement/forces.ts`). Servi
   * plutôt que redérivé : l'écran qui montre les deux boutons et le serveur qui les refuse
   * lisent la même réponse.
   */
  readonly specializationLocked: boolean;
  /**
   * **Ce que monter ce point coûterait**, servi comme celui d'un bâtiment (`Building`) et pour
   * la même raison : les nombres d'équilibrage ont une seule maison, `convex/constants.ts`. Un
   * point au niveau maximal n'a pas de niveau suivant — `atMaxLevel` le dit plutôt qu'un prix
   * qu'aucun geste ne paiera (précision du 15/09).
   */
  readonly nextLevelCost: Cost;
  readonly nextLevelMinutes: number;
  readonly atMaxLevel: boolean;
};

/**
 * **What the board serves of a season's paperwork, and it is a screen bound** — the reason it
 * lives here and not in `convex/constants.ts` is the telegraph's (`domain/telegraph.ts`): nothing
 * in the game is decided by these two, no simulation will ever measure them, and the day they
 * move it is because a window looked wrong.
 *
 * They are also the only thing standing between the view and Convex's read ceiling. Accounts and
 * dispatches are the two rows a season writes without limit — three hundred passes and a week of
 * notices read whole is megabytes, on **every** load of the board — while the journal shows the
 * last page of them and the manchette shows one. A window served is not a window paginated: there
 * is no scroll backwards, by design (ADR 0001 — a season is disposable, its archive is nobody's
 * need).
 */
export const REPORTS_SERVED = 50;

/** Deeper than the accounts because it carries every other kind of line — a delivery, a landing,
 *  a sighting — and it is the same depth the telegraph serves. */
export const NOTICES_SERVED = 200;

/**
 * One engagement as its own participant reads it afterwards: what each side brought, what each
 * side left on the ground. Never the enemy's composition by role — the fog does not lift because
 * shots were exchanged (ADR 0005); a head count and a butcher's bill is what a commander gets.
 */
export type CombatReport = {
  readonly id: string;
  readonly at: number;
  readonly cause: 'arrival' | 'interception';
  readonly side: 'attacker' | 'defender';
  readonly won: boolean;
  readonly hostCountry: string;
  readonly outpostDisabled: boolean;
  readonly mine: CombatTally;
  readonly theirs: CombatTally;
  /**
   * Set when this pass is the one that put the defender under the bar of the **test victory**
   * (`victory.ts`) — scaffolding, and named on both sides on purpose: the progress of the
   * simplified Domination is public, which is where it departs from design sheet 05.
   */
  readonly reduced: { readonly by: string; readonly whom: string } | null;
};

/**
 * A nation that entered a season already running (`convex/seasons.ts`, `enterWar`). Public to
 * everybody, and deliberately: the journal is the only place that says a belligerent has come
 * in, and his flag is on the map from that hour anyway.
 */
export type WarEntry = {
  readonly nickname: string;
  readonly nation: string;
  readonly at: number;
};

export type CombatTally = {
  readonly troops: number;
  /** In men and machines, never in percent (ADR 0014). */
  readonly lost: number;
  readonly routed: number;
  readonly destroyed: number;
};

/**
 * What the army costs to hold, beside what it is made of. The food rate served in `resources` is
 * already **net** of it — a player producing 40 and eating 45 reads −5, never 40 — so this is the
 * breakdown of a number he already sees, never a second one to reconcile.
 */
export type UpkeepView = {
  readonly troops: number;
  /** How many of them stand outside every anchor of their own, at the raised rate. */
  readonly unsupplied: number;
  readonly foodPerHour: number;
  /** What the empire costs an hour, beside what the army costs (ADR 0020 §10). It is the brake
   *  on expansion, and the player has to be able to read it as its own line. */
  readonly outposts: number;
  readonly outpostFoodPerHour: number;
  readonly outpostCoalPerHour: number;
};

/**
 * **Which site a placement hangs from** — `null` in `outpostId` is national soil, an id is an
 * outpost (ADR 0020 §10). The two forms are exclusive in a single field, so nothing here needs
 * a tag: a site is an outpost or it is home, and there is no third answer.
 */
export type SiteRef = { readonly outpostId: string | null };

export const sameSite = (one: SiteRef, other: SiteRef): boolean =>
  one.outpostId === other.outpostId;

/** What one site carries and what stands on it. `taken` is what **stands**: the prepaid queue
 *  is added by whoever reads it, so the two cannot be served twice and disagree. */
type SiteSlots = {
  readonly site: SiteRef;
  readonly taken: number;
  readonly total: number;
};

export type Resource = {
  readonly stock: number;
  readonly ratePerHour: number;
  readonly cap: number;
};

/** What a building costs, in materials — never one number since supply disappeared. */
export type Cost = Readonly<Partial<Record<ResourceKey, number>>>;

export type Building = {
  /** The row's own identifier — what a deep link carries, since a key names a family. */
  readonly id: string;
  readonly key: BuildingKey;
  readonly name: string;
  readonly regionId: string;
  /**
   * **Its own ground, when its region's is not where it stands** — the port and nothing else
   * (ADR 0013, revision of 04/09): the coast point the player picked, served by the server and
   * never recomputed here. `null` hangs the mast on the region, exactly as before.
   */
  readonly point: LonLat | null;
  readonly level: number;
  readonly nextLevelCost: Cost;
  readonly nextLevelMinutes: number;
  readonly cappedByHq: boolean;
};

/**
 * A conversion chain as the industry window reads it, standing or not. `state` is served, never
 * re-derived here: it is the settlement's own arbitration (`settleStocks`), and a second guess
 * made from the stocks would contradict the numbers it sits next to.
 */
export type ChainView = {
  readonly by: BuildingKey;
  readonly output: ResourceKey;
  readonly inputs: ReadonlyArray<{ readonly resource: ResourceKey; readonly quantity: number }>;
  /** **What actually comes out**, per hour. A chain out of matter reads zero here and keeps
   *  its `nominalPerHour` beside it — printing the nominal alone is a lie the player acts on. */
  readonly perHour: number;
  readonly nominalPerHour: number;
  /** Summed over the sites, like the rate: zero means nobody built it, and the line reads off. */
  readonly level: number;
  readonly state: ChainState;
  readonly missing: ResourceKey | null;
  /** Runs on a lot rather than on its own, because its input is spent elsewhere too
   *  (`COMMANDED_CHAINS`). Nothing else about the line changes. */
  readonly commanded: boolean;
  /** The standing lot — `null` when none was ever placed. `produced === ordered` is a lot
   *  delivered, kept so the surface can say so rather than falling silent. */
  readonly order: { readonly ordered: number; readonly produced: number } | null;
  /** The largest lot the input reserve allows right now, in units of output. */
  readonly maxOrder: number;
};

/** One exploitation and its yield. `deposit` is what the region holds — a building over a
 *  deposit it cannot work reads with a rate of zero, never as an absent line. */
export type ExtractionSiteView = {
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly level: number;
  readonly deposit: DepositKey | null;
  readonly perHour: number;
  /** Sa région porte-t-elle encore sa couleur (ADR 0020 §6) — coupé, il rend zéro, et c'est un
   *  état, pas une panne : rien ne se répare sur le site, tout se reprend sur la carte. */
  readonly linked: boolean;
};

/**
 * What a first level of a building costs and takes, per key: the construction panel's price
 * list. `unlockedAtHqLevel` travels with the price because it decides the same thing — whether
 * a line exists at all — and a client-side copy of the tier table is how the panel and the
 * server stop refusing the same things.
 */
export type BuildSpec = {
  readonly cost: Cost;
  readonly minutes: number;
  readonly unlockedAtHqLevel: number;
};

/**
 * A region the player may build on: his own country, plus wherever he has already built. What
 * lies under it and what he has put on it. Only his own — a region held by anyone else carries
 * no deposit and no building here, structurally, which is the same guard as the arc union.
 */
export type RegionView = {
  readonly id: string;
  readonly name: string;
  readonly deposit: DepositKey | null;
  readonly coastal: boolean;
  /** Where the region stands, as every rule of the game measures it (`regionFacts`) — never the
   *  centroid the map draws its polygon around, which is a different point. */
  readonly point: LonLat;
  readonly buildings: ReadonlyArray<{ readonly key: BuildingKey; readonly level: number }>;
  /** Whose placements a building here would spend — `null` when no living site of the player
   *  reaches it any more, which is a region nothing can go up on. */
  readonly site: SiteRef | null;
  /**
   * **Porte-t-elle la couleur de son propriétaire** (ADR 0020 §6). Ce qui y produit ne produit
   * que si oui : le sol national l'est toujours, une région d'avant-poste l'est tant que le
   * point la tient, et un point hors service décolore (§7). Servi par région parce que c'est la
   * région qui est tenue — deux bâtiments du même sol ne peuvent pas répondre différemment.
   */
  readonly linked: boolean;
};

export type OpponentBar =
  | { readonly state: 'anonymous'; readonly progress: number }
  | { readonly state: 'attributed'; readonly progress: number }
  | { readonly state: 'exposed'; readonly progress: number; readonly frozenUntil: string };

export type Opponent = {
  readonly nation: string;
  readonly ink: string;
  readonly power: string;
  readonly bar: OpponentBar;
  readonly restWindow: string;
  readonly lastIntel: string;
};

/**
 * What the next headquarters level would carry **at home** — `null` at the top of the ladder. It
 * is what turns "plus un emplacement libre" from a wall into a plan, and it is **served** so the
 * sentence and the refusal that raised it read the same `homeSlots`.
 */
export type HomeSlotRelief = { readonly nextHqLevel: number; readonly nextSlots: number } | null;

export type RunningWork = {
  readonly id: string;
  readonly name: string;
  readonly key: BuildCostKey;
  /** **Le point que cette ligne monte**, `null` pour un chantier de bâtiment (précision du
   *  15/09). Il est ce qui distingue les deux sortes d'entrées d'une seule file. */
  readonly outpostId: string | null;
  readonly regionId: string;
  readonly regionName: string;
  /** The quay a port was ordered on — the crane stands there from the queue, not from the
   *  moment it is finished. `null` for everything that hangs from its region. */
  readonly point: LonLat | null;
  readonly minutesLeft: number;
};

export type QueuedWork = {
  readonly id: string;
  readonly name: string;
  readonly key: BuildCostKey;
  readonly outpostId: string | null;
  readonly regionId: string;
  readonly regionName: string;
  readonly level: number;
};

export type DispatchSeverity = 'critical' | 'notable' | 'routine';

/**
 * **La sorte d'une dépêche — ce que la marge du journal tamponne.** La gravité dit *combien fort*
 * on le crie ; la sorte dit *de quoi il s'agit*, et les deux ne se déduisent pas l'une de l'autre :
 * un assaut mené et un assaut subi partagent une gravité et ne sont pas la même nouvelle.
 *
 * Elle est **portée par la dépêche** plutôt que redevinée depuis son texte : une phrase française
 * est ce qu'on lit, jamais ce sur quoi on branche une règle d'affichage (ADR 0016).
 */
export type DispatchKind =
  | 'seasonConcluded'
  | 'reduction'
  | 'warEntry'
  /** L'assaut qu'on a mené, et celui qu'on a subi : une passe, deux nouvelles. */
  | 'assault'
  | 'attacked'
  | 'construction'
  | 'delivery'
  | 'column'
  | 'stalled'
  | 'outpostFounded'
  | 'outpostRaised'
  | 'outpostDisabled'
  | 'sighting'
  /** Un camp relevé : la même encre que le fil relevé, et un mot distinct pour que le tampon de
   *  la marge dise lequel des deux on lit. */
  | 'campSighted'
  | 'firedDry'
  | 'foundNothing'
  | 'surrender'
  | 'command'
  /** L'édition du classement : le seul rendez-vous que tout le monde reçoit à la même heure. */
  | 'edition'
  /** **La production reliée qui mord, et qui lâche** (ADR 0020 §6). Une alarme et son
   *  contraire : la coupure exige une décision maintenant, le rétablissement se lit à son heure. */
  | 'productionCut'
  | 'productionRestored'
  | 'lootTaken'
  | 'sitePlundered'
  | 'siteSabotaged'
  | 'lootLost'
  | 'lootRecovered'
  | 'lootCollected'
  | 'lootDelivered';

/**
 * **A line the journal owes the player and no engagement accounts for.** Each kind is written by
 * the job that did the thing (`convex/validators.ts`, `NOTICE`), never derived on reading: the
 * journal answers *what changed while I was away*, and anything recomputed from the board would
 * answer *what is true now* — a different question, and not the one an asynchronous game lives
 * on.
 *
 * A discriminated union rather than optional fields, all the way from the schema: a sighting has
 * structurally no building and a delivery no heading, so the fog cannot leak through a field
 * somebody forgot to leave empty (convention §8).
 */
export type Notice =
  | {
      readonly kind: 'constructionCancelled';
      readonly at: number;
      readonly building: BuildingKey;
      readonly regionName: string;
    }
  | {
      readonly kind: 'constructionFinished';
      readonly at: number;
      readonly building: BuildingKey;
      readonly regionName: string;
      readonly level: number;
    }
  | {
      readonly kind: 'recruitmentDelivered';
      readonly at: number;
      readonly role: UnitRole;
      /** `null` when the site was razed while the batch formed: the company comes home. */
      readonly site: { readonly building: BuildingKey; readonly regionName: string } | null;
    }
  | {
      readonly kind: 'columnArrived';
      readonly at: number;
      readonly movementType: 'march' | 'recall' | 'return';
      readonly hostCountry: string;
      readonly troops: number;
    }
  /** A march that ended inside one of the player's own buildings (decision 64b). */
  | {
      readonly kind: 'garrisonEntered';
      readonly at: number;
      readonly building: BuildingKey;
      readonly regionName: string;
      readonly troops: number;
    }
  | {
      readonly kind: 'movementStalled';
      readonly at: number;
      readonly hostCountry: string;
      readonly resolvesAt: number;
    }
  | {
      readonly kind: 'outpostFounded';
      readonly at: number;
      readonly hostCountry: string;
      readonly specialization: Specialization;
    }
  | {
      readonly kind: 'outpostDisabled';
      readonly at: number;
      readonly hostCountry: string;
      readonly specialization: Specialization;
    }
  /**
   * **Un avant-poste qui a grandi** (précision du 15/09). Chez le seul propriétaire : ce qu'un
   * point élargi change se **relève** — sa portée entre dans celles de qui regarde — il ne
   * s'annonce pas (ADR 0005).
   */
  | {
      readonly kind: 'outpostRaised';
      readonly at: number;
      readonly hostCountry: string;
      readonly regionName: string | null;
      readonly level: number;
    }
  /**
   * **Ce que la couleur a coupé, et rendu** (ADR 0020 §6). Le compte de sites, jamais leur
   * liste : la ligne du journal dit qu'il faut aller voir, la carte « à faire maintenant » dit
   * lesquels, et une dépêche qui les nommerait serait une seconde source à tenir d'accord.
   */
  | {
      readonly kind: 'productionCut';
      readonly at: number;
      readonly sites: number;
      readonly hostCountry: string;
    }
  | {
      readonly kind: 'productionRestored';
      readonly at: number;
      readonly sites: number;
      readonly hostCountry: string;
    }
  /**
   * A thread, a place, a heading — and nothing a sentry could not honestly report (fiche 04).
   * The detector is the fourth, and it is a fact about the reader's own board: naming what of
   * his caught the column says nothing whatsoever about the column.
   */
  | {
      readonly kind: 'movementSighted';
      readonly at: number;
      readonly hostCountry: string;
      readonly headingDegrees: number;
      readonly detector: Detector;
      readonly detectorRegion: string | null;
    }
  /** La sœur immobile de la précédente (ADR 0024 §1) : un camp, un endroit, et pas de cap — un
   *  camp ne va nulle part, et c'est tout ce qui les sépare. */
  | {
      readonly kind: 'campSighted';
      readonly at: number;
      readonly hostCountry: string;
      readonly detector: Detector;
      readonly detectorRegion: string | null;
    }
  | { readonly kind: 'firedDry'; readonly at: number; readonly hostCountry: string }
  /**
   * Les trois dépêches du leurre ont quitté cette union le 29/08/2026, avec le leurre lui-même.
   * Leurs littéraux restent dans le validateur Convex le temps d'un wipe, et `convex/view.ts`
   * ne sert plus les lignes déjà écrites — rien de ce que le client reçoit ne les porte.
   */
  | {
      readonly kind: 'columnFoundNothing';
      readonly at: number;
      readonly movementType: 'attack' | 'raid';
      readonly hostCountry: string;
      readonly troops: number;
      /** **Ce que la colonne a trouvé debout sans personne pour le garder**, et rien qu'elle
       *  n'ait déjà relevé (`surveyedInstallations`) : l'attaque ne vise pas un bâtiment, et sans
       *  cette clé la dépêche laissait le joueur devant « n'a trouvé personne » alors qu'un ordre
       *  l'attendait sur le mât d'à côté. Absente, la dépêche ne dit rien de plus qu'avant. */
      readonly installation?: BuildingKey;
    }
  /** La fin d'une saison sans horloge : son fondateur l'a close. Aucun vainqueur ne
   *  l'accompagne, et le journal n'en désigne donc aucun (`seasons.conclude`). */
  | { readonly kind: 'seasonClosed'; readonly at: number }
  /** Une capitulation, et la main qu'elle passe (`convex/players.ts`, `surrender`). Publiques
   *  toutes les deux : elles changent la table, elles ne relèvent d'aucun brouillard. */
  | { readonly kind: 'playerSurrendered'; readonly at: number; readonly nation: string }
  | { readonly kind: 'commandTransferred'; readonly at: number; readonly nation: string }
  /** **Une édition a paru, et voici mon rang.** Aucun score, et surtout aucun de ceux des
   *  autres : la table se lit à la page de presse, la dépêche dit seulement qu'elle a paru. */
  | { readonly kind: 'editionPublished'; readonly at: number; readonly rank: number }
  | {
      readonly kind: 'lootTaken';
      readonly at: number;
      readonly building: BuildingKey;
      readonly regionName: string;
      readonly loot: ResourceAmounts;
    }
  | {
      readonly kind: 'sitePlundered';
      readonly at: number;
      readonly building: BuildingKey;
      readonly regionName: string;
      readonly taken: ResourceAmounts;
      readonly storageLost: ResourceAmounts;
    }
  | {
      readonly kind: 'siteSabotaged';
      readonly at: number;
      readonly building: BuildingKey;
      readonly regionName: string;
    }
  | { readonly kind: 'lootLost'; readonly at: number; readonly loot: ResourceAmounts }
  | {
      readonly kind: 'lootRecovered';
      readonly at: number;
      readonly hostCountry: string;
      readonly loot: ResourceAmounts;
    }
  | {
      readonly kind: 'lootCollected';
      readonly at: number;
      readonly hostCountry: string;
      readonly loot: ResourceAmounts;
    }
  | {
      readonly kind: 'lootDelivered';
      readonly at: number;
      readonly regionName: string;
      readonly delivered: ResourceAmounts;
      readonly lost: ResourceAmounts;
    };

export type JournalDispatch = {
  /** The hour it happened, kept beside its French form: the banner counts against
   *  `journalReadAt` and the merge orders by it, and neither can read a formatted string. */
  readonly at: number;
  readonly t: string;
  readonly severity: DispatchSeverity;
  /** Ce que la marge tamponne — la sorte, à côté de la gravité et jamais déduite d'elle. */
  readonly kind: DispatchKind;
  readonly text: string;
  /** Read is not a per-dispatch flag anywhere: it is `at > journalReadAt`, decided once here. */
  readonly unread: boolean;
  readonly remaining: string | null;
  readonly resolutionAt: string | null;
};

/**
 * **The board of the test victory — scaffolding, to be replaced whole** by the share of the map
 * (ADR 0020; `domain/victory.ts` says why). It is the one place this type hands over something
 * about everybody: the condition is unique, public and named, deliberately, and a capacity is
 * neither a position nor a composition — the fog loses nothing.
 */
export type ReductionBoard = {
  /** How many distinct players one has to hold under the bar, `⌈(n−1)/2⌉`. */
  readonly target: number;
  readonly concludedAt: number | null;
  readonly winnerNation: string | null;
  readonly standings: ReadonlyArray<ReductionStanding>;
};

export type ReductionStanding = {
  readonly nation: string | null;
  readonly nickname: string;
  readonly isMine: boolean;
  /** Read at the instant: he rebuilds over the bar, he leaves his executioner's count. */
  readonly isReduced: boolean;
  readonly reduced: number;
};

/**
 * **L'absence du fondateur, servie près du seuil seulement.** Aucune identité, aucune date de
 * connexion : une durée écoulée et l'heure à laquelle le doyen pourra clore. Un joueur ordinaire
 * n'a pas de jumeau de ce type — servir « vu il y a 3 h » pour un adversaire dirait quand le
 * frapper (ADR 0005).
 */
export type FounderAbsence = {
  readonly hours: number;
  readonly concludeOpensAt: number;
} | null;

/**
 * **La dernière édition du classement — un relevé daté, jamais l'état** (contrat de vue 07,
 * `propositions/classement-bareme.md`). L'écran ne bouge pas entre deux éditions, et c'est ce
 * type qui le garantit : rien ici n'est calculable depuis le plateau, tout vient d'une ligne
 * écrite à une heure donnée.
 *
 * **Le cloisonnement est dans la forme.** `mine` porte les cinq chiffres ; `PressLine` en porte
 * trois, et n'a structurellement ni `industry` ni `military` — on ne peut pas les afficher par
 * distraction, exactement comme un arc adverse n'a pas de composition (convention §8).
 */
export type PressEdition = {
  /** L'heure du relevé — la manchette l'imprime, à la seconde, comme partout ailleurs. */
  readonly at: number;
  /** `null` sur une édition finale : plus rien ne suit. */
  readonly next: number | null;
  readonly final: boolean;
  /** `null` pour un siège entré après la dernière édition : il paraîtra à la prochaine. */
  readonly mine: PressOwnLine | null;
  readonly others: ReadonlyArray<PressLine>;
};

/** Ce qu'on lit d'un autre joueur, et rien de plus (décision 80) : le général est exact, il ne
 *  se décompose pas. */
export type PressLine = {
  readonly playerId: string;
  readonly nickname: string;
  readonly nation: string | null;
  readonly rank: number;
  /** La part du théâtre, en pour cent — jamais un compte de régions. */
  readonly territory: number;
  readonly general: number;
  readonly deeds: number;
  readonly defeated: boolean;
};

/** Ma ligne : la même, plus le détail que je suis seul à lire, plus la variation depuis
 *  l'édition précédente — `null` à la première, où il n'y a rien à comparer. */
export type PressOwnLine = Omit<PressLine, 'playerId' | 'general'> & {
  readonly industry: number;
  readonly military: number;
  readonly general: number;
  readonly since: number | null;
  readonly delta: PressDelta | null;
};

export type PressDelta = {
  readonly territory: number;
  readonly industry: number;
  readonly military: number;
  readonly deeds: number;
  readonly general: number;
};

export type PlayerView = {
  readonly season: {
    readonly number: number;
    /** `null` = sans horloge : aucun écran n'affiche alors de compte à rebours, et la saison se
     *  clôt à la main (révision du 27/08 de l'ADR 0017). */
    readonly durationHours: number | null;
    readonly elapsedHours: number;
    readonly players: number;
    readonly playableRegion: string;
    readonly travelMinutesPer1000km: number;
    readonly reduction: ReductionBoard;
  };
  readonly me: {
    readonly nation: string;
    /** Le fondateur, et lui seul, clôt une saison sans horloge (`seasons.conclude`). C'est le
     *  seul pouvoir que le plateau réserve à un joueur plutôt qu'à une nation. */
    readonly creator: boolean;
    /** **Le bouton « clore la saison » existe ou n'existe pas** — servi par la fonction que la
     *  mutation lit (ADR 0015), jamais dérivé de `creator` : le doyen l'obtient quand le
     *  fondateur ne revient plus, sans que le titre bouge. */
    readonly mayConclude: boolean;
    /** **Le fondateur n'est plus là, et la porte approche** (`FOUNDER_ABSENCE_HOURS`). `null`
     *  partout ailleurs, ce qui est l'état normal : une ligne, pas une surface. C'est la seule
     *  forme sous laquelle une présence sort du serveur, et elle ne concerne que lui. */
    readonly founderAbsence: FounderAbsence;
    /** **Il a déposé les armes : il observe.** Le seul champ que l'interface lit pour retirer
     *  ses boutons — la vue elle-même est inchangée, portée par ses détecteurs restants
     *  (décision 47a). Rien ici ne se déduit d'une capacité : réduit n'est pas défait. */
    readonly defeated: boolean;
    readonly homePosition: LonLat;
    /** **La capitale de 1940**, servie pour une seule chose : cadrer le plateau d'un joueur qui
     *  n'a pas encore posé son quartier général (décision 1b du 13/09) — sans lui, la carte
     *  s'ouvre sur le monde entier et le joueur va chercher son pays. `null` sans drapeau. */
    readonly capitalPoint: LonLat | null;
    readonly ink: string;
    readonly power: string;
    readonly progress: number;
    readonly restWindow: string;
    readonly resources: Readonly<Record<ResourceKey, Resource>>;
    readonly slots: { readonly total: number; readonly used: number };
    /** Zero until the headquarters is built — and until then nothing else can be. */
    readonly hqLevel: number;
    /**
     * **The placements, site by site** (ADR 0020 §10) — national soil first, then one line per
     * outpost. There is no national total any more: a full home ground holds nothing back at an
     * outpost, which is what makes expanding worth its upkeep.
     */
    readonly siteSlots: ReadonlyArray<SiteSlots>;
    /** What the next headquarters level would carry at home — `null` at the top of the ladder.
     *  It is what turns "plus un emplacement libre" from a wall into a plan. */
    readonly homeSlotRelief: HomeSlotRelief;
    /** The headquarters level that opens mark 2 in this format — served, never derived here. */
    readonly tier2HqLevel: number;
    /**
     * The buildings the season still owes, in placement order — placed for nothing and at
     * once, wherever the player decides. Empty once the foundation stands.
     *
     * **Une dette est un couple**, jamais une clé seule : la mine due pour le fer ne s'acquitte
     * que sur une région de fer, et celle du charbon sur du charbon. `deposit: null` est la
     * dette que le sol ne nomme pas — le quartier général, première de la liste depuis la
     * décision 1b du 13/09, et la seule qui s'acquitte où le joueur veut.
     */
    readonly foundation: ReadonlyArray<{
      readonly key: BuildingKey;
      readonly deposit: DepositKey | null;
    }>;
    readonly buildings: ReadonlyArray<Building>;
    readonly chains: ReadonlyArray<ChainView>;
    readonly extraction: ReadonlyArray<ExtractionSiteView>;
    readonly regions: ReadonlyArray<RegionView>;
    /** The head of the construction queue — the only entry that is dated, hence the only one
     *  the banner counts down and the map plants a crane on. */
    readonly construction: RunningWork | null;
    /**
     * What is paid for and waiting its turn, behind the head and in build order. A queued entry
     * structurally carries **no** due time: nothing behind the head is dated, so a countdown
     * here could only be invented (`convex/constructions.ts`).
     */
    readonly constructionQueue: ReadonlyArray<QueuedWork>;
    readonly armyPresent: Stack;
    readonly armyInTransit: Stack;
    /** How many troops may stand at once, carried by the billets. `troops` holds the count. */
    readonly troopCap: number;
    readonly troops: ReadonlyArray<TroopView>;
    /** Shared stationed loads are grouped once by their connected carrier set. */
    readonly stationedCargo: ReadonlyArray<{
      readonly troopIds: ReadonlyArray<string>;
      readonly stationedAt: TroopStation;
      readonly cargo: CargoView;
    }>;
    /**
     * **Les bâtiments de projection qui ont un lot en main** — leurs identifiants, jamais leur
     * file : « à faire maintenant » demande si une caserne tourne, pas ce qu'elle forme, et la
     * file complète a sa propre query (`troops.workshop`). Servi plutôt que déduit ici, parce
     * qu'une caserne qui vient de livrer n'est pas une caserne occupée.
     */
    readonly recruiting: ReadonlyArray<string>;
    readonly outposts: ReadonlyArray<OutpostView>;
    readonly upkeep: UpkeepView;
    /**
     * **The army has nothing left to eat.** Nothing dies of it and nothing is lost: the reserve
     * floors at zero and the recruitment queues stop until the food comes back
     * (`consommation-continue.md` D3). The combat prompt will read it for its own malus; nothing
     * reads it for that yet.
     */
    readonly starving: boolean;
  };
  /** Level-one price list, served by the server: balance numbers have one home, `constants.ts`. */
  readonly buildCatalog: Readonly<Record<BuildingKey, BuildSpec>>;
  /** Installation identities frozen in the observer's last regional survey. */
  readonly surveyedInstallations: ReadonlyArray<{
    readonly id: string;
    readonly key: Exclude<BuildingKey, 'depot'>;
    readonly regionId: string;
  }>;
  /** Observer-owned ledger only; no crate truth or expiry crosses this boundary. */
  readonly lootSightings: ReadonlyArray<{
    readonly id: string;
    readonly point: LonLat;
    readonly loot: ResourceAmounts;
    readonly seenAt: number;
    readonly present: boolean;
    readonly current: boolean;
  }>;
  readonly arcs: ReadonlyArray<ArcView>;
  readonly camps: ReadonlyArray<CampView>;
  /** **La dernière édition parue, `null` avant la première.** Servie, jamais recalculée : c'est
   *  la seule surface du jeu qui affiche délibérément une donnée périmée, et c'est le sujet. */
  readonly press: PressEdition | null;
  readonly journal: ReadonlyArray<JournalDispatch>;
  readonly opponents: ReadonlyArray<Opponent>;
  readonly coverage: { readonly visible: number; readonly total: number };
  readonly loadedAt: number;
};

export function currentStock(resource: Resource, loadedAt: number, now: number): number {
  const raw = resource.stock + (resource.ratePerHour * Math.max(0, now - loadedAt)) / 3_600_000;
  /**
   * **The ceiling bounds what comes in, never what is held** — the same bar as the settlement's
   * `held` (`settleStocks`), and it has to be the same one: the opening kit hands out more alloy
   * than a nation without a warehouse can store, so clipping the display to the ceiling showed a
   * player 400 alliage while the server held a thousand of it, pinned and unable to move. He
   * read that as a foundry producing nothing.
   *
   * A net rate goes negative the day an army eats more than its farms grow, and the client
   * extrapolates it between two readings like any other: the floor is the same one the
   * settlement applies, so the strip never counts down past empty.
   */
  const held = Math.max(resource.cap, resource.stock);
  return Math.max(0, Math.floor(Math.min(held, raw)));
}

export function currentMinutes(minutesLeft: number, loadedAt: number, now: number): number {
  return Math.max(0, minutesLeft - Math.max(0, now - loadedAt) / 60_000);
}
