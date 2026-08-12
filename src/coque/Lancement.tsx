import { useEffect, useState } from 'react';

/**
 * Le lancement est irréversible : il se regarde, il ne se clique pas. La séquence sert
 * à graver ce passage — sceau, éclat de magnésium, titre — puis rend la main au plateau.
 * Elle ne décide de rien : la saison est déjà lancée côté serveur quand elle démarre.
 */

const REPERES = [
  { phase: 1, a: 0 },
  { phase: 2, a: 900 },
  { phase: 3, a: 1550 },
  { phase: 4, a: 3400 },
] as const;

const FIN = 4;

export function Lancement({
  region,
  cadence,
  joueurs,
  surFin,
}: {
  region: string;
  cadence: string;
  joueurs: number;
  surFin: () => void;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const minuteurs = REPERES.map(({ phase: repere, a }) =>
      setTimeout(() => setPhase(repere), a),
    );
    return () => minuteurs.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase >= FIN) surFin();
  }, [phase, surFin]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[var(--desk)] transition-opacity duration-700"
        style={{ opacity: phase >= 2 ? 1 : 0 }}
      />

      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
        style={{ opacity: phase === 1 ? 1 : 0 }}
      >
        <div
          className="border-[3px] border-[var(--critique)] p-1 shadow-[0_0_60px_rgba(157,70,56,.25)]"
          style={{
            transition: 'transform .34s cubic-bezier(.16,1.5,.3,1)',
            transform: phase >= 1 ? 'rotate(-4deg) scale(1)' : 'rotate(-14deg) scale(2.5)',
          }}
        >
          <div className="border border-[var(--critique)] bg-[rgba(157,70,56,.06)] px-[30px] pt-4 pb-[14px] text-center text-[var(--critique)]">
            <div className="font-[var(--font-display)] text-[38px] font-extrabold tracking-[.06em]">
              ORDRE DE MOBILISATION
            </div>
            <div className="mt-[6px] font-[var(--font-mono)] text-[11px] tracking-[.3em] uppercase">
              scellé — aucun retour
            </div>
          </div>
        </div>
      </div>

      {phase === 2 && (
        <div
          className="absolute inset-0 bg-[var(--paper)]"
          style={{ animation: 'eclat-magnesium .5s ease-out forwards' }}
        />
      )}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-[10px] transition-opacity duration-500"
        style={{ opacity: phase === 3 ? 1 : 0 }}
      >
        <div className="font-[var(--font-mono)] text-[11px] tracking-[.34em] text-[var(--notable)] uppercase">
          graine distribuée
        </div>
        <div
          className="h-px bg-[var(--ink-quiet)]"
          style={{ transition: 'width .9s cubic-bezier(.2,.7,.2,1)', width: phase >= 3 ? 460 : 0 }}
        />
        <div className="font-[var(--font-display)] text-[52px] font-extrabold tracking-[.06em] text-[var(--paper)]">
          SAISON 1
        </div>
        <div className="font-[var(--font-mono)] text-[11px] tracking-[.28em] text-[var(--paper-dim)] uppercase">
          {region} · {cadence} · {joueurs} joueurs
        </div>
      </div>

      <div aria-hidden className="absolute inset-0 shadow-[inset_0_0_200px_rgba(23,18,8,.55)]" />

      {phase < FIN && (
        <button
          type="button"
          onClick={() => setPhase(FIN)}
          className="absolute right-[22px] bottom-[18px] cursor-pointer border border-[var(--ink-quiet)] px-[14px] py-[7px] text-[10px] tracking-[.2em] text-[var(--paper-dim-2)] uppercase hover:border-[var(--paper)] hover:text-[var(--paper)]"
        >
          passer
        </button>
      )}
    </div>
  );
}
