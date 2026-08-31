import { fr } from '@/i18n/fr';

/**
 * **La porte de l'abaque de tir, là où la question se pose** — au recrutement, quand on choisit
 * quoi former, et sur la popin de troupe, quand on regarde ce qu'on a. Deux appelants, donc il
 * vit ici plutôt que dans l'un des deux (CONVENTIONS §1) ; **pas d'entrée de rail**, qui en a
 * déjà trop (audit du 25/08 §3).
 *
 * Un pictogramme et rien d'autre : c'est un renvoi vers du détail, pas une action de jeu, et un
 * libellé le mettrait au même rang que « recruter ». Le nom complet est dans l'infobulle et dans
 * `aria-label`, ensemble — un bouton muet pour un lecteur d'écran est un bouton mort.
 */
export function GunneryButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={fr.gunnery.open}
      aria-label={fr.gunnery.open}
      className="inline-flex cursor-pointer items-center border border-[var(--ink)] px-[5px] py-[3px] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
    >
      <AbacusMark />
    </button>
  );
}

/**
 * L'abaque lui-même, en neuf cases : trois pleines, trois grises, trois vides — c'est la grille
 * qu'on ouvre, et ses trois encres de lecture. Le tracé prend `currentColor` pour que le survol
 * l'inverse avec le cadre.
 */
function AbacusMark() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden focusable="false">
      <g fill="currentColor">
        <rect x="0.5" y="0.5" width="3" height="3" />
        <rect x="4.5" y="4.5" width="3" height="3" />
        <rect x="8.5" y="0.5" width="3" height="3" />
      </g>
      <g fill="currentColor" opacity="0.35">
        <rect x="4.5" y="0.5" width="3" height="3" />
        <rect x="0.5" y="4.5" width="3" height="3" />
        <rect x="8.5" y="8.5" width="3" height="3" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.55">
        <rect x="0.85" y="8.85" width="2.3" height="2.3" />
        <rect x="4.85" y="8.85" width="2.3" height="2.3" />
        <rect x="8.85" y="4.85" width="2.3" height="2.3" />
      </g>
    </svg>
  );
}
