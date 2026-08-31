import type { ReactNode } from 'react';
import { fr, nationLabel, stackLabel } from '@/i18n/fr';
import { DEPOSITS } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { Flag } from '@/emblems/Flag';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

/**
 * **The strategic identity sheet — and nothing else.** It used to carry the census of the
 * fifteen buildings, the placement budget and the headquarters' own button; the playtest had
 * three windows open in cascade to follow a single placement, and the census serves a decision
 * — *what to raise, what to put down next* — that is taken in Economy. So it moved there, with
 * the button, and this sheet stopped managing anything (`ordre-de-mobilisation-et-fenetre-
 * economie.md` §2).
 *
 * **It carries no handler.** Not a disabled one, not a hidden one: what a player reads here he
 * acts on somewhere else, and the surest way to hold that is for the file to import no mutation
 * at all. Occupation and revanchism (design sheet 11 §4.5) will land here for the same reason —
 * they are states, not verbs.
 */
export function NationWindow({
  view,
  onClose,
  ...windowProps
}: WindowProps & { view: PlayerView }) {
  return (
    <FloatingWindow name="nation" onClose={onClose} {...windowProps} alignment="top" width={420}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 items-center gap-[11px] border-b-2 border-[var(--ink)] px-4 py-[10px]">
          <Flag nation={view.me.nation} width={26} onPaper />
          <h1 className="font-(family-name:--font-display) text-[19px] leading-none font-extrabold tracking-[.04em] text-[var(--ink)] uppercase">
            {nationLabel(view.me.nation)}
          </h1>
          <span className="flex-1" />
          <span className="text-[10px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
            {fr.nationSheet.kicker}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Entry header={fr.nationSheet.powerHeader}>
            <p className="text-[13px] leading-[1.5] text-[var(--ink)]">{view.me.power}</p>
          </Entry>

          <NationalGap regions={view.me.regions} />

          <Entry header={fr.nationSheet.armyHeader}>
            <div className="flex flex-col gap-[5px] text-[12.5px]">
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.present}</span>
                <span className="text-right text-[var(--ink)]">
                  {stackLabel(view.me.armyPresent)}
                </span>
              </span>
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.inTransit}</span>
                <span className="text-right text-[var(--ink)]">
                  {stackLabel(view.me.armyInTransit)}
                </span>
              </span>
            </div>
          </Entry>

          <Entry header={fr.nationSheet.restHeader}>
            <p className="font-(family-name:--font-mono) text-[14px] text-[var(--ink)]">
              {view.me.restWindow}
            </p>
            <p className="mt-[3px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.nationSheet.restNote}
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--ink-quiet)] italic">
              {fr.nationSheet.restFrozen}
            </p>
          </Entry>

          <p className="px-4 pt-3 pb-5 text-[11px] leading-[1.45] text-[var(--ink-quiet)] italic">
            {fr.nationSheet.readOnly}
          </p>
        </div>
      </div>
    </FloatingWindow>
  );
}

function Entry({ header, children }: { header: string; children: ReactNode }) {
  return (
    <section className="border-b border-[rgba(42,33,24,.22)] px-4 py-[11px]">
      <h2 className="eyebrow mb-[3px]">{header}</h2>
      {children}
    </section>
  );
}

/**
 * The resource the nation holds no deposit of — beside the power, because it is its
 * counterpart: the ADR 0015 gap is what forces a nation out of its own ground, and the power
 * is what it goes out with. Two nations have none, and one has two: the sentence counts.
 *
 * **Derived, never tabulated.** The deposits held are the ones under the ground the player
 * may build on; the gap is the rest of `DEPOSITS`. A hard-coded table would go on saying
 * "pétrole" the day `generate-deposits.mjs` hands France an oil field — and it would go on
 * saying it after an outpost has won one abroad, which is the same lie in the other
 * direction.
 */
function NationalGap({ regions }: { regions: PlayerView['me']['regions'] }) {
  const held = new Set(regions.map((region) => region.deposit));
  const missing = DEPOSITS.filter((deposit) => !held.has(deposit));

  return (
    <Entry header={fr.nationSheet.gapHeader}>
      <p
        className="text-[13px] leading-[1.5]"
        style={{ color: missing.length === 0 ? 'var(--ink-soft)' : 'var(--ink)' }}
      >
        {missing.length === 0
          ? fr.nationSheet.gapNone
          : fr.nationSheet.gap(missing.map((deposit) => fr.deposits[deposit]))}
      </p>
    </Entry>
  );
}
