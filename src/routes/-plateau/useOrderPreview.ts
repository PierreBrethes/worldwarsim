import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { RELAY_SPEED_MULTIPLIER } from '../../../convex/constants';
import type { Id } from '../../../convex/_generated/dataModel';
import type { ArmedColumn } from '@/domain/armed-column';
import { asLocalTime, asSpan } from '@/domain/duration';
import { kmOf } from '@/domain/routing';
import type { LonLat } from '@/domain/geo';
import { fr } from '@/i18n/fr';
import type { DropFuel, DropNote } from '@/map/DropHint';
import type { Seat } from '@/data/session';
import {
  courseOfArc,
  courseRefusalOf,
  courseTargetRefusalOf,
  steersCourse,
} from '@/domain/carrier-doctrine';
import type { Asset } from '@/domain/nation-assets';
import type { ArcView } from '@/domain/player-view';
import type { MarchStation } from '@/domain/troops';
import type { MovementPreviewed } from '@/data/serverView';
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
        course: 'course' in fuel && fuel.course,
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
    /** **Pourquoi la durée est courte** (ADR 0037 §8) : servi par chaque aperçu. */
    ...(preview.relayed > 0
      ? [{ text: fr.aim.relayed(RELAY_SPEED_MULTIPLIER, asSpan(preview.relayed)), alarm: false }]
      : []),
    ...(preview.fuel.resupply.rounds + preview.fuel.resupply.fuel > 0
      ? [
          {
            text: fr.aim.storeResupply(preview.fuel.resupply.rounds, preview.fuel.resupply.fuel),
            alarm: false,
          },
        ]
      : []),
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
  /** Ce qui fait taire la ligne de distance (#302) : un ordre groupé, une Blitz. `course` : la
   *  flotte reprise en mer (#449), que `previewCourse` mesure à la place. */
  {
    grouped,
    blitz,
    course = null,
    chain = null,
  }: {
    readonly grouped: boolean;
    readonly blitz: boolean;
    readonly course?: {
      readonly arc: Extract<ArcView, { state: 'mine' }>;
      readonly asset: Asset | null;
    } | null;
    /** **La première jambe posée d'une Guerre éclair** (#451) : l'aperçu mesure l'attaque
     *  depuis où la colonne se tient, et la seconde cible sous la main en `then`. */
    readonly chain?: ChainedFirst | null;
  },
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
          origin: wireOrigin(chain?.station ?? column.station),
          troopIds: column.troopIds.map((troopId) => troopId as Id<'troops'>),
        };
  const mission = aimed?.mission ?? null;
  /** **Une réponse périmée ne s'affiche jamais** : un argument neuf rend `undefined` jusqu'à sa
   *  propre réponse, et l'abonnement précédent est remplacé, pas empilé (ADR 0026 §6). */
  const steered = course !== null && aimed !== null && steersCourse(aimed) ? aimed.type : null;
  const coursePreview = useQuery(
    api.movements.previewCourse,
    course === null || aimed === null || steered === null
      ? 'skip'
      : {
          ...seat,
          movementId: course.arc.id as Id<'movements'>,
          type: steered,
          target: wireTarget(aimed.aim),
        },
  );
  const marchPreview = useQuery(
    api.movements.preview,
    dispatch === null || aimed === null || mission?.kind !== 'march' || course !== null
      ? 'skip'
      : chain !== null
        ? {
            ...dispatch,
            target: wireTarget(chain.first.aim),
            type: 'attack' as const,
            then: wireTarget(aimed.aim),
          }
        : {
            ...dispatch,
            target: wireTarget(aimed.aim),
            type: aimed.type,
            ...(mission.roundTrip === true ? { roundTrip: true } : {}),
          },
  );
  /** La seconde jambe telle que le serveur la pèse : son refus en valeur, ou sa route. */
  const then = chain === null || !marchPreview ? undefined : (marchPreview.then ?? undefined);
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
      : course !== null
        ? /** Une mission garde son cap : rien à mesurer, le lâcher le dira. */
          steered === null
          ? null
          : coursePreview
        : mission.kind === 'plunder'
          ? plunderPreview
          : mission.kind === 'capture'
            ? capturePreview
            : mission.kind === 'collect'
              ? collectPreview
              : marchPreview;
  /** **Le refus du cap, dit avant l'aperçu** (#449) : la mi-parcours passée pendant le glisser,
   *  ou une cible qui donnerait une mission. Relu à chaque arrêt de la main, à l'heure du client. */
  const courseRefusal = useMemo(() => {
    if (course === null || resting === null) return null;
    const refusal =
      courseRefusalOf(course.asset, courseOfArc(course.arc), Date.now()) ??
      courseTargetRefusalOf(resting);
    return refusal === null ? null : fr.errors[refusal]({});
  }, [course, resting]);
  /** No card before the order any more: what would change it is said under the verb, at the stop. */
  const dropNotes = useMemo(
    (): ReadonlyArray<DropNote> =>
      chain !== null
        ? then === undefined
          ? []
          : then.refusal !== null
            ? [{ text: refusalText(then.refusal), alarm: true, refusal: true }]
            : [
                {
                  text: fr.aim.distance(kmOf(then.route.distanceUnits), asSpan(then.minutes)),
                  alarm: false,
                },
              ]
        : courseRefusal !== null
          ? [{ text: courseRefusal, alarm: true, refusal: true }]
          : resting === null || preview === undefined
            ? []
            : preview === null
              ? [{ text: fr.aim.noRoute, alarm: true, refusal: true }]
              : [
                  ...distanceNotesOf(preview, { grouped, blitz }),
                  { text: fr.aim.arrival(asLocalTime(preview.arrivesAt)), alarm: false },
                  ...(preview.holdUntil === null
                    ? []
                    : [{ text: fr.aim.restBite(asLocalTime(preview.holdUntil)), alarm: true }]),
                  ...('spared' in preview && typeof preview.spared === 'number'
                    ? [{ text: fr.aim.sparedAtDakar(preview.spared), alarm: false }]
                    : []),
                  ...fuelNotes(preview),
                ],
    [chain, then, courseRefusal, resting, preview, grouped, blitz],
  );

  /** **The server's road, a ribbon under the hand** (POC « Manipuler les pions »): no preview arc
   *  nor pawn any more, only the ochre band to the point aimed at. */
  const aimRoute = useMemo(
    () =>
      column === null || aimed === null || !preview
        ? null
        : ((chain === null
            ? preview.route
            : then?.refusal === null
              ? then.route
              : null
          )?.points.map((point) => [point.lon, point.lat] as LonLat) ?? null),
    [column, aimed, preview, chain, then],
  );

  /** **The fuel the road would eat, a gauge under the hand** (#250), on the server's road. */
  const dropFuel = useMemo(
    (): DropFuel | null =>
      chain !== null
        ? then?.refusal === null && then.fuel.gauge !== null
          ? { ...then.fuel.gauge, roundTrip: false }
          : null
        : resting === null || !preview || preview.fuel.gauge === null
          ? null
          : {
              ...preview.fuel.gauge,
              roundTrip: 'roundTrip' in preview.fuel && preview.fuel.roundTrip,
            },
    [chain, then, resting, preview],
  );

  return { preview, dropNotes, dropFuel, aimRoute, then };
}

/** La colonne d'une Guerre éclair entre ses deux cibles : d'où elle part, et la première. */
export type ChainedFirst = {
  readonly station: MarchStation;
  readonly first: OrderChoice;
  /** L'aperçu de la première jambe, au lâcher : son nom, sa route, son heure. */
  readonly preview: NonNullable<MovementPreviewed>;
};

/** Un refus servi en valeur, par son texte unique (`fr.errors`). */
export const refusalText = ({
  code,
  details,
}: {
  readonly code: string;
  readonly details: Readonly<Record<string, string | number | boolean>>;
}): string =>
  code in fr.errors ? fr.errors[code as keyof typeof fr.errors]({ ...details } as never) : code;

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
