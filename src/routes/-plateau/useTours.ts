import { useCallback, useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { TourAct, TourTrace } from '@/domain/cargo-tag';
import type { PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';
import type { TourLoop } from '@/map/WorldMap';
import { notify } from '@/shell/notifications';

export function useTours(
  seat: Seat,
  me: PlayerView['me'],
  setOrderError: (error: string | null) => void,
) {
  /** **La tournée que la main trace** (ADR 0028) : son transport et ses dépôts dans l'ordre ;
   *  l'étiquette du transport la lance ou l'efface. */
  const [trace, setTrace] = useState<TourTrace | null>(null);
  const startTour = useMutation(api.tours.start);
  const recallTour = useMutation(api.tours.recall);
  /** **La tournée depuis l'étiquette** : lancer celle qu'on a tracée, l'effacer, la rappeler. */
  const onTour = useCallback(
    (carrierId: string, act: TourAct) => {
      setOrderError(null);
      const refused = (problem: unknown) => handleError(problem, setOrderError);
      if (act === 'recall') {
        recallTour({ ...seat, troopId: carrierId as Id<'troops'> }).catch(refused);
        return;
      }
      const traced = trace;
      setTrace(null);
      if (act === 'clear' || traced === null || traced.carrierId !== carrierId) return;
      startTour({
        ...seat,
        troopId: carrierId as Id<'troops'>,
        stops: traced.stops.map((stop) => stop as Id<'outposts'>),
      }).then(() => notify(fr.logistics.tourStarted, 'info'), refused);
    },
    [recallTour, startTour, seat, trace, setOrderError],
  );
  /** **Les boucles à l'encre** : chaque tournée, et celle qu'on trace, du chargement au
   *  chargement par ses dépôts ; un dépôt que ce tour saute, plein, en pointillé. */
  const tourLoops = useMemo((): ReadonlyArray<TourLoop> => {
    const pointOfStation = (id: string) =>
      me.buildings.find((building) => building.id === id)?.point ??
      me.outposts.find((outpost) => outpost.id === id)?.lonLat;
    const loopOf = (
      baseId: string,
      stops: ReadonlyArray<string>,
      skipped: ReadonlyArray<string>,
      tracing: boolean,
    ): ReadonlyArray<TourLoop> => {
      const base = pointOfStation(baseId);
      const points = stops.flatMap((stop) => {
        const at = pointOfStation(stop);
        return at === undefined ? [] : [{ at, skipped: skipped.includes(stop) }];
      });
      return base === undefined ? [] : [{ base, stops: points, tracing }];
    };
    const tracedFrom = me.troops.find((troop) => troop.id === trace?.carrierId)?.stationedAt;
    return [
      ...me.troops.flatMap((troop) =>
        troop.tour === undefined
          ? []
          : loopOf(troop.tour.baseId, troop.tour.stops, troop.tour.skipped, false),
      ),
      ...(trace === null || tracedFrom === undefined
        ? []
        : tracedFrom.kind === 'building'
          ? loopOf(tracedFrom.buildingId, trace.stops, [], true)
          : tracedFrom.kind === 'outpost'
            ? loopOf(tracedFrom.outpostId, trace.stops, [], true)
            : []),
    ];
  }, [me.troops, me.buildings, me.outposts, trace]);

  return { trace, setTrace, onTour, tourLoops };
}
