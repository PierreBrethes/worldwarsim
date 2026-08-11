import type { Pile, VueJoueur } from '@/domaine/vue-joueur';
import { Ligne, Panneau } from './Panneau';

const total = (pile: Pile) => Object.values(pile).reduce((somme, nombre) => somme + nombre, 0);

export function PanneauMaNation({ vue }: { vue: VueJoueur }) {
  const { moi } = vue;
  return (
    <Panneau titre="Ma nation" repere="4.5" position="hautGauche">
      <Ligne libelle="armée présente" valeur={`${total(moi.armeePresente)} unités`} />
      <Ligne libelle="en transit" valeur={`${total(moi.armeeEnTransit)} unités`} />
      <Ligne libelle="avant-postes" valeur={`${moi.avantPostes.length}`} />
      <Ligne
        libelle="file de chantier"
        valeur={moi.chantier ? `${Math.round(moi.chantier.resteMinutes)} min` : '—'}
      />
      <div className="mt-3 border-t border-[rgba(42,33,24,.3)] pt-2">
        <div className="eyebrow">Pouvoir national</div>
        <p className="mt-1 text-[12.5px] leading-[1.4] text-[var(--ink)]">{moi.pouvoir}</p>
      </div>
    </Panneau>
  );
}
