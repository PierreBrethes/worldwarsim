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
