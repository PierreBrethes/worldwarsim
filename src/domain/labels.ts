import type { SupplyLoad } from './logistics';
import type { PileSupplies } from './supplies';
import type { CargoTag } from './cargo-tag';
import { asDuration, asLocalTime } from '@/domain/duration';
import { countryLabel, fr, nationLabel } from '@/i18n/fr';
import type { CaptureClock } from './capture';
import type { LonLat } from './geo';
import type { PilePieces } from './pile-pieces';
import { loadingUntilOf } from './loading';
import {
  RESOURCES,
  type BuildingKey,
  type DepositKey,
  type MovementType,
  type Specialization,
  type UnitRole,
} from './ids';
import type { ArcView, CaptureView, PlayerView, Stack, TroopStation } from './player-view';
import type { WorkSite } from './construction';

/**
 * What the map knows how to plant on the ground. A discriminated union rather than a marker
 * with optional fields: an outpost has no stack headcount, a construction has no garrison,
 * so a label cannot display another kind's field by accident.
 */
export type MapMarker =
  | {
      /** A private observation only: no owner, origin or expiry exists in this shape. */
      readonly kind: 'loot';
      readonly id: string;
      readonly sightingId: string;
      readonly lonLat: LonLat;
      readonly current: boolean;
    }
  | {
      /**
       * **Une installation adverse, telle que le dernier relevé l'a figée** — jamais la ligne
       * vivante : ni stock, ni garnison, ni niveau ne traversent cette forme (ADR 0005). Elle
       * n'a pas de point à elle : le relevé porte la région, et le mât se pose au centroïde,
       * comme un gisement.
       */
      readonly kind: 'installation';
      readonly id: string;
      readonly buildingId: string;
      readonly key: Exclude<BuildingKey, 'depot'>;
      readonly regionId: string;
      /** **Où il se tenait quand on l'a relevé** (ADR 0029) : son mât, et le point que la capture
       *  et la frappe visent. */
      readonly lonLat: LonLat;
      readonly name: string;
      readonly plate: string | null;
      /** Le relevé date : délavé tant que la région n'est pas couverte à l'instant. */
      readonly washed: boolean;
      /** **Un neutre de la Blitz** (lot 4) : public et jamais délavé ; `null` hors Blitz. */
      readonly neutral: { readonly lonLat: LonLat } | null;
    }
  | {
      /**
       * **Un camp adverse relevé** (ADR 0024 §1) — une position, un milieu, deux dates. Il n'a
       * ni encre, ni effectif, ni portrait : le brouillard ne rend que *où* une force se tient,
       * jamais *ce qu'elle est*, et la forme est ce qui l'interdit.
       */
      readonly kind: 'camp';
      readonly id: string;
      readonly campId: string;
      readonly lonLat: LonLat;
      readonly medium: 'land' | 'sea' | 'air';
      /** Perdu de vue : le mât se délave, comme un relevé de région qui date. */
      readonly lastKnown: boolean;
      readonly since: number;
      readonly seenMinutesAgo: number | null;
      readonly lastSeenAt: number | null;
      /** Lisbonne (P11) : la nation du camp, à son seul teneur. */
      readonly nation?: string;
    }
  | {
      /**
       * **Un objectif neutre** (17/09/2026) — le seul marqueur du jeu qui n'appartienne à
       * personne et que **tout le monde** voie : il est public par décision, pas par relevé.
       * Aucune encre, aucune garnison, aucun effectif : ce qu'il porte est un nom de 1940, un
       * palier, et ce qu'il reste au dépôt.
       */
      readonly kind: 'objective';
      readonly id: string;
      readonly objectiveId: string;
      readonly lonLat: LonLat;
      readonly name: string;
      readonly tier: string;
      /** La planche de l'archétype, `null` tant qu'elle manque — le cadre pointillé et son nom
       *  prennent alors sa place, jamais une image cassée. */
      readonly plate: string | null;
      readonly depot: string;
      readonly emptied: boolean;
    }
  | {
      /**
       * **Un point stratégique** (P1-P12) : public comme un objectif, il porte l'encre de son
       * teneur — la couleur est un attribut de possession —, aucune s'il est neutre.
       */
      readonly kind: 'strategic';
      readonly id: string;
      readonly pointId: string;
      readonly lonLat: LonLat;
      readonly name: string;
      readonly ink: string | null;
      /** Ce que tout le monde lit : neutre, tenu par qui, ou contesté. */
      readonly state: string;
    }
  | {
      readonly kind: 'outpost';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly hostCountry: string;
      /**
       * **Le mât d'un avant-poste ouvre sa garnison**, comme celui d'un bâtiment hors
       * projection : la colonne qui a fondé y stationne (ADR 0019 §1), et depuis la disparition
       * du widget de troupes elle n'avait plus aucune porte. Une adresse, jamais deux — le clic
       * droit garde la rose du point.
       */
      readonly station: Extract<TroopStation, { kind: 'outpost' }>;
      readonly specialization: Specialization;
      readonly level: number;
      /**
       * **En chantier jusqu'à cette heure-là**, `null` pour un point debout (révision du 15/09
       * de l'ADR 0020 §10). Le mât le dit, parce que c'est la fenêtre où le point n'existe pas
       * encore : rien ne se bâtit dans son rayon, rien n'y est tenu, et la garnison est ce qui
       * le tient en vie.
       */
      readonly standsAt: number | null;
      readonly garrison: number;
      readonly reach: Reach | null;
      readonly ink: string;
      /** **Son dépôt** (ADR 0028 §4), la barre découpée par couleur sous le niveau. */
      readonly depot?: { readonly load: SupplyLoad; readonly capacity: number };
      /** Les étiquettes de ses transports en garnison : on y charge depuis son dépôt. */
      readonly cargo?: ReadonlyArray<CargoTag>;
    }
  | {
      /**
       * **A pile posted on the map**, and the only marker that is troops rather than a place:
       * a column left standing in the field, a hull holding a stretch of sea. Its address is
       * a point, so it carries one — a garrison at a building or on an outpost reads on the
       * mast that is already drawn there, never here.
       */
      readonly kind: 'stack';
      readonly id: string;
      readonly lonLat: LonLat;
      /** The address a click opens the garrison of, and what the camera flies to. */
      readonly station: TroopStation;
      readonly stack: Stack;
      /** What the address is called on the map — `stationNames(view).place`, never a second
       *  naming: the cartouche reads « Piémont · 3 » as « à faire maintenant » does. */
      readonly place: string;
      /**
       * The pile's own portrait — the sprite of its majority role, the same plate the garrison
       * panel shows. `null` for a role its nation has no drawing for; the pictogram stands in
       * then, and nothing else changes.
       */
      readonly plate: string | null;
      /** Its groups of figurines (`pilePieces`), what the board stands up close in its place. */
      readonly pieces: PilePieces;
      /** **Ses transports chargés** (POC du 16/10) : l'étiquette qui pend sous la pile. */
      readonly cargo?: ReadonlyArray<CargoTag>;
      /** **Blitz** (B19) : la fin du plus long rechargement de la pile, absente sinon. */
      readonly reloadUntil?: number;
      /** **L'artillerie** (B20) : l'instant où la pile sera en batterie, absent sinon. */
      readonly emplacedAt?: number;
      /** **Ses coups et son plein** (ADR 0028 §3), absents en Blitz. */
      readonly supplies?: PileSupplies | null;
      readonly ink: string;
    }
  | {
      readonly kind: 'construction';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly hostCountry: string;
      readonly name: string;
      readonly finishedAt: number;
      /** No order follows: once finished, the construction site idles. */
      readonly idle: boolean;
      readonly ink: string;
    }
  | {
      /**
       * A building stands **on a region**, never on a coordinate: the ground its callout drops
       * to is the region's interior point, and only the region layer knows it. Carrying a
       * `lonLat` for all of them would give every label a second position, free to drift from
       * its own foot.
       *
       * **Except a port** (ADR 0013, revision of 04/09): it was placed on a coast point, the
       * server serves that point, and the mast belongs on the quay rather than thirty
       * kilometres inland. `null` is every other building and keeps the region anchor.
       */
      readonly kind: 'building';
      readonly id: string;
      readonly lonLat: LonLat | null;
      /**
       * The row a click opens, `null` while the first level is still under the crane: nothing
       * stands yet, so there is no line to open anywhere. The instance and not the key — a
       * nation holding three barracks has three lines, and only one of them is this mast.
       */
      readonly buildingId: string | null;
      /** The family, which the instance alone does not say — what an order names
       *  (`constructions.start`) and what the compass rose raises a level of. */
      readonly key: BuildingKey;
      readonly regionId: string;
      /** La région en toutes lettres : la liste d'une pile de mâts la porte en tête (1r). */
      readonly regionName: string;
      readonly hostCountry: string | null;
      readonly name: string;
      /** `null` while the first level is still under the crane: nothing stands to be levelled. */
      readonly level: number | null;
      /** The plate hung at the top of the callout. `null` leaves the mast bare. */
      readonly plate: string | null;
      /**
       * **The works on this site** (mode chantier): its plan in the queue, its first level
       * rising, or a level raised on what stands. The mast wears a pennant for it far away, the
       * board its maquette up close; the hour and the bar are the poster's, never the label's.
       */
      readonly works: WorkSite | null;
      readonly reach: Reach | null;
      /** Sa garnison, comme une pile posée : la fin de son rechargement (B19) et l'instant où
       *  son artillerie est en batterie (B20), absents sinon. */
      readonly reloadUntil?: number;
      readonly emplacedAt?: number;
      /** **Les transports chargés de sa garnison** : l'étiquette qui pend sous le mât. */
      readonly cargo?: ReadonlyArray<CargoTag>;
      /** Mon QG seul : la carte de recherche qu'il porte. */
      readonly research?: Extract<LabelLine, { role: 'research' }>;
      readonly ink: string;
    }
  | {
      /**
       * What the ground holds before anyone works it. Same anchor as a building — the region's
       * interior point — but neither its ink nor its words: a deposit is a potential, and only
       * what is held gets a nation's ink.
       *
       * Nor its reach. A building says what a nation *holds* and stays legible from orbit; a
       * deposit only answers "where do I build", so it comes and goes with the admin-1 layer
       * that makes building possible at all (`withRegionLayer`, `map/engine/labels.ts`).
       */
      readonly kind: 'deposit';
      readonly id: string;
      /** **Un gisement est un point** (ADR 0029 §3) : il se tient là où l'exploitation s'aimante. */
      readonly lonLat: LonLat;
      readonly deposit: DepositKey;
      /** Who is known to work it (`depositHolders`), absent while it is free. */
      readonly held?: { readonly mine: boolean; readonly level: number | null };
      /** A building that takes this deposit is in hand: the free ones light up. */
      readonly seek?: true;
    };

/**
 * The face of the base plate. Provisional: it will one day follow the route's starting point
 * rather than the marker kind, hence a separate field instead of reading the label type.
 *
 * One outpost pictogram whatever the specialization: three drawings for a distinction the
 * label already spells out would cost one more vocabulary to learn, for nothing.
 */
export type LabelPictogram = 'outpost' | 'stack' | 'construction' | 'objective' | 'strategic';

/**
 * **The ground a thing covers, in kilometres around a point** — a listening station's radius, a
 * listening outpost's reach. It travels on the marker rather than being looked up on the map:
 * the point a rule measures from is the server's own (`regionFacts`), and the map layer holds a
 * different one — the centroid it draws the polygon around. Drawing the ring on that second
 * point would put it tens of kilometres off the radius the fog actually applies.
 */
export type Reach = {
  readonly lonLat: LonLat;
  /** Ce que la chose voit passer — le tireté (ADR 0021). */
  readonly detectionKm: number;
  /**
   * **Ce que la chose touche**, `contactKm(théâtre)` — le plein (décisions 4a et 3a du 16/09).
   * `null` pour un avant-poste et une station : ils relèvent, ils n'engagent rien, et un second
   * cercle autour d'eux promettrait une allonge qu'aucune règle ne leur donne.
   */
  readonly contactKm: number | null;
  /** **Ce qu'une artillerie atteint** (B20) : l'anneau de portée, et la zone morte hachurée. */
  readonly fire?: { readonly rangeKm: number; readonly deadZoneKm: number };
};

export type LabelType =
  | 'loot'
  | 'installation'
  | 'camp'
  | 'objective'
  | 'strategic'
  | 'outpost'
  | 'stack'
  | 'construction'
  | 'building'
  | 'deposit'
  | 'my-movement'
  | 'inbound-movement'
  | 'intel'
  /** **Le drapeau planté au bout d'un de mes mouvements** (carte-lisible, 03/10). Il n'existe
   *  que sur la branche `mine` de l'arc : un relevé adverse ne sert pas de destination (4a). */
  | 'arrival';

/**
 * A line's role, not its shape: the mockup decides that a nature line is spaced capitals and
 * a figures line is tabular. The domain never fabricates countdown text — it hands the due
 * time, the display layer counts it down once per second and nothing recomputes in between.
 */
export type LabelLine =
  | { readonly role: 'nature' | 'figures' | 'headcount' | 'mention'; readonly text: string }
  | {
      readonly role: 'countdown';
      readonly dueAt: number;
      readonly prefix: string;
      /** My column's departure, read off the share served: its bar fills from there to `dueAt`. */
      readonly since?: number;
      /** À la seconde (« 0:42 ») plutôt qu'en durée, et muet une fois échu : un rechargement. */
      readonly clock?: true;
    }
  /** My expedition loading on site: a bar and what is left, in place of the countdown. */
  | { readonly role: 'loading'; readonly until: number }
  /** **Coups et plein** de ma pile (ADR 0028 §3) : la cartouche et le jerrican sous la figurine. */
  | { readonly role: 'supplies'; readonly supplies: PileSupplies }
  /** **La carte de recherche que porte mon QG** (ADR 0028 §5) : son nom et sa barre, qui court
   *  de `since` à `dueAt` — figée à `share` quand le QG manque (`dueAt: null`). */
  | {
      readonly role: 'research';
      readonly text: string;
      readonly since: number;
      readonly dueAt: number | null;
      readonly share: number;
    }
  /** **Une charge** (ADR 0028 §4) : le dépôt d'un avant-poste, en barre découpée par couleur. */
  | { readonly role: 'charge'; readonly load: SupplyLoad; readonly capacity: number }
  /** **Une capture sur ce site** (14/10) : l'anneau qui se remplit et l'heure de fin — de
   *  victoire chez le capteur, de perte chez le défenseur. */
  | {
      readonly role: 'capture';
      readonly side: CaptureView['side'];
      readonly site: CaptureView['site'];
      readonly clock: CaptureClock;
      readonly completesAt: number;
    };

/**
 * A mobile anchor carries no position: a movement's head travels along its arc every frame,
 * and the arc layer is the one that knows where it is. Storing a `lonLat` here would freeze
 * the label at the departure point.
 */
export type LabelAnchor =
  | { readonly kind: 'ground'; readonly lonLat: LonLat }
  | { readonly kind: 'movementHead'; readonly arc: string }
  /** Resolved by the region layer, the only holder of a region's interior point. */
  | { readonly kind: 'region'; readonly regionId: string };

/**
 * **Une installation relevée, telle que le mât la tend à qui agit dessus.** Ce n'est pas un
 * `BuildingHandle` et ce n'en sera jamais un : un relevé n'a pas de niveau, et l'inventer pour
 * réutiliser la forme d'à côté ferait dire au brouillard ce qu'il ne sait pas.
 */
type InstallationHandle = {
  readonly id: string;
  readonly key: Exclude<BuildingKey, 'depot'>;
  readonly regionId: string;
  /** Un neutre de la Blitz, qu'on capture sans l'avoir relevé. */
  readonly neutral: boolean;
};

/** A standing building, as a label hands it to whoever acts on it. */
type BuildingHandle = {
  readonly id: string;
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly regionName: string;
  readonly level: number;
};

export type MapLabel = {
  readonly id: string;
  readonly type: LabelType;
  readonly priority: number;
  readonly anchor: LabelAnchor;
  /** What the pointer reveals under this label, `null` for everything that covers no ground. */
  readonly reach: Reach | null;
  /** The owning nation's ink; `null` when the label is not mine. */
  readonly ink: string | null;
  /** **The fanion planted at its point under its piece** (Blitz, retours du 15/10): whose it is,
   *  as I see it — an ink, `NEUTRAL_FLAG`, or none (`ownerFlags`). */
  readonly flag?: string;
  /** The ground pictogram; `null` for a movement head, whose 3D sprite stands in. */
  readonly pictogram: LabelPictogram | null;
  /** **A pile's loaded transports**, each with its tag (POC du 16/10); absent elsewhere. */
  readonly cargo?: ReadonlyArray<CargoTag>;
  /**
   * A drawn plate hung where the pictogram would go — the building itself rather than a sign
   * for it. The two are exclusive: a plate is a portrait, a pictogram is a category, and the
   * crane is what a building wears while it has no portrait to show yet.
   */
  readonly plate: string | null;
  /**
   * The resource lying under the region. The third and last face a label can wear, and the
   * only one that belongs to the ground rather than to a nation — hence a marker that carries
   * no ink beside it.
   */
  readonly deposit: DepositKey | null;
  /** A free deposit the held building would take: it lights up. */
  readonly seeking?: true;
  /** The private sighting a click opens; every other label carries null. */
  readonly lootSightingId: string | null;
  /** False gives a known crate its stale, dashed treatment. */
  readonly lootCurrent: boolean;
  /** Le délavé des relevés : ce qui n'est pas su à l'instant se lit plus pâle que le reste. */
  readonly washed: boolean;
  readonly lines: ReadonlyArray<LabelLine>;
  /** An enemy movement pierced by intelligence — the mockup marks it with a state. */
  readonly identified: boolean;
  /**
   * The movement comes to strike, and we know it. False until intelligence pierces it: the
   * alert mark only arms its triangle on an established nature, never on a suspicion.
   */
  readonly offensive: boolean;
  /** A finished construction that nothing follows — the oversight the screen edge catches. */
  readonly idle: boolean;
  /** The works a building's mast carries (`WorkSite`): a pennant far away, the poster's lines. */
  readonly works: WorkSite | null;
  /** The country a click selects; `null` when the label is not clickable. */
  readonly hostCountry: string | null;
  /**
   * The building this mast stands for — the surface a left click opens, and the target a right
   * click raises a level of (decision 56a). It takes precedence over `hostCountry`: a click
   * that opened a window *and* moved the country selection would do two things for one gesture,
   * and only one of them was asked for.
   *
   * The whole handle rather than an id: the compass rose has to name a **family and a level**
   * to bill a raise, and reading them back off a label's own sentences would be reading the
   * screen instead of the view. `null` while the first level is under the crane — nothing
   * stands there yet to be opened or raised.
   */
  readonly building: BuildingHandle | null;
  /** Le mât adverse relevé, la cible de l'expédition — jamais confondu avec `building`. */
  readonly installation: InstallationHandle | null;
  /**
   * **Le camp adverse relevé** (ADR 0024 §1) : ce qu'un clic gauche ouvre en cartouche et ce
   * qu'un clic droit vise. Il porte son milieu parce que c'est tout son portrait — la
   * silhouette de domaine, jamais une planche nationale.
   */
  readonly camp: { readonly id: string; readonly medium: 'land' | 'sea' | 'air' } | null;
  /**
   * **L'objectif neutre que ce mât porte** : ce qu'un clic gauche ouvre en cartouche et ce qu'un
   * clic droit vise. Il n'a ni niveau ni garnison — la forme est ce qui tient la règle.
   */
  readonly objective: {
    readonly id: string;
    readonly name: string;
    readonly tier: string;
    readonly depot: string;
    readonly emptied: boolean;
  } | null;
  /** **Le point stratégique que ce mât porte** : ce qu'un clic gauche lit et ce qu'un clic droit
   *  vise (P2). */
  readonly strategic: { readonly id: string; readonly name: string } | null;
  /**
   * The garrison a click opens, for the one label that *is* troops: a pile posted on the map.
   * Same door as the widget's *stationnaire* card — one panel, one selection state, never a
   * second read-only sheet for the same pile.
   */
  readonly station: TroopStation | null;
  /**
   * **What a pile weighs, for the one label that is troops.** The cartouche says « Lieu · n » and
   * nothing more (carte-lisible, 03/10) : the composition left the map, but the compass rose
   * still names it and the grouping still sums the headcounts — read here, never off the words.
   */
  readonly force: { readonly headcount: number; readonly composition: string } | null;
};

export const isCountdown = (line: LabelLine): line is Extract<LabelLine, { role: 'countdown' }> =>
  line.role === 'countdown';

/**
 * **Les pièces se nomment au pointeur** (retours de Pierre du 13/10) : la planche, la figurine,
 * bientôt la maquette disent ce qu'elles sont, et vingt cartouches au repos couvraient la carte
 * qu'ils nommaient. Les installations adverses et les objectifs suivent la même règle — un mât
 * se lit au même geste qu'il soit à moi ou non. `pointed` est la souris qui survole ou le doigt
 * qui vient de toucher, faute de survol.
 *
 * Deux exceptions, chacune pour ce qu'elle porte et non pour ce qu'elle est : un compte à
 * rebours reste au repos, parce que c'est une durée qu'on surveille d'un coup d'œil (le point qui
 * se lève — un chantier de bâtiment, lui, se lit sur sa maquette et à l'affiche, mode chantier) ; et une tête de mouvement n'est pas une pièce posée — sa
 * ligne dit l'heure d'arrivée, et l'alerte « cap sur moi » ne s'attend pas au survol.
 */
const NAMED_WHEN_POINTED: ReadonlySet<LabelType> = new Set([
  'building',
  'stack',
  'outpost',
  'objective',
  'strategic',
  'installation',
  'camp',
]);

export const cartoucheShown = (
  label: Pick<MapLabel, 'type' | 'lines'>,
  { pointed, selected }: { readonly pointed: boolean; readonly selected: boolean },
): boolean =>
  !NAMED_WHEN_POINTED.has(label.type) ||
  pointed ||
  selected ||
  label.lines.some((line) => isCountdown(line) || line.role === 'capture');

/**
 * The overlap-degradation order. Sheet 11 gives it for five types; intel — an enemy movement
 * not coming at me — slots below mine and above the construction: an enemy contact reads
 * before a build duration, but after what I pilot myself. The building comes near-last: it
 * is the only label that never moves, so it is the one a player can look for at leisure.
 *
 * The deposit comes below even that, and the order is the whole rule of its layer: it says a
 * *potential* where everything above says a possession, so it never pushes anything aside.
 */
const PRIORITY: Readonly<Record<LabelType, number>> = {
  'inbound-movement': 7,
  'my-movement': 6,
  intel: 5,
  construction: 4,
  loot: 3,
  outpost: 3,
  /** Un camp relevé se lit avant un mât : c'est une force, et elle peut partir. */
  camp: 3,
  /** **Un objectif se lit avant tout ce qui ne bouge pas** : c'est le seul endroit de la carte
   *  où le jeu envoie tout le monde, et le manquer sous un mât serait manquer la partie. */
  objective: 4,
  /** La course se lit avant tout le reste du décor : c'est elle qui gagne la saison. */
  strategic: 4,
  stack: 2,
  building: 1,
  /** Le mât d'un autre ne prend jamais la place du sien : à encombrement égal, c'est le joueur
   *  qui garde la sienne lisible. */
  installation: 1,
  deposit: 0,
  /** Le drapeau ne repousse rien et n'est repoussé par rien : il est hors du repli. */
  arrival: 0,
};

/** Below this remainder, the label switches to the mockup's urgency accent. */
export const URGENCY_MS = 5 * 60_000;

/** Two lines, never a sentence: the composition abbreviates, "·" replaces the conjunction. */
export function abbreviateStack(stack: Stack): string {
  return (Object.entries(stack) as ReadonlyArray<[UnitRole, number]>)
    .filter(([, count]) => count > 0)
    .map(([role, count]) => `${count} ${fr.roleAbbreviations[role]}`)
    .join(' · ');
}

const stackHeadcount = (stack: Stack): number =>
  Object.values(stack).reduce((sum, count) => sum + count, 0);

export const NEUTRAL_FLAG = 'neutral';

/**
 * **À qui est quoi, d'un coup d'œil** (Blitz, retours du 15/10) : mes piles et mes sites à mon
 * encre, un site tenu par un autre à l'encre que mon relevé voit sur sa région, un neutre en
 * blanc. **Une pièce adverse jamais** — un camp relevé n'a pas de nation hors du feu, et il n'a
 * donc pas de fanion.
 */
export function ownerFlags(
  labels: ReadonlyArray<MapLabel>,
  holderInk: (regionId: string) => string | null,
  myInk: string | null,
): ReadonlyArray<MapLabel> {
  /** Le tenant de la région, pas celui du site : quand c'est moi, un autre site de la région
   *  porte la couleur, et ce site d'un autre n'a pas de tenant que je sache dire. */
  const holderOf = (regionId: string) => {
    const ink = holderInk(regionId);
    return ink === myInk ? null : ink;
  };
  return labels.map((label) => {
    const flag =
      label.type === 'building' || label.type === 'stack'
        ? label.ink
        : label.installation === null
          ? null
          : label.installation.neutral
            ? NEUTRAL_FLAG
            : holderOf(label.installation.regionId);
    return flag === null ? label : { ...label, flag };
  });
}

export function buildLabels(
  view: PlayerView,
  markers: ReadonlyArray<MapMarker>,
): ReadonlyArray<MapLabel> {
  return [
    ...withCaptures(markers.map(markerLabel), view.captures),
    ...view.arcs.map((arc) => arcLabel(arc, view.loadedAt)).filter(exists),
    ...view.arcs.map((arc) => arrivalLabel(arc, view.me.ink)).filter(exists),
  ];
}

const carriesSite = (label: MapLabel, target: CaptureView['target']): boolean =>
  target.kind === 'building'
    ? label.building?.id === target.id || label.installation?.id === target.id
    : label.station?.kind === 'outpost' && label.station.outpostId === target.id;

/**
 * **Le site visé porte sa capture** — l'anneau pend à son étiquette. Un site que la carte ne
 * dessine pas (un avant-poste adverse jamais relevé en mât) a la sienne, posée au point où
 * l'infanterie se tient : on ne perd pas une capture parce que la carte n'a rien sous elle.
 */
function withCaptures(
  labels: ReadonlyArray<MapLabel>,
  captures: ReadonlyArray<CaptureView>,
): ReadonlyArray<MapLabel> {
  const running = captures.filter((capture) => capture.stoppedAt === null);
  const lineOf = (capture: CaptureView): LabelLine => ({
    role: 'capture',
    side: capture.side,
    site: capture.site,
    clock: capture.clock,
    completesAt: capture.completesAt,
  });
  const carried = labels.map((label) => {
    const capture = running.find((candidate) => carriesSite(label, candidate.target));
    return capture === undefined ? label : { ...label, lines: [...label.lines, lineOf(capture)] };
  });
  const alone = running.filter(
    (capture) => !labels.some((label) => carriesSite(label, capture.target)),
  );
  return [
    ...carried,
    ...alone.map((capture): MapLabel => ({
      id: `capture-${capture.id}`,
      type: 'installation',
      priority: PRIORITY.installation,
      anchor: { kind: 'ground', lonLat: capture.point },
      reach: null,
      ink: null,
      pictogram: null,
      plate: null,
      deposit: null,
      lootSightingId: null,
      lootCurrent: true,
      washed: false,
      lines: [{ role: 'nature', text: captureSiteName(capture) }, lineOf(capture)],
      identified: false,
      offensive: false,
      idle: false,
      works: null,
      hostCountry: null,
      building: null,
      installation: null,
      camp: null,
      objective: null,
      strategic: null,
      station: null,
      force: null,
    })),
  ];
}

export const captureSiteName = (capture: Pick<CaptureView, 'site' | 'regionName'>): string =>
  capture.site.kind === 'building'
    ? fr.capture.buildingSite(fr.buildings[capture.site.building], capture.regionName ?? '')
    : capture.site.kind === 'point'
      ? fr.points.site(capture.site.key)
      : fr.capture.outpostSite(capture.site.level, countryLabel(capture.site.hostCountry));

/**
 * **Chacun de mes mouvements finit par un drapeau** (carte-lisible, 03/10), planté au bout du
 * fil — le dernier point de la route, là où le trait s'arrête, et non `to`, qui peut tomber à
 * une demi-cellule de lui. Un arc adverse n'en a jamais : le relevé sert un tronçon et un cap,
 * pas une destination (décision 4a du 13/09), et un drapeau au bout du tronçon la suggérerait.
 * Le nom voyage en ligne de nature : c'est lui que le bord de l'écran annonce, hors champ.
 */
function arrivalLabel(arc: ArcView, ink: string): MapLabel | null {
  if (arc.state !== 'mine') return null;
  return {
    id: `arrival-${arc.id}`,
    type: 'arrival',
    priority: PRIORITY.arrival,
    anchor: { kind: 'ground', lonLat: arc.route.points.at(-1) ?? arc.to },
    reach: null,
    ink,
    pictogram: null,
    plate: null,
    deposit: null,
    lootSightingId: null,
    lootCurrent: true,
    washed: false,
    lines: [{ role: 'nature', text: arc.destinationLabel }],
    identified: false,
    offensive: false,
    idle: false,
    works: null,
    hostCountry: null,
    building: null,
    installation: null,
    camp: null,
    objective: null,
    strategic: null,
    station: null,
    force: null,
  };
}

const exists = <T>(value: T | null): value is T => value !== null;

/** Everything hangs from its coordinate — a deposit, a building, a surveyed installation —
 *  save a building the view serves without one. */
function anchorOf(marker: MapMarker): LabelAnchor {
  if (marker.kind === 'building') {
    return marker.lonLat === null
      ? { kind: 'region', regionId: marker.regionId }
      : { kind: 'ground', lonLat: marker.lonLat };
  }
  return { kind: 'ground', lonLat: marker.lonLat };
}

function markerLabel(marker: MapMarker): MapLabel {
  const common = {
    id: marker.id,
    anchor: anchorOf(marker),
    ink:
      marker.kind === 'deposit' ||
      marker.kind === 'loot' ||
      marker.kind === 'installation' ||
      marker.kind === 'camp' ||
      /** **Un objectif n'appartient à personne** : il n'a donc pas d'encre à porter, et c'est la
       *  forme qui le dit — la couleur est un attribut de possession. */
      marker.kind === 'objective'
        ? null
        : marker.ink,
    plate: null,
    deposit: null,
    lootSightingId: null,
    lootCurrent: true,
    washed:
      (marker.kind === 'installation' && marker.washed) ||
      (marker.kind === 'camp' && marker.lastKnown),
    identified: false,
    offensive: false,
    idle: false,
    works: null,
    building: null,
    installation: null,
    camp: null,
    objective: null,
    strategic: null,
    station: null,
    force: null,
    /** Only two things cover ground, and only while the pointer asks: everything else answers
     *  `null` and the map draws nothing (`map/engine/reach.ts`). */
    reach: marker.kind === 'outpost' || marker.kind === 'building' ? marker.reach : null,
  } as const;

  switch (marker.kind) {
    case 'loot':
      return {
        ...common,
        type: 'loot',
        priority: PRIORITY.loot,
        pictogram: null,
        lootSightingId: marker.sightingId,
        lootCurrent: marker.current,
        hostCountry: null,
        lines: [
          {
            role: 'nature',
            text: marker.current ? fr.loot.markerCurrent : fr.loot.markerStale,
          },
        ],
      };
    /**
     * **Ce qu'on a relevé chez l'autre, et rien de plus.** Le mât porte le dessin du bâtiment et
     * son nom ; il n'ouvre aucune fenêtre — le clic droit y ouvre la rose de l'expédition, la
     * lecture du sol reste celle de la région, qui porte déjà la date du relevé.
     */
    case 'installation':
      return {
        ...common,
        type: 'installation',
        priority: PRIORITY.installation,
        pictogram: null,
        plate: marker.plate,
        installation: {
          id: marker.buildingId,
          key: marker.key,
          regionId: marker.regionId,
          neutral: marker.neutral !== null,
        },
        hostCountry: null,
        lines: [
          { role: 'nature', text: marker.name },
          ...(marker.neutral === null
            ? []
            : [{ role: 'mention', text: fr.blitz.neutral } as const]),
        ],
      };
    /**
     * **Ce qu'on sait d'un camp, et c'est tout** (ADR 0024 §1) : il se tient là, dans ce
     * milieu-là, et on l'a relevé à cette heure-là. Aucun pictogramme — c'est la silhouette de
     * domaine qui en tient lieu, celle qu'un arc adverse porte déjà.
     */
    case 'camp':
      return {
        ...common,
        type: 'camp',
        priority: PRIORITY.camp,
        pictogram: null,
        camp: { id: marker.campId, medium: marker.medium },
        hostCountry: null,
        lines: [
          { role: 'nature', text: fr.camps.marker },
          {
            role: 'mention',
            text:
              marker.seenMinutesAgo === null
                ? fr.camps.seenAt(asLocalTime(marker.since))
                : fr.camps.lastKnown(asDuration(marker.seenMinutesAgo)),
          },
          ...lisbonLine(marker.nation),
        ],
      };
    /**
     * **Un objectif neutre, tel qu'il est annoncé à tous** : son nom de 1940, le palier en toutes
     * lettres, et ce qu'il reste au dépôt. **Le palier, jamais la composition** — le mot dit le
     * risque, et ce qui tient l'objectif ne se sait qu'en s'en approchant.
     */
    case 'objective':
      return {
        ...common,
        type: 'objective',
        priority: PRIORITY.objective,
        /** La planche gagne sur le signe, comme sur un mât de bâtiment ; le pictogramme prend sa
         *  place tant qu'aucune planche n'est dessinée. */
        pictogram: marker.plate === null ? 'objective' : null,
        plate: marker.plate,
        objective: {
          id: marker.objectiveId,
          name: marker.name,
          tier: marker.tier,
          depot: marker.depot,
          emptied: marker.emptied,
        },
        hostCountry: null,
        lines: [
          { role: 'nature', text: marker.name },
          { role: 'figures', text: marker.emptied ? fr.objectives.emptied : marker.depot },
        ],
      };
    case 'strategic':
      return {
        ...common,
        type: 'strategic',
        priority: PRIORITY.strategic,
        pictogram: 'strategic',
        strategic: { id: marker.pointId, name: marker.name },
        hostCountry: null,
        lines: [
          { role: 'nature', text: marker.name },
          { role: 'figures', text: marker.state },
        ],
      };
    /** **Un chantier ne se lit pas comme un point** : il n'a ni niveau ni métier tant qu'il
     *  n'est pas levé, et ce qu'il doit dire est l'heure et la garnison qui le tient. */
    case 'outpost':
      return {
        ...common,
        type: 'outpost',
        priority: PRIORITY.outpost,
        pictogram: 'outpost',
        station: marker.station,
        hostCountry: marker.hostCountry,
        ...(marker.cargo !== undefined && marker.cargo.length > 0 ? { cargo: marker.cargo } : {}),
        lines:
          marker.standsAt === null
            ? [
                { role: 'nature', text: fr.specializations[marker.specialization] },
                {
                  role: 'figures',
                  text: fr.labels.levelAndGarrison(marker.level, marker.garrison),
                },
                ...(marker.depot === undefined
                  ? []
                  : [{ role: 'charge', ...marker.depot } as const]),
              ]
            : [
                { role: 'nature', text: fr.labels.outpostUnderConstruction },
                { role: 'figures', text: fr.labels.outpostGarrison(marker.garrison) },
                {
                  role: 'countdown',
                  dueAt: marker.standsAt,
                  prefix: fr.labels.constructionPrefix,
                },
              ],
      };
    case 'stack':
      return {
        ...common,
        type: 'stack',
        priority: PRIORITY.stack,
        // The portrait wins over the sign, exactly as on a building's mast: the plate says
        // *what* stands there, the pictogram only that something does.
        pictogram: marker.plate === null ? 'stack' : null,
        plate: marker.plate,
        station: marker.station,
        hostCountry: null,
        ...(marker.cargo !== undefined && marker.cargo.length > 0 ? { cargo: marker.cargo } : {}),
        force: {
          headcount: stackHeadcount(marker.stack),
          composition: abbreviateStack(marker.stack),
        },
        // **Un cartouche par pile, jamais une étiquette par troupe** (carte-lisible, 03/10) : le
        // lieu et le compte. La composition se lit dans la garnison, que le clic ouvre.
        lines: [
          {
            role: 'nature',
            text: fr.labels.stackPlace(marker.place, stackHeadcount(marker.stack)),
          },
          ...(marker.supplies == null
            ? []
            : [{ role: 'supplies', supplies: marker.supplies } as const]),
          ...countdownsOf(marker),
        ],
      };
    case 'construction':
      return {
        ...common,
        type: 'construction',
        priority: PRIORITY.construction,
        pictogram: 'construction',
        hostCountry: marker.hostCountry,
        idle: marker.idle,
        lines: [
          { role: 'nature', text: marker.name },
          { role: 'countdown', dueAt: marker.finishedAt, prefix: fr.labels.constructionPrefix },
        ],
      };
    case 'building':
      return {
        ...common,
        type: 'building',
        priority: PRIORITY.building,
        building:
          marker.buildingId === null || marker.level === null
            ? null
            : {
                id: marker.buildingId,
                key: marker.key,
                regionId: marker.regionId,
                regionName: marker.regionName,
                level: marker.level,
              },
        // A queued site has nothing standing yet: its pennant alone marks the mast.
        plate: marker.works?.phase === 'queued' ? null : marker.plate,
        pictogram: null,
        works: marker.works,
        hostCountry: marker.hostCountry,
        ...(marker.cargo !== undefined && marker.cargo.length > 0 ? { cargo: marker.cargo } : {}),
        lines: [
          { role: 'nature', text: marker.name },
          ...(marker.level === null
            ? []
            : [{ role: 'figures', text: fr.labels.buildingLevel(marker.level) } as const]),
          ...(marker.research === undefined ? [] : [marker.research]),
          ...countdownsOf(marker),
        ],
      };
    case 'deposit':
      return {
        ...common,
        type: 'deposit',
        priority: PRIORITY.deposit,
        pictogram: null,
        deposit: marker.deposit,
        // A click on a deposit says nothing the ground does not: the region's own click
        // already selects the country, and the crane already opens on the right list.
        hostCountry: null,
        ...(marker.seek === true && marker.held === undefined ? { seeking: true as const } : {}),
        lines: [
          { role: 'nature', text: fr.deposits[marker.deposit] },
          ...(marker.held === undefined
            ? []
            : [{ role: 'figures', text: fr.labels.depositHeld(marker.held) } as const]),
        ],
      };
  }
}

/** Ce que la pile attend, posée ou en garnison : son rechargement, puis sa mise en batterie. */
const countdownsOf = ({
  reloadUntil,
  emplacedAt,
}: {
  readonly reloadUntil?: number;
  readonly emplacedAt?: number;
}) => [
  ...(reloadUntil === undefined
    ? []
    : [
        {
          role: 'countdown' as const,
          dueAt: reloadUntil,
          prefix: fr.reload.prefix,
          clock: true as const,
        },
      ]),
  ...(emplacedAt === undefined
    ? []
    : [
        {
          role: 'countdown' as const,
          dueAt: emplacedAt,
          prefix: fr.battery.prefix,
          clock: true as const,
        },
      ]),
];

/**
 * The intelligence rule lives in this function and nowhere else: an unidentified enemy
 * movement structurally has neither type nor stack to leak, and its schedule comes out
 * prefixed with "~". A breakthrough gives the nature and the composition — never the watch.
 * A frozen arc or mere sea control carries no label: they have nothing to say that an
 * anonymous cone does not already.
 */
function arcLabel(arc: ArcView, loadedAt: number): MapLabel | null {
  if (arc.state === 'mine') {
    const mission = arc.mission ?? null;
    const cargo = arc.cargo;
    // Une poursuite ne porte rien : sa charge vide ne dirait rien de plus que « poursuite ».
    const cargoVisible =
      cargo !== undefined &&
      (cargo.carried > 0 || (mission !== null && mission.kind !== 'pursuit'));
    const loadingUntil = loadingUntilOf(arc);
    return {
      id: arc.id,
      type: 'my-movement',
      priority: PRIORITY['my-movement'],
      objective: null,
      strategic: null,
      washed: false,
      installation: null,
      camp: null,
      anchor: { kind: 'movementHead', arc: arc.id },
      reach: null,
      ink: null,
      pictogram: null,
      plate: null,
      deposit: null,
      lootSightingId: null,
      lootCurrent: true,
      identified: false,
      offensive: false,
      idle: false,
      works: null,
      hostCountry: null,
      building: null,
      station: null,
      force: null,
      lines: [
        ...(loadingUntil === null
          ? scheduleLines(arc, loadedAt)
          : [{ role: 'loading', until: loadingUntil } as const]),
        ...(cargoVisible
          ? [
              {
                role: 'figures',
                text: fr.loot.cargoCapacity(cargo.carried, cargo.capacity),
              } as const,
            ]
          : []),
        ...(cargo !== undefined && cargo.carried > 0
          ? [{ role: 'figures', text: resourceAmountsLabel(cargo.loot) } as const]
          : []),
        ...(mission === null ? [] : [{ role: 'mention', text: missionLabel(mission) } as const]),
      ],
    };
  }
  /**
   * **Une dernière position connue se nomme** (ADR 0024 §2) : l'arc figé disait son âge par sa
   * seule pâleur, et un joueur ne pouvait pas savoir s'il lisait une trace d'il y a dix minutes
   * ou d'hier soir. Une ligne, la même que celle d'un camp perdu de vue.
   */
  if (arc.state === 'lastKnown') {
    return {
      id: arc.id,
      type: 'intel',
      priority: PRIORITY.intel,
      washed: true,
      installation: null,
      camp: null,
      objective: null,
      strategic: null,
      anchor: { kind: 'movementHead', arc: arc.id },
      reach: null,
      ink: null,
      pictogram: null,
      plate: null,
      deposit: null,
      lootSightingId: null,
      lootCurrent: true,
      identified: false,
      offensive: false,
      idle: false,
      works: null,
      hostCountry: null,
      building: null,
      station: null,
      force: null,
      lines: [
        { role: 'mention', text: fr.camps.lastKnown(asDuration(arc.seenMinutesAgo)) },
        ...lisbonLine(arc.nation),
      ],
    };
  }
  if (arc.state !== 'enemyDetected') return null;

  const type = arc.headingAtMe ? 'inbound-movement' : 'intel';
  const schedule: ReadonlyArray<LabelLine> =
    arc.estimatedMinutesLeft === null
      ? []
      : [
          {
            role: 'countdown',
            dueAt: loadedAt + arc.estimatedMinutesLeft * 60_000,
            prefix: '~',
          },
        ];
  const second: LabelLine = arc.identification.pierced
    ? {
        role: 'nature',
        text: `${fr.movementTypes[arc.identification.type]} · ${abbreviateStack(arc.identification.stack)}`,
      }
    : { role: 'mention', text: fr.labels.estimated };

  return {
    id: arc.id,
    type,
    priority: PRIORITY[type],
    washed: false,
    installation: null,
    camp: null,
    objective: null,
    strategic: null,
    anchor: { kind: 'movementHead', arc: arc.id },
    reach: null,
    ink: null,
    pictogram: null,
    plate: null,
    deposit: null,
    lootSightingId: null,
    lootCurrent: true,
    identified: arc.identification.pierced,
    offensive: arc.identification.pierced && OFFENSIVE_TYPES.includes(arc.identification.type),
    idle: false,
    works: null,
    hostCountry: null,
    building: null,
    station: null,
    force: null,
    lines: [...schedule, second, ...lisbonLine(arc.nation)],
  };
}

/** **Ce que Lisbonne fait lire** (P11) : la nation d'un relevé, à son seul teneur. */
const lisbonLine = (nation: string | undefined): ReadonlyArray<LabelLine> =>
  nation === undefined
    ? []
    : [{ role: 'figures', text: fr.points.readAtLisbon(nationLabel(nation)) }];

/**
 * **Une arrivée retenue ne se compte pas à rebours** : la colonne se tient à la frontière, elle
 * ne marche plus, et l'étiquette dit l'heure de la passe. Tant qu'elle marche vers une plage
 * déjà connue, le compte à rebours reste et la retenue s'annonce sous lui.
 */
function scheduleLines(
  arc: Extract<ArcView, { state: 'mine' }>,
  loadedAt: number,
): ReadonlyArray<LabelLine> {
  const wait = arc.borderWait;
  if (wait === null) {
    const dueAt = loadedAt + arc.minutesLeft * 60_000;
    // The share walked and the minutes left date the departure; a share at its end dates nothing.
    const since =
      arc.progress < 1 ? loadedAt - (arc.progress / (1 - arc.progress)) * (dueAt - loadedAt) : null;
    return [{ role: 'countdown', dueAt, prefix: '', ...(since === null ? {} : { since }) }];
  }
  const resolvesAt = asLocalTime(loadedAt + wait.resolutionInMinutes * 60_000);
  if (arc.minutesLeft === 0) return [{ role: 'mention', text: fr.labels.arrivalHeld(resolvesAt) }];
  return [
    { role: 'countdown', dueAt: loadedAt + arc.minutesLeft * 60_000, prefix: '' },
    { role: 'mention', text: fr.labels.borderHold(resolvesAt) },
  ];
}

/** Striking means attacking a nation or raiding an outpost; the rest infiltrates. */
const OFFENSIVE_TYPES: ReadonlyArray<MovementType> = ['attack', 'raid'];

const resourceAmountsLabel = (amounts: PlayerView['lootSightings'][number]['loot']): string =>
  RESOURCES.filter((resource) => amounts[resource] > 0)
    .map((resource) => `${amounts[resource]} ${fr.resources[resource]}`)
    .join(' · ');

function missionLabel(
  mission: NonNullable<Extract<ArcView, { state: 'mine' }>['mission']>,
): string {
  switch (mission.kind) {
    case 'plunder':
      return mission.phase === 'presence' && mission.presenceEndsAt !== null
        ? fr.loot.missions.plunderPresence(asLocalTime(mission.presenceEndsAt))
        : fr.loot.missions.plunderOutbound;
    case 'collection':
      return fr.loot.missions.collection;
    case 'cargoReturn':
      return fr.loot.missions.cargoReturn;
    case 'pursuit':
      return fr.aim.pursuit;
  }
}
