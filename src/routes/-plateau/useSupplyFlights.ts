import { useEffect, useRef } from 'react';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { SUPPLY_KEYS, type SupplyLoad } from '@/domain/logistics';
import {
  binPoint,
  flyFlows,
  mapPoint,
  pulseAt,
  stampWord,
  type Flow,
  type Point,
} from '@/shell/flights';

/** Un dépôt et la troupe qu'il recharge se tiennent au même point : la pastille part à côté. */
const apart = (from: Point, to: Point): Point =>
  Math.hypot(from.x - to.x, from.y - to.y) < 24 ? { x: from.x - 56, y: from.y - 36 } : from;

const stationOf = (view: Pick<PlayerView, 'me'>, troop: TroopView): LonLat | null => {
  const { stationedAt } = troop;
  if (stationedAt.kind === 'point') return stationedAt.lonLat;
  if (stationedAt.kind === 'outpost')
    return view.me.outposts.find((one) => one.id === stationedAt.outpostId)?.lonLat ?? null;
  if (stationedAt.kind === 'home')
    return view.me.buildings.find((one) => one.key === 'hq')?.point ?? null;
  return view.me.buildings.find((one) => one.id === stationedAt.buildingId)?.point ?? null;
};

/** **Une livraison jouée** : le tampon LIVRÉ, et les pastilles du transport au dépôt. */
function deliver(at: LonLat, delivered: SupplyLoad, motion: MapMotion): void {
  const depot = mapPoint(at);
  stampWord('delivered', 'delivered', at);
  if (depot === null) return;
  const hull = { x: depot.x - 56, y: depot.y - 36 };
  void flyFlows(
    SUPPLY_KEYS.flatMap((key) =>
      delivered[key] > 0
        ? [{ resource: key, amount: delivered[key], from: hull, to: depot } satisfies Flow]
        : [],
    ),
    motion,
  );
}

/**
 * **Les échanges de la logistique, joués à l'événement réel** — jamais avant lui. Une livraison
 * arrive en dépêche (`supplyDelivered`) : ses pastilles volent du transport au dépôt, et le
 * tampon LIVRÉ. Une troupe ancrée dont les crans montent dans la vue vient d'être rechargée : les
 * pastilles du dépôt (ou du bac) à elle, et sa pulsation. Une tournée qui saute un dépôt de plus
 * tamponne PLEIN sur lui. La vue du montage ne joue rien : elle n'est pas un événement.
 */
export function useSupplyFlights(view: PlayerView, motion: MapMotion): void {
  const seen = useRef<{
    at: number;
    troops: ReadonlyMap<string, TroopView>;
    /** Le niveau de chaque bâtiment et avant-poste : un niveau qui monte est un chantier fini. */
    levels: ReadonlyMap<string, number>;
    /** Ce que chaque dépôt tenait : une tournée qui livre n'écrit aucune dépêche. */
    depots: ReadonlyMap<string, SupplyLoad>;
  } | null>(null);

  const { me, journal } = view;
  useEffect(() => {
    const before = seen.current;
    seen.current = {
      at: Math.max(0, ...journal.map((dispatch) => dispatch.at)),
      troops: new Map(me.troops.map((troop) => [troop.id, troop])),
      levels: new Map([
        ...me.buildings.map((one) => [one.id, one.level] as const),
        ...me.outposts.map((one) => [one.id, one.level] as const),
      ]),
      depots: new Map(me.outposts.map((one) => [one.id, one.depot])),
    };
    if (before === null) return;

    /** **BÂTI et ÉLEVÉ se pressent à l'achèvement**, pas à la mise en file : la dépêche de fin de
     *  chantier garde la prise d'un bâtiment (capturé, il apparaît aussi) hors du compte. */
    if (
      journal.some(
        (dispatch) =>
          dispatch.at > before.at &&
          (dispatch.kind === 'construction' || dispatch.kind === 'outpostRaised'),
      )
    )
      for (const [one, at] of [
        ...me.buildings.map((one) => [one, one.point] as const),
        ...me.outposts.map((one) => [one, one.lonLat] as const),
      ]) {
        const was = before.levels.get(one.id);
        if (was === undefined && 'key' in one) stampWord('built', 'built', at);
        else if (was !== undefined && one.level > was) stampWord('built', 'raised', at);
      }

    const told = journal.filter(
      (dispatch) => dispatch.at > before.at && dispatch.kind === 'supplyDelivered',
    );
    for (const dispatch of told) {
      if (dispatch.place === null || dispatch.delivered === undefined) continue;
      deliver([dispatch.place.lon, dispatch.place.lat], dispatch.delivered, motion);
    }
    /** **Une étape de tournée qui livre** n'a pas de dépêche (elles inonderaient le journal) : le
     *  dépôt qui monte pendant qu'une tournée le passe est la livraison, lue dans la vue. */
    for (const outpost of me.outposts) {
      const was = before.depots.get(outpost.id);
      if (was === undefined) continue;
      const delivered = Object.fromEntries(
        SUPPLY_KEYS.map((key) => [key, Math.max(0, outpost.depot[key] - was[key])]),
      ) as SupplyLoad;
      const [lon, lat] = outpost.lonLat;
      if (
        SUPPLY_KEYS.every((key) => delivered[key] === 0) ||
        !me.troops.some((troop) => troop.tour?.stops.includes(outpost.id)) ||
        told.some((dispatch) => dispatch.place?.lon === lon && dispatch.place?.lat === lat)
      )
        continue;
      deliver(outpost.lonLat, delivered, motion);
    }

    for (const troop of me.troops) {
      const was = before.troops.get(troop.id);
      if (was === undefined) continue;
      for (const stop of troop.tour?.skipped ?? []) {
        if (was.tour?.skipped.includes(stop) === true) continue;
        const outpost = me.outposts.find((one) => one.id === stop);
        if (outpost !== undefined) stampWord('delivered', 'full', outpost.lonLat);
      }
      if (troop.anchored !== true || was.supplies === undefined || troop.supplies === undefined)
        continue;
      const gains = [
        { resource: 'ammunition' as const, amount: troop.supplies.rounds - was.supplies.rounds },
        { resource: 'oil' as const, amount: troop.supplies.fuel - was.supplies.fuel },
      ].filter((gain) => gain.amount > 0);
      const at = stationOf({ me }, troop);
      const to = at === null ? null : mapPoint(at);
      if (gains.length === 0 || to === null) continue;
      const depotAt =
        troop.depotId === undefined
          ? null
          : (me.outposts.find((one) => one.id === troop.depotId)?.lonLat ?? null);
      const store = depotAt === null ? null : mapPoint(depotAt);
      void flyFlows(
        gains.flatMap((gain) => {
          const from = depotAt === null ? binPoint(gain.resource) : store;
          return from === null ? [] : [{ ...gain, from: apart(from, to), to }];
        }),
        motion,
        // La pulsation suit la première pastille arrivée.
        ((landed) => () => {
          if (landed) return;
          landed = true;
          pulseAt(to, motion);
        })(false),
      );
    }
  }, [me, journal, motion]);
}
