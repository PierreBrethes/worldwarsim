import { pileSupplies } from '@/domain/supplies';
import type { TourTrace } from '@/domain/cargo-tag';
import { cargoTagsOf } from '@/domain/cargo-tag';
import { outpostReachKm, objectiveArchetype } from '../../../convex/constants';
import { cardName, fr, nationLabel } from '@/i18n/fr';
import { researchMs, researchProgressOf, searcherOf } from '@/domain/research';
import { isRangoonColumn } from '@/domain/strategic-points';
import type { StandingPile } from '@/map/engine';
import { rangoonReachOf, type LabelLine, type MapMarker } from '@/domain/labels';
import { pilePieces, unitPieces, type PilePieces } from '@/domain/pile-pieces';
import { COUNTRY_BY_NATION, isNation, nationInk } from '@/domain/nations';
import { buildingSprite } from '@/emblems/buildings/manifest';
import { lootWords } from '@/domain/journal';
import { destinationPoint, type LonLat } from '@/domain/geo';
import { BASIN_FLATTENING, BASIN_KM } from '@/domain/deposit-basins';
import { DEPOSIT_POINTS } from '@/domain/world';
import { workSitesOf, type DepositCall, type depositHolders } from '@/domain/construction';
import { reachOfStation, withRangoonPile } from '@/domain/board-reach';
import type { IndicatorToggles } from '@/domain/indicators';
import type { ArcView, PlayerView, Stack, TroopStation, TroopView } from '@/domain/player-view';
import { DOMAIN_BY_ROLE, PROJECTION_BY_DOMAIN, stationKeyOf, troopsAt } from '@/domain/troops';
import { outpostPinId } from '@/domain/pins';
import { stackLabelId } from '@/domain/force-highlight';
import { pilePlace, stationNames, type RegionAt } from '@/domain/station-name';
import { surveyedAt } from '@/domain/survey-ink';
export function markersOf(
  view: PlayerView,
  {
    marching,
    trace,
    regionAt,
    toggles,
    calls,
    holders,
    knownRegionById,
  }: {
    marching: ReadonlySet<string>;
    trace: TourTrace | null;
    regionAt: RegionAt | null;
    toggles: IndicatorToggles;
    /** The deposits a key in hand calls (`usePlacing`): they wake (#239). */
    calls: ReadonlyArray<DepositCall> | null;
    holders: ReturnType<typeof depositHolders>;
    knownRegionById: ReadonlyMap<string, { readonly state: string }>;
  },
): ReadonlyArray<MapMarker> {
  const loot: ReadonlyArray<MapMarker> = view.lootSightings
    .filter((sighting) => sighting.present)
    .map((sighting) => ({
      kind: 'loot' as const,
      id: `loot-${sighting.id}`,
      sightingId: sighting.id,
      lonLat: sighting.point,
      current: sighting.current,
    }));
  /**
   * **Toute la géologie, pas seulement la sienne** (décision 65a du 01/09). La bascule dessinait
   * `me.regions` au nom de l'ADR 0005 : contresens, elle protège les *joueurs* — positions,
   * mouvements, tenants — et le sol n'est ni l'un ni l'autre. Un gisement est fixe, identique
   * pour tout le monde et connu d'un atlas ; le cacher n'apprenait rien à personne sur
   * l'adversaire et laissait le joueur ignorer où le pétrole se prend. La source est l'asset
   * (`DEPOSIT_POINTS`), donc aucune donnée de joueur n'entre ici — les marqueurs n'ont ni
   * encre ni ligne, et ils suivent la couche des régions comme avant (`withRegionLayer`) :
   * au dézoom, rien ne pleut sur la carte.
   */
  /** **La Blitz n'exploite rien** : ses gisements ne diraient rien qu'on puisse en faire. */
  const woken = new Map(
    (calls ?? []).map((call) => [call.deposit.id, call.refusal ?? ('open' as const)]),
  );
  const deposits: ReadonlyArray<MapMarker> =
    (toggles.deposits || calls !== null) && view.mode !== 'blitz'
      ? DEPOSIT_POINTS.map((point) => {
          const holder = holders.get(point.id);
          const wake = woken.get(point.id);
          return {
            kind: 'deposit' as const,
            id: `deposit-${point.id}`,
            // Its name is written below its basin, as a massif's (#239).
            lonLat: destinationPoint(point.lonLat, BASIN_KM * BASIN_FLATTENING, 180),
            deposit: point.deposit,
            ...(holder === undefined ? {} : { held: holder }),
            ...(wake === undefined ? {} : { wake }),
          };
        })
      : [];

  /**
   * **A founded outpost has to stand on the board.** Without this the column that planted it
   * becomes a garrison hanging from a point nothing draws: the troops leave the *stationnaires*
   * of the widget for an address the map never shows, and the whole march reads as "nothing
   * happened". `me.outposts` is mine only — the fog keeps an opponent's point out of the answer
   * itself (`view.ts`), so there is nothing to filter on nationality here.
   */
  const outposts: ReadonlyArray<MapMarker> = view.me.outposts.map((outpost) => ({
    kind: 'outpost' as const,
    id: outpostPinId(outpost.id),
    lonLat: outpost.lonLat,
    hostCountry: outpost.hostCountry,
    /** **Le mât ouvre la garnison** : la colonne qui a fondé stationne là (ADR 0019 §1), et
     *  depuis la disparition du widget de troupes plus rien ne l'ouvrait. */
    station: { kind: 'outpost', outpostId: outpost.id },
    specialization: outpost.specialization,
    level: outpost.level,
    standsAt: outpost.standsAt,
    garrison: outpost.garrison,
    /** **Ce qu'il écoute est ce qu'il ravitaille** : le même rayon, montré au survol. Le
     *  relais couvre le même cercle mais n'y relève rien — c'est le temps de trajet qu'il
     *  change, et la carte n'a pas de trait pour dire une vitesse. */
    /** Un chantier n'atteint rien : pas de cercle à montrer tant qu'il n'est pas levé. */
    reach: withRangoonPile(
      view.me,
      { kind: 'outpost', outpostId: outpost.id },
      marching,
      outpost.lonLat,
      outpost.specialization === 'listening' && outpost.standsAt === null
        ? {
            lonLat: outpost.lonLat,
            detectionKm: outpostReachKm(outpost.level),
            /** Un point n'engage rien : il relève, et le cercle de contact est celui d'une
             *  pile (décisions 4a et 3a du 16/09). */
            contactKm: null,
          }
        : null,
    ),
    ink: view.me.ink,
    ...(view.mode === 'blitz' || outpost.standsAt !== null
      ? {}
      : { depot: { load: outpost.depot, capacity: outpost.depotCapacity } }),
    /** Ses transports en garnison : on y charge depuis son dépôt (ADR 0028 §4). */
    cargo: cargoTagsOf(
      troopsAt(view.me, stationKeyOf({ kind: 'outpost', outpostId: outpost.id }), marching),
      { afloat: false, atAirfield: false, trace },
    ),
  }));

  /**
   * **Une troupe posée se tient sur la carte**, et c'est la seule adresse qui n'a pas déjà un
   * mât : une colonne laissée en campagne, une coque qui tient un bout de mer. Sans ce
   * marqueur elles n'existaient que dans le widget — le joueur lisait « en campagne » sans
   * jamais savoir où. Les autres adresses ne passent pas par ici : une garnison de bâtiment
   * se lit sur sa plaque, celle d'un avant-poste sur son point.
   */
  const stacks: ReadonlyArray<MapMarker> = postedStacks(view.me, marching, regionAt);

  /**
   * **Ce qu'on a relevé chez l'autre se tient sur la carte** (S8) : sans mât, l'expédition
   * n'avait aucune poignée — un ordre existait côté serveur que rien à l'écran ne pouvait
   * nommer. Le relevé porte le point où le site se tenait (ADR 0029), et le mât s'y pose : c'est
   * le point que la capture et la frappe visent. Il suit le même interrupteur que les mâts à
   * soi, parce que c'est le même encombrement.
   */
  /**
   * **Un camp adverse relevé se tient sur la carte** (ADR 0024 §1) : sans mât, le §3 serait
   * injouable — un adversaire camperait chez le joueur sans que rien ne le lui dise. Le
   * marqueur ne porte que ce que le relevé sert : un point, un milieu, deux dates.
   */
  /** **Éteindre les objectifs emporte leur garnison relevée** : elle se tient au point exact
   *  de la réserve (`convex/objectives.ts`), et un bloc sans la réserve qu'il garde ne dirait
   *  plus rien. */
  const isObjectivePoint = (point: LonLat): boolean =>
    view.objectives.some(
      (objective) => objective.point[0] === point[0] && objective.point[1] === point[1],
    );
  const camps: ReadonlyArray<MapMarker> = view.camps
    .filter((camp) => toggles.objectives || !isObjectivePoint(camp.point))
    .map((camp) => ({
      kind: 'camp' as const,
      id: `camp-${camp.id}`,
      campId: camp.id,
      lonLat: camp.point,
      medium: camp.medium,
      lastKnown: camp.lastKnown,
      since: camp.since,
      seenMinutesAgo: camp.seenMinutesAgo,
      lastSeenAt: camp.lastSeenAt,
      ...(camp.nation === undefined ? {} : { nation: camp.nation }),
    }));

  /**
   * **Les objectifs neutres se tiennent sur la carte, pour tout le monde** (17/09/2026). C'est
   * le seul marqueur public par décision : sans lui, une réserve annoncée par dépêche serait
   * une adresse que rien à l'écran ne sait montrer, et le PVE ne ferait converger personne.
   * Il ne porte ni encre ni garnison — un objectif n'appartient à personne, et ce qui le tient
   * se relève comme toute force posée.
   */
  const objectives: ReadonlyArray<MapMarker> = (toggles.objectives ? view.objectives : []).map(
    (objective) => ({
      kind: 'objective' as const,
      id: `objective-${objective.id}`,
      objectiveId: objective.id,
      lonLat: objective.point,
      name: fr.objectives.names[objective.key] ?? objective.key,
      tier: fr.objectives.tiers[objectiveArchetype(objective.key)?.tier ?? ''] ?? '',
      depot: lootWords(objective.depot),
      emptied: objective.status === 'taken',
    }),
  );

  /** **Les Sept, sur la carte de tous** (P2) : à l'encre de leur teneur, aucune s'ils sont
   *  neutres ; contestés, ils le disent sans dire par qui. */
  const points: ReadonlyArray<MapMarker> = view.strategicPoints.map((point) => ({
    kind: 'strategic' as const,
    id: `strategic-${point.id}`,
    pointId: point.id,
    lonLat: point.point,
    name: fr.points.names[point.key],
    ink: point.holder === null ? null : nationInk(point.holder.nation),
    state: point.contested
      ? fr.points.contested
      : point.holder === null
        ? fr.points.neutral
        : nationLabel(point.holder.nation),
  }));

  /** Un neutre relevé encore neutre a déjà son mât, au quai : un seul marqueur par bâtiment. */
  const neutralIds = new Set(view.neutralSites.map((site) => site.id));
  const surveyed: ReadonlyArray<MapMarker> = view.surveyedInstallations
    .filter((installation) => !neutralIds.has(installation.id))
    .map((installation) => ({
      kind: 'installation' as const,
      id: `installation-${installation.id}`,
      buildingId: installation.id,
      key: installation.key,
      regionId: installation.regionId,
      lonLat: installation.point,
      name: fr.buildings[installation.key],
      washed: knownRegionById.get(installation.regionId)?.state !== 'current',
      neutral: null,
    }));
  /** **Les neutres de la Blitz se tiennent sur la carte de tous** : publics, sans garnison, ils
   *  se capturent comme un site adverse relevé, par la même rose. */
  const neutral: ReadonlyArray<MapMarker> = view.neutralSites.map((site) => ({
    kind: 'installation' as const,
    id: `installation-${site.id}`,
    buildingId: site.id,
    key: site.key,
    regionId: site.regionId,
    lonLat: site.point,
    name: fr.buildings[site.key],
    washed: false,
    neutral: { lonLat: site.point },
  }));

  if (!toggles.buildings)
    return [...deposits, ...loot, ...camps, ...objectives, ...points, ...outposts, ...stacks];
  const host = isNation(view.me.nation) ? COUNTRY_BY_NATION[view.me.nation] : null;
  const works = workSitesOf(view.me, view.buildCatalog, view.loadedAt);
  const worksOn = (point: LonLat, key: string) =>
    works.find(
      (site) =>
        site.point !== null &&
        site.point[0] === point[0] &&
        site.point[1] === point[1] &&
        site.key === key,
    ) ?? null;
  const pointOfRegion = new Map(view.me.regions.map((region) => [region.id, region.point]));
  const nameOfRegion = new Map(view.me.regions.map((region) => [region.id, region.name]));
  /** **La garnison attend comme une pile posée** (B19, B20) : le compte à rebours sur le mât,
   *  et l'étiquette de ses transports chargés — un avion ne débarque qu'à l'aérodrome. */
  const garrisonOf = (building: PlayerView['me']['buildings'][number]) => {
    const held = troopsAt(
      view.me,
      stationKeyOf({ kind: 'building', buildingId: building.id }),
      marching,
    );
    return {
      ...reloadOf(held),
      ...emplacementOf(held),
      cargo: cargoTagsOf(held, {
        afloat: false,
        atAirfield: building.key === PROJECTION_BY_DOMAIN.air,
        trace,
      }),
    };
  };
  const searcher = searcherOf(view.me.buildings);
  const standing = view.me.buildings.map((building) => ({
    kind: 'building' as const,
    id: buildingLabelId(building),
    buildingId: building.id,
    key: building.key,
    regionId: building.regionId,
    regionName: nameOfRegion.get(building.regionId) ?? building.regionId,
    lonLat: building.point,
    hostCountry: host,
    name: building.name,
    level: building.level,
    plate: buildingSprite(building.key),
    // An upgrade is work on a building that already stands: its own mast wears the pennant.
    works: worksOn(building.point, building.key),
    /** **Le seul bâtiment qui couvre du terrain**, et le seul dont le rayon décide où on le
     *  pose. Le point est celui de la région tel que le serveur le mesure, jamais celui que
     *  la couche des régions dessine — deux points, deux cercles, et l'un des deux mentirait
     *  sur ce que la station entend vraiment. */
    reach: withRangoonPile(
      view.me,
      { kind: 'building', buildingId: building.id },
      marching,
      building.point,
      reachOfStation(building.key, pointOfRegion.get(building.regionId)),
    ),
    ...garrisonOf(building),
    ...(building === searcher ? researchOnCenter(view.me) : {}),
    ink: view.me.ink,
  }));

  // A first level has no building to hang its works on: the site gets its own mast at its
  // point, from the queue on. **Une élévation d'avant-poste ne plante rien** : le point a déjà
  // son mât (précision du 15/09), et `workSitesOf` laisse ses travaux au panneau du point.
  const raising = works
    .filter((site) => site.phase !== 'raising')
    .map((site) => ({
      kind: 'building' as const,
      id: buildingLabelId(site),
      // Nothing stands: a click opens no line yet.
      buildingId: null,
      key: site.key,
      regionId: site.regionId,
      regionName: site.regionName,
      lonLat: site.point,
      hostCountry: host,
      name: fr.buildings[site.key],
      level: null,
      plate: buildingSprite(site.key),
      works: site,
      /** Rien ne se tient encore : un chantier n'entend rien. */
      reach: null,
      ink: view.me.ink,
    }));
  return [
    ...deposits,
    ...loot,
    ...camps,
    ...objectives,
    ...points,
    ...surveyed,
    ...neutral,
    ...outposts,
    ...stacks,
    ...standing,
    ...raising,
  ];
}

export function standingPilesOf(
  me: PlayerView['me'],
  markers: ReadonlyArray<MapMarker>,
  marching: ReadonlySet<string>,
  blitz: boolean,
): ReadonlyArray<StandingPile> {
  return [
    ...markers.flatMap((marker) =>
      marker.kind === 'stack'
        ? [{ id: marker.id, at: { lonLat: marker.lonLat }, pieces: marker.pieces }]
        : [],
    ),
    ...garrisonPiles(me, marching),
  ].map((pile) => withFacing(blitz ? blitzPile(pile, me.troops) : pile, me.troops));
}

export const campsOf = (markers: ReadonlyArray<MapMarker>) =>
  markers.flatMap((marker) =>
    marker.kind === 'camp'
      ? [
          {
            id: marker.id,
            lonLat: marker.lonLat,
            medium: marker.medium,
            seenAt: surveyedAt(marker),
            seenMinutesAgo: marker.seenMinutesAgo,
          },
        ]
      : [],
  );

/**
 * **Les piles posées, une carte par adresse.** Le portrait est celui du rôle majoritaire — la
 * règle du pion d'un mouvement (`movementSprite`), pour qu'une colonne ne change pas de visage
 * en s'arrêtant. Une nation sans planche pour ce rôle rend `null` et l'étiquette retombe sur
 * son pictogramme : c'est un dessin qui manque, jamais une pile qui disparaît.
 */
function postedStacks(
  me: PlayerView['me'],
  marching: ReadonlySet<string>,
  regionAt: RegionAt | null,
): ReadonlyArray<MapMarker> {
  const names = stationNames({ me });
  const posts = new Map<
    string,
    { readonly at: Extract<TroopStation, { kind: 'point' }>; readonly held: TroopView[] }
  >();
  for (const troop of me.troops) {
    const at = troop.stationedAt;
    if (marching.has(troop.id) || at.kind !== 'point') continue;
    const key = stationKeyOf(at);
    const post = posts.get(key);
    if (post === undefined) posts.set(key, { at, held: [troop] });
    else post.held.push(troop);
  }

  return [...posts.values()].map(({ at, held }) => {
    const stack = stackOf(held);
    return {
      kind: 'stack' as const,
      id: stackLabelId(at),
      lonLat: at.lonLat,
      station: at,
      stack,
      place: pilePlace(at, names, regionAt),
      pieces: pilePieces(held),
      cargo: cargoTagsOf(held, { afloat: at.afloat, atAirfield: false }),
      ink: me.ink,
      supplies: pileSupplies(held),
      ...(isRangoonColumn(held, (troop) => troop.tour?.veiled === true)
        ? { reach: rangoonReachOf(at.lonLat) }
        : {}),
      ...reloadOf(held),
      ...emplacementOf(held),
    };
  });
}

/** **La carte que cherche mon Centre de recherche** (#123) : son nom et sa barre sur son mât. */
function researchOnCenter(me: PlayerView['me']): {
  research?: Extract<LabelLine, { role: 'research' }>;
} {
  const running = me.research.running;
  if (running === null) return {};
  const { share, finishesAt } = researchProgressOf(running, Date.now());
  return {
    research: {
      role: 'research',
      text: fr.research.onCenter(cardName(running.card)),
      since: (finishesAt ?? Date.now()) - (running.totalMs ?? researchMs(running.card)),
      dueAt: finishesAt,
      share,
    },
  };
}

/** **L'artillerie** (B20) : la pile est en batterie quand sa dernière pièce posée l'est. */
function emplacementOf(held: ReadonlyArray<TroopView>): { emplacedAt?: number } {
  const at = Math.max(0, ...held.map((troop) => troop.emplacedAt ?? 0));
  return at > Date.now() ? { emplacedAt: at } : {};
}

/** **Blitz** (B19) : la pile recharge tant que sa dernière troupe à avoir frappé recharge. */
function reloadOf(held: ReadonlyArray<TroopView>): { reloadUntil?: number } {
  const until = Math.max(0, ...held.map((troop) => troop.reloadUntil ?? 0));
  return until > Date.now() ? { reloadUntil: until } : {};
}

/**
 * **Les garnisons de mes bâtiments et de mes avant-postes** (ADR 0026 §5). Mes troupes
 * seulement : la garnison d'un autre ne sort jamais du serveur. Un bâtiment se garnit au pied de
 * sa maquette, et n'en porte aucune quand elle n'est pas debout — chantier, bâtiments masqués ;
 * un avant-poste n'a pas de maquette, sa garnison se dresse à son point, chantier compris.
 */
function garrisonPiles(
  me: PlayerView['me'],
  marching: ReadonlySet<string>,
): ReadonlyArray<StandingPile> {
  const pile = (
    station: TroopStation,
    at: StandingPile['at'],
    label?: string,
  ): ReadonlyArray<StandingPile> => {
    // The station's key, as `holding` names the pile a hand was taken from.
    const id = stationKeyOf(station);
    const troops = troopsAt(me, id, marching);
    return troops.length === 0
      ? []
      : [{ id, ...(label === undefined ? {} : { label }), at, pieces: pilePieces(troops) }];
  };
  return [
    ...me.buildings.flatMap((building) =>
      pile(
        { kind: 'building', buildingId: building.id },
        building.key === PROJECTION_BY_DOMAIN.sea
          ? { beside: buildingLabelId(building), quay: building.point }
          : { beside: buildingLabelId(building) },
      ),
    ),
    ...me.outposts.flatMap((outpost) =>
      pile(
        { kind: 'outpost', outpostId: outpost.id },
        { lonLat: outpost.lonLat },
        outpostPinId(outpost.id),
      ),
    ),
  ];
}

/**
 * **Ce que chacun de mes mouvements de terre montre sur la route** (#276), par son id : ses
 * troupes de terre comme au repos — en Mondiale la pile (`pilePieces`), en Blitz ses unités —,
 * dans le même ordre. Rien pour ce qui n'est pas à moi : la file ne se lit que sur mes troupes.
 */
export function marchingPiecesOf(
  arcs: ReadonlyArray<ArcView>,
  troops: ReadonlyArray<TroopView>,
  blitz: boolean,
): ReadonlyMap<string, PilePieces> {
  return new Map(
    arcs.flatMap((arc) => {
      if (arc.state !== 'mine' || !arc.route.legs.some(({ medium }) => medium === 'land'))
        return [];
      const carried = new Set(arc.troopIds);
      const walking = troops.filter(
        (troop) => carried.has(troop.id) && DOMAIN_BY_ROLE[troop.role] === 'land',
      );
      return walking.length === 0
        ? []
        : [[arc.id, blitz ? unitPieces(walking) : pilePieces(walking)] as const];
    }),
  );
}

/** **Le cap de la pile** (#362) : celui de ses troupes, qu'une arrivée leur donne à toutes ; une
 *  pile de point seulement — une garnison d'avant-poste pend à son étiquette et ne se tourne pas. */
function withFacing(pile: StandingPile, troops: ReadonlyArray<TroopView>): StandingPile {
  if (!('lonLat' in pile.at) || pile.label !== undefined) return pile;
  const here = new Set(pile.pieces.troopIds);
  const facing = troops.find((troop) => here.has(troop.id) && troop.facing !== undefined)?.facing;
  return facing === undefined ? pile : { ...pile, facing };
}

function blitzPile(pile: StandingPile, troops: ReadonlyArray<TroopView>): StandingPile {
  const here = new Set(pile.pieces.troopIds);
  return { ...pile, pieces: unitPieces(troops.filter((troop) => here.has(troop.id))) };
}

/** Le mât d'un bâtiment, et la maquette qui le remplace au rapproché — par son point (ADR 0029) :
 *  deux mines d'une même région sont deux mâts. */
export const buildingLabelId = ({ key, point }: { key: string; point: LonLat | null }): string =>
  point === null ? `building-${key}` : `building-${key}@${point[0]},${point[1]}`;

/** **Les maquettes rasées que la vue sert encore** (#326) : la carte joue l'affaissement de celle
 *  que la vue perd, puis l'id s'oublie. La même liste quand rien n'est parti. */
export const razingStill = (
  razing: ReadonlyArray<string>,
  buildings: ReadonlyArray<{ key: string; point: LonLat | null }>,
): ReadonlyArray<string> => {
  const served = new Set(buildings.map(buildingLabelId));
  return razing.every((id) => served.has(id)) ? razing : razing.filter((id) => served.has(id));
};

/** **Les points confirmés au démantèlement que la vue sert encore** (#340), par id : la carte
 *  joue la chute de celui que la vue perd, puis l'id s'oublie. */
export const leavingStill = <T extends { readonly id: string }>(
  leaving: ReadonlyArray<T>,
  outposts: ReadonlyArray<{ readonly id: string }>,
): ReadonlyArray<T> => {
  const served = new Set(outposts.map(({ id }) => id));
  return leaving.every(({ id }) => served.has(id))
    ? leaving
    : leaving.filter(({ id }) => served.has(id));
};

/** La maquette sous un point de l'écran, par l'id de son étiquette (`MapEngine.maquetteAtPoint`). */
export type MaquetteAt = (clientX: number, clientY: number) => string | null;

/** Mes bâtiments que nomme la maquette sous la main (`MapEngine.maquetteAtPoint`) : la
 *  maquette est ce que le joueur vise, son mât est replié (#205). */
export const buildingsOfMaquette = <B extends { key: string; point: LonLat | null }>(
  buildings: ReadonlyArray<B>,
  labelId: string | null,
): B[] => buildings.filter((building) => buildingLabelId(building) === labelId);

export const stackOf = (troops: ReadonlyArray<TroopView>): Stack =>
  troops.reduce<Stack>(
    (counted, troop) => ({ ...counted, [troop.role]: (counted[troop.role] ?? 0) + 1 }),
    {},
  );

/** Where a station stands on the board, as the label layer names it. A building answers with
 *  its mast and an outpost with its own marker; a **point** has none — the camera then holds
 *  still rather than flying somewhere approximate. */
export function markerOfStation(
  view: Pick<PlayerView, 'me'>,
  station: TroopStation,
): string | null {
  /** Une pile posée a désormais son marqueur : la caméra a où aller quand on ouvre sa carte. */
  if (station.kind === 'point') return stackLabelId(station);
  if (station.kind === 'outpost') {
    return view.me.outposts.some((candidate) => candidate.id === station.outpostId)
      ? outpostPinId(station.outpostId)
      : null;
  }
  if (station.kind !== 'building') return null;
  const building = view.me.buildings.find((candidate) => candidate.id === station.buildingId);
  return building === undefined ? null : buildingLabelId(building);
}
