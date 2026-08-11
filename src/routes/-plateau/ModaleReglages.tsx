import { useState } from 'react';
import {
  ECHELLE_HUD_DEFAUT,
  ECHELLE_HUD_MAX,
  ECHELLE_HUD_MIN,
  garderEchelleHud,
  lireEchelleHud,
} from '@/donnees/reglages';
import { Modale } from './Modale';

export function ModaleReglages({ onFermer }: { onFermer: () => void }) {
  const [echelle, setEchelle] = useState(lireEchelleHud);

  const regler = (valeur: number) => {
    const bornee = Math.max(ECHELLE_HUD_MIN, Math.min(ECHELLE_HUD_MAX, valeur));
    setEchelle(bornee);
    garderEchelleHud(bornee);
  };

  return (
    <Modale onFermer={onFermer}>
      <div className="trame-papier w-[420px] max-w-full border border-[var(--ink)]">
        <div className="flex items-center justify-between border-b border-[var(--ink)] px-4 py-[9px]">
          <span className="eyebrow">réglages</span>
          <button
            type="button"
            onClick={onFermer}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            fermer
          </button>
        </div>

        <div className="px-4 py-[14px]">
          <div className="flex items-baseline justify-between">
            <span className="text-[13.5px] text-[var(--ink)]">Échelle de l’interface</span>
            <span className="font-[var(--font-mono)] text-[15px] text-[var(--ink)]">{echelle} %</span>
          </div>
          <div className="mt-3 flex items-center gap-[10px]">
            <Pas signe="–" onClick={() => regler(echelle - 10)} desactive={echelle <= ECHELLE_HUD_MIN} />
            <div className="relative h-[6px] flex-1 bg-[rgba(42,33,24,.14)]">
              <div
                className="h-[6px] bg-[var(--interaction)]"
                style={{ width: `${((echelle - ECHELLE_HUD_MIN) / (ECHELLE_HUD_MAX - ECHELLE_HUD_MIN)) * 100}%` }}
              />
            </div>
            <Pas signe="+" onClick={() => regler(echelle + 10)} desactive={echelle >= ECHELLE_HUD_MAX} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11.5px] text-[var(--ink-soft)]">
              De {ECHELLE_HUD_MIN} à {ECHELLE_HUD_MAX} %, appliqué immédiatement. Réglage propre à ce
              navigateur.
            </span>
            <button
              type="button"
              onClick={() => regler(ECHELLE_HUD_DEFAUT)}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              défaut
            </button>
          </div>
        </div>
      </div>
    </Modale>
  );
}

function Pas({ signe, onClick, desactive }: { signe: string; onClick: () => void; desactive: boolean }) {
  return (
    <button
      type="button"
      disabled={desactive}
      onClick={onClick}
      className="h-6 w-6 shrink-0 cursor-pointer border border-[var(--ink)] text-[14px] leading-none text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {signe}
    </button>
  );
}
