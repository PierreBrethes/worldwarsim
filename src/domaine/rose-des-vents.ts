import { PAYS_DE_NATION, type Nation } from './nations';
import type { TypeMouvement, VueJoueur } from './vue-joueur';

/**
 * Ce que le clic droit a touché. Une union discriminée plutôt qu'un objet à champs
 * optionnels : une force n'a pas de pays hôte déclaré — c'est le picking qui dit sur quelle
 * terre elle se tient — et un avant-poste, lui, en a toujours un.
 */
export type CibleRose =
  | { readonly genre: 'pays'; readonly pays: string }
  | { readonly genre: 'avantPoste'; readonly id: string; readonly paysHote: string; readonly nom: string }
  | {
      readonly genre: 'force';
      readonly id: string;
      readonly pays: string | null;
      readonly nom: string;
      readonly effectif: number;
    };

/**
 * Les six pictos de la planche du menu radial. Trois ne marquent encore rien — la grue
 * attend l'économie v2, le casque l'agent, les fusils la fiche de force — et sont déclarés
 * ici pour que le jour venu il n'y ait qu'un câblage à écrire, jamais un dessin à retrouver.
 */
export type PictoRose = 'cabane' | 'grue' | 'ancre' | 'casque' | 'helice' | 'fusils';

/**
 * Seules les actions qui ont une destination réelle existent — rien de grisé, jamais. Le
 * picto reste muet : libellé, coût et conséquence n'apparaissent qu'au survol, dans
 * l'infobulle. L'ordre du tableau est l'ordre de l'éventail, plein nord puis sens horaire.
 */
export type ActionRose =
  | {
      readonly cle: 'voir';
      readonly picto: PictoRose;
      readonly libelle: string;
      readonly cout: string | null;
      readonly consequence: string;
      readonly pays: string;
    }
  | {
      readonly cle: 'envoyer';
      readonly picto: PictoRose;
      readonly libelle: string;
      readonly cout: string | null;
      readonly consequence: string;
      readonly destination: string | null;
      readonly type: TypeMouvement | null;
    };

export type Rose = {
  /** La ligne de contexte de l'infobulle : la nature de la cible et sa qualification. */
  readonly kicker: string;
  readonly nom: string;
  readonly actions: ReadonlyArray<ActionRose>;
};

const NATION_DE_PAYS: ReadonlyMap<string, Nation> = new Map(
  (Object.entries(PAYS_DE_NATION) as ReadonlyArray<[Nation, string]>).map(([nation, pays]) => [
    pays,
    nation,
  ]),
);

type Appartenance = 'mienne' | 'adverse' | 'neutre';

function appartenanceDuPays(pays: string, vue: VueJoueur): Appartenance {
  const nation = NATION_DE_PAYS.get(pays);
  if (nation === undefined) return 'neutre';
  if (nation === vue.moi.nation) return 'mienne';
  return vue.adversaires.some((adversaire) => adversaire.nation === nation) ? 'adverse' : 'neutre';
}

/** L'infobulle nomme la nation quand le pays de la carte en porte une, le pays sinon. */
const nomDuPays = (pays: string): string => NATION_DE_PAYS.get(pays) ?? pays;

/**
 * Le seul coût que le jeu sache chiffrer aujourd'hui. L'acier et la durée d'une fondation
 * n'existent nulle part — les afficher demanderait de les inventer.
 */
function coutEnSlots(vue: VueJoueur): string {
  const libres = vue.moi.slots.total - vue.moi.slots.utilises;
  return `1 slot · ${libres} libre${libres > 1 ? 's' : ''}`;
}

const voirLePays = (pays: string): ActionRose => ({
  cle: 'voir',
  picto: 'cabane',
  libelle: 'Voir le pays',
  cout: null,
  consequence: `Sélectionne ${nomDuPays(pays)} et ouvre son panneau de bord.`,
  pays,
});

const envoyerUnMouvement = (destination: string | null, vue: VueJoueur): ActionRose => ({
  cle: 'envoyer',
  picto: 'helice',
  libelle: 'Envoyer un mouvement',
  cout: coutEnSlots(vue),
  consequence:
    destination === null
      ? 'Ouvre la fenêtre d’envoi sur l’onglet mouvement.'
      : `Ouvre la fenêtre d’envoi, ${nomDuPays(destination)} en destination.`,
  destination,
  type: null,
});

const fonderUnAvantPoste = (destination: string, vue: VueJoueur): ActionRose => ({
  cle: 'envoyer',
  picto: 'ancre',
  libelle: 'Fonder un avant-poste',
  cout: coutEnSlots(vue),
  consequence: `Ouvre l’envoi préréglé sur la fondation, vers ${nomDuPays(destination)}.`,
  destination,
  type: 'avantPoste',
});

/**
 * La rose d'une cible, ou `null` quand aucune action n'aboutit — le clic droit reste alors
 * sans effet plutôt que d'ouvrir un éventail vide.
 */
export function roseDe(cible: CibleRose, vue: VueJoueur): Rose | null {
  const rose = construire(cible, vue);
  return rose.actions.length === 0 ? null : rose;
}

function construire(cible: CibleRose, vue: VueJoueur): Rose {
  switch (cible.genre) {
    case 'pays': {
      const appartenance = appartenanceDuPays(cible.pays, vue);
      const tenu = vue.moi.avantPostes.some((poste) => poste.paysHote === cible.pays);
      const fondable = appartenance === 'neutre' && !tenu;
      return {
        kicker:
          appartenance === 'neutre'
            ? `pays neutre · ${tenu ? 'avant-poste tenu' : 'sans avant-poste'}`
            : appartenance === 'mienne'
              ? 'mon territoire'
              : 'nation adverse',
        nom: nomDuPays(cible.pays),
        actions: [
          ...(fondable ? [fonderUnAvantPoste(cible.pays, vue)] : []),
          voirLePays(cible.pays),
        ],
      };
    }
    case 'avantPoste':
      return {
        kicker: `avant-poste · ${nomDuPays(cible.paysHote)}`,
        nom: cible.nom,
        actions: [voirLePays(cible.paysHote)],
      };
    case 'force': {
      const chezMoi = cible.pays !== null && appartenanceDuPays(cible.pays, vue) === 'mienne';
      return {
        kicker: `ma force · ${cible.effectif} unité${cible.effectif > 1 ? 's' : ''}`,
        nom: cible.nom,
        actions: [
          envoyerUnMouvement(chezMoi ? null : cible.pays, vue),
          ...(cible.pays === null ? [] : [voirLePays(cible.pays)]),
        ],
      };
    }
  }
}
