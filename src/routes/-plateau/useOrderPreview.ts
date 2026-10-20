import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { ArmedColumn } from '@/domain/armed-column';
import { asLocalTime } from '@/domain/duration';
import type { LonLat } from '@/domain/geo';
import { fr } from '@/i18n/fr';
import type { DropNote } from '@/map/DropHint';
import type { Seat } from '@/data/session';
import {
  wireCaptureTarget,
  wireOrigin,
  wireTarget,
  type OrderChoice,
  type Previewed,
} from './order-wire';

export function useOrderPreview(
  seat: Seat,
  column: ArmedColumn | null,
  resting: OrderChoice | null,
) {
  /**
   * **Un aperçu par mission, et le serveur date toujours seul.** Les trois requêtes coexistent
   * parce qu'aucune ne sait refuser à la place des autres : celle qui ne sert pas est en `skip`,
   * et la carte lit celle de l'ordre en cours.
   */
  const aimed = resting;
  const dispatch =
    column === null || aimed === null
      ? null
      : {
          ...seat,
          origin: wireOrigin(column.station),
          troopIds: column.troopIds.map((troopId) => troopId as Id<'troops'>),
        };
  const mission = aimed?.mission ?? null;
  /** **Une réponse périmée ne s'affiche jamais** : un argument neuf rend `undefined` jusqu'à sa
   *  propre réponse, et l'abonnement précédent est remplacé, pas empilé (ADR 0026 §6). */
  const marchPreview = useQuery(
    api.movements.preview,
    dispatch === null || aimed === null || mission?.kind !== 'march'
      ? 'skip'
      : {
          ...dispatch,
          target: wireTarget(aimed.aim),
          type: aimed.type,
          ...(mission.roundTrip === true ? { roundTrip: true } : {}),
        },
  );
  const plunderPreview = useQuery(
    api.movements.previewPlunder,
    dispatch === null || mission?.kind !== 'plunder'
      ? 'skip'
      : { ...dispatch, buildingId: mission.buildingId as Id<'buildings'> },
  );
  const capturePreview = useQuery(
    api.movements.previewCapture,
    dispatch === null || mission?.kind !== 'capture'
      ? 'skip'
      : { ...dispatch, target: wireCaptureTarget(mission.target) },
  );
  const collectPreview = useQuery(
    api.movements.previewLootCollection,
    dispatch === null || mission?.kind !== 'collect'
      ? 'skip'
      : { ...dispatch, sightingId: mission.sightingId as Id<'lootCrateSightings'> },
  );
  const preview =
    mission === null
      ? undefined
      : mission.kind === 'plunder'
        ? plunderPreview
        : mission.kind === 'capture'
          ? capturePreview
          : mission.kind === 'collect'
            ? collectPreview
            : marchPreview;
  /** No card before the order any more: what would change it is said under the verb, at the stop. */
  const dropNotes = useMemo(
    (): ReadonlyArray<DropNote> =>
      resting === null || preview === undefined
        ? []
        : preview === null
          ? [{ text: fr.aim.noRoute, alarm: true }]
          : [
              { text: fr.aim.arrival(asLocalTime(preview.arrivesAt)), alarm: false },
              ...(preview.holdUntil === null
                ? []
                : [{ text: fr.aim.restBite(asLocalTime(preview.holdUntil)), alarm: true }]),
              ...('spared' in preview && preview.spared !== null
                ? [{ text: fr.aim.sparedAtDakar(preview.spared), alarm: false }]
                : []),
              ...fuelNotes(preview),
            ],
    [resting, preview],
  );

  /** **The server's road, a ribbon under the hand** (POC « Manipuler les pions »): no preview arc
   *  nor pawn any more, only the ochre band to the point aimed at. */
  const aimRoute = useMemo(
    () =>
      column === null || aimed === null || !preview
        ? null
        : preview.route.points.map((point) => [point.lon, point.lat] as LonLat),
    [column, aimed, preview],
  );

  return { preview, dropNotes, aimRoute };
}

/** **Le plein de la route, dit avant le clic** (ADR 0028 §3) : ce qu'elle coûte, ou le refus. */
function fuelNotes({ fuel }: NonNullable<Previewed>): ReadonlyArray<DropNote> {
  if (fuel.short !== null)
    return [
      {
        text: fr.errors.NOT_ENOUGH_FUEL({
          ...fuel.short,
          km: fuel.km,
          roundTrip: 'roundTrip' in fuel && fuel.roundTrip,
        }),
        alarm: true,
      },
    ];
  return [
    ...(fuel.steps > 0
      ? [
          {
            text: fr.supplies.route(fuel.steps, 'roundTrip' in fuel && fuel.roundTrip),
            alarm: false,
          },
        ]
      : []),
    /** Singapour se dit là où l'on paie la route. */
    ...(fuel.eased
      ? [{ text: fr.supplies.easedBySingapore(fuel.eased.from, fuel.eased.to), alarm: false }]
      : []),
  ];
}
