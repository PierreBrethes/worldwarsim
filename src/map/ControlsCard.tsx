import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { useMouseMapping } from '@/data/mouseMapping';
import { useCoarsePointer } from '@/shell/viewport';

/**
 * The map's six gestures, read-only. This is not a settings screen: nothing is editable,
 * nothing is stored — a player who opens it seeks an answer, not a controller. It opens on
 * `?` and via the `?` button of the board's corner.
 */
export function ControlsCard({ onClose }: { onClose: () => void }) {
  // Elle lit le mappage, elle ne le règle pas : les six gestes sont ceux de ce joueur-là.
  const mapping = useMouseMapping();
  // Sur un écran au doigt, la notice est celle du doigt : un tableau de boutons n'y répond à rien.
  const coarse = useCoarsePointer();
  const gestures = coarse ? fr.mapUi.fingerGestures : fr.mapUi.gestures(mapping);

  return (
    <CornerCard title={fr.mapUi.controlsHeader} onClose={onClose}>
      <dl className="grid grid-cols-[126px_1fr] gap-x-3 gap-y-[7px] px-4 pt-[10px] pb-[14px] text-[11.5px] leading-[1.35]">
        {gestures.map(({ gesture, effect }) => (
          <div key={gesture} className="contents">
            <dt className="text-[var(--ink-soft)]">{gesture}</dt>
            <dd>{effect}</dd>
          </div>
        ))}
      </dl>
    </CornerCard>
  );
}

/**
 * **Une carte du coin de la carte, au bureau** : l'aide-mémoire ou les calques, au-dessus des
 * boutons qui les ouvrent, du même papier qu'eux. **Elle n'ancre rien** : le plateau l'empile dans
 * la colonne bas-droite avec ce qui répond au pointeur (`GroundPanel`), seul arrangement où
 * aucun ne couvre l'autre quelle que soit sa hauteur.
 */
export function CornerCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      role="dialog"
      aria-label={title}
      className="hud paper-grain w-[320px] border border-[var(--ink)] font-(family-name:--font-body) text-[var(--ink)] shadow-[0_2px_0_rgba(15,10,4,.55)]"
    >
      <div className="flex items-baseline justify-between border-b border-[var(--ink)] px-4 pt-3 pb-2">
        <h2 className="text-[9px] tracking-[.2em] text-[var(--ink-soft)] uppercase">{title}</h2>
        <button
          type="button"
          aria-label={fr.mapUi.controlsClose}
          onClick={onClose}
          className="cursor-pointer text-[14px] leading-none text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          ×
        </button>
      </div>
      {children}
    </section>
  );
}
