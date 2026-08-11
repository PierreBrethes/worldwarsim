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

export const DOCTRINES = ['domination', 'hegemonie', 'influence'] as const;

export function encreDeNation(nation: string | null): string {
  return nation && nation in ENCRE_PAR_NATION ? ENCRE_PAR_NATION[nation as Nation] : '#6e6a5e';
}
