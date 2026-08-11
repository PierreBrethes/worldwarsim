import type { LonLat } from './geo';

export type RoleUnite =
  | 'infanterie' | 'blinde' | 'transportTerrestre'
  | 'chasseur' | 'bombardier' | 'transportAerien'
  | 'escorte' | 'cargo' | 'porteAvions';

export type Doctrine = 'domination' | 'hegemonie' | 'influence';
export type TypeMouvement = 'attaque' | 'raid' | 'avantPoste' | 'agent' | 'leurre';
export type Pile = Partial<Record<RoleUnite, number>>;

/**
 * Les quatre états d'affichage d'un arc. L'union discriminée est le garde-fou du
 * brouillard : un arc adverse n'a structurellement ni `type` ni `pile`, donc on ne
 * peut pas les afficher par distraction.
 */
export type ArcAffiche =
  | {
      readonly etat: 'mien';
      readonly id: string;
      readonly depuis: LonLat;
      readonly vers: LonLat;
      readonly type: TypeMouvement;
      readonly pile: Pile;
      readonly minutesRestantes: number;
      readonly avancement: number;
    }
  | {
      readonly etat: 'adverseDetecte';
      readonly id: string;
      readonly depuis: LonLat;
      readonly vers: LonLat;
      readonly nationSuspectee: string | null;
      readonly capDegres: number;
      readonly minutesRestantesEstimees: number | null;
      readonly avancement: number;
    }
  | {
      readonly etat: 'dernierePositionConnue';
      readonly id: string;
      readonly depuis: LonLat;
      readonly vers: LonLat;
      readonly capDegres: number;
      readonly vuIlYaMinutes: number;
      readonly avancement: number;
    }
  | {
      readonly etat: 'maitriseDesMers';
      readonly id: string;
      readonly depuis: LonLat;
      readonly vers: LonLat;
      readonly avancement: number;
    };

export type AvantPosteAffiche = {
  readonly id: string;
  readonly paysHote: string;
  readonly lonLat: LonLat;
  readonly specialisation: 'extraction' | 'relais' | 'ecoute';
  readonly garnison: number;
  readonly aMoi: boolean;
};

export type Ressource = {
  readonly stock: number;
  readonly debitParHeure: number;
  readonly plafond?: number | undefined;
};

export type Batiment = {
  readonly cle: 'qg' | 'industrie' | 'logistique' | 'conscription' | 'ecoute';
  readonly nom: string;
  readonly niveau: number;
  readonly coutNiveauSuivant: number;
  readonly dureeNiveauSuivantMinutes: number;
  readonly plafonneParQg: boolean;
};

export type BarreAdversaire =
  | { readonly etat: 'anonyme'; readonly progression: number }
  | { readonly etat: 'attribuee'; readonly progression: number; readonly doctrine: Doctrine }
  | { readonly etat: 'exposee'; readonly progression: number; readonly doctrine: Doctrine; readonly geleeJusqua: string };

export type Adversaire = {
  readonly nation: string;
  readonly encre: string;
  readonly pouvoir: string;
  readonly barre: BarreAdversaire;
  readonly plageRepos: string;
  readonly dernierRenseignement: string;
};

export type VueJoueur = {
  readonly saison: {
    readonly numero: number;
    readonly dureeHeures: number;
    readonly ecouleHeures: number;
    readonly joueurs: number;
    readonly regionJouable: string;
    readonly trajetMinutesPar1000km: number;
  };
  readonly moi: {
    readonly nation: string;
    readonly encre: string;
    readonly pouvoir: string;
    readonly doctrine: Doctrine;
    readonly progression: number;
    readonly plageRepos: string;
    readonly ravitaillement: Ressource;
    readonly acier: Ressource;
    readonly effectifs: Ressource;
    readonly slots: { readonly total: number; readonly utilises: number };
    readonly batiments: ReadonlyArray<Batiment>;
    readonly chantier: { readonly nom: string; readonly resteMinutes: number } | null;
    readonly armeePresente: Pile;
    readonly armeeEnTransit: Pile;
    readonly avantPostes: ReadonlyArray<AvantPosteAffiche>;
  };
  readonly arcs: ReadonlyArray<ArcAffiche>;
  readonly adversaires: ReadonlyArray<Adversaire>;
  readonly couverture: { readonly visibles: number; readonly total: number };
};
