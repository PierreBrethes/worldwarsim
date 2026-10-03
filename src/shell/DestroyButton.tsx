import { useState } from 'react';
import { fr } from '@/i18n/fr';

/**
 * Two clicks, and the second one is not the same button: destroying a season takes everyone's
 * game away, and a misclick next to "launch" would be the worst possible one. The cancel sits
 * where the first click was, so the reflex click lands on it.
 *
 * The wording travels as props because the same two clicks guard two different losses — the
 * founder scrapping a season for everybody, and a guest dropping his own seat. Only the note
 * can say which; "annuler" is the same word in both.
 */
export function DestroyButton({
  label,
  confirm,
  note,
  onDestroy,
}: {
  label: string;
  confirm: string;
  note: string;
  onDestroy: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="mt-[10px] w-full cursor-pointer border border-(color:--ink)/30 p-[9px] text-[10px] tracking-[.2em] text-[var(--ink-faint)] uppercase hover:border-[var(--critical)] hover:text-[var(--critical)]"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="mt-[10px] flex flex-col gap-[6px]">
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="w-full cursor-pointer border border-[var(--ink)] p-[9px] text-[10px] tracking-[.2em] uppercase hover:bg-(--ink)/8"
      >
        {fr.lobby.destroyCancel}
      </button>
      <button
        type="button"
        onClick={onDestroy}
        className="w-full cursor-pointer border border-[var(--critical)] bg-[var(--critical)] p-[9px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase"
      >
        {confirm}
      </button>
      <p className="text-center text-[10.5px] leading-[1.4] text-[var(--critical)]">{note}</p>
    </div>
  );
}
