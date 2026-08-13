export const PALETTE = {
  bureau: '#171208',
  papier: '#e4d8bd',
  mer: '#a9c5cd',
  encreMer: '#2c5063',
  terreNeutre: '#d5c5a0',
  frontiere: '#2a2118',
  graticule: '#4a4436',
  socleHaut: '#c7b48e',
  socleBas: '#5f5039',
  bordureMonde: '#6b4a24',
  traitBordure: '#3a2a18',
} as const;

/**
 * Les encres des planches « fil tendu », telles quelles. De l'encre sur du papier : une ocre
 * calme pour ce que je pilote, l'encre critique assourdie pour ce qui vient d'en face, le gris
 * de routine pour ce qui n'est plus qu'un souvenir. Aucun orange saturé, aucun matériau
 * émissif — le budget de contraste appartient à la couche de jeu, pas à la lumière.
 */
export const COULEURS_ARC = {
  mien: { trace: '#c98a3c', progression: '#e0a552' },
  adverseDetecte: { trace: '#8f4a3e', progression: '#9d4638' },
  dernierePositionConnue: { trace: '#6e6a5e', progression: '#6e6a5e' },
  maitriseDesMers: { trace: '#3e6b7a', progression: '#5a8fa0' },
} as const;
