import type { LonLat } from './geo';

export type PaysProjete = {
  readonly nom: string;
  readonly pointRepresentatif: readonly [x: number, y: number];
  readonly lonLat: LonLat;
  readonly anneaux: ReadonlyArray<ReadonlyArray<readonly [x: number, y: number]>>;
};

export type EchantillonContour = readonly [
  latitude: number,
  xOuest: number,
  xEst: number,
  y: number,
];

export type Monde = {
  readonly sphere: { minX: number; maxX: number; minY: number; maxY: number };
  readonly contour: ReadonlyArray<EchantillonContour>;
  readonly pays: ReadonlyArray<PaysProjete>;
};

export type LigneRegion = ReadonlyArray<readonly [x: number, y: number]>;

export type RegionAffichee = {
  readonly nom: string;
  readonly anneaux: ReadonlyArray<ReadonlyArray<readonly [x: number, y: number]>>;
};

export type DonneesRegions = {
  readonly lignes: ReadonlyArray<LigneRegion>;
  readonly regions: ReadonlyArray<RegionAffichee>;
};

/**
 * Les régions admin-1 sont un fichier à part : plusieurs fois le poids du monde, purement
 * décoratives, et invisibles tant qu'on ne zoome pas — le plateau n'a pas à les attendre.
 */
export async function chargerRegions(url = '/regions.json'): Promise<DonneesRegions> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`régions introuvables : ${url}`);
  const brut = (await reponse.json()) as { lignes: LigneRegion[]; regions: Array<{ n: string; p: [number, number][][] }> };
  return {
    lignes: brut.lignes,
    regions: brut.regions.map((region) => ({ nom: region.n, anneaux: region.p })),
  };
}

export type TypeRegion = 'plaine' | 'forêt' | 'jungle' | 'montagne' | 'désert' | 'toundra';

/**
 * Six régions témoins classées à la main — une par type — pour juger le rendu avant la
 * passe de terrain réel (ETOPO + Köppen + landcover, cuite dans `regions.json`).
 * « Amazonas » existe dans quatre pays : tous jungle, l'homonymie est inoffensive.
 */
const TEMOINS: ReadonlyMap<string, TypeRegion> = new Map([
  ['Oise', 'plaine'],
  ['Landes', 'forêt'],
  ['Amazonas', 'jungle'],
  ['Valais', 'montagne'],
  ['Tamanghasset', 'désert'],
  ['Chukchi Autonomous Okrug', 'toundra'],
]);

/**
 * **Type factice** hors témoins : un hachage du nom, stable d'un chargement à l'autre,
 * pour donner corps à l'infobulle de survol. Aucune règle de jeu ne doit jamais le lire.
 */
export function typeDeRegion(nom: string): TypeRegion {
  const temoin = TEMOINS.get(nom);
  if (temoin !== undefined) return temoin;
  const types: ReadonlyArray<TypeRegion> = ['plaine', 'forêt', 'jungle', 'montagne', 'désert', 'toundra'];
  let hachage = 0;
  for (let i = 0; i < nom.length; i++) hachage = (hachage * 31 + nom.charCodeAt(i)) >>> 0;
  return types[hachage % types.length]!;
}

type MondeBrut = {
  meta: {
    sphere: { minX: number; maxX: number; minY: number; maxY: number };
    outline: EchantillonContour[];
  };
  countries: Array<{ n: string; c: [number, number]; ll: [number, number]; p: [number, number][][] }>;
};

export async function chargerMonde(url = '/monde.json'): Promise<Monde> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`monde introuvable : ${url}`);
  const brut = (await reponse.json()) as MondeBrut;
  return {
    sphere: brut.meta.sphere,
    contour: brut.meta.outline,
    pays: brut.countries.map((c) => ({
      nom: c.n,
      pointRepresentatif: c.c,
      lonLat: c.ll,
      anneaux: c.p,
    })),
  };
}
