import { useEffect, useRef, useState } from 'react';
import { YIELD_OF } from '@/domain/economy';
import type { DepositKey } from '@/domain/ids';
import { ResourcePlate } from '@/emblems/Plate';
import { fr } from '@/i18n/fr';
import { isTyping } from '@/map/typing';

/** The menu's order, and the digit that picks each one while it is open (maquette). */
const SPECIES: ReadonlyArray<DepositKey> = ['coal', 'iron', 'food', 'oil'];

/**
 * **« Sonder · espèce »** (#249, maquette `radar-gisements/choisie.html`) : au pied des boutons de
 * carte, au bureau (#670) comme au téléphone (#621), l'icône de l'espèce qui lance l'onde pour la
 * dernière, 44 × 44 px, et son chevron en pastille à sa gauche qui ouvre la liste. S relance, 1 à 4
 * choisissent dans la liste ouverte ; son nom se lit au `title`. La liste s'ouvre vers la gauche et
 * le haut (la pile tient le bord droit). Pas d'appui long : le chevron est la seule entrée de la liste.
 */
export function SweepButton({
  species,
  onSweep,
  status = null,
}: {
  species: DepositKey;
  onSweep: (species: DepositKey) => void;
  /** What the wave is doing or found, beside the button; nothing when none runs. */
  status?: string | null;
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

  const menu = (
    <div
      role="menu"
      className={`hud paper-grain absolute z-[var(--z-band)] min-w-[210px] border border-[var(--ink)] py-[4px] shadow-[0_10px_24px_rgb(0_0_0/40%)] ${'right-0 bottom-[calc(100%+8px)]'}`}
    >
      <p className="mx-[10px] mt-[2px] mb-[4px] text-[9.5px] font-semibold tracking-[.14em] text-[var(--ink-soft)] uppercase">
        {fr.sweep.menu}
      </p>
      {SPECIES.map((one) => (
        <button
          key={one}
          type="button"
          role="menuitem"
          aria-current={one === species}
          onClick={() => {
            setOpen(false);
            onSweep(one);
          }}
          className={`flex w-full items-center gap-[9px] px-[10px] py-[11px] text-[14px] font-medium hover:bg-(color:--ink)/8 ${one === species ? 'bg-(color:--ink)/8' : ''}`}
        >
          <ResourcePlate resource={YIELD_OF[one]} height={18} boxed={false} />
          <span>
            {fr.sweep.species(one)}
            {one === species && (
              <span className="text-[12px] text-[var(--ink-soft)]"> · {fr.sweep.last}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
  return (
    <div ref={root} className="relative flex items-center">
      {status !== null && (
        <span
          role="status"
          className="mr-[8px] border border-(color:--ink)/40 bg-[rgb(233_222_196/94%)] px-[7px] py-[3px] text-[12px] font-medium whitespace-nowrap text-[var(--ink-soft)]"
        >
          {status}
        </span>
      )}
      <button
        type="button"
        title={fr.sweep.choose}
        aria-label={fr.sweep.choose}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
        className={`press float h-[44px] w-[32px] cursor-pointer border border-r-0 border-[var(--ink)] text-[12px] leading-none font-semibold ${open ? 'bg-[var(--ink)] text-[var(--paper)]' : 'paper-grain'}`}
      >
        ▾
      </button>
      <button
        type="button"
        title={fr.sweep.launch(species)}
        aria-label={fr.sweep.launch(species)}
        aria-keyshortcuts="S"
        onClick={() => {
          setOpen(false);
          onSweep(species);
        }}
        className="press paper-grain paper-hover float flex h-[44px] w-[44px] cursor-pointer items-center justify-center border border-[var(--ink)]"
      >
        <ResourcePlate resource={YIELD_OF[species]} height={24} boxed={false} />
      </button>
      {open && menu}
    </div>
  );
}
