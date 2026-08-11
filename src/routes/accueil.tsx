import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import { clientConvex } from '@/donnees/clientConvex';
import { garderJeton, lireJeton } from '@/donnees/jeton';

export const Route = createFileRoute('/accueil')({ component: Accueil });

function Accueil() {
  return (
    <div className="flex h-full items-start justify-center overflow-auto bg-[var(--desk)] px-6 py-[34px]">
      <div className="hud trame-papier w-[720px] max-w-full border border-[var(--ink)] px-[30px] pt-[26px] pb-6">
        <div className="flex items-center justify-between text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>édition du jour</span>
          <span>2 à 8 joueurs — entre amis</span>
        </div>
        <div className="mt-[10px] border-t-2 border-b border-[var(--ink)] py-[14px] text-center">
          <h1 className="font-[var(--font-display)] text-[54px] leading-[.98] font-extrabold tracking-[.06em] text-[var(--ink)]">
            WORLDWARSIM
          </h1>
          <p className="mt-[9px] text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            projeter de la force — l’information est chère, tout engagement est irréversible
          </p>
        </div>
        {clientConvex ? <Entrees /> : <SansBackend />}
      </div>
    </div>
  );
}

function Entrees() {
  const naviguer = useNavigate();
  const fonder = useMutation(api.saisons.fonder);
  const rejoindre = useMutation(api.saisons.rejoindre);
  const [pseudo, setPseudo] = useState('');
  const [code, setCode] = useState('');
  const [duree, setDuree] = useState<48 | 168>(48);
  const [erreur, setErreur] = useState<string | null>(null);
  const jetonConnu = lireJeton();

  const soumettreFondation = async (evenement: FormEvent) => {
    evenement.preventDefault();
    try {
      const { jeton } = await fonder({ pseudo, dureeHeures: duree, compensation: 0.5 });
      garderJeton(jeton);
      void naviguer({ to: '/salon' });
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : String(probleme));
    }
  };

  const soumettreRejoindre = async (evenement: FormEvent) => {
    evenement.preventDefault();
    try {
      const { jeton } = await rejoindre({ code, pseudo });
      garderJeton(jeton);
      void naviguer({ to: '/salon' });
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : String(probleme));
    }
  };

  return (
    <div className="pt-4">
      {jetonConnu && (
        <button
          type="button"
          onClick={() => void naviguer({ to: '/salon' })}
          className="mb-4 w-full cursor-pointer bg-[var(--ink)] py-3 text-[11px] tracking-[.22em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)]"
        >
          reprendre la partie en cours
        </button>
      )}

      <label className="eyebrow block">pseudo</label>
      <input
        value={pseudo}
        onChange={(evenement) => setPseudo(evenement.target.value)}
        className="mt-1 w-full border border-[var(--ink)] bg-transparent px-3 py-2 text-[15px] text-[var(--ink)] outline-none"
        placeholder="votre nom de guerre"
      />

      <div className="mt-5 flex items-stretch gap-[22px]">
        <form onSubmit={soumettreFondation} className="flex-1 border-t border-[rgba(42,33,24,.35)] pt-3">
          <h2 className="font-[var(--font-display)] text-[18px] font-extrabold text-[var(--ink)]">
            Fonder une saison
          </h2>
          <div className="mt-2 flex gap-[5px]">
            {([48, 168] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setDuree(candidate)}
                className={`flex-1 cursor-pointer border border-[var(--ink)] py-2 text-[11px] tracking-[.1em] uppercase ${
                  duree === candidate
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                }`}
              >
                {candidate === 48 ? '48 heures' : '7 jours'}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={pseudo.trim() === ''}
            className="mt-3 w-full cursor-pointer bg-[var(--ink)] py-[10px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            fonder — obtenir un code
          </button>
        </form>

        <form onSubmit={soumettreRejoindre} className="flex-1 border-t border-[rgba(42,33,24,.35)] pt-3">
          <h2 className="font-[var(--font-display)] text-[18px] font-extrabold text-[var(--ink)]">
            Rejoindre par code
          </h2>
          <input
            value={code}
            onChange={(evenement) => setCode(evenement.target.value.toUpperCase())}
            maxLength={6}
            className="mt-2 w-full border border-[var(--ink)] bg-transparent px-3 py-2 text-center font-[var(--font-mono)] text-[18px] tracking-[.3em] text-[var(--ink)] outline-none"
            placeholder="ABC234"
          />
          <button
            type="submit"
            disabled={pseudo.trim() === '' || code.length !== 6}
            className="mt-3 w-full cursor-pointer border border-[var(--ink)] py-[10px] text-[10px] tracking-[.2em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            rejoindre le salon
          </button>
        </form>
      </div>

      {erreur && (
        <p className="mt-4 border border-[var(--critique)] px-3 py-2 text-[12.5px] text-[var(--ink)]">{erreur}</p>
      )}
    </div>
  );
}

function SansBackend() {
  const naviguer = useNavigate();
  return (
    <div className="pt-4">
      <p className="text-[13.5px] leading-[1.55] text-[var(--ink)]">
        Aucun backend configuré (<span className="font-[var(--font-mono)]">VITE_CONVEX_URL</span> absent).
        Lancez la pile locale avec <span className="font-[var(--font-mono)]">docker compose up</span> —
        voir <span className="font-[var(--font-mono)]">deploiement/README.md</span>.
      </p>
      <button
        type="button"
        onClick={() => void naviguer({ to: '/plateau' })}
        className="mt-4 w-full cursor-pointer border border-[var(--ink)] py-[10px] text-[10px] tracking-[.2em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        voir le plateau de démonstration
      </button>
    </div>
  );
}
