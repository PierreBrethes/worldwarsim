import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';
import { useMouseMapping } from '@/data/mouseMapping';
import { useCoarsePointer } from '@/shell/viewport';
import { isTyping } from './typing';

/**
 * The map's six gestures, read-only. This is not a settings screen: nothing is editable,
 * nothing is stored — a player who opens it seeks an answer, not a controller. It opens on
 * `?` and via a discreet badge at the board's edge.
 *
 * **It anchors nothing.** The board stacks it in the bottom-right column with what answers the
 * pointer (`GroundPanel`), and a column is the only arrangement in which neither can cover the
 * other whatever its height — the overlap this replaces came from two absolute anchors, each
 * guessing at the other's size.
 */
export function ControlsCard() {
  const [open, setOpen] = useState(false);
  // Elle lit le mappage, elle ne le règle pas : les six gestes sont ceux de ce joueur-là.
  const mapping = useMouseMapping();
  // Sur un écran au doigt, la notice est celle du doigt : un tableau de boutons n'y répond à rien.
  const coarse = useCoarsePointer();
  const gestures = coarse ? fr.mapUi.fingerGestures : fr.mapUi.gestures(mapping);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== '?' || isTyping()) return;
      event.preventDefault();
      setOpen((previous) => !previous);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col items-end gap-2">
      {open && (
        <div className="hud w-[300px] border border-[var(--ink-quiet)] bg-[var(--desk)] px-4 pt-3 pb-[14px] font-(family-name:--font-body)">
          <div className="flex items-baseline justify-between border-b border-[var(--ink-quiet)] pb-2">
            <span className="text-[9px] tracking-[.2em] text-[var(--paper-dim)] uppercase">
              {fr.mapUi.controlsHeader}
            </span>
            <button
              type="button"
              aria-label={fr.mapUi.controlsClose}
              onClick={() => setOpen(false)}
              className="cursor-pointer text-[12px] leading-none text-[var(--paper-dim)] hover:text-[var(--paper)]"
            >
              ×
            </button>
          </div>
          <dl className="mt-[10px] grid grid-cols-[126px_1fr] gap-x-3 gap-y-[7px] text-[11.5px] leading-[1.35]">
            {gestures.map(({ gesture, effect }) => (
              <div key={gesture} className="contents">
                <dt className="text-[var(--paper-dim)]">{gesture}</dt>
                <dd className="text-[var(--paper)]">{effect}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <button
        type="button"
        aria-label={fr.mapUi.controlsLabel}
        onClick={() => setOpen((previous) => !previous)}
        className="hud h-[22px] w-[22px] cursor-pointer border border-[var(--ink-quiet)] bg-[var(--desk)] font-(family-name:--font-body) text-[12px] leading-none text-[var(--paper-dim)] opacity-55 hover:opacity-100"
      >
        ?
      </button>
    </div>
  );
}
