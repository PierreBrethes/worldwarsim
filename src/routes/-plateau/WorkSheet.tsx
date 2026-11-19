import { useEffect } from 'react';
import type { Seat } from '@/data/session';
import { cancelWorkRefusalOf } from '@/domain/construction';
import type { PlayerView } from '@/domain/player-view';
import { countdownLabel, fr } from '@/i18n/fr';
import { BottomSheet } from '@/shell/BottomSheet';
import { useClock } from '@/shell/clock';
import { useCancelWork, worksOf } from './works';

/**
 * **La fiche d'un chantier, au téléphone** (#587) : la ligne de travail touchée sur la carte — son
 * rang, sa durée, ce qu'il ne forme pas encore. « Annuler » rend la mise d'une ligne en file ; une
 * tête commencée dit sa phrase à la place du bouton (`cancelWorkRefusalOf`, la règle de
 * `constructions.cancel`). Le chantier fini s'en va avec sa ligne : la fiche se ferme.
 */
export function WorkSheet({
  view,
  seat,
  workId,
  onClose,
}: {
  view: PlayerView;
  seat: Seat;
  workId: string;
  onClose: () => void;
}) {
  const now = useClock();
  const { cancel, error } = useCancelWork(seat, onClose);
  const works = worksOf(view, now);
  const index = works.findIndex(({ work }) => work.id === workId);
  const line = works[index];
  useEffect(() => {
    if (line === undefined) onClose();
  }, [line, onClose]);
  if (line === undefined) return null;
  const { work, running, total, left, name } = line;
  const refusal = cancelWorkRefusalOf({ started: running });
  return (
    <BottomSheet
      title={name}
      aside={
        <span className="min-w-0 truncate text-[12px] text-[var(--ink-soft)]">
          {work.regionName}
        </span>
      }
      onClose={onClose}
      initial="peek"
      hug
      keepsSelection
    >
      <div className="grid gap-[8px] px-4 py-[12px]">
        <p className="text-[13px] font-bold">
          {running
            ? `${fr.personalBoard.workSiteHead} · ${countdownLabel(left * 60_000)}`
            : `${fr.personalBoard.workSiteRank(index + 1)} · ${countdownLabel(total * 60_000)}`}
        </p>
        <p className="text-[12.5px] leading-[1.4] text-[var(--ink-soft)]">
          {fr.personalBoard.workSiteNothing}
        </p>
        {refusal !== null ? (
          <p className="text-[12px] leading-[1.4] text-[var(--ink-soft)]">{fr.errors[refusal]()}</p>
        ) : (
          !view.me.defeated && (
            <button
              type="button"
              title={fr.economy.queueCancelTitle}
              onClick={() => cancel(work.id)}
              className="min-h-[44px] w-full cursor-pointer border border-[var(--ink)] px-[12px] text-[11px] font-bold tracking-[.16em] uppercase"
            >
              {fr.economy.queueCancel}
            </button>
          )
        )}
        {error !== null && <p className="text-[11px] text-[var(--critical)]">{error}</p>}
      </div>
    </BottomSheet>
  );
}
