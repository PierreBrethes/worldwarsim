import { keptLevelOf } from './construction';
import type { LonLat } from './geo';
import { RESOURCES, isOutpostWork, type BuildCostKey, type ResourceKey } from './ids';
import { worksMinutes } from './level-speed';
import { currentStock, workMinutesLeft, type PlayerView } from './player-view';
import { underwayOf, type RecruitmentDue, type UnderwayPlace } from './underway';
import { fr } from '@/i18n/fr';

/** **Le tableau de marche** (#719) : la barre fine et la feuille qui montrent, sur douze heures, ce
 *  qui tombe. Rien n'y est recalculé : les mouvements sont les lignes de `underwayOf`, la tête de
 *  file se lit comme `workMinutesLeft`, une ligne en file dure `worksMinutes` (celle que
 *  `worksOf` du plateau affiche), un stock se lit à `currentStock`. */
export const MARCH_HORIZON_MS = 12 * 3_600_000;
/** La première heure se lit à part : c'est là que les décisions se prennent. */
export const MARCH_FIRST_HOUR_MS = 3_600_000;
/** @a-mesurer : la part de la largeur que prend la première heure ; les onze suivantes se
 *  partagent le reste. */
export const FIRST_HOUR_SHARE = 0.35;

/** **Où tombe un délai sur la largeur**, de 0 (maintenant) à 1 (l'horizon) : deux zones linéaires.
 *  Rien avant maintenant, rien au-delà de l'horizon. */
export function positionOf(delayMs: number): number {
  if (delayMs <= 0) return 0;
  if (delayMs >= MARCH_HORIZON_MS) return 1;
  if (delayMs <= MARCH_FIRST_HOUR_MS) return FIRST_HOUR_SHARE * (delayMs / MARCH_FIRST_HOUR_MS);
  return (
    FIRST_HOUR_SHARE +
    (1 - FIRST_HOUR_SHARE) *
      ((delayMs - MARCH_FIRST_HOUR_MS) / (MARCH_HORIZON_MS - MARCH_FIRST_HOUR_MS))
  );
}

/** `placed` : tombe dans l'horizon. Ce qui tombe après est compté (`MarchSchedule.beyond`), pas placé.
 *  `place` : où la carte va au clic, comme `Underway.place`. Une arrivée déjà passée se lit à
 *  `now` : la durée a pour plancher « maintenant ». */
type MarchMovement = {
  readonly id: string;
  readonly label: string;
  readonly arrivesAt: number;
  readonly placed: boolean;
  readonly place: UnderwayPlace;
};

/** **Ce que la marche ne date pas d'elle-même** : recrutements, recherche, lots, fondations et
 *  haltes de ronde, les lignes de `underwayOf` qui ne sont ni mouvement ni chantier. */
type MarchOther = {
  readonly id: string;
  readonly label: string;
  readonly endsAt: number;
  readonly placed: boolean;
  readonly place: UnderwayPlace;
};

/** Un chantier de la file : bout à bout avec le précédent. `placed` : il commence dans l'horizon ;
 *  un chantier qui l'enjambe est placé, sa fin dépasse. */
type MarchWork = {
  readonly id: string;
  readonly label: string;
  readonly running: boolean;
  /** Figé sous son QG désactivé (ADR 0046 §8) : sa fin recule avec l'horloge. */
  readonly frozen: boolean;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly placed: boolean;
  readonly place: UnderwayPlace;
};

type MarchStock = {
  readonly resource: ResourceKey;
  readonly level: number;
  readonly cap: number;
  readonly ratePerHour: number;
  readonly dryAt: number;
  readonly placed: boolean;
};

type MarchFamily = 'movement' | 'works' | 'stock' | 'edition' | 'other';

/** Une échéance placée, toutes familles confondues : ce que l'onglet replié dit. */
type MarchDue = {
  readonly family: MarchFamily;
  readonly id: string;
  readonly label: string;
  readonly at: number;
};

export type MarchSchedule = {
  readonly now: number;
  readonly horizonAt: number;
  /** Du plus proche au plus lointain. */
  readonly movements: ReadonlyArray<MarchMovement>;
  /** Le chantier en cours puis la file, dans l'ordre où ils se font. */
  readonly works: ReadonlyArray<MarchWork>;
  /** L'instant où la file se vide ; `null` sans chantier. Peut dépasser l'horizon. */
  readonly queueEmptiesAt: number | null;
  /** Une entrée par ressource au débit négatif, de la plus proche de sa fin à la plus lointaine. */
  readonly stocks: ReadonlyArray<MarchStock>;
  /** Recrutements, recherche, lots, fondations, haltes de ronde : du plus proche au plus lointain. */
  readonly other: ReadonlyArray<MarchOther>;
  /** La prochaine édition de la presse ; `null` si finale, passée ou sans édition. */
  readonly edition: number | null;
  /** La prochaine échéance placée. Une file figée n'y entre pas : sa fin recule avec l'horloge. */
  readonly next: MarchDue | null;
  /** Les échéances placées autres que `next`. */
  readonly others: number;
  /** Ce qui tombe après l'horizon, compté par famille : chaque ligne de la feuille dit le sien. */
  readonly beyond: Readonly<Record<MarchFamily, number>>;
};

/** **Rien ne court** : aucune ligne, placée ou au-delà, et pas d'édition à venir. Ce que l'onglet
 *  replié dit « rien en cours ». */
export const marchIdleOf = (schedule: MarchSchedule): boolean =>
  schedule.movements.length === 0 &&
  schedule.works.length === 0 &&
  schedule.stocks.length === 0 &&
  schedule.other.length === 0 &&
  schedule.edition === null;

/** Où la carte va pour un chantier : l'avant-poste qu'il élève, ou le point du bâtiment. */
const placeOfWork = (work: {
  readonly id: string;
  readonly key: BuildCostKey;
  readonly outpostId: string | null;
  readonly regionId: string;
  readonly point: LonLat | null;
}): UnderwayPlace =>
  work.outpostId === null && !isOutpostWork(work.key)
    ? { kind: 'building', regionId: work.regionId, key: work.key, point: work.point }
    : { kind: 'outpost', outpostId: work.outpostId ?? work.id };

/**
 * **Les échéances du joueur sur douze heures, par famille** (#719, #733 ; Mondiale seule : `null`
 * en Blitz). Les recrutements ne sont pas dans la vue : l'atelier les date à part, et l'appelant
 * les passe comme à `underwayOf`, dont les autres lignes (recherche, lots, fondations, haltes)
 * forment la famille `other`.
 */
export function marchScheduleOf(
  view: PlayerView,
  now: number,
  recruitments: ReadonlyArray<RecruitmentDue> = [],
): MarchSchedule | null {
  if (view.mode === 'blitz') return null;
  const horizonAt = now + MARCH_HORIZON_MS;
  const lines = underwayOf(view, recruitments);

  const movements = lines
    .filter((line) => line.place.kind === 'movement')
    .map((line) => {
      const arrivesAt = Math.max(line.endsAt, now);
      return {
        id: line.id,
        label: line.label,
        arrivesAt,
        placed: arrivesAt <= horizonAt,
        place: line.place,
      };
    });

  const other = lines
    .filter((line) => line.place.kind !== 'movement' && !line.id.startsWith('construction-'))
    .map((line) => {
      const endsAt = Math.max(line.endsAt, now);
      return {
        id: line.id,
        label: line.label,
        endsAt,
        placed: endsAt <= horizonAt,
        place: line.place,
      };
    });

  const { construction, constructionQueue, hqLevel } = view.me;
  const works: MarchWork[] = [];
  let cursor = now;
  const lined = (work: { name: string; level: number; kept?: number }) =>
    fr.personalBoard.work(
      work.name,
      work.kept === undefined ? work.level : keptLevelOf(work.kept, hqLevel),
    );
  if (construction !== null) {
    const endsAt = now + workMinutesLeft(construction, view.loadedAt, now) * 60_000;
    works.push({
      id: construction.id,
      label: lined(construction),
      running: true,
      frozen: construction.frozen === true,
      startsAt: now,
      endsAt,
      placed: now <= horizonAt,
      place: placeOfWork(construction),
    });
    cursor = endsAt;
  }
  for (const work of constructionQueue) {
    const endsAt = cursor + worksMinutes(work.key, work.level, hqLevel) * 60_000;
    works.push({
      id: work.id,
      label: lined(work),
      running: false,
      frozen: false,
      startsAt: cursor,
      endsAt,
      placed: cursor < horizonAt,
      place: placeOfWork(work),
    });
    cursor = endsAt;
  }

  const stocks = RESOURCES.flatMap((resource): MarchStock[] => {
    const held = view.me.resources[resource];
    if (held.ratePerHour >= 0) return [];
    const level = currentStock(held, view.loadedAt, now);
    const dryAt = now + (level / -held.ratePerHour) * 3_600_000;
    return [
      {
        resource,
        level,
        cap: held.cap,
        ratePerHour: held.ratePerHour,
        dryAt,
        placed: dryAt <= horizonAt,
      },
    ];
  }).sort((first, second) => first.dryAt - second.dryAt);

  const next = view.press?.next ?? null;
  const edition = next !== null && next > now ? next : null;

  /** Sous un QG désactivé la tête ne décompte pas, et la file derrière elle attend : aucune de
   *  leurs fins n'est une échéance. */
  const stalled = works[0]?.frozen === true;
  const dues: MarchDue[] = [
    ...movements
      .filter((one) => one.placed)
      .map((one) => ({
        family: 'movement' as const,
        id: one.id,
        label: one.label,
        at: one.arrivesAt,
      })),
    ...works
      .filter((one) => one.placed && !stalled)
      .map((one) => ({ family: 'works' as const, id: one.id, label: one.label, at: one.endsAt })),
    ...stocks
      .filter((one) => one.placed)
      .map((one) => ({
        family: 'stock' as const,
        id: one.resource,
        label: fr.march.dry(fr.resources[one.resource]),
        at: one.dryAt,
      })),
    ...other
      .filter((one) => one.placed)
      .map((one) => ({ family: 'other' as const, id: one.id, label: one.label, at: one.endsAt })),
    ...(edition !== null && edition <= horizonAt
      ? [{ family: 'edition' as const, id: 'edition', label: fr.march.editionDue, at: edition }]
      : []),
  ].sort((first, second) => first.at - second.at);

  return {
    now,
    horizonAt,
    movements,
    works,
    queueEmptiesAt: works.length === 0 ? null : cursor,
    stocks,
    other,
    edition,
    next: dues[0] ?? null,
    others: Math.max(0, dues.length - 1),
    beyond: {
      movement: movements.filter((one) => !one.placed).length,
      works: works.filter((one) => !one.placed).length,
      stock: stocks.filter((one) => !one.placed).length,
      other: other.filter((one) => !one.placed).length,
      edition: edition !== null && edition > horizonAt ? 1 : 0,
    },
  };
}

/** Les largeurs d'une étiquette d'heure (« 11 h ») et de l'air qu'elle garde, en pixels d'écran :
 *  mesurées sur la règle de la feuille. @a-mesurer */
const HOUR_LABEL_PX = 29;
const HOUR_LABEL_AIR = 24;

/**
 * **Les heures que la règle étiquette**, d'après le pas d'une heure en pixels d'écran (`0` : pas
 * encore mesuré, toutes). L'heure 1 ferme la zone teintée et la 12 ferme la règle : elles se lisent
 * toujours, et quand deux voisines se chevaucheraient, celle de 12 h gagne. Sous un pas de deux
 * étiquettes, une sur deux.
 */
export function hourLabelsOf(hourStepPx: number): ReadonlyArray<number> {
  const hours = Array.from({ length: 12 }, (_, rank) => rank + 1);
  if (hourStepPx <= 0) return hours;
  const thin = hourStepPx < 2 * HOUR_LABEL_PX + 4;
  return hours.filter((hour) => {
    if (hour === 1 || hour === 12) return true;
    // « 12 h » est calée sur le bord, « 11 h » sur son trait : un pas court les superpose.
    if (hour === 11 && hourStepPx < 2 * HOUR_LABEL_PX + HOUR_LABEL_AIR) return false;
    return !thin || hour % 2 === 0;
  });
}
