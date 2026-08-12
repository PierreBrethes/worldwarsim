export const NATIONS = [
  'France',
  'Royaume-Uni',
  'États-Unis',
  'URSS',
  'Allemagne',
  'Japon',
  'Italie',
  'Chine',
] as const;

export type Nation = (typeof NATIONS)[number];

export const ENCRE_PAR_NATION: Readonly<Record<Nation, string>> = {
  France: '#3f5a7d',
  'Royaume-Uni': '#4a4f7a',
  'États-Unis': '#4a7060',
  URSS: '#9d4638',
  Allemagne: '#6e6a5e',
  Japon: '#a44a5e',
  Italie: '#a86c4a',
  Chine: '#b07434',
};

export const POUVOIR_PAR_NATION: Readonly<Record<Nation, string>> = {
  France: 'Projection outre-mer — avant-postes à n’importe quelle distance, coût croissant',
  'Royaume-Uni': 'Maîtrise des mers — voit tous les arcs maritimes, sans origine ni cargaison',
  'États-Unis': 'Arsenal — convertit ravitaillement → acier, un sens, avec cooldown',
  URSS: 'Profondeur stratégique — l’occupation ne réduit pas sa production',
  Allemagne: 'Guerre éclair — enchaîne deux mouvements offensifs sans cooldown de slot',
  Japon: 'Doctrine du porte-avions — réoriente un mouvement en vol, avant mi-parcours',
  Italie: 'Reconnaissance aérienne — voit la composition des piles détectées',
  Chine: 'Masse — pas de plafond d’effectifs, entretien croissant en ravitaillement',
};

/**
 * Le pays de `monde.json` sur lequel s'assied chaque nation jouable. La table est
 * indispensable parce que le monde est nommé en anglais : sans elle, seule « France »
 * coïncide par accident avec le libellé de la nation, et les sept autres ne matchent jamais.
 *
 * **Porter le nom d'une nation n'est pas la posséder.** Un pays ne prend l'encre que
 * lorsqu'un joueur a réservé cette nation — voir `encreParPaysPris`.
 */
export const PAYS_DE_NATION: Readonly<Record<Nation, string>> = {
  France: 'France',
  'Royaume-Uni': 'United Kingdom',
  'États-Unis': 'United States of America',
  URSS: 'Russia',
  Allemagne: 'Germany',
  Japon: 'Japan',
  Italie: 'Italy',
  Chine: 'China',
};

/**
 * Les pays à encrer sur la carte, à partir des joueurs réellement présents. Un porteur
 * sans nation (pseudo en guise d'étiquette) ne colore rien.
 */
export function encreParPaysPris(
  porteurs: ReadonlyArray<{ readonly nation: string | null; readonly encre: string }>,
): Map<string, string> {
  const encres = new Map<string, string>();
  for (const { nation, encre } of porteurs) {
    if (nation !== null && nation in PAYS_DE_NATION) {
      encres.set(PAYS_DE_NATION[nation as Nation], encre);
    }
  }
  return encres;
}

export const DOCTRINES = ['domination', 'hegemonie', 'influence'] as const;

export type Doctrine = (typeof DOCTRINES)[number];

/** Le schéma stocke des identifiants sans accent ; l'écran, lui, est en français. */
export const LIBELLE_DOCTRINE: Readonly<Record<Doctrine, string>> = {
  domination: 'domination',
  hegemonie: 'hégémonie',
  influence: 'influence',
};

export function libelleDoctrine(doctrine: string | null): string | null {
  return doctrine && doctrine in LIBELLE_DOCTRINE ? LIBELLE_DOCTRINE[doctrine as Doctrine] : doctrine;
}

export function encreDeNation(nation: string | null): string {
  return nation && nation in ENCRE_PAR_NATION ? ENCRE_PAR_NATION[nation as Nation] : '#6e6a5e';
}
