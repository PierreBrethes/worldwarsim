import { useCallback, useEffect, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import { combatsSince, isAlarm, latestDispatchAt } from '@/domain/journal';
import type { CombatReport, JournalDispatch } from '@/domain/player-view';
import { useMapMotion } from '@/data/mapMotion';
import { Stamp } from '@/shell/Stamp';
import { MAT_LIFT_HUD, useNarrowScreen } from '@/shell/viewport';
import { ReplayButton } from './ReplayDeck';

const MAX_TOASTS = 3;
const TOAST_MS = 8_000;

type Toast = {
  readonly dispatch: JournalDispatch;
  readonly combat: CombatReport;
  readonly leaving: boolean;
};

/**
 * **Le combat qui arrive pendant qu'on regarde la carte** (ADR 0026 §7). Ce que le plateau a
 * ouvert avec se lit au journal ; seul ce qui arrive ensuite s'imprime ici, au plus trois, le plus
 * ancien sortant le premier. `quiet` — un rejeu à l'écran, un joueur défait — tait l'encart et
 * vide la pile : ce qui arrive alors attend au journal, il ne ressort pas après coup. `held` : les
 * combats qui se jouent encore sur la carte (#272) — leur encart attend la fin de la scène, son
 * temps de lecture ne court qu'une fois paru.
 */
export function CombatToasts({
  journal,
  quiet,
  held,
  onShow,
}: {
  journal: ReadonlyArray<JournalDispatch>;
  quiet: boolean;
  held: ReadonlySet<string>;
  onShow: (combat: CombatReport) => void;
}) {
  const narrow = useNarrowScreen();
  const animated = useMapMotion() === 'full';
  const seenAt = useRef(latestDispatchAt(journal));
  const [toasts, setToasts] = useState<ReadonlyArray<Toast>>([]);

  useEffect(() => {
    const arrived = combatsSince(journal, seenAt.current);
    seenAt.current = Math.max(seenAt.current, latestDispatchAt(journal));
    if (quiet) setToasts((current) => (current.length === 0 ? current : []));
    else if (arrived.length > 0)
      setToasts((current) =>
        [
          ...current,
          // The journal reads newest first; the pile keeps arrival order, so the oldest leaves first.
          ...[...arrived]
            .reverse()
            .flatMap(({ combat, ...dispatch }) =>
              combat === null
                ? []
                : [{ dispatch: { ...dispatch, combat }, combat, leaving: false }],
            ),
        ].slice(-MAX_TOASTS),
      );
  }, [journal, quiet]);

  const remove = useCallback(
    (id: string) => setToasts((current) => current.filter((toast) => idOf(toast) !== id)),
    [],
  );
  const dismiss = useCallback(
    (id: string) =>
      animated
        ? setToasts((current) =>
            current.map((toast) => (idOf(toast) === id ? { ...toast, leaving: true } : toast)),
          )
        : remove(id),
    [animated, remove],
  );

  const out = toasts.filter((toast) => !held.has(idOf(toast)));
  if (out.length === 0) return null;
  /* Au téléphone, un seul à la fois et au pied de la carte, comme l'avis d'envoi : trois encarts
     en haut couvraient la colonne « en cours » et la moitié du plateau. Les suivants attendent
     que le premier parte. */
  const shown = narrow ? out.slice(-1) : [...out].reverse();
  return (
    <div
      style={narrow ? { marginBottom: MAT_LIFT_HUD } : undefined}
      className={`hud pointer-events-none absolute z-[var(--z-band)] flex flex-col gap-2 ${
        narrow
          ? 'inset-x-[10px] bottom-[80px]'
          : 'top-[calc(var(--board-top)/var(--hud-scale)_+_40px)] left-1/2 w-[min(400px,calc(100%-32px))] -translate-x-1/2'
      }`}
    >
      {shown.map((toast) => (
        <CombatToast
          key={idOf(toast)}
          toast={toast}
          animated={animated}
          narrow={narrow}
          onShow={onShow}
          onDismiss={dismiss}
          onGone={remove}
        />
      ))}
    </div>
  );
}

const idOf = (toast: Toast): string => toast.combat.id;

function CombatToast({
  toast,
  animated,
  narrow,
  onShow,
  onDismiss,
  onGone,
}: {
  toast: Toast;
  animated: boolean;
  narrow: boolean;
  onShow: (combat: CombatReport) => void;
  onDismiss: (id: string) => void;
  onGone: (id: string) => void;
}) {
  const { dispatch, leaving } = toast;
  const id = idOf(toast);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || leaving) return;
    const timer = setTimeout(() => onDismiss(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [held, leaving, id, onDismiss]);
  /** Le réglage coupé pendant la sortie : plus de transition, donc plus de `transitionend` à attendre. */
  useEffect(() => {
    if (leaving && !animated) onGone(id);
  }, [leaving, animated, id, onGone]);

  const alarm = isAlarm(dispatch.kind);
  const action = `${narrow ? 'min-h-[44px]' : 'min-h-[36px]'} cursor-pointer border border-[var(--ink)] px-3 text-[10.5px] font-semibold tracking-[.16em] uppercase`;
  return (
    <div
      role="status"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onTransitionEnd={(event) => leaving && event.target === event.currentTarget && onGone(id)}
      className={`paper-grain pointer-events-auto flex flex-col gap-2 border px-[14px] py-[10px] text-[var(--ink)] float ${
        alarm ? 'border-[var(--critical)]' : 'border-[var(--ink)]'
      } ${
        animated
          ? `transition-[opacity,translate] ease-(--ease-out) starting:-translate-y-[10px] starting:opacity-0 ${
              leaving ? '-translate-y-[10px] opacity-0 duration-150' : 'duration-[220ms]'
            }`
          : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <Stamp
          label={fr.stamps.dispatches[dispatch.kind]}
          tone={alarm ? 'critical' : 'ink'}
          size="small"
        />
        <span className="flex-1 font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {dispatch.t}
        </span>
        <button
          type="button"
          onClick={() => onDismiss(id)}
          title={fr.combatToast.close}
          aria-label={fr.combatToast.close}
          className={`${narrow ? 'min-h-[44px] min-w-[44px]' : 'min-h-[28px] min-w-[28px]'} shrink-0 cursor-pointer border border-[var(--ink)] text-[11px] leading-none hover:bg-[var(--ink)] hover:text-[var(--paper)]`}
        >
          ×
        </button>
      </div>
      <p
        className="font-(family-name:--font-display) text-[15px] leading-[1.25] font-bold text-pretty break-words"
        style={{ color: alarm ? 'var(--critical)' : 'var(--ink)' }}
      >
        {dispatch.text}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ReplayButton dispatch={dispatch} className={action} />
        <button
          type="button"
          title={fr.journal.showOnMap}
          onClick={() => onShow(toast.combat)}
          className={action}
        >
          {fr.combatToast.show}
        </button>
      </div>
    </div>
  );
}
