import { fr } from '@/i18n/fr';
import { CATEGORIES } from '@/domain/indicators';
import { toggleIndicator, useIndicatorToggles } from '@/data/indicatorToggles';
import { BottomSheet } from './BottomSheet';

/**
 * **Les huit bascules des calques, en cases de 44 px sur deux colonnes** (A4). Deux portes l'ouvrent
 * — le dossier de la nation et le bouton posé sur la carte. Le bureau lit la même grille dans une
 * carte du coin (`useIndicatorToggles`, une seule mémoire) : allumer les chantiers au téléphone
 * les allume aussi au bureau du même navigateur.
 */
export function LayersSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title={fr.foot.layersTitle} onClose={onClose}>
      <LayersGrid />
    </BottomSheet>
  );
}

/** La grille seule : la feuille la porte sous le seuil, la carte du coin au bureau. */
export function LayersGrid() {
  const toggles = useIndicatorToggles();
  return (
    <ul className="grid grid-cols-2 gap-[8px] p-4">
      {CATEGORIES.map((category) => {
        const on = toggles[category];
        return (
          <li key={category} className="flex">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggleIndicator(category)}
              className={`flex w-full cursor-pointer items-center gap-[10px] border px-[10px] text-left ${
                on ? 'border-[var(--ink)]' : 'border-(color:--ink)/35'
              }`}
            >
              <span
                aria-hidden
                className="flex h-[16px] w-[16px] shrink-0 items-center justify-center border border-[var(--ink)]"
              >
                {on && <span className="h-[8px] w-[8px] bg-[var(--ink)]" />}
              </span>
              <span className="block text-[13px] first-letter:uppercase">
                {fr.indicatorCategories[category]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
