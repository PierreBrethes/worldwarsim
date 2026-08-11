import type { LonLat } from '@/domaine/geo';
import { distanceKm } from '@/domaine/geo';
import type { Monde } from '@/domaine/monde';
import type { ArcAffiche, Batiment, Pile, RoleUnite, VueJoueur } from '@/domaine/vue-joueur';

const ROLE_PAR_LIBELLE: Readonly<Record<string, RoleUnite>> = {
  Infanterie: 'infanterie',
  Blindé: 'blinde',
  'Transport terrestre': 'transportTerrestre',
  Chasseur: 'chasseur',
  Bombardier: 'bombardier',
  'Transport aérien': 'transportAerien',
  Escorte: 'escorte',
  Cargo: 'cargo',
  'Porte-avions': 'porteAvions',
};

const CLE_PAR_BATIMENT: Readonly<Record<string, Batiment['cle']>> = {
  qg: 'qg', ind: 'industrie', log: 'logistique', cons: 'conscription', ecoute: 'ecoute',
};

const TYPE_PAR_LIBELLE = {
  Attaque: 'attaque',
  "Raid d’avant-poste": 'raid',
  "Fondation d’avant-poste": 'avantPoste',
  'Agent dormant': 'agent',
} as const;

type Fixture = typeof import('./etat-reference-type').Fixture;

function versPile(brut: Record<string, number> | null | undefined): Pile {
  const pile: Pile = {};
  for (const [libelle, nombre] of Object.entries(brut ?? {})) {
    const role = ROLE_PAR_LIBELLE[libelle];
    if (role) pile[role] = nombre;
  }
  return pile;
}

function lonLatDe(monde: Monde, nomPays: string): LonLat | null {
  return monde.pays.find((pays) => pays.nom === nomPays)?.lonLat ?? null;
}

/**
 * Les nations du jeu portent un nom francisé ; la géométrie du monde vient de
 * Natural Earth et garde ses noms anglais. Cette table est la seule couture.
 */
const PAYS_DE_NATION: Readonly<Record<string, string>> = {
  France: 'France',
  'Royaume-Uni': 'United Kingdom',
  'États-Unis': 'United States of America',
  URSS: 'Russia',
  Allemagne: 'Germany',
  Japon: 'Japan',
  Italie: 'Italy',
  Chine: 'China',
};

function positionDe(monde: Monde, nom: string): LonLat | null {
  return lonLatDe(monde, PAYS_DE_NATION[nom] ?? nom);
}

export async function chargerVueJoueur(monde: Monde, url = '/etat-reference.json'): Promise<VueJoueur> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`état de référence introuvable : ${url}`);
  const brut = (await reponse.json()) as Fixture;

  const origine = positionDe(monde, brut.moi.nation);
  if (!origine) throw new Error(`nation sans position : ${brut.moi.nation}`);

  const minutesPar1000km = brut.saison.trajetMinPar1000km;
  const arcs: ArcAffiche[] = [];

  for (const mouvement of brut.mouvements.miens) {
    const destination = positionDe(monde, mouvement.destination);
    if (!destination) continue;
    const dureeTotale = (distanceKm(origine, destination) / 1000) * minutesPar1000km;
    arcs.push({
      etat: 'mien',
      id: mouvement.id,
      depuis: origine,
      vers: destination,
      type: TYPE_PAR_LIBELLE[mouvement.type as keyof typeof TYPE_PAR_LIBELLE] ?? 'attaque',
      pile: versPile(mouvement.pile),
      minutesRestantes: mouvement.minutesRestantes,
      avancement: dureeTotale > 0 ? 1 - mouvement.minutesRestantes / dureeTotale : 0,
    });
  }

  for (const detecte of brut.mouvements.adversesVisibles) {
    const depuis = detecte.nationSuspectee ? positionDe(monde, detecte.nationSuspectee) : null;
    if (!depuis) continue;
    const vers = capVersDestination(depuis, detecte.capDegres);
    if (detecte.etat === 'adverse-detecte') {
      arcs.push({
        etat: 'adverseDetecte',
        id: detecte.id,
        depuis,
        vers,
        nationSuspectee: detecte.nationSuspectee,
        capDegres: detecte.capDegres,
        minutesRestantesEstimees: null,
        avancement: 0.5,
      });
    } else {
      arcs.push({
        etat: 'dernierePositionConnue',
        id: detecte.id,
        depuis,
        vers,
        capDegres: detecte.capDegres,
        vuIlYaMinutes: detecte.vuIlYaMin,
        avancement: 0.45,
      });
    }
  }

  return {
    saison: {
      numero: brut.saison.numero,
      dureeHeures: brut.saison.dureeHeures,
      ecouleHeures: brut.saison.ecouleHeures,
      joueurs: brut.saison.joueurs,
      regionJouable: brut.saison.regionJouable,
      trajetMinutesPar1000km: minutesPar1000km,
    },
    moi: {
      nation: brut.moi.nation,
      encre: brut.moi.encre,
      pouvoir: brut.moi.pouvoir,
      doctrine: brut.moi.doctrine,
      progression: brut.moi.progressionPourcent / 100,
      plageRepos: brut.moi.plageRepos,
      ravitaillement: {
        stock: brut.moi.ressources.ravitaillement.stock,
        debitParHeure: brut.moi.ressources.ravitaillement.debitParHeure,
      },
      acier: {
        stock: brut.moi.ressources.acier.stock,
        debitParHeure: brut.moi.ressources.acier.debitParHeure,
      },
      effectifs: {
        stock: brut.moi.ressources.effectifs.stock,
        debitParHeure: brut.moi.ressources.effectifs.debitParHeure,
        plafond: brut.moi.ressources.effectifs.plafond,
      },
      slots: { total: brut.moi.slots.total, utilises: brut.moi.slots.utilises },
      batiments: brut.moi.batiments.map((batiment) => ({
        cle: CLE_PAR_BATIMENT[batiment.cle] ?? 'qg',
        nom: batiment.nom,
        niveau: batiment.niveau,
        coutNiveauSuivant: batiment.coutNiveauSuivant,
        dureeNiveauSuivantMinutes: batiment.dureeNiveauSuivantMin,
        plafonneParQg: batiment.plafonneParQG,
      })),
      chantier: brut.moi.chantier
        ? { nom: brut.moi.chantier.nom, resteMinutes: brut.moi.chantier.resteMin }
        : null,
      armeePresente: versPile(brut.moi.armee.presente),
      armeeEnTransit: versPile(brut.moi.armee.enTransit),
      avantPostes: brut.moi.avantPostes.flatMap((avantPoste) => {
        const position = lonLatDe(monde, avantPoste.paysHote);
        if (!position) return [];
        return [{
          id: avantPoste.id,
          paysHote: avantPoste.paysHote,
          lonLat: position,
          specialisation: 'extraction' as const,
          garnison: avantPoste.garnison,
          aMoi: true,
        }];
      }),
    },
    arcs,
    adversaires: brut.adversaires.map((adversaire) => ({
      nation: adversaire.nation,
      encre: adversaire.encre,
      pouvoir: adversaire.pouvoir,
      plageRepos: adversaire.plageRepos,
      dernierRenseignement: adversaire.dernierRenseignement,
      barre:
        adversaire.barre.etat === 'attribuee' && adversaire.barre.doctrine
          ? {
              etat: 'attribuee',
              progression: adversaire.barre.progressionPourcent / 100,
              doctrine: adversaire.barre.doctrine,
            }
          : { etat: 'anonyme', progression: adversaire.barre.progressionPourcent / 100 },
    })),
    couverture: {
      visibles: brut.brouillard.mouvementsAdversesVisibles,
      total: brut.brouillard.mouvementsAdversesTotal,
    },
  };
}

function capVersDestination(depuis: LonLat, capDegres: number): LonLat {
  const PORTEE_DEGRES = 28;
  const radians = (capDegres * Math.PI) / 180;
  return [
    depuis[0] + Math.sin(radians) * PORTEE_DEGRES,
    Math.max(-80, Math.min(80, depuis[1] + Math.cos(radians) * PORTEE_DEGRES)),
  ];
}
