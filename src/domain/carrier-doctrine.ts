import type { MovementType, UnitRole } from './ids';
import { mediumAt, type MarchingForce } from './interception';
import type { Asset } from './nation-assets';
import type { ArcView } from './player-view';
import type { SeasonMode } from './season-mode';
import { fuelStepsOf } from './supplies';

/**
 * **La Doctrine du porte-avions** (ADR 0039 §4) : un mouvement japonais en mer change une fois de
 * destination, avant la mi-parcours. La fiche au survol, la pastille et `movements.changeCourse`
 * lisent cette fonction ; la nouvelle destination, elle, se refuse comme un ordre neuf.
 */
export type CourseRefusal =
  | 'NO_CARRIER_DOCTRINE'
  /** Ni un retour, ni une livraison, un largage, un pillage, un ramassage, une capture, une
   *  tournée, une ronde, un embarquement (décision de Pierre du 04/11). */
  | 'COURSE_ON_MISSION'
  | 'COURSE_ALREADY_CHANGED'
  | 'PAST_HALFWAY'
  | 'NOT_AT_SEA';

export type Course = {
  readonly type: MovementType;
  readonly onMission: boolean;
  readonly courseChangedAt: number | null;
  readonly force: MarchingForce;
};

/** Ce qui change de cap, et ce qu'on lui donne au lâcher : une marche, une attaque, une
 *  expédition. */
export const STEERED = ['march', 'attack', 'raid'] as const;
export type Steered = (typeof STEERED)[number];
const isSteered = (type: MovementType): type is Steered =>
  (STEERED as ReadonlyArray<MovementType>).includes(type);

/** L'ordre que la flotte reprise reçoit au lâcher, tel que la rose le propose. */
export type CourseTarget = {
  readonly type: MovementType;
  readonly mission: {
    readonly kind: string;
    readonly boardsOn?: unknown;
    readonly roundTrip?: boolean;
  };
};

/** **La cible du cap neuf** (décision du 04/11) : ni mission (caisse, pillage, capture), ni
 *  embarquement, ni aller-retour — la cible en porterait une, le cap reste. */
export const steersCourse = <T extends CourseTarget>(order: T): order is T & { type: Steered } =>
  order.mission.kind === 'march' &&
  order.mission.boardsOn === undefined &&
  order.mission.roundTrip !== true &&
  isSteered(order.type);

export const courseTargetRefusalOf = (order: CourseTarget): 'COURSE_TARGET_ON_MISSION' | null =>
  steersCourse(order) ? null : 'COURSE_TARGET_ON_MISSION';

/** La moitié de la durée du trajet (`departedAt` à `arrivesAt`). */
export const halfwayOf = ({
  departedAt,
  arrivesAt,
}: Pick<MarchingForce, 'departedAt' | 'arrivesAt'>) => departedAt + (arrivesAt - departedAt) / 2;

export function courseRefusalOf(
  asset: Asset | null,
  course: Course,
  now: number,
): CourseRefusal | null {
  if (asset !== 'carrierDoctrine') return 'NO_CARRIER_DOCTRINE';
  if (!isSteered(course.type) || course.onMission) return 'COURSE_ON_MISSION';
  if (course.courseChangedAt !== null) return 'COURSE_ALREADY_CHANGED';
  /** Retenue à la frontière, la colonne est arrivée : sa mi-parcours est loin derrière. */
  if (course.force.heldAt !== undefined || now >= halfwayOf(course.force)) return 'PAST_HALFWAY';
  return mediumAt(course.force, now) === 'sea' ? null : 'NOT_AT_SEA';
}

/** **Le plein déjà payé** : les crans de l'ancienne route moins ceux qu'elle a courus. */
export const fuelCreditOf = (
  role: UnitRole,
  paidKm: number,
  ranKm: number,
  holdsSingapore = false,
): number =>
  Math.max(0, fuelStepsOf(role, paidKm, holdsSingapore) - fuelStepsOf(role, ranKm, holdsSingapore));

/** Ce qui reste au réservoir : le surplus de la route neuve s'y prend, le crédit en trop se perd
 *  (aucun mouvement ne rend son plein, décision du 04/11). */
export const fuelAfterCourse = (held: number, credit: number, needed: number): number =>
  held - Math.max(0, needed - credit);

type MyArc = Extract<ArcView, { state: 'mine' }>;

/** **Le cap d'un arc à moi**, lu comme le serveur lit sa ligne (`courseRefusalOfRow`). */
export const courseOfArc = (arc: MyArc): Course => ({
  type: arc.type,
  onMission: arc.onMission === true,
  courseChangedAt: arc.courseChange?.at ?? null,
  force: {
    id: arc.id,
    points: arc.route.points,
    legs: arc.route.legs,
    distanceUnits: arc.route.distanceUnits,
    landCost: arc.route.landCost,
    departedAt: arc.schedule.departedAt,
    arrivesAt: arc.schedule.arrivesAt,
    ...(arc.schedule.resumed === undefined ? {} : { resumed: arc.schedule.resumed }),
    ...(arc.schedule.heldAt === null ? {} : { heldAt: arc.schedule.heldAt }),
  },
});

/**
 * **Ce que la fiche d'un de mes mouvements dit du cap** (maquette A, #449) : libre jusqu'à la
 * mi-parcours, ou pourquoi il ne change plus — `null` quand il n'y a rien à dire (une mission,
 * une colonne à terre d'une nation sans l'atout).
 */
export type CourseNote =
  | { readonly kind: 'free'; readonly until: number }
  | { readonly kind: 'changed'; readonly at: number }
  | { readonly kind: 'pastHalfway'; readonly at: number }
  | { readonly kind: 'ashore' }
  | { readonly kind: 'others' };

export function courseNoteOf(
  asset: Asset | null,
  arc: MyArc,
  now: number,
  mode: SeasonMode,
): CourseNote | null {
  /** L'atout est de la Mondiale seule : en Blitz, la fiche n'a rien à dire du cap. */
  if (mode === 'blitz') return null;
  const course = courseOfArc(arc);
  switch (courseRefusalOf(asset, course, now)) {
    case null:
      return { kind: 'free', until: halfwayOf(course.force) };
    case 'COURSE_ALREADY_CHANGED':
      return { kind: 'changed', at: course.courseChangedAt! };
    case 'PAST_HALFWAY':
      return { kind: 'pastHalfway', at: halfwayOf(course.force) };
    case 'NOT_AT_SEA':
      return { kind: 'ashore' };
    case 'NO_CARRIER_DOCTRINE':
      return isSteered(course.type) && mediumAt(course.force, now) === 'sea'
        ? { kind: 'others' }
        : null;
    case 'COURSE_ON_MISSION':
      return null;
  }
}

/** **La prochaine heure où une fiche change d'avis** (#449) : la mi-parcours à venir d'une de mes
 *  flottes, que le client attend pour relire le cap — `null` sans atout ou sans mi-parcours devant. */
export function nextCourseTurnAt(
  arcs: ReadonlyArray<ArcView>,
  asset: Asset | null,
  now: number,
): number | null {
  if (asset !== 'carrierDoctrine') return null;
  const turns = arcs.flatMap((arc) => {
    if (arc.state !== 'mine') return [];
    const halfway = halfwayOf(courseOfArc(arc).force);
    return halfway > now ? [halfway] : [];
  });
  return turns.length === 0 ? null : Math.min(...turns);
}
