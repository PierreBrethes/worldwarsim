import { useState, type ReactNode } from 'react';

type Position = 'hautGauche' | 'hautDroite' | 'basGauche' | 'basDroite';

const ANCRAGE: Record<Position, string> = {
  hautGauche: 'top-4 left-4',
  hautDroite: 'top-4 right-4',
  basGauche: 'bottom-[26px] left-4',
  basDroite: 'bottom-[26px] right-4',
};

export function Panneau({
  titre,
  repere,
  position,
  largeur = 260,
  children,
}: {
  titre: string;
  repere?: string;
  position: Position;
  largeur?: number;
  children: ReactNode;
}) {
  const [reduit, setReduit] = useState(false);
  return (
    <section
      className={`hud trame-papier absolute z-10 border border-[var(--ink)] ${ANCRAGE[position]}`}
      style={{ width: largeur }}
    >
      <header className="flex items-center gap-2 border-b border-[var(--ink)] px-3 py-2">
        <span className="eyebrow flex-1">{titre}</span>
        {repere && <span className="font-[var(--font-mono)] text-[9px] text-[var(--ink-soft)]">{repere}</span>}
        <button
          type="button"
          aria-expanded={!reduit}
          title={reduit ? 'déplier' : 'réduire'}
          onClick={() => setReduit((precedent) => !precedent)}
          className="h-[15px] w-[15px] shrink-0 cursor-pointer border border-[var(--ink)] text-[11px] leading-[13px] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {reduit ? '+' : '–'}
        </button>
      </header>
      {!reduit && <div className="px-3 py-[10px]">{children}</div>}
    </section>
  );
}

export function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[rgba(42,33,24,.14)] py-[5px] last:border-0">
      <span className="text-[12.5px] text-[var(--ink-soft)]">{libelle}</span>
      <span className="font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">{valeur}</span>
    </div>
  );
}
