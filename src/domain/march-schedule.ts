import { keptLevelOf } from './construction';
import { RESOURCES, type ResourceKey } from './ids';
import { worksMinutes } from './level-speed';
import { currentStock, workMinutesLeft, type PlayerView } from './player-view';
import { underwayOf } from './underway';
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

/** `placed` : tombe dans l'horizon. Ce qui tombe après est compté (`MarchSchedule.beyond`), pas placé. */
type MarchMovement = {
  readonly id: string;
  readonly label: string;
  readonly arrivesAt: number;
  readonly placed: boolean;
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
};

type MarchStock = {
  readonly resource: ResourceKey;
  readonly level: number;
  readonly cap: number;
  readonly ratePerHour: number;
  readonly dryAt: number;
  readonly placed: boolean;
};

type MarchFamily = 'movement' | 'works' | 'stock' | 'edition';

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
  /** La prochaine édition de la presse ; `null` si finale, passée ou sans édition. */
  readonly edition: number | null;
  readonly next: MarchDue | null;
  /** Les échéances placées autres que `next`. */
  readonly others: number;
  /** Ce qui tombe après l'horizon. */
  readonly beyond: number;
};

/**
 * **Les échéances du joueur sur douze heures, par famille** (#719, Mondiale seule : `null` en
 * Blitz). Les recrutements ne s'y trouvent pas : la vue ne les date pas, l'atelier les sert à
 * part (`RecruitmentDue`).
 */
export function marchScheduleOf(view: PlayerView, now: number): MarchSchedule | null {
  if (view.mode === 'blitz') return null;
  const horizonAt = now + MARCH_HORIZON_MS;

  const movements = underwayOf(view, [])
    .filter((line) => line.place.kind === 'movement')
    .map((line) => ({
      id: line.id,
      label: line.label,
      arrivesAt: line.endsAt,
      placed: line.endsAt <= horizonAt,
    }));

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
      .filter((one) => one.placed)
      .map((one) => ({ family: 'works' as const, id: one.id, label: one.label, at: one.endsAt })),
    ...stocks
      .filter((one) => one.placed)
      .map((one) => ({
        family: 'stock' as const,
        id: one.resource,
        label: fr.resources[one.resource],
        at: one.dryAt,
      })),
    ...(edition !== null && edition <= horizonAt
      ? [{ family: 'edition' as const, id: 'edition', label: fr.banner.edition, at: edition }]
      : []),
  ].sort((first, second) => first.at - second.at);

  const unplaced =
    movements.filter((one) => !one.placed).length +
    works.filter((one) => !one.placed).length +
    stocks.filter((one) => !one.placed).length +
    (edition !== null && edition > horizonAt ? 1 : 0);

  return {
    now,
    horizonAt,
    movements,
    works,
    queueEmptiesAt: works.length === 0 ? null : cursor,
    stocks,
    edition,
    next: dues[0] ?? null,
    others: Math.max(0, dues.length - 1),
    beyond: unplaced,
  };
}
