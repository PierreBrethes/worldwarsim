import { cardName, countryLabel, fr } from '@/i18n/fr';
import { researchProgressOf, searcherOf } from './research';
import { isOutpostWork, type BuildingKey, type UnitRole } from './ids';
import { lotFinishesAt, type PlayerView } from './player-view';
import type { LonLat } from './geo';
import { representativeRole } from './troops';

/**
 * **Où la carte va quand on touche une ligne.** Le domaine ne connaît pas les étiquettes du
 * plateau : il dit *quoi*, un mouvement, un mât ou un point, et le plateau sait quel marqueur le
 * dessine.
 */
type UnderwayPlace =
  | { readonly kind: 'movement'; readonly arcId: string }
  | {
      readonly kind: 'building';
      readonly regionId: string;
      readonly key: BuildingKey;
      /** Where its mast stands (ADR 0029) — `null` when the view does not carry it. */
      readonly point: LonLat | null;
    }
  | { readonly kind: 'outpost'; readonly outpostId: string };

/** Le visage d'une ligne : la planche de ce qui marche, ou celle de ce qui se bâtit. */
export type UnderwayFace =
  | { readonly kind: 'unit'; readonly role: UnitRole | null }
  | { readonly kind: 'building'; readonly key: BuildingKey }
  | { readonly kind: 'outpost' };

export type Underway = {
  readonly id: string;
  readonly endsAt: number;
  readonly label: string;
  readonly face: UnderwayFace;
  readonly place: UnderwayPlace;
  /** Un mouvement se lit à l'ambre de son fil ; le reste à l'encre. */
  readonly moving: boolean;
};

/** Un lot de recrutement commencé, tel que l'atelier le date (`troops.workshop`) : il n'est pas
 *  dans la vue, qui ne sert que la liste des casernes occupées. */
export type RecruitmentDue = {
  readonly buildingId: string;
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly regionName: string;
  readonly endsAt: number;
};

/**
 * **Tout ce qui court, du plus proche au plus lointain** (refonte mobile, règle 4 : les horaires
 * sans rien ouvrir). Mouvements, chantier en tête de file, fondations, recrutements commencés et
 * lots commandés — chacun avec l'heure à laquelle il tombe, jamais une estimation de plus que
 * celles que les surfaces impriment déjà : la file d'attente n'a pas d'heure, elle n'y est pas.
 *
 * Un mouvement tenu à une frontière par une plage de repos tombe à sa résolution, qui est
 * l'heure où quelque chose se passera.
 */
/** **Tous les chantiers qui montent**, la tête (`minutesLeft` daté) —
 *  la même lecture que `sitesOf`. */
export function datedWorksOf(
  me: PlayerView['me'],
): ReadonlyArray<NonNullable<PlayerView['me']['construction']>> {
  return [
    ...(me.construction === null ? [] : [me.construction]),
    ...me.constructionQueue.flatMap((queued) =>
      queued.minutesLeft == null ? [] : [{ ...queued, minutesLeft: queued.minutesLeft }],
    ),
  ];
}

export function underwayOf(
  view: PlayerView,
  recruitments: ReadonlyArray<RecruitmentDue>,
): ReadonlyArray<Underway> {
  const at = (minutes: number) => view.loadedAt + minutes * 60_000;
  const lines: Underway[] = [];

  for (const arc of view.arcs) {
    if (arc.state !== 'mine') continue;
    lines.push({
      id: `movement-${arc.id}`,
      endsAt: at(arc.borderWait?.resolutionInMinutes ?? arc.minutesLeft),
      label: fr.underway.movement(
        arc.airdrop === 'out' ? fr.airdropMovement : fr.movementTypes[arc.type],
        arc.destinationLabel,
      ),
      face: { kind: 'unit', role: representativeRole(arc.stack) },
      place: { kind: 'movement', arcId: arc.id },
      moving: true,
    });
  }

  for (const work of datedWorksOf(view.me)) {
    if (isOutpostWork(work.key)) {
      const outpost = view.me.outposts.find((candidate) => candidate.id === work.outpostId);
      if (outpost !== undefined)
        lines.push({
          id: `construction-${work.id}`,
          endsAt: at(work.minutesLeft),
          label: fr.underway.raise(outpost.level + 1),
          face: { kind: 'outpost' },
          place: { kind: 'outpost', outpostId: outpost.id },
          moving: false,
        });
    } else {
      /** La tête de file ne porte pas son niveau : il se lit sur le bâtiment qu'elle monte, et un
       *  bâtiment qui ne se tient pas encore monte au premier. */
      const point = work.point;
      const standing = view.me.buildings.find(
        (building) =>
          point !== null &&
          building.point[0] === point[0] &&
          building.point[1] === point[1] &&
          building.key === work.key,
      );
      lines.push({
        id: `construction-${work.id}`,
        endsAt: at(work.minutesLeft),
        label: fr.underway.construction(work.name, (standing?.level ?? 0) + 1),
        face: { kind: 'building', key: work.key },
        place: { kind: 'building', regionId: work.regionId, key: work.key, point: work.point },
        moving: false,
      });
    }
  }

  for (const outpost of view.me.outposts) {
    if (outpost.standsAt === null) continue;
    lines.push({
      id: `foundation-${outpost.id}`,
      endsAt: outpost.standsAt,
      label: fr.underway.foundation(countryLabel(outpost.hostCountry)),
      face: { kind: 'outpost' },
      place: { kind: 'outpost', outpostId: outpost.id },
      moving: false,
    });
  }

  for (const recruitment of recruitments) {
    lines.push({
      id: `recruitment-${recruitment.buildingId}`,
      endsAt: recruitment.endsAt,
      label: fr.underway.recruitment(recruitment.regionName),
      face: { kind: 'building', key: recruitment.key },
      place: {
        kind: 'building',
        regionId: recruitment.regionId,
        key: recruitment.key,
        point:
          view.me.buildings.find((building) => building.id === recruitment.buildingId)?.point ??
          null,
      },
      moving: false,
    });
  }

  /** La carte que cherche mon Centre ; une carte qui attend un Centre n'a pas d'heure, elle n'y
   *  est pas. */
  const research = view.me.research.running;
  const center = searcherOf(view.me.buildings) ?? undefined;
  const researchEnds =
    research === null ? null : researchProgressOf(research, view.loadedAt).finishesAt;
  if (research !== null && center !== undefined && researchEnds !== null)
    lines.push({
      id: 'research',
      endsAt: researchEnds,
      label: fr.research.onCenter(cardName(research.card)),
      face: { kind: 'building', key: 'researchCenter' },
      place: {
        kind: 'building',
        regionId: center.regionId,
        key: 'researchCenter',
        point: center.point,
      },
      moving: false,
    });

  for (const chain of view.me.chains) {
    const finishesAt = lotFinishesAt(chain, view.loadedAt);
    const site = view.me.buildings.find((building) => building.key === chain.by);
    if (finishesAt === null || chain.order === null || site === undefined) continue;
    lines.push({
      id: `lot-${chain.by}`,
      endsAt: finishesAt,
      label: fr.underway.lot(chain.order.ordered, fr.resources[chain.output]),
      face: { kind: 'building', key: chain.by },
      place: { kind: 'building', regionId: site.regionId, key: site.key, point: site.point },
      moving: false,
    });
  }

  return lines.sort((first, second) => first.endsAt - second.endsAt);
}
