import { useEffect, useRef } from 'react';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { SUPPLY_KEYS } from '@/domain/logistics';
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

const stationOf = (view: PlayerView, troop: TroopView): LonLat | null => {
  const { stationedAt } = troop;
  if (stationedAt.kind === 'point') return stationedAt.lonLat;
  if (stationedAt.kind === 'outpost')
    return view.me.outposts.find((one) => one.id === stationedAt.outpostId)?.lonLat ?? null;
  if (stationedAt.kind === 'home')
    return view.me.buildings.find((one) => one.key === 'hq')?.point ?? null;
  return view.me.buildings.find((one) => one.id === stationedAt.buildingId)?.point ?? null;
};

/**
 * **Les échanges de la logistique, joués à l'événement réel** — jamais avant lui. Une livraison
 * arrive en dépêche (`supplyDelivered`) : ses pastilles volent du transport au dépôt, et le
 * tampon LIVRÉ. Une troupe ancrée dont les crans montent dans la vue vient d'être rechargée : les
 * pastilles du dépôt (ou du bac) à elle, et sa pulsation. Une tournée qui saute un dépôt de plus
 * tamponne PLEIN sur lui. La vue du montage ne joue rien : elle n'est pas un événement.
 */
export function useSupplyFlights(view: PlayerView, motion: MapMotion): void {
  const seen = useRef<{ at: number; troops: ReadonlyMap<string, TroopView> } | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = {
      at: Math.max(0, ...view.journal.map((dispatch) => dispatch.at)),
      troops: new Map(view.me.troops.map((troop) => [troop.id, troop])),
    };
    if (before === null) return;

    for (const dispatch of view.journal) {
      if (dispatch.at <= before.at || dispatch.kind !== 'supplyDelivered') continue;
      if (dispatch.place === null || dispatch.delivered === undefined) continue;
      const at: LonLat = [dispatch.place.lon, dispatch.place.lat];
      const depot = mapPoint(at);
      stampWord('delivered', 'delivered', at);
      if (depot === null) continue;
      const hull = { x: depot.x - 56, y: depot.y - 36 };
      void flyFlows(
        SUPPLY_KEYS.flatMap((key) => {
          const amount = dispatch.delivered![key];
          return amount > 0
            ? [{ resource: key, amount, from: hull, to: depot } satisfies Flow]
            : [];
        }),
        motion,
      );
    }

    for (const troop of view.me.troops) {
      const was = before.troops.get(troop.id);
      if (was === undefined) continue;
      for (const stop of troop.tour?.skipped ?? []) {
        if (was.tour?.skipped.includes(stop) === true) continue;
        const outpost = view.me.outposts.find((one) => one.id === stop);
        if (outpost !== undefined) stampWord('delivered', 'full', outpost.lonLat);
      }
      if (troop.anchored !== true || was.supplies === undefined || troop.supplies === undefined)
        continue;
      const gains = [
        { resource: 'ammunition' as const, amount: troop.supplies.rounds - was.supplies.rounds },
        { resource: 'oil' as const, amount: troop.supplies.fuel - was.supplies.fuel },
      ].filter((gain) => gain.amount > 0);
      const at = stationOf(view, troop);
      const to = at === null ? null : mapPoint(at);
      if (gains.length === 0 || to === null) continue;
      const depotAt =
        troop.depotId === undefined
          ? null
          : (view.me.outposts.find((one) => one.id === troop.depotId)?.lonLat ?? null);
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
  }, [view, motion]);
}
