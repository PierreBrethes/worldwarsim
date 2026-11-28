import { cardName, countryLabel, fr } from '@/i18n/fr';
import { researchMs, researchProgressOf, searcherOf } from './research';
import { foundationMinutes } from './level-speed';
import { isOutpostWork, type BuildingKey, type UnitRole } from './ids';
import { lotFinishesAt, type PlayerView } from './player-view';
import type { LonLat } from './geo';
import { representativeRole } from './troops';
import { borderResolution } from './arc-timing';
import { outpostNameIn } from './patrol';
import { keptLevelOf } from './construction';

/**
 * **Où la carte va quand on touche une ligne.** Le domaine ne connaît pas les étiquettes du
 * plateau : il dit *quoi*, un mouvement, un mât ou un point, et le plateau sait quel marqueur le
 * dessine.
 */
export type UnderwayPlace =
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
  /** **Un mouvement tient un slot, sauf un retour** (`claimSlot`) et la marche d'une ronde ou d'une
   *  tournée, qui garde le sien à l'arrivée : seul lui compte dans « tient un slot » et dans la
   *  phrase du refus. */
  readonly holdsSlot: boolean;
  /** L'instant où ce slot se rend : l'arrivée, non `endsAt`, qui peut être la fin d'une marche vers
   *  une plage de repos. */
  readonly slotFreedAt?: number;
  /** **La durée entière dont la jauge se tire**, en ms ; absente quand la vue ne la porte pas :
   *  la jauge n'est alors pas dessinée plutôt que devinée. Celle d'une fondation est une
   *  approximation : la durée au niveau du QG d'aujourd'hui, que la vue ne date pas. */
  readonly span?: number;
  /** **Une ronde qu'on peut rappeler** (#376) : sa troupe. */
  readonly recall?: string;
  /** **Figé** sous son QG désactivé (ADR 0046 §8) : son reste, en ms, qui ne décompte pas. */
  readonly frozenMs?: number;
};

/** **Ce qui reste à une ligne à `now`** : figée, son reste ne bouge pas. La colonne et le tiroir. */
export const underwayLeftMs = (line: Underway, now: number): number =>
  line.frozenMs ?? line.endsAt - now;

const frozenLabel = (work: { readonly frozen?: true }, label: string): string =>
  work.frozen === true ? fr.underway.frozen(label) : label;

/** La tête de file figée : son reste fixe, et le mot qui le dit. */
const frozenOf = (work: { readonly minutesLeft: number; readonly frozen?: true }) =>
  work.frozen === true ? { frozenMs: work.minutesLeft * 60_000 } : {};

/** Un lot de recrutement commencé, tel que l'atelier le date (`troops.workshop`) : il n'est pas
 *  dans la vue, qui ne sert que la liste des casernes occupées. */
export type RecruitmentDue = {
  readonly buildingId: string;
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly regionName: string;
  readonly endsAt: number;
  /** La durée de la formation, quand l'atelier la sert (`troops.workshop`). */
  readonly span?: number;
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
export function underwayOf(
  view: PlayerView,
  recruitments: ReadonlyArray<RecruitmentDue>,
): ReadonlyArray<Underway> {
  const at = (minutes: number) => view.loadedAt + minutes * 60_000;
  const lines: Underway[] = [];

  const patrolling = view.me.troops.filter((troop) => troop.patrol !== undefined);
  for (const arc of view.arcs) {
    if (arc.state !== 'mine') continue;
    const patroller = patrolling.find((troop) => arc.troopIds.includes(troop.id));
    const patrol = patroller?.patrol;
    /** Une ronde ou une tournée garde son slot à l'arrivée : sa marche n'en rend aucun. */
    const keepsSlot = view.me.troops.some(
      (troop) =>
        (troop.patrol !== undefined || troop.tour !== undefined) && arc.troopIds.includes(troop.id),
    );
    const holdsSlot = arc.type !== 'return' && !keepsSlot;
    const endsAt = borderResolution(arc.schedule) ?? arc.schedule.arrivesAt;
    lines.push({
      id: `movement-${arc.id}`,
      endsAt,
      span: endsAt - arc.schedule.departedAt,
      label:
        patrol !== undefined
          ? fr.patrol.state({ ...patrol, to: outpostNameIn(view.me, patrol.to), here: null })
          : fr.underway.movement(
              arc.airdrop === 'out' ? fr.airdropMovement : fr.movementTypes[arc.type],
              arc.destinationLabel,
            ),
      face: { kind: 'unit', role: representativeRole(arc.stack) },
      place: { kind: 'movement', arcId: arc.id },
      moving: true,
      holdsSlot,
      ...(holdsSlot ? { slotFreedAt: arc.schedule.arrivesAt } : {}),
      ...(patrol === undefined || patrol.recalled ? {} : { recall: patroller!.id }),
    });
  }

  for (const work of view.me.construction === null ? [] : [view.me.construction]) {
    if (isOutpostWork(work.key)) {
      const outpost = view.me.outposts.find((candidate) => candidate.id === work.outpostId);
      if (outpost !== undefined)
        lines.push({
          id: `construction-${work.id}`,
          endsAt: at(work.minutesLeft),
          ...frozenOf(work),
          ...(work.minutes === undefined ? {} : { span: work.minutes * 60_000 }),
          label: frozenLabel(
            work,
            work.respecialize
              ? fr.underway.respecialize(fr.specialties[work.specialty ?? 'general'])
              : fr.underway.raise(
                  outpost.level + 1,
                  work.specialty === null ? undefined : fr.specialties[work.specialty],
                ),
          ),
          face: { kind: 'outpost' },
          place: { kind: 'outpost', outpostId: outpost.id },
          moving: false,
          holdsSlot: false,
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
        ...frozenOf(work),
        ...(work.minutes === undefined ? {} : { span: work.minutes * 60_000 }),
        label: frozenLabel(
          work,
          fr.underway.construction(
            work.name,
            standing !== undefined
              ? standing.level + 1
              : work.kept === undefined
                ? 1
                : keptLevelOf(work.kept, view.me.hqLevel),
          ),
        ),
        face: { kind: 'building', key: work.key },
        place: { kind: 'building', regionId: work.regionId, key: work.key, point: work.point },
        moving: false,
        holdsSlot: false,
      });
    }
  }

  /** **Une ronde en halte** (#376) : la garnison qu'elle tient, jusqu'à son départ. */
  for (const troop of patrolling) {
    const station = troop.stationedAt;
    if (troop.patrol?.haltUntil == null || station.kind !== 'outpost') continue;
    lines.push({
      id: `patrol-${troop.id}`,
      endsAt: troop.patrol.haltUntil,
      label: fr.patrol.state({
        ...troop.patrol,
        to: outpostNameIn(view.me, troop.patrol.to),
        here: outpostNameIn(view.me, station.outpostId),
      }),
      face: { kind: 'unit', role: troop.role },
      place: { kind: 'outpost', outpostId: station.outpostId },
      moving: false,
      holdsSlot: false,
      recall: troop.id,
    });
  }

  for (const outpost of view.me.outposts) {
    if (outpost.standsAt === null) continue;
    lines.push({
      id: `foundation-${outpost.id}`,
      endsAt: outpost.standsAt,
      span: foundationMinutes(view.me.hqLevel) * 60_000,
      label: fr.underway.foundation(countryLabel(outpost.hostCountry)),
      face: { kind: 'outpost' },
      place: { kind: 'outpost', outpostId: outpost.id },
      moving: false,
      holdsSlot: false,
    });
  }

  for (const recruitment of recruitments) {
    lines.push({
      id: `recruitment-${recruitment.buildingId}`,
      endsAt: recruitment.endsAt,
      ...(recruitment.span === undefined ? {} : { span: recruitment.span }),
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
      holdsSlot: false,
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
      span: research.totalMs ?? researchMs(research.card),
      label: fr.research.onCenter(cardName(research.card)),
      face: { kind: 'building', key: 'researchCenter' },
      place: {
        kind: 'building',
        regionId: center.regionId,
        key: 'researchCenter',
        point: center.point,
      },
      moving: false,
      holdsSlot: false,
    });

  for (const chain of view.me.chains) {
    const finishesAt = lotFinishesAt(chain, view.loadedAt);
    const site = view.me.buildings.find((building) => building.key === chain.by);
    if (finishesAt === null || chain.order === null || site === undefined) continue;
    lines.push({
      id: `lot-${chain.by}`,
      endsAt: finishesAt,
      span:
        (chain.order.ordered / (chain.state === 'running' ? chain.nominalPerHour : chain.perHour)) *
        3_600_000,
      label: fr.underway.lot(chain.order.ordered, fr.resources[chain.output]),
      face: { kind: 'building', key: chain.by },
      place: { kind: 'building', regionId: site.regionId, key: site.key, point: site.point },
      moving: false,
      holdsSlot: false,
    });
  }

  return lines.sort((first, second) => first.endsAt - second.endsAt);
}

/**
 * **Le refus que le volet dit sous les mouvements** (ADR 0015) quand tous les slots sont pris : à
 * quelle échéance le prochain se libère. Les lignes qui tiennent un slot doivent égaler `used` ;
 * sinon (Halifax épargne un mouvement maritime, une colonne qu'on ne lit pas) on ne nomme rien
 * qu'on ne sache, et on dit seulement que les slots sont engagés. `lines` est déjà trié.
 */
export function slotsRefusalOf(
  slots: { readonly total: number; readonly used: number },
  lines: ReadonlyArray<Underway>,
):
  | { readonly kind: 'frees'; readonly line: Underway; readonly at: number }
  | { readonly kind: 'engaged' }
  | null {
  if (slots.used < slots.total) return null;
  const holders = lines.filter((line) => line.holdsSlot);
  if (holders.length === 0 || holders.length !== slots.used) return { kind: 'engaged' };
  const freedAt = (line: Underway) => line.slotFreedAt ?? line.endsAt;
  const first = holders.reduce((best, line) => (freedAt(line) < freedAt(best) ? line : best));
  return { kind: 'frees', line: first, at: freedAt(first) };
}
