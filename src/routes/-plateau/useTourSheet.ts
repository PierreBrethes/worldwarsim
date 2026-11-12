import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { TourAct } from '@/domain/cargo-tag';
import { buildingLabelId } from '@/domain/building-label-id';
import type { PlayerView } from '@/domain/player-view';
import { outpostPinId } from '@/domain/pins';
import {
  launchRefusalOf,
  loopOf,
  orderBest,
  placeStop,
  proposeTour,
  rankStops,
  type SheetStop,
} from '@/domain/tour-sheet';
import type { SheetMark } from '@/domain/tour-sheet-marks';
import { cardsOf, readSheet } from '@/domain/tour-sheet-view';
import type { Projection } from '@/domain/world';
import { fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';
import type { TourLoop } from '@/map/WorldMap';
import { notify } from '@/shell/notifications';
import projectionAsset from '../../../public/projection.json';

const projection = projectionAsset as unknown as Projection;

type Stop = { readonly kind: 'depot' | 'site'; readonly id: string };
const keyOf = (stop: Stop) => `${stop.kind}:${stop.id}`;
const THIRTY_SECONDS = 30_000;

/**
 * **La feuille de route d'un transport** (ADR 0041, #551) : le transport dont elle est ouverte, les
 * arrêts que la main a posés, et tout ce que l'Ordonnance en tire (`tour-sheet.ts`) — la boucle, les
 * cartes, le classement des arrêts possibles, l'ordre au mieux. Rien ne part avant `launch`. Elle
 * remplace le tracé d'arrêt en arrêt : un transport en tournée l'ouvre en lecture, avec `recall`.
 *
 * Ce que le client ne sait pas lire (une route, un quai) vient de `tours.pickups`, demandé feuille
 * ouverte seulement.
 */
export function useTourSheet(
  seat: Seat,
  view: PlayerView,
  setOrderError: (error: string | null) => void,
) {
  const [carrierId, setCarrierId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReadonlyArray<Stop>>([]);
  const [picking, setPicking] = useState(false);
  const [fresh, setFresh] = useState<{
    readonly key: string;
    readonly at: number;
    readonly from: number;
    readonly to: number;
  } | null>(null);
  const [proposed, setProposed] = useState(false);
  const [pinned, setPinned] = useState<Stop | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startTour = useMutation(api.tours.start);
  const recallTour = useMutation(api.tours.recall);

  useEffect(() => {
    if (carrierId === null) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), THIRTY_SECONDS);
    return () => clearInterval(tick);
  }, [carrierId, view.loadedAt]);

  const pickups = useQuery(
    api.tours.pickups,
    carrierId === null || view.mode === 'blitz' || view.me.defeated
      ? 'skip'
      : { ...seat, troopId: carrierId as Id<'troops'> },
  );
  const reading = useMemo(
    () => (carrierId === null ? null : readSheet(view, carrierId, pickups, projection, now)),
    [view, carrierId, pickups, now],
  );
  const touring = reading?.carrier.tour !== undefined;

  /** Les arrêts de la feuille, résolus : un arrêt qu'on ne sait pas encore lire attend `pickups`. */
  const stops = useMemo((): ReadonlyArray<SheetStop> => {
    if (reading === null) return [];
    const wanted: ReadonlyArray<Stop> = reading.carrier.tour?.stops ?? draft;
    const byKey = new Map(reading.candidates.map((stop) => [keyOf(stop), stop]));
    return wanted.flatMap((stop) => byKey.get(keyOf(stop)) ?? []);
  }, [reading, draft]);

  const analysis = useMemo(() => {
    if (reading === null) return null;
    const { sheet, candidates } = reading;
    return {
      loop: loopOf(sheet, stops),
      ranked: picking && !touring ? rankStops(sheet, stops, candidates) : null,
      order: stops.length > 1 ? orderBest(sheet, stops) : null,
      refusal: launchRefusalOf(sheet, stops),
    };
  }, [reading, stops, picking, touring]);

  const cards = useMemo(
    () =>
      reading === null || analysis === null
        ? []
        : cardsOf(stops, analysis.loop, reading.nameOf, fresh),
    [reading, analysis, stops, fresh],
  );

  const reset = () => {
    setPicking(false);
    setFresh(null);
    setProposed(false);
    setPinned(null);
  };
  const open = useCallback(
    (id: string) => {
      setOrderError(null);
      setCarrierId(id);
      setDraft([]);
      reset();
    },
    [setOrderError],
  );
  const close = useCallback(() => {
    setCarrierId(null);
    setDraft([]);
    reset();
  }, []);

  /** Un arrêt choisi : posé là où le rendement monte le plus, ou refusé et redit. */
  const pick = useCallback(
    (stop: Stop) => {
      if (reading === null || analysis === null || touring || !picking) return;
      if (analysis.ranked?.refused.some((one) => keyOf(one.stop) === keyOf(stop)) === true) {
        setPinned(stop);
        return;
      }
      const full = reading.candidates.find((one) => keyOf(one) === keyOf(stop));
      if (full === undefined) return;
      const slot = placeStop(reading.sheet, stops, full);
      setDraft([...stops.slice(0, slot.at), full, ...stops.slice(slot.at)]);
      setFresh({
        key: keyOf(full),
        at: slot.at,
        from: Math.round(slot.rateBefore),
        to: Math.round(slot.rate),
      });
      setPicking(false);
      setPinned(null);
    },
    [reading, analysis, touring, picking, stops],
  );

  const change = (next: ReadonlyArray<Stop>) => {
    setDraft(next);
    setFresh(null);
  };
  const remove = (at: number) => change(stops.filter((_, rank) => rank !== at));
  const move = (from: number, to: number) => {
    const next = [...stops];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    change(next);
  };
  const startPicking = () => {
    setPicking(true);
    setFresh(null);
  };
  const stopPicking = () => {
    setPicking(false);
    setPinned(null);
  };
  const clear = () => {
    change([]);
    setProposed(false);
  };
  const orderBestNow = () => {
    if (analysis?.order !== null && analysis?.order !== undefined) change(analysis.order.order);
  };
  const propose = () => {
    if (reading === null) return;
    change(proposeTour(reading.sheet, reading.candidates));
    setProposed(true);
    setPicking(false);
  };

  const launch = () => {
    if (carrierId === null || analysis === null) return;
    if (analysis.refusal !== null) {
      const { code, ...details } = analysis.refusal;
      setOrderError(fr.errors[code](details));
      return;
    }
    setOrderError(null);
    startTour({
      ...seat,
      troopId: carrierId as Id<'troops'>,
      stops: stops.map((stop) =>
        stop.kind === 'depot'
          ? (stop.id as Id<'outposts'>)
          : { kind: 'site' as const, id: stop.id as Id<'buildings'> },
      ),
    }).then(
      () => {
        notify(fr.logistics.tourStarted, 'info');
        close();
      },
      (problem: unknown) => handleError(problem, setOrderError),
    );
  };

  const recall = useCallback(
    (id: string) => {
      setOrderError(null);
      recallTour({ ...seat, troopId: id as Id<'troops'> }).catch((problem: unknown) =>
        handleError(problem, setOrderError),
      );
    },
    [recallTour, seat, setOrderError],
  );

  /** **Depuis l'étiquette d'un transport** : ouvrir sa feuille, ou rappeler sa tournée. */
  const onTour = useCallback(
    (id: string, act: TourAct) => (act === 'open' ? open(id) : recall(id)),
    [open, recall],
  );

  /** **Les arrêts allumés sur la carte** : le rang de chacun dans la boucle ; les possibles, avec
   *  leur rang au classement ; les refusés, barrés. */
  const marks = useMemo((): ReadonlyMap<string, SheetMark> => {
    const result = new Map<string, SheetMark>();
    if (reading === null || analysis === null) return result;
    const labelOf = (stop: Stop) => {
      if (stop.kind === 'depot') return outpostPinId(stop.id);
      const building = view.me.buildings.find((one) => one.id === stop.id);
      return building === undefined ? null : buildingLabelId(building);
    };
    const put = (stop: Stop, tone: SheetMark['tone'], text: string) => {
      const label = labelOf(stop);
      if (label !== null) result.set(label, { tone, text, pick: { kind: stop.kind, id: stop.id } });
    };
    analysis.ranked?.offered.forEach((offer, rank) => put(offer.stop, 'cand', String(rank + 1)));
    for (const refused of analysis.ranked?.refused ?? []) put(refused.stop, 'nope', '✕');
    stops.forEach((stop, rank) => put(stop, 'stop', String(rank + 1)));
    return result;
  }, [reading, analysis, stops, view.me.buildings]);

  /** **Les boucles à l'encre** : chaque tournée qui tourne, du chargement au chargement par ses
   *  arrêts ; celle de la feuille ouverte, en pointillés tant qu'elle n'est pas lancée. */
  const loops = useMemo((): ReadonlyArray<TourLoop> => {
    const pointOfStation = (id: string) =>
      view.me.buildings.find((building) => building.id === id)?.point ??
      view.me.outposts.find((outpost) => outpost.id === id)?.lonLat;
    const running = view.me.troops.flatMap((troop) => {
      if (troop.tour === undefined) return [];
      const base = pointOfStation(troop.tour.baseId);
      if (base === undefined) return [];
      const points = troop.tour.stops.flatMap((stop) => {
        const at = pointOfStation(stop.id);
        return at === undefined ? [] : [{ at, skipped: troop.tour!.skipped.includes(stop.id) }];
      });
      return [{ base, stops: points, tracing: false }];
    });
    const tracing =
      reading === null || touring || stops.length === 0
        ? []
        : [
            {
              base: reading.sheet.base,
              stops: stops.map((stop) => ({ at: stop.stopPoint, skipped: false })),
              tracing: true,
            },
          ];
    return [...running, ...tracing];
  }, [view.me.troops, view.me.buildings, view.me.outposts, reading, touring, stops]);

  return {
    carrierId,
    reading,
    touring,
    picking,
    startPicking,
    stopPicking,
    pinned,
    proposed,
    stops,
    cards,
    analysis,
    pick,
    open,
    close,
    remove,
    move,
    clear,
    orderBestNow,
    propose,
    launch,
    recall,
    onTour,
    marks,
    loops,
    pending: pickups === undefined && carrierId !== null,
  };
}

export type TourSheetState = ReturnType<typeof useTourSheet>;
