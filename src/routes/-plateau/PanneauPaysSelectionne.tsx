import type { VueJoueur } from '@/domaine/vue-joueur';
import { Ligne, Panneau } from './Panneau';

export function PanneauPaysSelectionne({ pays, vue }: { pays: string; vue: VueJoueur }) {
  const avantPoste = vue.moi.avantPostes.find((poste) => poste.paysHote === pays);
  const adversaire = vue.adversaires.find((autre) => autre.nation === pays);

  return (
    <Panneau titre={adversaire ? 'Nation adverse' : 'Pays neutre'} repere="sélection" position="hautDroite" largeur={280}>
      <h2 className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[.02em] text-[var(--ink)] uppercase">
        {pays}
      </h2>

      {adversaire ? (
        <>
          <Ligne libelle="progression" valeur={`${Math.round(adversaire.barre.progression * 100)} %`} />
          <Ligne
            libelle="doctrine"
            valeur={adversaire.barre.etat === 'attribuee' ? adversaire.barre.doctrine : 'inconnue'}
          />
          <Ligne libelle="plage de repos" valeur={adversaire.plageRepos} />
          <Ligne libelle="dernier renseignement" valeur={adversaire.dernierRenseignement} />
        </>
      ) : (
        <>
          <Ligne libelle="avant-poste" valeur={avantPoste ? 'France — extraction' : 'aucun'} />
          {avantPoste && <Ligne libelle="garnison" valeur={`${avantPoste.garnison}`} />}
        </>
      )}
    </Panneau>
  );
}
