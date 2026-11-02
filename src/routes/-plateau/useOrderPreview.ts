import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { ArmedColumn } from '@/domain/armed-column';
import { asLocalTime, asSpan } from '@/domain/duration';
import { kmOf } from '@/domain/routing';
import type { LonLat } from '@/domain/geo';
import { fr } from '@/i18n/fr';
import type { DropFuel, DropNote } from '@/map/DropHint';
import type { Seat } from '@/data/session';
import {
  wireCaptureTarget,
  wireOrigin,
  wireTarget,
  type OrderChoice,
  type Previewed,
} from './order-wire';

/** **Le refus que seul l'aperçu du serveur connaît** (#258) : pas de route, ou plein trop court.
 *  Même fonction que le serveur (`fuelRefusalOf`) ; `null` tant que l'aperçu n'est pas là. */
function previewRefusalOf(preview: Previewed): string | null {
  if (preview === undefined) return null;
  if (preview === null) return fr.aim.noRoute;
  return fuelRefusalText(preview);
}

function fuelRefusalText({ fuel }: NonNullable<Previewed>): string | null {
  return fuel.short === null
    ? null
    : fr.errors.NOT_ENOUGH_FUEL({
        ...fuel.short,
        km: fuel.km,
        roundTrip: 'roundTrip' in fuel && fuel.roundTrip,
      });
}

/** **La longueur de la route sous la main** (#302), lue sur la route même que le serveur a
 *  calculée et dont il tire le plein : même `distanceUnits`, même `KM_PER_UNIT`, aucun calcul de
 *  route de plus au client. La part de mer ne se dit que d'un trajet qui mêle terre et mer : une
 *  traversée toute en mer l'a déjà dite en disant le total. */
export function distanceNotesOf(
  preview: NonNullable<Previewed>,
  { grouped, blitz }: { readonly grouped: boolean; readonly blitz: boolean },
): ReadonlyArray<DropNote> {
  /** Un ordre groupé : la route est celle de la pile en main, la ligne mentirait aux autres. La
   *  Blitz lit ses distances en part du théâtre et ne paie pas de plein. */
  if (grouped || blitz) return [];
  const { route, minutes } = preview;
  const total = kmOf(route.distanceUnits);
  const sea = kmOf(
    route.legs.reduce((sum, leg) => sum + (leg.medium === 'sea' ? leg.distanceUnits : 0), 0),
  );
  return [
    { text: fr.aim.distance(total, asSpan(minutes)), alarm: false },
    ...(sea > 0 && sea < total ? [{ text: fr.aim.distanceSea(sea), alarm: false }] : []),
  ];
}

const sameOrder = (a: OrderChoice, b: OrderChoice) =>
  JSON.stringify([a.aim, a.type, a.mission]) === JSON.stringify([b.aim, b.type, b.mission]);

/** **Ce que le lâcher retient** (#258) : le refus de plein que la pastille vient de dire, sur
 *  l'ordre même que l'aperçu a mesuré. Un aperçu `null` laisse partir : le serveur le rend
 *  aussi pour une soute pleine ou une troupe déjà en marche, et dit sa raison exacte. */
export function dropRefusalOf(
  seen: { readonly choice: OrderChoice; readonly preview: Previewed } | undefined,
  chosen: OrderChoice,
): string | null {
  return seen === undefined || !seen.preview || !sameOrder(seen.choice, chosen)
    ? null
    : fuelRefusalText(seen.preview);
}

export function useOrderPreview(
  seat: Seat,
  column: ArmedColumn | null,
  resting: OrderChoice | null,
  /** Ce qui fait taire la ligne de distance (#302) : un ordre groupé, une Blitz. */
  { grouped, blitz }: { readonly grouped: boolean; readonly blitz: boolean },
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
          ? [{ text: fr.aim.noRoute, alarm: true, refusal: true }]
          : [
              ...distanceNotesOf(preview, { grouped, blitz }),
              { text: fr.aim.arrival(asLocalTime(preview.arrivesAt)), alarm: false },
              ...(preview.holdUntil === null
                ? []
                : [{ text: fr.aim.restBite(asLocalTime(preview.holdUntil)), alarm: true }]),
              ...('spared' in preview && preview.spared !== null
                ? [{ text: fr.aim.sparedAtDakar(preview.spared), alarm: false }]
                : []),
              ...fuelNotes(preview),
            ],
    [resting, preview, grouped, blitz],
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

  /** **The fuel the road would eat, a gauge under the hand** (#250), on the server's road. */
  const dropFuel = useMemo(
    (): DropFuel | null =>
      resting === null || !preview || preview.fuel.gauge === null
        ? null
        : {
            ...preview.fuel.gauge,
            roundTrip: 'roundTrip' in preview.fuel && preview.fuel.roundTrip,
          },
    [resting, preview],
  );

  return { preview, dropNotes, dropFuel, aimRoute };
}

/** **Le refus du plein, dit avant le clic** (ADR 0028 §3) ; ce que la route mange, la jauge le
 *  montre (`dropFuel`). */
function fuelNotes(preview: NonNullable<Previewed>): ReadonlyArray<DropNote> {
  const refusal = previewRefusalOf(preview);
  if (refusal !== null) return [{ text: refusal, alarm: true, refusal: true }];
  const { fuel } = preview;
  /** Singapour se dit là où l'on paie la route. */
  return fuel.eased
    ? [{ text: fr.supplies.easedBySingapore(fuel.eased.from, fuel.eased.to), alarm: false }]
    : [];
}
