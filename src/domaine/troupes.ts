import type { ArcAffiche, Pile, RoleUnite, TypeMouvement, VueJoueur } from './vue-joueur';

export type DomaineUnite = 'terre' | 'air' | 'mer';

export const DOMAINE_PAR_ROLE: Readonly<Record<RoleUnite, DomaineUnite>> = {
  infanterie: 'terre',
  blinde: 'terre',
  transportTerrestre: 'terre',
  chasseur: 'air',
  bombardier: 'air',
  transportAerien: 'air',
  escorte: 'mer',
  cargo: 'mer',
  porteAvions: 'mer',
};

export type PalierUnite = 1 | 2;

/**
 * Combien de niveaux de matériel un rôle connaît. Deux pour ceux dont l'équipement se
 * remplace en cours de saison, un pour les autres : c'est cette table qui décide ce qu'un
 * atelier a le droit de produire, pas la présence d'un sprite.
 */
export const PALIERS_PAR_ROLE: Readonly<Record<RoleUnite, PalierUnite>> = {
  infanterie: 2,
  blinde: 2,
  transportTerrestre: 1,
  chasseur: 1,
  bombardier: 1,
  transportAerien: 1,
  escorte: 1,
  cargo: 1,
  porteAvions: 2,
};

export const libellePalier = (palier: PalierUnite): string => `MK${palier}`;

/**
 * La matrice complète fait 9×9 et un joueur ne doit jamais la voir en entier (brief 4.6) :
 * deux listes courtes suffisent. Une unité de **soutien** n'a structurellement ni forces ni
 * faiblesses — elle ne combat pas, elle se fait détruire ou intercepter.
 */
export type FicheUnite =
  | {
      readonly genre: 'combat';
      readonly fortContre: ReadonlyArray<string>;
      readonly faibleContre: ReadonlyArray<string>;
    }
  | { readonly genre: 'soutien'; readonly apport: string };

export const FICHE_PAR_ROLE: Readonly<Record<RoleUnite, FicheUnite>> = {
  infanterie: {
    genre: 'combat',
    fortContre: ['garnisons', 'avant-postes'],
    faibleContre: ['blindé', 'bombardier'],
  },
  blinde: {
    genre: 'combat',
    fortContre: ['infanterie', 'garnisons'],
    faibleContre: ['bombardier', 'infanterie MK2'],
  },
  transportTerrestre: {
    genre: 'soutien',
    apport: 'Ajoute de la capacité de pile : projette l’infanterie plus loin.',
  },
  chasseur: {
    genre: 'combat',
    fortContre: ['bombardier', 'transport aérien'],
    faibleContre: ['escorte'],
  },
  bombardier: {
    genre: 'combat',
    fortContre: ['blindé', 'avant-postes', 'navires'],
    faibleContre: ['chasseur'],
  },
  transportAerien: {
    genre: 'soutien',
    apport: 'Vitesse maximale, capacité minimale.',
  },
  escorte: {
    genre: 'combat',
    fortContre: ['cargo', 'mouvements maritimes'],
    faibleContre: ['bombardier'],
  },
  cargo: {
    genre: 'soutien',
    apport: 'Commerce avec les pays neutres et logistique lourde.',
  },
  porteAvions: {
    genre: 'soutien',
    apport: 'Infrastructure mobile : déplace le point de lancement aérien.',
  },
};

const ORDRE_ROLE: ReadonlyArray<RoleUnite> = [
  'infanterie',
  'blinde',
  'transportTerrestre',
  'chasseur',
  'bombardier',
  'transportAerien',
  'escorte',
  'cargo',
  'porteAvions',
];

export type SituationTroupes =
  | { readonly genre: 'domicile' }
  | {
      readonly genre: 'mouvement';
      readonly arcId: string;
      readonly typeMouvement: TypeMouvement;
      readonly destination: string;
      readonly minutesRestantes: number;
    }
  | { readonly genre: 'garnison'; readonly avantPosteId: string; readonly paysHote: string };

export type GenreSituation = SituationTroupes['genre'];

export type LigneTroupes = {
  readonly cle: string;
  readonly role: RoleUnite;
  readonly domaineUnite: DomaineUnite;
  readonly nombre: number;
  readonly situation: SituationTroupes;
};

export type FiltreTroupes = {
  readonly situation: GenreSituation | 'toutes';
  readonly domaineUnite: DomaineUnite | 'tous';
};

export type TriTroupes = 'role' | 'nombre' | 'echeance';

/**
 * Le rôle qui donne son visage à un mouvement sur la carte : le plus nombreux de la pile,
 * départagé par l'ordre canonique des rôles. Une pile vide n'a pas de visage — c'est au
 * rendu de décider quoi montrer, pas au domaine d'inventer une unité.
 */
export function roleRepresentatif(pile: Pile): RoleUnite | null {
  let retenu: RoleUnite | null = null;
  let maximum = 0;
  for (const role of ORDRE_ROLE) {
    const nombre = pile[role] ?? 0;
    if (nombre > maximum) {
      retenu = role;
      maximum = nombre;
    }
  }
  return retenu;
}

/**
 * Un avant-poste n'expose que le nombre d'hommes de sa garnison, pas une pile : seule
 * l'infanterie garnit un avant-poste (fiche 09), donc l'inventaire la reporte sous ce rôle.
 */
export function inventorierTroupes(
  moi: VueJoueur['moi'],
  arcs: ReadonlyArray<ArcAffiche>,
): ReadonlyArray<LigneTroupes> {
  const lignes: LigneTroupes[] = [];

  for (const [role, nombre] of effectifsDe(moi.armeePresente)) {
    lignes.push(ligne(`domicile-${role}`, role, nombre, { genre: 'domicile' }));
  }

  for (const arc of arcs) {
    if (arc.etat !== 'mien') continue;
    for (const [role, nombre] of effectifsDe(arc.pile)) {
      lignes.push(
        ligne(`${arc.id}-${role}`, role, nombre, {
          genre: 'mouvement',
          arcId: arc.id,
          typeMouvement: arc.type,
          destination: arc.destinationLibelle,
          minutesRestantes: arc.minutesRestantes,
        }),
      );
    }
  }

  for (const avantPoste of moi.avantPostes) {
    if (!avantPoste.aMoi || avantPoste.garnison <= 0) continue;
    lignes.push(
      ligne(`${avantPoste.id}-garnison`, 'infanterie', avantPoste.garnison, {
        genre: 'garnison',
        avantPosteId: avantPoste.id,
        paysHote: avantPoste.paysHote,
      }),
    );
  }

  return lignes;
}

export function organiserTroupes(
  lignes: ReadonlyArray<LigneTroupes>,
  filtre: FiltreTroupes,
  tri: TriTroupes,
): ReadonlyArray<LigneTroupes> {
  const retenues = lignes.filter(
    (candidate) =>
      (filtre.situation === 'toutes' || candidate.situation.genre === filtre.situation) &&
      (filtre.domaineUnite === 'tous' || candidate.domaineUnite === filtre.domaineUnite),
  );
  return retenues.sort(comparer(tri));
}

export function compterTroupes(lignes: ReadonlyArray<LigneTroupes>): number {
  return lignes.reduce((somme, candidate) => somme + candidate.nombre, 0);
}

function ligne(
  cle: string,
  role: RoleUnite,
  nombre: number,
  situation: SituationTroupes,
): LigneTroupes {
  return { cle, role, domaineUnite: DOMAINE_PAR_ROLE[role], nombre, situation };
}

function effectifsDe(pile: VueJoueur['moi']['armeePresente']): ReadonlyArray<[RoleUnite, number]> {
  return (Object.entries(pile) as ReadonlyArray<[RoleUnite, number]>).filter(
    ([, nombre]) => nombre > 0,
  );
}

function comparer(tri: TriTroupes): (a: LigneTroupes, b: LigneTroupes) => number {
  switch (tri) {
    case 'role':
      return (a, b) => ORDRE_ROLE.indexOf(a.role) - ORDRE_ROLE.indexOf(b.role) || b.nombre - a.nombre;
    case 'nombre':
      return (a, b) => b.nombre - a.nombre;
    case 'echeance':
      return (a, b) => echeanceMinutes(a) - echeanceMinutes(b);
  }
}

function echeanceMinutes(candidate: LigneTroupes): number {
  return candidate.situation.genre === 'mouvement'
    ? candidate.situation.minutesRestantes
    : Number.POSITIVE_INFINITY;
}
