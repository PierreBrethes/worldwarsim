import { fr } from '@/i18n/fr';
import { asClockTime } from './duration';
import { captureSiteName } from './labels';
import { outpostRaiseHold, pledgedOutposts, slotsOn } from './construction';
import { produces } from './economy';
import { BLITZ_SHARE } from '../../convex/constants';
import { playedTheatre, theatreKm } from './theatres';
import { rolesFormedBy } from './blitz';
import type { BuildingKey, ResourceKey } from './ids';
import { distanceKm, type LonLat } from './geo';
import { currentStock, type PlayerView, type TroopStation, type TroopView } from './player-view';
import { PROJECTION_BY_DOMAIN, marchingTroopIds, stationKeyOf } from './troops';
import { stationNames, type StationNames } from './station-name';

/**
 * **Ce qui a une position ne vit pas dans un panneau** (décision Pierre, 30/08). Le widget de
 * troupes était l'inventaire de ce que la carte montrait déjà ; ce qui reste à un panneau, c'est
 * ce que la carte ne peut pas dire — *ce qui attend le joueur*. Une ligne par attente, et
 * chacune mène là où on la lève : la carte, ou la surface qui la commande.
 *
 * La liste est **dérivée de la vue et de rien d'autre** : aucune ligne ne se coche, aucune ne se
 * range. Une attente disparaît parce qu'elle a été levée, jamais parce qu'on l'a fermée — c'est
 * ce qui interdit à cette carte de devenir une seconde liste de tâches à tenir à jour.
 */
export type NextActionKind =
  /** Un de mes sites se fait capturer : la seule attente qui ait une heure de perte (14/10). */
  | 'siteUnderCapture'
  | 'captureStopped'
  | 'foundation'
  | 'idleSite'
  | 'idleProjection'
  | 'unlinkedSites'
  | 'raiseOutpost'
  | 'troopWithoutOrder'
  | 'unsupplied'
  /** Une ville neutre à portée, en Blitz : elle verse des fonds à qui la capture. */
  | 'neutralCity';

/** Une seule surface reste une destination de rail : la fenêtre Production est morte avec son
 *  onglet (59a), et ce qui la remplaçait est une modale ancrée à un bâtiment de la carte. */
export type NextActionSurface = 'economy';

/**
 * Où la ligne mène. `unfold` est la fondation et elle seule : elle ne mène nulle part parce que
 * le geste se fait **dans la ligne** — on y clique une clé, la carte allume le sol, on clique la
 * région. C'est une troisième sorte plutôt qu'une cible nulle, pour que le compilateur oblige la
 * carte à en dire quelque chose.
 */
export type NextActionTarget =
  | { readonly kind: 'map'; readonly point: LonLat }
  | { readonly kind: 'surface'; readonly surface: NextActionSurface }
  /** Un site de production : la carte se recentre sur son mât **et** sa modale s'ouvre — une
   *  seule destination, celle du clic gauche (59a, 61a). Le point n'est pas porté ici : le
   *  plateau sait cadrer un bâtiment par son marqueur, et un second point diverge. */
  | { readonly kind: 'site'; readonly buildingId: string }
  /** Un avant-poste : la carte recadre son mât **et** son panneau de garnison s'ouvre — la porte
   *  de l'élévation est là et nulle part ailleurs (précision du 15/09). Même grammaire que
   *  `site`, pour une adresse qui n'est pas un bâtiment. */
  | { readonly kind: 'outpost'; readonly outpostId: string }
  | { readonly kind: 'unfold' };

export type NextAction = {
  /** Stable d'un rendu à l'autre : c'est la clé de la ligne, ce sur quoi le dépli se retient et
   *  ce sous quoi l'interface garde son rang. Une sorte d'attente, un seul `id`. */
  readonly id: string;
  readonly kind: NextActionKind;
  readonly label: string;
  /** **Une ligne par sorte, une cible par occurrence** (décision Pierre, 05/10) : dans l'ordre
   *  de la vue, jamais retriées. Le domaine les décrit, c'est l'interface qui les parcourt. */
  readonly targets: readonly [NextActionTarget, ...NextActionTarget[]];
};

const lineOf = (
  kind: NextActionKind,
  label: string,
  targets: ReadonlyArray<NextActionTarget>,
): ReadonlyArray<NextAction> => {
  const [first, ...rest] = targets;
  return first === undefined ? [] : [{ id: kind, kind, label, targets: [first, ...rest] }];
};

const PROJECTION_KEYS: ReadonlySet<string> = new Set(Object.values(PROJECTION_BY_DOMAIN));

/**
 * **Les attentes du joueur, dans l'ordre où on les lève.** La fondation d'abord — elle est
 * offerte et elle périme le reste tant qu'elle traîne — puis ce qui produit, puis ce qui se
 * tient sur le terrain. Une liste vide est le cas normal d'une partie tenue, et la carte n'a
 * alors pas d'état fermé : elle n'existe pas.
 */
export function nextActionsOf(view: PlayerView): ReadonlyArray<NextAction> {
  /** **Rien n'attend un observateur** (décision du 31/08). La carte n'a pas d'état fermé — son
   *  absence *est* l'état fermé — et c'est exactement ce qu'on doit à un joueur qui a déposé les
   *  armes : pas une liste grisée de ce qu'il ne fera plus. */
  if (view.me.defeated) return [];
  /** Une saison conclue se relit : rien n'y attend plus personne. */
  if (view.season.reduction.concludedAt !== null) return [];
  /**
   * **Tant que le quartier général est dû, il est la seule chose qui attende** (décision 1b du
   * 13/09). Rien d'autre ne se bâtit avant lui (`HQ_FIRST`), donc « chantier libre — rien en
   * file » mènerait à une surface où le joueur ne peut rien commander : une attente qu'on ne
   * peut pas lever n'est pas une attente, c'est un reproche.
   */
  if (view.me.hqLevel === 0) return foundationLine(view);
  const names = stationNames(view);
  const marching = marchingTroopIds(view.arcs);
  const standing = view.me.troops.filter((troop) => !marching.has(troop.id));

  return [
    ...captureLines(view),
    ...foundationLine(view),
    ...unlinkedSitesLine(view),
    ...raiseOutpostLine(view),
    ...(view.mode === 'blitz' ? [] : idleSiteLine(view)),
    ...idleProjectionLine(view),
    ...(view.mode === 'blitz' ? neutralCityLine(view) : []),
    ...troopsWithoutOrder(view, standing, names),
    ...unsuppliedTroops(view, standing, names),
  ];
}

/**
 * **Une capture qui m'attend** : en tête, le site que je suis en train de perdre et l'heure où il
 * part — la ligne recentre sur lui ; plus bas, celle que mon infanterie a lâchée, à relancer.
 * Celle qui court chez moi n'attend rien de moi : elle se lit sur la carte.
 */
function captureLines(view: PlayerView): ReadonlyArray<NextAction> {
  const threatened = view.captures.filter((capture) => capture.side === 'defender');
  const stopped = view.captures.filter(
    (capture) => capture.side === 'capturer' && capture.stoppedAt !== null,
  );
  const [one] = threatened;
  const [dropped] = stopped;
  return [
    ...lineOf(
      'siteUnderCapture',
      threatened.length === 1 && one !== undefined
        ? fr.nextActions.siteUnderCapture(captureSiteName(one), asClockTime(one.completesAt))
        : fr.nextActions.sitesUnderCapture(threatened.length),
      threatened.map((capture) => ({ kind: 'map', point: capture.point })),
    ),
    ...lineOf(
      'captureStopped',
      stopped.length === 1 && dropped !== undefined
        ? fr.nextActions.captureStopped(captureSiteName(dropped))
        : fr.nextActions.capturesStopped(stopped.length),
      stopped.map((capture) => ({ kind: 'map', point: capture.point })),
    ),
  ];
}

const foundationLine = (view: PlayerView): ReadonlyArray<NextAction> =>
  view.me.foundation.length === 0
    ? []
    : [
        {
          id: 'foundation',
          kind: 'foundation',
          label: fr.nextActions.foundation(view.me.foundation.length),
          targets: [{ kind: 'unfold' }],
        },
      ];

/**
 * **Ce que la carte vient de couper** (ADR 0020 §6). Une seule ligne pour tous les sites : ils
 * sont coupés par la même chose — une région qui a changé de couleur — et une ligne par bâtiment
 * ferait de la perte d'une frontière une liste de six attentes distinctes. Elle passe juste
 * derrière la fondation : c'est le seul poste où le joueur perd sans avoir rien fait, et il ne
 * se répare pas sur le site mais sur la carte.
 *
 * Elle parcourt les sites coupés, comme une caserne au repos mène à la sienne — même grammaire,
 * même geste : la carte recadre le mât et la modale s'ouvre.
 */
function unlinkedSitesLine(view: PlayerView): ReadonlyArray<NextAction> {
  const cut = unlinkedProducers(view);
  return lineOf(
    'unlinkedSites',
    fr.nextActions.unlinkedSites(cut.length),
    cut.map((building) => ({ kind: 'site', buildingId: building.id })),
  );
}

/**
 * **Les bâtiments qui produisent et dont la région n'est plus tenue.** Servi par la vue et non
 * recalculé : `regions[].linked` est la couleur que la carte peint, et une seconde lecture ici
 * ferait diverger la ligne du lavis.
 */
export function unlinkedProducers(
  view: PlayerView,
): ReadonlyArray<PlayerView['me']['buildings'][number]> {
  const cut = new Set(
    view.me.regions.filter((region) => !region.linked).map((region) => region.id),
  );
  return view.me.buildings.filter(
    (building) => produces(building.key) && cut.has(building.regionId),
  );
}

/**
 * **Un avant-poste plein qu'on a de quoi monter** (précision du 15/09 de l'ADR 0020 §10). C'est
 * la seule attente que le jeu promettait déjà par écrit — « améliorez-le pour en ouvrir un de
 * plus » — sans qu'aucun geste ne la lève : le texte promettait, le jeu ne tenait pas.
 *
 * Deux conditions, et elles sont celles de la promesse : le point est **plein** (sinon il n'y a
 * rien à ouvrir) et rien ne retient l'élévation — `outpostRaiseHold`, la même fonction que le
 * bouton et la mutation. Le prix vient de la vue, jamais d'un barème recopié ici.
 */
function raiseOutpostLine(view: PlayerView): ReadonlyArray<NextAction> {
  const queued = pledgedOutposts(view);
  const stocks = Object.fromEntries(
    Object.entries(view.me.resources).map(([key, resource]) => [
      key,
      currentStock(resource, view.loadedAt, view.loadedAt),
    ]),
  ) as Record<ResourceKey, number>;

  const ready = view.me.outposts.filter((outpost) => {
    /** **Attendre n'est pas un problème** : un chantier n'a rien à élever et rien à décider,
     *  la carte se tait (révision du 15/09 de l'ADR 0020 §10). */
    if (!outpost.isMine || outpost.atMaxLevel || outpost.standsAt !== null) return false;
    const budget = slotsOn(view, { outpostId: outpost.id });
    if (budget.taken < budget.total) return false;
    return (
      outpostRaiseHold(
        {
          level: outpost.level,
          disabled: outpost.disabledMinutesLeft !== null,
          queued: queued.has(outpost.id),
          stocks,
        },
        outpost.nextLevelCost,
        outpost.level + 1,
      ) === null
    );
  });
  const [only, ...others] = ready;
  if (only === undefined) return [];
  return lineOf(
    'raiseOutpost',
    others.length === 0
      ? fr.nextActions.raiseOutpost(
          view.me.regions.find((region) => region.id === only.regionId)?.name ?? only.hostCountry,
        )
      : fr.nextActions.raiseOutposts(ready.length),
    ready.map((outpost) => ({ kind: 'outpost', outpostId: outpost.id })),
  );
}

/** La tête de file est la seule entrée datée : sans elle, rien ne se bâtit, quelle que soit la
 *  longueur de ce qui attend derrière — il n'y a rien derrière. */
const idleSiteLine = (view: PlayerView): ReadonlyArray<NextAction> =>
  view.me.construction !== null
    ? []
    : [
        {
          id: 'idleSite',
          kind: 'idleSite',
          label: fr.nextActions.idleSite,
          targets: [{ kind: 'surface', surface: 'economy' }],
        },
      ];

/** Chaque bâtiment de projection tient sa propre file (ADR 0015) : un par lieu à parcourir, mais
 *  une seule ligne — ce sont des casernes, des aérodromes et des ports qui attendent la même
 *  chose, un lot. */
function idleProjectionLine(view: PlayerView): ReadonlyArray<NextAction> {
  const regions = new Map(view.me.regions.map((region) => [region.id, region.name]));
  /** En Blitz le QG forme aussi — l'infanterie (`rolesFormedBy`). */
  const forms = (key: BuildingKey) =>
    view.mode === 'blitz' ? rolesFormedBy(key).length > 0 : PROJECTION_KEYS.has(key);
  /** **En Blitz on ne recrute que dans un bâtiment libre** (U6) : celui qu'une des miennes tient
   *  n'attend rien. */
  const marching = marchingTroopIds(view.arcs);
  const held = new Set(
    view.mode === 'blitz'
      ? view.me.troops.flatMap((troop) =>
          troop.stationedAt.kind === 'building' && !marching.has(troop.id)
            ? [troop.stationedAt.buildingId]
            : [],
        )
      : [],
  );
  const idle = view.me.buildings.filter(
    (building) =>
      forms(building.key) && !view.me.recruiting.includes(building.id) && !held.has(building.id),
  );
  const [only] = idle;
  if (only === undefined) return [];

  return lineOf(
    'idleProjection',
    idle.length === 1
      ? fr.nextActions.idleProjection(
          fr.buildings[only.key],
          regions.get(only.regionId) ?? only.name,
        )
      : fr.nextActions.idleProjections(idle.length),
    idle.map((building) => ({ kind: 'site', buildingId: building.id })),
  );
}

/**
 * **Les villes neutres à portée** (Blitz) : à moins de `BLITZ_SHARE.nearCity` du théâtre d'un de mes bâtiments,
 * la plus proche d'abord. C'est la première chose qu'une Blitz demande — une ville verse des fonds
 * à qui la capture, et personne ne la garde.
 */
function neutralCityLine(view: PlayerView): ReadonlyArray<NextAction> {
  /** Le point d'un bâtiment n'est servi que pour un port : les autres se tiennent à leur région. */
  const regions = new Map(view.me.regions.map((region) => [region.id, region.point]));
  const mine = view.me.buildings.flatMap((building) => {
    const point = building.point ?? regions.get(building.regionId);
    return point === undefined ? [] : [point];
  });
  const reach = (point: LonLat) => Math.min(...mine.map((own) => distanceKm(own, point)));
  const theatre = playedTheatre(view);
  const nearKm = theatre === null ? 0 : theatreKm(theatre, BLITZ_SHARE.nearCity);
  const near = view.neutralSites
    .filter((site) => site.key === 'city' && reach(site.point) <= nearKm)
    .sort((left, right) => reach(left.point) - reach(right.point));
  return lineOf(
    'neutralCity',
    fr.nextActions.neutralCities(near.length),
    near.map((site) => ({ kind: 'map', point: site.point })),
  );
}

/**
 * **Une troupe posée sur la carte n'a rien à faire d'autre que partir.** En garnison ou dans un
 * avant-poste elle tient quelque chose — c'est ce qu'une attaque trouve debout, et ce n'est pas
 * une attente. Laissée sur un point, elle n'a pas d'ordre, et c'est la seule adresse dont ce
 * soit vrai.
 */
const troopsWithoutOrder = (
  view: PlayerView,
  standing: ReadonlyArray<TroopView>,
  names: StationNames,
): ReadonlyArray<NextAction> =>
  stationLine(
    'troopWithoutOrder',
    fr.nextActions.troopWithoutOrder,
    names,
    view,
    standing,
    (troop) => troop.stationedAt.kind === 'point' && !capturesFrom(view, troop.stationedAt),
  );

/** A troop that is capturing where it stands is working, not idle. */
const capturesFrom = (view: PlayerView, station: Extract<TroopStation, { kind: 'point' }>) =>
  view.captures.some(
    (capture) =>
      capture.side === 'capturer' &&
      capture.stoppedAt === null &&
      capture.point[0] === station.lonLat[0] &&
      capture.point[1] === station.lonLat[1],
  );

const unsuppliedTroops = (
  view: PlayerView,
  standing: ReadonlyArray<TroopView>,
  names: StationNames,
): ReadonlyArray<NextAction> =>
  stationLine(
    'unsupplied',
    fr.nextActions.unsupplied,
    names,
    view,
    standing,
    (troop) => !troop.supplied,
  );

/**
 * Le libellé compte les **troupes**, le rang les **adresses** : à une seule adresse la ligne
 * garde son lieu en toutes lettres, à plusieurs elle ne donne que le total.
 */
function stationLine(
  kind: 'troopWithoutOrder' | 'unsupplied',
  label: (count: number, place: string | null) => string,
  names: StationNames,
  view: PlayerView,
  standing: ReadonlyArray<TroopView>,
  keep: (troop: TroopView) => boolean,
): ReadonlyArray<NextAction> {
  const stations = byStation(standing.filter(keep), view);
  const [only] = stations;
  if (only === undefined) return [];
  const total = stations.reduce((sum, station) => sum + station.count, 0);

  return lineOf(
    kind,
    label(total, stations.length === 1 ? names.place(only.station) : null),
    stations.map(({ point }) => ({ kind: 'map', point })),
  );
}

type StationCount = {
  readonly station: TroopStation;
  readonly count: number;
  readonly point: LonLat;
};

/** Une adresse, une ligne : deux fantassins laissés au même endroit sont une attente, pas deux. */
function byStation(
  troops: ReadonlyArray<TroopView>,
  view: PlayerView,
): ReadonlyArray<StationCount> {
  const counts = new Map<string, StationCount>();

  for (const troop of troops) {
    const key = stationKeyOf(troop.stationedAt);
    const held = counts.get(key);
    counts.set(key, {
      station: held?.station ?? troop.stationedAt,
      count: (held?.count ?? 0) + 1,
      point: held?.point ?? pointOfStation(view, troop.stationedAt),
    });
  }

  return [...counts.values()];
}

/**
 * Où la caméra va quand la ligne est cliquée. Un bâtiment répond par le point de sa région —
 * celui que toute règle du jeu mesure, jamais le centroïde du polygone — et une adresse que la
 * vue ne porte plus retombe sur le foyer, qui est toujours quelque part.
 */
function pointOfStation(view: PlayerView, station: TroopStation): LonLat {
  if (station.kind === 'point') return station.lonLat;
  if (station.kind === 'outpost') {
    const outpost = view.me.outposts.find((candidate) => candidate.id === station.outpostId);
    return outpost?.lonLat ?? view.me.homePosition;
  }
  if (station.kind === 'building') {
    const building = view.me.buildings.find((candidate) => candidate.id === station.buildingId);
    const region = view.me.regions.find((candidate) => candidate.id === building?.regionId);
    return region?.point ?? view.me.homePosition;
  }
  return view.me.homePosition;
}
