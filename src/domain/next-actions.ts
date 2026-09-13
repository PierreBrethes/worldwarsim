import { fr } from '@/i18n/fr';
import { produces } from './economy';
import type { LonLat } from './geo';
import type { PlayerView, TroopStation, TroopView } from './player-view';
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
  | 'foundation'
  | 'idleSite'
  | 'idleBarracks'
  | 'unlinkedSites'
  | 'troopWithoutOrder'
  | 'unsupplied'
  | 'freeSlot';

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
  | { readonly kind: 'unfold' };

export type NextAction = {
  /** Stable d'un rendu à l'autre : c'est la clé de la ligne et ce sur quoi le dépli se retient. */
  readonly id: string;
  readonly kind: NextActionKind;
  readonly label: string;
  readonly target: NextActionTarget;
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
    ...foundationLine(view),
    ...unlinkedSitesLine(view),
    ...idleSiteLine(view),
    ...idleProjectionLines(view),
    ...troopsWithoutOrder(view, standing, names),
    ...unsuppliedTroops(view, standing, names),
    ...freeSlotLine(view, standing),
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
          target: { kind: 'unfold' },
        },
      ];

/**
 * **Ce que la carte vient de couper** (ADR 0020 §6). Une seule ligne pour tous les sites : ils
 * sont coupés par la même chose — une région qui a changé de couleur — et une ligne par bâtiment
 * ferait de la perte d'une frontière une liste de six attentes distinctes. Elle passe juste
 * derrière la fondation : c'est le seul poste où le joueur perd sans avoir rien fait, et il ne
 * se répare pas sur le site mais sur la carte.
 *
 * Elle mène au premier, comme une caserne au repos mène à la sienne — même grammaire, même
 * geste : la carte recadre le mât et la modale s'ouvre.
 */
function unlinkedSitesLine(view: PlayerView): ReadonlyArray<NextAction> {
  const cut = unlinkedProducers(view);
  const first = cut[0];
  if (first === undefined) return [];
  return [
    {
      id: 'unlinkedSites',
      kind: 'unlinkedSites',
      label: fr.nextActions.unlinkedSites(cut.length),
      target: { kind: 'site', buildingId: first.id },
    },
  ];
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
          target: { kind: 'surface', surface: 'economy' },
        },
      ];

/** Chaque bâtiment de projection tient sa propre file (ADR 0015) : une caserne au repos pendant
 *  qu'une autre forme est une ligne, pas une nuance d'une ligne nationale. */
function idleProjectionLines(view: PlayerView): ReadonlyArray<NextAction> {
  const regions = new Map(view.me.regions.map((region) => [region.id, region.name]));

  return view.me.buildings
    .filter(
      (building) => PROJECTION_KEYS.has(building.key) && !view.me.recruiting.includes(building.id),
    )
    .map((building) => ({
      id: `idleBarracks:${building.id}`,
      kind: 'idleBarracks' as const,
      label: fr.nextActions.idleProjection(
        fr.buildings[building.key],
        regions.get(building.regionId) ?? building.name,
      ),
      target: { kind: 'site' as const, buildingId: building.id },
    }));
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
  byStation(
    standing.filter((troop) => troop.stationedAt.kind === 'point'),
    view,
  ).map(({ station, count, point }) => ({
    id: `troopWithoutOrder:${stationKeyOf(station)}`,
    kind: 'troopWithoutOrder' as const,
    label: fr.nextActions.troopWithoutOrder(count, names.place(station)),
    target: { kind: 'map' as const, point },
  }));

const unsuppliedTroops = (
  view: PlayerView,
  standing: ReadonlyArray<TroopView>,
  names: StationNames,
): ReadonlyArray<NextAction> =>
  byStation(
    standing.filter((troop) => !troop.supplied),
    view,
  ).map(({ station, count, point }) => ({
    id: `unsupplied:${stationKeyOf(station)}`,
    kind: 'unsupplied' as const,
    label: fr.nextActions.unsupplied(count, names.place(station)),
    target: { kind: 'map' as const, point },
  }));

/**
 * Un slot libre n'est une attente que s'il y a de quoi le remplir : sans une troupe posée, la
 * ligne dirait au joueur d'ouvrir une porte qu'aucun geste ne franchit. `home` n'est pas une
 * adresse d'où l'on part (ADR 0019 §1).
 */
function freeSlotLine(
  view: PlayerView,
  standing: ReadonlyArray<TroopView>,
): ReadonlyArray<NextAction> {
  const free = view.me.slots.total - view.me.slots.used;
  const departing = standing.find((troop) => troop.stationedAt.kind !== 'home');
  if (free <= 0 || departing === undefined) return [];

  return [
    {
      id: 'freeSlot',
      kind: 'freeSlot',
      label: fr.nextActions.freeSlot(free),
      target: { kind: 'map', point: pointOfStation(view, departing.stationedAt) },
    },
  ];
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
