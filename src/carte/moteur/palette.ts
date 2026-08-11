export const PALETTE = {
  bureau: '#171208',
  papier: '#e4d8bd',
  mer: '#a9c5cd',
  encreMer: '#2c5063',
  ombreCote: '#3f6b7c',
  terreNeutre: '#d5c5a0',
  frontiere: '#2a2118',
  graticule: '#4a4436',
  socleHaut: '#c7b48e',
  socleBas: '#5f5039',
  bordureMonde: '#6b4a24',
  traitBordure: '#3a2a18',
} as const;

export const ENCRES_NATION: Readonly<Record<string, string>> = {
  France: '#3f5a7d',
  'Royaume-Uni': '#4a4f7a',
  'États-Unis': '#4a7060',
  URSS: '#9d4638',
  Allemagne: '#6e6a5e',
  Japon: '#a44a5e',
  Italie: '#a86c4a',
  Chine: '#b07434',
};

export const COULEURS_ARC = {
  mien: { trace: '#8a4a1e', progression: '#c9762c' },
  adverseDetecte: { trace: '#9d4638', progression: '#c2604f' },
  dernierePositionConnue: { trace: '#6e6a5e', progression: '#6e6a5e' },
  maitriseDesMers: { trace: '#3e6b7a', progression: '#5a8fa0' },
} as const;
