import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Monde } from '@/domaine/monde';
import { POUVOIR_PAR_NATION, type Nation } from '@/domaine/nations';
import { formaterPlage } from '@/domaine/plage-repos';
import type { Batiment, VueJoueur } from '@/domaine/vue-joueur';
import { clientConvexHttp } from './clientConvex';
import { PAYS_DE_NATION } from './chargerVueJoueur';

const NOM_PAR_BATIMENT: Readonly<Record<Batiment['cle'], string>> = {
  qg: 'Quartier général',
  industrie: 'Complexe industriel',
  logistique: 'Centre logistique',
  conscription: 'Conscription',
  ecoute: 'Station d’écoute',
};

export type VueServeur = FunctionReturnType<typeof api.vue.vueJoueur>;

export async function chargerVueJoueurConvex(monde: Monde, jeton: string): Promise<VueJoueur> {
  const client = clientConvexHttp();
  if (!client) throw new Error('VITE_CONVEX_URL absent');
  const serveur: VueServeur = await client.query(api.vue.vueJoueur, { jeton });
  return adapterVueServeur(monde, serveur);
}

export function adapterVueServeur(monde: Monde, serveur: VueServeur): VueJoueur {
  const nomPays = PAYS_DE_NATION[serveur.moi.nation] ?? serveur.moi.nation;
  const positionDomicile = monde.pays.find((pays) => pays.nom === nomPays)?.lonLat;
  if (!positionDomicile) throw new Error(`nation sans position : ${serveur.moi.nation}`);

  return {
    saison: serveur.saison,
    moi: {
      nation: serveur.moi.nation,
      positionDomicile,
      encre: serveur.moi.encre,
      pouvoir: POUVOIR_PAR_NATION[serveur.moi.nation as Nation] ?? '',
      doctrine: serveur.moi.doctrine,
      progression: serveur.moi.progression,
      plageRepos: formaterPlage(serveur.moi.plageRepos),
      ravitaillement: {
        stock: serveur.moi.ravitaillement.stock,
        debitParHeure: serveur.moi.ravitaillement.debitParHeure,
      },
      acier: { stock: serveur.moi.acier.stock, debitParHeure: serveur.moi.acier.debitParHeure },
      effectifs: {
        stock: serveur.moi.effectifs.stock,
        debitParHeure: serveur.moi.effectifs.debitParHeure,
        plafond: serveur.moi.effectifs.plafond ?? undefined,
      },
      slots: serveur.moi.slots,
      batiments: serveur.moi.batiments.map((batiment) => ({
        ...batiment,
        nom: NOM_PAR_BATIMENT[batiment.cle],
      })),
      chantier: serveur.moi.chantier
        ? { nom: NOM_PAR_BATIMENT[serveur.moi.chantier.nom as Batiment['cle']] ?? serveur.moi.chantier.nom, resteMinutes: serveur.moi.chantier.resteMinutes }
        : null,
      // Un déploiement en retard sur le client renvoie un objet sans ce champ. L'adaptateur est
      // la seule frontière : c'est ici qu'un écart de version se résorbe, pas dans les panneaux,
      // où un `undefined` fait tomber tout le plateau.
      armeePresente: serveur.moi.armeePresente ?? {},
      armeeEnTransit: {},
      avantPostes: [],
    },
    arcs: [],
    journal: [],
    adversaires: serveur.adversaires.map((adversaire) => ({
      nation: adversaire.nation,
      encre: adversaire.encre,
      pouvoir: POUVOIR_PAR_NATION[adversaire.nation as Nation] ?? '',
      barre: { etat: 'anonyme', progression: 0 },
      plageRepos: formaterPlage(adversaire.plageRepos),
      dernierRenseignement: adversaire.dernierRenseignement,
    })),
    couverture: { visibles: 0, total: 0 },
    chargeeA: serveur.chargeeA,
  };
}
