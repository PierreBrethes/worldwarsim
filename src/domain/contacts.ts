import { detectionRangeOf } from '../../convex/constants';
import { fr } from '@/i18n/fr';
import type { City } from './atlas';
import { buildingLabelId } from './building-label-id';
import { stackLabelId } from './force-highlight';
import { bearingDegrees, distanceKm, type LonLat } from './geo';
import type { UnitRole } from './ids';
import type { PlayerView } from './player-view';
import { campPinId, outpostPinId } from './pins';
import { playedTheatre } from './theatres';
import { marchingTroopIds, stationKeyOf, stationPointOf } from './troops';

/**
 * **Un accrochage** (#441) : mes forces posées et ce que j'ai relevé à portée de leur détection,
 * réunis tant que l'un touche l'autre. Une lecture de la carte, pas un combat.
 */
export type Contact = {
  readonly number: number;
  /** What it gathers: the same pieces, the same contact, whatever the numbers became. */
  readonly key: string;
  /** The pins of my stations, then of the camps. */
  readonly pinIds: ReadonlyArray<string>;
  readonly points: ReadonlyArray<LonLat>;
  readonly troops: number;
  readonly seen: number;
  /** Its latest sighting: the hour its cartouche says. */
  readonly latest: number;
  readonly name: string;
  /** The city alone, for a phone's cartouche. */
  readonly city: string;
};

/** Closer than this to its city, a contact stands « devant » it.
 *  @a-mesurer la maquette C le pose à 0,35 unité, environ 30 km */
const BEFORE_CITY_KM = 30;

type Node = { readonly pinId: string; readonly at: LonLat };

type Station = Node & {
  readonly roles: UnitRole[];
  readonly rangeKm: number;
  /** Only a pile at a point is turned (`contactFacingsOf`): a garrison hangs from its site. */
  readonly standing: boolean;
};

/**
 * **L'appariement** (#441, #641), la seule lecture de ce que mes forces touchent : mes stations
 * et les camps encore en vue, appariés par la distance dans la portée de détection de la station
 * (`detectionRangeOf`, celle du serveur), sans regard au milieu. `touching[c]` : les stations
 * qui touchent le camp `c`. L'accrochage dessiné et le cap d'une pile parlent des mêmes camps.
 */
export function pairingOf(
  view: Pick<PlayerView, 'me' | 'camps' | 'arcs' | 'mode' | 'theatre'>,
) {
  const theatre = playedTheatre(view);
  const marching = marchingTroopIds(view.arcs);
  const stations = new Map<string, Omit<Station, 'rangeKm'>>();
  for (const troop of view.me.troops) {
    const station = troop.stationedAt;
    if (marching.has(troop.id) || station.kind === 'home') continue;
    const key = stationKeyOf(station);
    const held = stations.get(key);
    if (held !== undefined) {
      held.roles.push(troop.role);
      continue;
    }
    const at = stationPointOf(view.me, station);
    if (at === null) continue;
    const pinId =
      station.kind === 'point'
        ? stackLabelId(station)
        : station.kind === 'outpost'
          ? outpostPinId(station.outpostId)
          : buildingLabelId(view.me.buildings.find(({ id }) => id === station.buildingId)!);
    stations.set(key, { pinId, at, roles: [troop.role], standing: station.kind === 'point' });
  }
  const mine: Station[] = [...stations.values()].map((station) => ({
    ...station,
    rangeKm: detectionRangeOf(station.roles, theatre),
  }));
  const camps = view.camps.filter((camp) => !camp.lastKnown);

  const touching = camps.map((camp) =>
    mine.flatMap((station, k) =>
      distanceKm(station.at, camp.point) <= station.rangeKm ? [k] : [],
    ),
  );
  return { mine, camps, touching };
}

/**
 * **Le cap de contact** (#641) : la pile posée en un point se tourne vers le camp relevé le plus
 * proche de ceux qui sont à portée de sa détection ; à égale distance, le plus petit `id`, pour
 * que le cap ne flotte pas d'une vue à l'autre. En degrés depuis le nord, comme `facing`, par
 * identifiant d'étiquette de la pile ; une pile sans camp à portée n'y est pas.
 */
export function contactFacingsOf(
  view: Pick<PlayerView, 'me' | 'camps' | 'arcs' | 'mode' | 'theatre'>,
  pairing: ReturnType<typeof pairingOf> = pairingOf(view),
): ReadonlyMap<string, number> {
  const { mine, camps, touching } = pairing;
  const best = new Map<number, { km: number; id: string; point: LonLat }>();
  camps.forEach((camp, c) => {
    for (const k of touching[c]!) {
      if (!mine[k]!.standing) continue;
      const km = distanceKm(mine[k]!.at, camp.point);
      const held = best.get(k);
      if (held === undefined || km < held.km || (km === held.km && camp.id < held.id))
        best.set(k, { km, id: camp.id, point: camp.point });
    }
  });
  return new Map(
    [...best].map(([k, { point }]) => [mine[k]!.pinId, bearingDegrees(mine[k]!.at, point)]),
  );
}

/**
 * My stations — piles posted, garrisons of outposts and buildings, counted from the troops that
 * stand there — and the camps still in sight, paired (`pairingOf`), then gathered into connected
 * pieces. Sites, foreign outposts and movements, mine or theirs, never touch.
 */
export function contactsOf(
  view: Pick<PlayerView, 'me' | 'camps' | 'arcs' | 'mode' | 'theatre'>,
  cities: ReadonlyArray<City>,
  pairing: ReturnType<typeof pairingOf> = pairingOf(view),
): ReadonlyArray<Contact> {
  const { mine, camps, touching } = pairing;
  const pieces: Array<{ mine: Set<number>; camps: Set<number> }> = [];
  const pieceOfStation = new Map<number, (typeof pieces)[number]>();
  camps.forEach((_, c) => {
    if (touching[c]!.length === 0) return;
    const joined = [...new Set(touching[c]!.flatMap((k) => pieceOfStation.get(k) ?? []))];
    const piece = joined[0] ?? { mine: new Set<number>(), camps: new Set<number>() };
    if (joined.length === 0) pieces.push(piece);
    for (const other of joined.slice(1)) {
      for (const k of other.mine) piece.mine.add(k);
      for (const k of other.camps) piece.camps.add(k);
      pieces.splice(pieces.indexOf(other), 1);
    }
    piece.camps.add(c);
    for (const k of touching[c]!) piece.mine.add(k);
    for (const k of piece.mine) pieceOfStation.set(k, piece);
  });

  return pieces
    .map((piece) => {
      const stood = [...piece.mine].sort((a, b) => a - b).map((k) => mine[k]!);
      const seen = [...piece.camps].sort((a, b) => a - b).map((c) => camps[c]!);
      const points = [...stood.map(({ at }) => at), ...seen.map(({ point }) => point)];
      const sinces = seen.map(({ since }) => since);
      return {
        key: [...stood.map(({ pinId }) => pinId), ...seen.map(({ id }) => campPinId(id))].join(' '),
        pinIds: [...stood.map(({ pinId }) => pinId), ...seen.map(({ id }) => campPinId(id))],
        points,
        troops: stood.reduce((sum, { roles }) => sum + roles.length, 0),
        seen: seen.length,
        oldest: Math.min(...sinces),
        latest: Math.max(...sinces),
        ...nameOf(
          points,
          seen.some(({ medium }) => medium === 'sea'),
          cities,
        ),
      };
    })
    .sort((a, b) => a.oldest - b.oldest || a.key.localeCompare(b.key))
    .map(({ oldest: _, ...contact }, rank) => ({ number: rank + 1, ...contact }));
}

/** Named after the nearest city of the whole list, so its name does not change with the zoom. */
function nameOf(points: ReadonlyArray<LonLat>, atSea: boolean, cities: ReadonlyArray<City>) {
  const center: LonLat = [
    points.reduce((sum, [lon]) => sum + lon, 0) / points.length,
    points.reduce((sum, [, lat]) => sum + lat, 0) / points.length,
  ];
  let nearest: City | null = null;
  let best = Infinity;
  for (const city of cities) {
    const km = distanceKm(city.lonLat, center);
    if (km < best) [nearest, best] = [city, km];
  }
  if (nearest === null) return { name: '', city: '' };
  const city = nearest.name;
  if (atSea) return { name: fr.contacts.offshore(city), city };
  if (best < BEFORE_CITY_KM) return { name: fr.contacts.before(city), city };
  const direction = Math.round(bearingDegrees(nearest.lonLat, center) / 45) % 8;
  return { name: fr.contacts.toward(direction, city), city };
}
