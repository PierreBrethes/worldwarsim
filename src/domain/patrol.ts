import { outpostReachKm } from '../../convex/constants';
import { countryLabel, fr } from '@/i18n/fr';
import { drawnLiaisonsOf, isOnWatch, PATROL_ROLES, patrolRefusalOf } from './outposts';
import type { PlayerView } from './player-view';

/** Une liaison entre deux de mes avant-postes, par leurs identités. */
export type Liaison = readonly [string, string];

/** **Les liaisons que ma carte trace** (#375) : mes points en service, l'épure de
 *  `drawnLiaisonsOf` — celles où une ronde peut tourner (#376). */
const drawnLiaisonsIn = (me: PlayerView['me']): Liaison[] =>
  drawnLiaisonsOf(
    me.outposts.filter(isOnWatch).map((outpost) => ({
      id: outpost.id,
      point: outpost.lonLat,
      reachKm: outpostReachKm(outpost.level),
    })),
  );

/** **Une main qui tient une troupe de ronde** : ce qui montre les liaisons, calque éteint. */
export const holdsPatrolTroop = (view: PlayerView, troopIds: ReadonlyArray<string>): boolean =>
  view.mode !== 'blitz' &&
  view.me.troops.some((troop) => troopIds.includes(troop.id) && PATROL_ROLES.has(troop.role));

/**
 * **Pourquoi cette main ne part pas en ronde sur cette liaison**, en toutes lettres, ou `null` —
 * `patrolRefusalOf`, que `patrols.start` relit, sur les faits de la vue.
 */
export function patrolRefusalIn(
  view: PlayerView,
  troopIds: ReadonlyArray<string>,
  liaison: Liaison,
): string | null {
  const held = view.me.troops.filter((troop) => troopIds.includes(troop.id));
  const troop = held[0];
  if (troop === undefined) return null;
  const refusal = patrolRefusalOf({
    role: troop.role,
    pieces: held.length,
    aboard: troop.carriedBy !== undefined,
    busy:
      troop.tour !== undefined ||
      troop.patrol !== undefined ||
      view.arcs.some((arc) => arc.state === 'mine' && arc.troopIds.includes(troop.id)),
    stationedAt: troop.stationedAt.kind === 'outpost' ? troop.stationedAt.outpostId : null,
    liaison,
    drawn: drawnLiaisonsIn(view.me),
    patrolled: view.me.troops.flatMap((one) => (one.patrol === undefined ? [] : [one.patrol.ends])),
    slots: view.me.slots,
  });
  if (refusal === null) return null;
  const { code, ...details } = refusal;
  return fr.errors[code](details);
}

/** **Le nom d'un de mes avant-postes** : sa région quand la vue la connaît, sinon son pays. */
export function outpostNameIn(me: PlayerView['me'], outpostId: string): string {
  const outpost = me.outposts.find((one) => one.id === outpostId);
  if (outpost === undefined) return fr.compass.fallbackOutpost;
  return (
    me.regions.find((region) => region.id === outpost.regionId)?.name ??
    countryLabel(outpost.hostCountry)
  );
}

/**
 * **La ligne « Ronde » de la fiche** (décision du 02/11) : la ronde que la troupe tient — sa
 * prochaine halte, son rappel —, ou les liaisons tracées de son avant-poste, chacune nommée par
 * l'autre bout, avec son refus. `null` quand il n'y a rien à dire : Blitz, rôle hors ronde, pas
 * d'avant-poste en liaison sous elle.
 */
export type PatrolLine =
  | {
      readonly kind: 'patrolling';
      readonly troopId: string;
      readonly to: string;
      readonly haltUntil: number | null;
      readonly here: string | null;
      readonly recalled: boolean;
    }
  | {
      readonly kind: 'offers';
      readonly liaisons: ReadonlyArray<{
        readonly ends: Liaison;
        readonly other: string;
        readonly refusal: string | null;
      }>;
    };

export function patrolLineOf(view: PlayerView, troopIds: ReadonlyArray<string>): PatrolLine | null {
  if (!holdsPatrolTroop(view, troopIds)) return null;
  const held = view.me.troops.filter((troop) => troopIds.includes(troop.id));
  const patrolling = held.find((troop) => troop.patrol !== undefined);
  if (patrolling?.patrol !== undefined) {
    const { to, haltUntil, recalled } = patrolling.patrol;
    const station = patrolling.stationedAt;
    return {
      kind: 'patrolling',
      troopId: patrolling.id,
      to: outpostNameIn(view.me, to),
      haltUntil,
      here: station.kind === 'outpost' ? outpostNameIn(view.me, station.outpostId) : null,
      recalled,
    };
  }
  const station = held[0]?.stationedAt;
  if (station?.kind !== 'outpost') return null;
  const liaisons = drawnLiaisonsIn(view.me)
    .filter((pair) => pair.includes(station.outpostId))
    .map((ends) => ({
      ends,
      other: outpostNameIn(view.me, ends[0] === station.outpostId ? ends[1] : ends[0]),
      refusal: patrolRefusalIn(view, troopIds, ends),
    }));
  return liaisons.length === 0 ? null : { kind: 'offers', liaisons };
}

/**
 * **Une ronde en halte est décochée par défaut** dans la pile de sa garnison (#376) : lever la
 * garnison ne l'emporte pas. Seule, elle se lève — sa fiche dit sa ronde et son rappel.
 */
export function withoutPatrols(
  me: PlayerView['me'],
  troopIds: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const patrolling = new Set(
    me.troops.filter((troop) => troop.patrol !== undefined).map((troop) => troop.id),
  );
  const free = troopIds.filter((id) => !patrolling.has(id));
  return free.length === 0 ? troopIds : free;
}
