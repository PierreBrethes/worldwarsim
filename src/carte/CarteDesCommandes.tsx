import { useEffect, useState } from 'react';
import { saisieEnCours } from './saisie';

/**
 * Le rappel des six gestes de la carte, en lecture seule. Ce n'est pas un écran de réglages :
 * rien n'y est modifiable, rien n'y est gardé — un joueur qui l'ouvre cherche une réponse, pas
 * une manette. Il s'ouvre à `?` et par une pastille discrète au bord du plateau.
 */
export function CarteDesCommandes() {
  const [ouverte, setOuverte] = useState(false);

  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') {
        setOuverte(false);
        return;
      }
      if (evenement.key !== '?' || saisieEnCours()) return;
      evenement.preventDefault();
      setOuverte((precedente) => !precedente);
    };
    addEventListener('keydown', surTouche);
    return () => removeEventListener('keydown', surTouche);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="carte des commandes"
        onClick={() => setOuverte((precedente) => !precedente)}
        className="hud absolute right-4 bottom-4 z-10 h-[22px] w-[22px] cursor-pointer border border-[var(--ink-quiet)] bg-[var(--desk)] font-[var(--font-body)] text-[12px] leading-none text-[var(--paper-dim)] opacity-55 hover:opacity-100"
      >
        ?
      </button>

      {ouverte && (
        <div className="hud absolute right-4 bottom-[34px] z-10 w-[300px] border border-[var(--ink-quiet)] bg-[var(--desk)] px-4 pt-3 pb-[14px] font-[var(--font-body)]">
          <div className="flex items-baseline justify-between border-b border-[var(--ink-quiet)] pb-2">
            <span className="text-[9px] tracking-[.2em] text-[var(--paper-dim)] uppercase">
              commandes de la carte
            </span>
            <button
              type="button"
              aria-label="fermer"
              onClick={() => setOuverte(false)}
              className="cursor-pointer text-[12px] leading-none text-[var(--paper-dim)] hover:text-[var(--paper)]"
            >
              ×
            </button>
          </div>
          <dl className="mt-[10px] grid grid-cols-[126px_1fr] gap-x-3 gap-y-[7px] text-[11.5px] leading-[1.35]">
            {GESTES.map(({ geste, effet }) => (
              <div key={geste} className="contents">
                <dt className="text-[var(--paper-dim)]">{geste}</dt>
                <dd className="text-[var(--paper)]">{effet}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}

const GESTES: ReadonlyArray<{ geste: string; effet: string }> = [
  { geste: 'clic gauche glisser', effet: 'orienter et incliner la caméra' },
  { geste: 'clic gauche net', effet: 'sélectionner l’entité visée' },
  { geste: 'molette enfoncée', effet: 'déplacer la carte' },
  { geste: 'espace + clic gauche', effet: 'déplacer la carte' },
  { geste: 'clic droit', effet: 'ouvrir la rose des vents' },
  { geste: 'molette', effet: 'zoomer' },
];
