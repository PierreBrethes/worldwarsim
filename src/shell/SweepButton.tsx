import { useEffect, useRef, useState } from 'react';
import { YIELD_OF } from '@/domain/economy';
import type { DepositKey } from '@/domain/ids';
import { ResourcePlate } from '@/emblems/Plate';
import { fr } from '@/i18n/fr';
import { isTyping } from '@/map/typing';

/** The menu's order, and the digit that picks each one while it is open (maquette). */
const SPECIES: ReadonlyArray<DepositKey> = ['coal', 'iron', 'food', 'oil'];

/**
 * **« Sonder · espèce »** (#249, maquette `radar-gisements/choisie.html`) : un poussoir de la
 * réglette qui lance l'onde pour la dernière espèce, et son chevron qui ouvre la liste. S relance,
 * 1 à 4 choisissent dans la liste ouverte. Au téléphone, il se tient sous le pouce (`thumb`) et
 * sa liste s'ouvre vers le haut.
 */
export function SweepButton({
  species,
  onSweep,
  status = null,
  thumb = false,
}: {
  species: DepositKey;
  onSweep: (species: DepositKey) => void;
  /** What the wave is doing or found, beside the button; nothing when none runs. */
  status?: string | null;
  thumb?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // A press anywhere else closes the list, as the rose: left open, a digit would both turn a
  // lifted piece's verb and sweep.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return setOpen(false);
      if (isTyping() || event.metaKey || event.ctrlKey || event.altKey) return;
      const picked = open ? SPECIES[Number.parseInt(event.key, 10) - 1] : undefined;
      if (picked !== undefined) {
        event.preventDefault();
        setOpen(false);
        onSweep(picked);
      } else if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        setOpen(false);
        onSweep(species);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, species, onSweep]);

  const height = thumb ? 'h-[52px]' : 'h-[32px]';
  const paper = thumb
    ? 'bg-[var(--paper)] shadow-[0_1px_0_var(--ink),0_8px_18px_rgb(0_0_0/45%)]'
    : '';
  return (
    <div ref={root} className="relative flex items-center">
      {thumb && status !== null && (
        <span
          role="status"
          className="mr-[8px] border border-(color:--ink)/40 bg-[rgb(233_222_196/94%)] px-[7px] py-[3px] text-[12px] font-medium whitespace-nowrap text-[var(--ink-soft)]"
        >
          {status}
        </span>
      )}
      <button
        type="button"
        title={fr.sweep.launch(species)}
        aria-keyshortcuts="S"
        onClick={() => {
          setOpen(false);
          onSweep(species);
        }}
        className={`flex ${height} items-center gap-[7px] border border-[var(--ink)] px-[9px] text-[12px] font-semibold tracking-[.06em] uppercase hover:bg-(color:--ink)/8 ${paper} ${thumb ? 'px-[14px]' : ''}`}
      >
        <ResourcePlate resource={YIELD_OF[species]} height={18} boxed={false} />
        {fr.sweep.button}
        <b className="font-(family-name:--font-display) text-[13px] font-semibold tracking-normal normal-case italic">
          {fr.deposits[species]}
        </b>
        {!thumb && <Key>S</Key>}
      </button>
      <button
        type="button"
        title={fr.sweep.choose}
        aria-label={fr.sweep.choose}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
        className={`${height} border border-l-0 border-[var(--ink)] ${thumb ? 'w-[36px] text-[16px]' : 'w-[24px] text-[11px]'} font-semibold ${open ? 'bg-[var(--ink)] text-[var(--paper)]' : paper}`}
      >
        ▾
      </button>
      {!thumb && status !== null && (
        <span
          role="status"
          className="ml-[8px] text-[12px] font-medium whitespace-nowrap text-[var(--ink-soft)]"
        >
          {status}
        </span>
      )}
      {open && (
        <div
          role="menu"
          className={`hud paper-grain absolute z-[var(--z-band)] min-w-[210px] border border-[var(--ink)] py-[4px] shadow-[0_10px_24px_rgb(0_0_0/40%)] ${
            thumb ? 'right-0 bottom-[calc(100%+8px)]' : 'top-[calc(100%+6px)] left-0'
          }`}
        >
          <p className="mx-[10px] mt-[2px] mb-[4px] text-[9.5px] font-semibold tracking-[.14em] text-[var(--ink-soft)] uppercase">
            {fr.sweep.menu}
          </p>
          {SPECIES.map((one, rank) => (
            <button
              key={one}
              type="button"
              role="menuitem"
              aria-current={one === species}
              onClick={() => {
                setOpen(false);
                onSweep(one);
              }}
              className={`flex w-full items-center gap-[9px] px-[10px] ${thumb ? 'py-[11px]' : 'py-[7px]'} text-[14px] font-medium hover:bg-(color:--ink)/8 ${one === species ? 'bg-(color:--ink)/8' : ''}`}
            >
              <ResourcePlate resource={YIELD_OF[one]} height={18} boxed={false} />
              <span>
                {fr.sweep.species(one)}
                {one === species && (
                  <span className="text-[12px] text-[var(--ink-soft)]"> · {fr.sweep.last}</span>
                )}
              </span>
              {!thumb && <Key className="ml-auto">{rank + 1}</Key>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Key({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`border border-b-2 border-current px-[4px] font-(family-name:--font-mono) text-[10px] leading-[14px] font-semibold ${className}`}
    >
      {children}
    </kbd>
  );
}
