import type { UnitRole } from '@/domain/ids';
import { fr } from '@/i18n/fr';

/**
 * **La barre au-dessus d'une sélection** (#130, POC « Manipuler les pions », `#actions`) : combien
 * de piles, ce qu'elles portent par rôle, et ce qu'on peut leur faire faire d'ici — former une
 * escouade (G), la dissoudre (U), les lâcher (Échap). Glisser l'une d'elles emmène les autres.
 */
export function SelectionBar({
  piles,
  roles,
  picking,
  refusal,
  onForm,
  onDisband,
  onClear,
  onDone,
}: {
  piles: number;
  roles: ReadonlyArray<UnitRole>;
  /** Au doigt, les touchers ajoutent : « Terminer » rend le toucher qui lève. */
  picking: boolean;
  refusal: string | null;
  onForm: () => void;
  onDisband: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const { selection } = fr;
  return (
    <div className="selection-bar" role="toolbar" aria-label={selection.label}>
      <p className="selection-bar-count">
        <b>{selection.piles(piles)}</b>
        {roles.length > 0 && (
          <>
            {' · '}
            {selection.troops(roles.length)}
            <span className="selection-bar-roles">{fr.compass.transports(roles)}</span>
          </>
        )}
        {picking && piles === 0 && <span className="selection-bar-roles">{selection.picking}</span>}
      </p>
      <div className="selection-bar-verbs">
        {piles >= 2 && (
          <button type="button" onClick={onForm} aria-keyshortcuts="G">
            {selection.form} <kbd>G</kbd>
          </button>
        )}
        {piles === 1 && (
          <button type="button" onClick={onDisband} aria-keyshortcuts="U">
            {selection.disband} <kbd>U</kbd>
          </button>
        )}
        {picking ? (
          <button type="button" onClick={onDone}>
            {selection.done}
          </button>
        ) : (
          <button type="button" onClick={onClear} aria-keyshortcuts="Escape">
            {selection.clear} <kbd>Échap</kbd>
          </button>
        )}
      </div>
      {refusal !== null && (
        <p className="selection-bar-refusal" role="status">
          {refusal}
        </p>
      )}
    </div>
  );
}
