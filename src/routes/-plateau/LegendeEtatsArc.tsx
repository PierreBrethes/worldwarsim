import { COULEURS_ARC } from '@/carte/moteur/palette';
import { Panneau } from './Panneau';

const ETATS = [
  { cle: 'mien', libelle: 'mien' },
  { cle: 'adverseDetecte', libelle: 'adverse détecté' },
  { cle: 'dernierePositionConnue', libelle: 'dernière position connue' },
  { cle: 'maitriseDesMers', libelle: 'maîtrise des mers' },
] as const;

export function LegendeEtatsArc({ couverture }: { couverture: { visibles: number; total: number } }) {
  return (
    <Panneau titre="États d’arc" position="basDroite" largeur={210}>
      {ETATS.map((etat) => (
        <div key={etat.cle} className="flex items-center gap-2 py-[3px]">
          <span className="h-[2px] w-6" style={{ background: COULEURS_ARC[etat.cle].progression }} />
          <span className="text-[12px] text-[var(--ink-soft)]">{etat.libelle}</span>
        </div>
      ))}
      <p className="mt-2 border-t border-[rgba(42,33,24,.3)] pt-2 text-[11.5px] text-[var(--ink-soft)] italic">
        {couverture.visibles} mouvement{couverture.visibles > 1 ? 's' : ''} adverse
        {couverture.visibles > 1 ? 's' : ''} visible{couverture.visibles > 1 ? 's' : ''} sur {couverture.total}
      </p>
    </Panneau>
  );
}
