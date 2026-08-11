import type { Doctrine } from '@/domaine/vue-joueur';

export declare const Fixture: {
  saison: {
    numero: number; dureeHeures: number; ecouleHeures: number; restantHeures: number;
    joueurs: number; regionJouable: string; trajetMinPar1000km: number;
  };
  moi: {
    nation: string; encre: string; pouvoir: string; doctrine: Doctrine;
    doctrineRevelee: boolean; progressionPourcent: number; plageRepos: string;
    ressources: {
      ravitaillement: { stock: number; debitParHeure: number };
      acier: { stock: number; debitParHeure: number };
      effectifs: { stock: number; plafond: number; debitParHeure: number; note: string };
    };
    slots: { total: number; utilises: number };
    batiments: Array<{
      cle: string; nom: string; niveau: number;
      coutNiveauSuivant: number; dureeNiveauSuivantMin: number; plafonneParQG: boolean;
    }>;
    chantier: { nom: string; resteMin: number } | null;
    armee: { presente: Record<string, number>; enTransit: Record<string, number> };
    avantPostes: Array<{
      id: string; paysHote: string; specialisation: string;
      rendementRelatif: number; garnison: number; immunitePostRaidMin: number;
    }>;
    agents: Array<{ paysHote: string; aligne: boolean; progresMin: number }>;
  };
  mouvements: {
    miens: Array<{
      id: string; etat: string; type: string; origine: string; destination: string;
      distanceKm: number; minutesRestantes: number; arriveeDans: string;
      slotOccupe: boolean; pile: Record<string, number> | null; traverseAntimeridien: boolean;
    }>;
    adversesVisibles: Array<{
      id: string; etat: 'adverse-detecte' | 'adverse-derniere-position-connue';
      nationSuspectee: string | null; type: null; pile: null;
      capDegres: number; arriveeEstimeeDans: string | null; vuIlYaMin: number;
    }>;
  };
  brouillard: {
    detecteurs: Array<{ nom: string; rayonKm: number }>;
    mouvementsAdversesTotal: number; mouvementsAdversesVisibles: number; couverturePourcent: number;
  };
  journal: Array<{ t: string; gravite: 'critique' | 'notable' | 'routine'; texte: string }>;
  adversaires: Array<{
    nation: string; encre: string; pouvoir: string;
    barre: { etat: string; progressionPourcent: number; doctrine: Doctrine | null };
    plageRepos: string; dernierRenseignement: string;
  }>;
};
