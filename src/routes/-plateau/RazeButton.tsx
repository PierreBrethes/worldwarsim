import { createContext, useContext, type ContextType } from 'react';
import { demolitionRefusalOf } from '@/domain/construction';
import type { Building } from '@/domain/player-view';
import { fr } from '@/i18n/fr';

/**
 * **Raser, depuis la fiche du bâtiment** (#347) : au doigt, aucun geste n'atteint la rose, et
 * raser n'a pas de feuille commune (plateau personnel, recherche, site, garnison). Le plateau
 * fournit l'ordre ; chaque fiche pose son bouton, qui nomme le bâtiment qu'il rase. Sans
 * fournisseur (une fiche hors plateau), il n'y a pas de bouton.
 */
export const RazeContext = createContext<
  ((buildingId: string, at: { x: number; y: number }) => void) | null
>(null);

type Raze = NonNullable<ContextType<typeof RazeContext>>;

/**
 * **Ce que le plateau prête aux fiches** : rien en Blitz ni à un vaincu, où la rose ne propose rien
 * et où la mutation refuse (`NOT_IN_BLITZ`, `requirePlayable`).
 */
export const razeOf = (state: { blitz: boolean; defeated: boolean }, open: Raze): Raze | null =>
  state.blitz || state.defeated ? null : open;

/**
 * Sous le seuil seulement : au bureau la rose suffit. Le refus se lit de la fonction de la rose et
 * de la mutation (`demolitionRefusalOf`) et se dit à la place du bouton (ADR 0015). `region`, quand
 * la fiche en porte plusieurs du même nom, dit lequel.
 */
export function RazeButton({
  building,
  region,
  className = '',
}: {
  building: Building;
  region?: string | undefined;
  className?: string;
}) {
  const raze = useContext(RazeContext);
  if (raze === null) return null;
  const refusal = demolitionRefusalOf({ key: building.key, mine: true });
  return (
    <div className={`shrink-0 border-t border-(color:--ink)/32 pt-[9px] md:hidden ${className}`}>
      {refusal === null ? (
        <button
          type="button"
          title={fr.compass.demolishConsequence}
          onClick={(event) => raze(building.id, { x: event.clientX, y: event.clientY })}
          className="min-h-[44px] w-full cursor-pointer border border-[var(--critical)] px-[10px] py-[4px] text-[10px] tracking-[.16em] text-[var(--critical)] uppercase"
        >
          {fr.compass.razeNamed(building.name, region)}
        </button>
      ) : (
        <p className="text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">{fr.errors[refusal]()}</p>
      )}
    </div>
  );
}
