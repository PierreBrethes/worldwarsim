import { useMemo } from 'react';
import { deroulerTrajet } from '@/domaine/deroule-trajet';
import { enHeuresMinutes } from '@/domaine/duree';
import type { Milieu } from '@/domaine/trajets';
import type { ArcAffiche } from '@/domaine/vue-joueur';

/**
 * L'échelle segmentée de la planche 2d : le trajet à plat, chaque tronçon large comme sa
 * durée, quais compris. Elle ne s'affiche qu'au survol ou à la sélection — permanente, elle
 * doublerait la frise et mangerait le budget de contraste qui appartient au plateau.
 */
const LIBELLE_MILIEU: Readonly<Record<Milieu, string>> = {
  terre: 'terrestre',
  mer: 'maritime',
  air: 'aérien',
};

const ENCRE_MILIEU: Readonly<Record<Milieu, string>> = {
  terre: '#c98a3c',
  mer: 'rgba(201,138,60,.55)',
  air: '#e0a552',
};

/** Sous cette part, le libellé d'un tronçon ne tient plus : il tombe au filet seul. */
const PART_LISIBLE = 0.09;

export function EchelleTrajet({ arc }: { arc: ArcAffiche }) {
  const troncons = useMemo(() => deroulerTrajet(arc.trajet), [arc.trajet]);
  const dureeMinutes = dureeTotale(arc);
  if (troncons.length === 0) return null;

  return (
    <div className="hud pointer-events-none w-[520px] max-w-full border border-[var(--ink-quiet)] bg-[rgba(15,10,4,.86)] px-3 pt-[7px] pb-[9px]">
      <div className="flex items-baseline justify-between pb-[7px]">
        <span className="eyebrow-sombre">échelle du trajet</span>
        {dureeMinutes !== null && (
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--paper-dim)]">
            {enHeuresMinutes(dureeMinutes)}
          </span>
        )}
      </div>
      <div className="flex items-stretch gap-[2px]">
        {troncons.map((troncon, rang) => {
          const quai = troncon.genre === 'quai';
          const libelle = quai ? 'quai' : LIBELLE_MILIEU[troncon.milieu];
          const encre = quai ? 'var(--paper)' : ENCRE_MILIEU[troncon.milieu];
          return (
            <div
              key={rang}
              className="overflow-hidden pt-[5px] font-[var(--font-mono)] text-[9px] tracking-[.14em] whitespace-nowrap uppercase"
              style={{
                flex: `${Math.max(0.02, troncon.part)} 1 0`,
                borderTop: `2px solid ${encre}`,
                color: quai ? 'var(--paper)' : 'var(--paper-dim)',
              }}
            >
              {troncon.part < PART_LISIBLE
                ? ''
                : dureeMinutes === null
                  ? libelle
                  : `${libelle} · ${enHeuresMinutes(troncon.part * dureeMinutes)}`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * `VueJoueur` ne porte que le temps restant : le total s'en déduit par l'avancement. Un arc
 * figé ou une maîtrise des mers n'a pas d'horaire du tout — l'échelle montre alors la découpe
 * seule, ce qui reste la bonne réponse à « par où passe-t-il ».
 */
function dureeTotale(arc: ArcAffiche): number | null {
  const reste =
    arc.etat === 'mien'
      ? arc.minutesRestantes
      : arc.etat === 'adverseDetecte'
        ? arc.minutesRestantesEstimees
        : null;
  if (reste === null) return null;
  return arc.avancement >= 1 ? Math.max(0, reste) : Math.max(0, reste) / (1 - arc.avancement);
}
