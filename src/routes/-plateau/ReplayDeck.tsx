import { createContext, useContext, useEffect, useState } from 'react';
import { fr, roleLabel } from '@/i18n/fr';
import { tierLabel } from '@/domain/troops';
import type { CombatTally, JournalDispatch, ReplayView } from '@/domain/player-view';
import type { ReplayStep } from '@/domain/replay';
import { Stamp } from '@/shell/Stamp';
import { useNarrowScreen } from '@/shell/viewport';

/**
 * **Ce qui lance le rejeu d'une dépêche**, tendu par le plateau : il rend la phrase du refus, ou
 * `null` quand le rejeu part. Un contexte plutôt qu'une prop, parce que le bouton vit au fond de
 * trois surfaces — la marge du journal, sa manchette au téléphone, la feuille d'arrivée — et
 * qu'aucune n'a autre chose à en faire que de le passer.
 */
export const ReplayLaunch = createContext<
  ((dispatch: JournalDispatch) => Promise<string | null>) | null
>(null);

/** **« Rejouer », sur une dépêche de combat et sur elle seule** : la vue ne sert de compte rendu
 *  qu'au camp qui s'est battu, donc toute dépêche qui en porte un est un combat à soi. */
export function ReplayButton({
  dispatch,
  className,
}: {
  dispatch: JournalDispatch;
  className: string;
}) {
  const launch = useContext(ReplayLaunch);
  const [refusal, setRefusal] = useState<string | null>(null);
  if (launch === null || dispatch.combat === null) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => void launch(dispatch).then(setRefusal)}
      >
        {fr.replay.play}
      </button>
      {refusal !== null && (
        <span role="status" className="text-[11.5px] text-[var(--critical)]">
          {refusal}
        </span>
      )}
    </>
  );
}

/**
 * **Le bandeau du rejeu, et le cartouche du compte rendu** (surface 4.7, grilling du 13/10).
 * Discret, en bas : l'étape nommée, lecture ou pause, les flèches, quitter. Quitter se confirme,
 * Échap compris — un rejeu de dix secondes ne se perd pas sur une touche.
 */
export function ReplayDeck({
  view,
  said,
  step,
  playing,
  onToggle,
  onStep,
  onLeave,
}: {
  view: ReplayView;
  /** La phrase de la dépêche : le cartouche la reprend telle quelle. */
  said: string;
  step: ReplayStep | null;
  playing: boolean;
  onToggle: () => void;
  onStep: (direction: 1 | -1) => void;
  onLeave: () => void;
}) {
  const narrow = useNarrowScreen();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLeaving(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const frame = `cursor-pointer border border-[var(--ink)] px-3 font-semibold tracking-[.16em] uppercase ${
    narrow ? 'min-h-[44px] flex-1' : 'py-[6px]'
  }`;
  const control = `${frame} text-[10.5px]`;
  /** Un chevron en petites capitales se perdait dans un bouton de 44 px au pouce. */
  const arrow = `${frame} ${narrow ? 'text-[18px] leading-none' : 'text-[10.5px]'}`;
  return (
    /* Au téléphone, le relief de « à faire » monte de la barre de pied dans le bandeau : la marge
       basse le laisse sous les boutons au lieu de les toucher. */
    <div
      className={`paper-grain absolute bottom-0 flex flex-col gap-2 border border-[var(--ink)] text-[var(--ink)] ${
        narrow
          ? 'inset-x-0 border-x-0 border-b-0 px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]'
          : 'left-1/2 mb-4 w-[min(560px,calc(100%-32px))] -translate-x-1/2 px-4 py-3'
      }`}
    >
      {step === 'compte-rendu' && <ReplayAccount view={view} said={said} />}
      {leaving ? (
        <div
          role="alertdialog"
          aria-label={fr.replay.leaveQuestion}
          className="flex flex-col gap-2"
        >
          <span className="font-(family-name:--font-display) text-[17px] font-bold">
            {fr.replay.leaveQuestion}
          </span>
          <span className="text-[12px] text-[var(--ink-soft)]">{fr.replay.leaveNote}</span>
          <div className="flex gap-2">
            <button
              type="button"
              autoFocus
              className={`${control} bg-[var(--ink)] text-[var(--paper)]`}
              onClick={onLeave}
            >
              {fr.replay.leave}
            </button>
            <button type="button" className={control} onClick={() => setLeaving(false)}>
              {fr.replay.stay}
            </button>
          </div>
        </div>
      ) : (
        <div className={`flex items-center gap-2 ${narrow ? 'flex-wrap' : ''}`}>
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="text-[10px] font-bold tracking-[.2em] text-[var(--ink-soft)] uppercase">
              {fr.replay.kicker}
            </span>
            <span className="truncate font-(family-name:--font-display) text-[16px] font-bold">
              {step === null
                ? ''
                : step === 'frappe' || step === 'riposte'
                  ? `${fr.replay.steps[step]} — ${fr.replay.whose((step === 'frappe') === (view.side === 'attacker'))}`
                  : fr.replay.steps[step]}
            </span>
          </span>
          <span className={`flex gap-2 ${narrow ? 'w-full' : ''}`}>
            <button
              type="button"
              aria-label={fr.replay.previous}
              className={arrow}
              onClick={() => onStep(-1)}
            >
              ‹
            </button>
            <button type="button" className={control} onClick={onToggle}>
              {playing ? fr.replay.pause : fr.replay.resume}
            </button>
            <button
              type="button"
              aria-label={fr.replay.next}
              className={arrow}
              onClick={() => onStep(1)}
            >
              ›
            </button>
            <button type="button" className={control} onClick={() => setLeaving(true)}>
              {fr.replay.leave}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** **Le décompte final** : chez nous par rôle et marque, en face de même sous sa nation quand on
 *  l'a vue au feu (F1) — les seuls totaux sur un compte rendu d'avant. */
export function ReplayAccount({ view, said }: { view: ReplayView; said: string }) {
  const mineLost = view.mine.reduce((sum, entry) => sum + entry.lost, 0);
  const mineDry = view.mine.reduce((sum, entry) => sum + (entry.dry ?? 0), 0);
  const cell = 'px-2 py-[3px] text-right font-(family-name:--font-mono) text-[12px]';
  const row = (label: string, tally: CombatTally, rule = 'border-t border-(color:--ink)/20') => (
    <tr key={label} className={rule}>
      <th scope="row" className="py-[3px] pr-2 text-left text-[12.5px] font-normal">
        {label}
      </th>
      <td className={cell}>{tally.troops}</td>
      <td className={cell}>{tally.lost}</td>
      <td className={cell}>{tally.routed}</td>
      <td className={cell}>{tally.destroyed}</td>
    </tr>
  );
  const kinds = (entries: ReplayView['mine']) =>
    entries.map((entry) =>
      row(`${roleLabel(entry.role, entry.troops)} ${tierLabel(entry.tier)}`, entry),
    );
  const heading = (label: string) => (
    <tr>
      <th
        colSpan={5}
        scope="rowgroup"
        className="pt-2 text-left text-[10px] font-bold tracking-[.2em] uppercase"
      >
        {label}
      </th>
    </tr>
  );
  return (
    <section aria-label={fr.replay.steps['compte-rendu']} className="flex flex-col gap-2 pb-1">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1 font-(family-name:--font-text) text-[14px] leading-[1.35] text-pretty">
          {said}
        </span>
        <Stamp
          label={view.won ? fr.replay.held : fr.replay.lost}
          tone={view.won ? 'ink' : 'critical'}
        />
      </div>
      <p className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
        {fr.combat.beats(view.side === 'attacker', mineLost, view.theirs.lost)}
      </p>
      {mineDry + (view.theirs.dry ?? 0) > 0 && (
        <p className="font-(family-name:--font-mono) text-[11.5px] text-[var(--critical)]">
          {fr.dispatchSheet.dryValue(mineDry, view.theirs.dry ?? 0, view.side === 'attacker')}
        </p>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[9.5px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
            <th />
            <th className="px-2 text-right font-normal">{fr.replay.columns.troops}</th>
            <th className="px-2 text-right font-normal">{fr.replay.columns.lost}</th>
            <th className="px-2 text-right font-normal">{fr.replay.columns.routed}</th>
            <th className="px-2 text-right font-normal">{fr.replay.columns.destroyed}</th>
          </tr>
        </thead>
        <tbody>
          {heading(fr.replay.mine)}
          {kinds(view.mine)}
          {view.faced ? (
            <>
              {heading(fr.combat.facedNation(view.faced.nation))}
              {kinds(view.faced.forces)}
            </>
          ) : (
            row(fr.replay.theirs, view.theirs, 'border-t-2 border-[var(--ink)]')
          )}
        </tbody>
      </table>
    </section>
  );
}
