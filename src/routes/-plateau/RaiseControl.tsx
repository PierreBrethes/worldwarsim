import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { upgradeHold, type UpgradeHold } from '@/domain/construction';
import { asDuration } from '@/domain/duration';
import { RESOURCES, type BuildingKey } from '@/domain/ids';
import { currentMinutes, type Building, type PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';

export type Queued = {
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly name: string;
};

/**
 * **Monter d'un niveau, d'un toucher** : la mutation d'`UpgradeControl` et la même retenue
 * (`upgradeHold`). Ce qui retient se dit à la place du bouton — en chantier et son heure, son rang
 * en file, le plafond du QG, la matière qui manque — et jamais grisé. Un observateur n'y trouve
 * rien à toucher. `wide` est la marche du quartier général, sur toute la largeur de sa carte.
 */
export function RaiseControl({
  building,
  view,
  seat,
  now,
  onQueued,
  wide = false,
}: {
  building: Building;
  view: PlayerView;
  seat: Seat;
  now: number;
  /** Absent, la retenue suffit : « en file · 2ᵉ » remplace le bouton dès que la vue le sait. */
  onQueued?: (queued: Queued) => void;
  wide?: boolean;
}) {
  const start = useMutation(api.constructions.start);
  const [error, setError] = useState<string | null>(null);
  if (view.me.defeated) return null;
  const hold = upgradeHold(building, view, now);
  const next = building.level + 1;

  if (hold !== null)
    return (
      <span
        className={`shrink-0 px-1 text-[10.5px] leading-[1.35] font-bold tracking-[.1em] uppercase ${
          wide ? 'block pt-1' : 'w-[128px] text-right'
        }`}
        style={{ color: hold.kind === 'materials' ? 'var(--critical)' : 'var(--ink-soft)' }}
      >
        {holdText(hold, building, view, now)}
      </span>
    );

  return (
    <span className={`flex shrink-0 flex-col gap-1 ${wide ? '' : 'w-[128px]'}`}>
      <button
        type="button"
        title={fr.works.raiseTitle(building.name, next)}
        onClick={() => {
          setError(null);
          start({ ...seat, building: building.key, regionId: building.regionId }).then(
            () =>
              onQueued?.({ key: building.key, regionId: building.regionId, name: building.name }),
            (problem: unknown) => handleError(problem, setError),
          );
        }}
        className={`flex min-h-[50px] cursor-pointer text-left ${
          wide
            ? 'items-center justify-between bg-[var(--ink)] px-[14px] text-[var(--paper)]'
            : 'flex-col items-start justify-center gap-[5px] border border-[var(--ink)] bg-(--paper)/40 px-[10px]'
        }`}
      >
        <span className="text-[10.5px] leading-none font-bold tracking-[.12em] uppercase">
          {fr.works.raise(next, asDuration(building.nextLevelMinutes))}
        </span>
        <span
          className={`font-(family-name:--font-mono) text-[10.5px] leading-none ${
            wide ? 'text-[var(--paper-dim-2)]' : 'text-[var(--ink-quiet)]'
          }`}
        >
          {billOf(building.nextLevelCost)}
        </span>
      </button>
      {error !== null && (
        <span className="text-[11px] leading-[1.35] text-[var(--critical)]">{error}</span>
      )}
    </span>
  );
}

/** Ce que la retenue d'une marche dit d'elle-même, sur une ligne. Une entrée retenue par la file
 *  dit si elle avance déjà, ou à quel rang elle attend. */
function holdText(hold: UpgradeHold, building: Building, view: PlayerView, now: number): string {
  switch (hold.kind) {
    case 'alreadyQueued': {
      const running = view.me.construction;
      if (running !== null && running.regionId === building.regionId)
        return fr.works.underway(
          asDuration(currentMinutes(running.minutesLeft, view.loadedAt, now)),
        );
      const rank = view.me.constructionQueue.findIndex(
        (entry) => entry.regionId === building.regionId,
      );
      return fr.works.queued(rank + 2);
    }
    case 'cappedByHq':
      return fr.economy.cappedByHq;
    case 'materials':
      return fr.works.lacking(hold.needed - hold.available, fr.resources[hold.resource]);
  }
}

/** La facture en abrégé, matière par matière : « 240 all. · 80 cha. ». */
const billOf = (cost: Building['nextLevelCost']): string =>
  RESOURCES.filter((key) => (cost[key] ?? 0) > 0)
    .map((key) => fr.works.cost(cost[key] ?? 0, fr.resourceBand.abbreviations[key]))
    .join(' · ');
