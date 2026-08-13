import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { deroulerTrajet, positionTemporelle, viseeDuJalon } from '@/domaine/deroule-trajet';
import type { Monde } from '@/domaine/monde';
import { calculerTrajet, construireGrille, trajetDirect } from '@/domaine/trajets';
import {
  construireFil,
  flecheAerienne,
  pointSurEtape,
  FLECHE_AIR_MAX,
  FLECHE_AIR_MIN,
  PART_FLECHE_AIR,
} from './fil';
import { EPAISSEUR_PAYS, RepereMonde } from './repere';

/** Le monde jouet de `trajets.test.ts` : deux îles séparées par dix unités de mer. */
function mondeJouet(): Monde {
  const contour: Array<readonly [number, number, number, number]> = [];
  for (let latitude = -90; latitude <= 90; latitude++) {
    contour.push([latitude, 0, 100, ((90 - latitude) / 180) * 50]);
  }
  const rectangle = (x1: number, y1: number, x2: number, y2: number) =>
    [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as const;
  return {
    sphere: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
    contour,
    pays: [
      { nom: 'Ouestland', pointRepresentatif: [20, 25], lonLat: [-108, 0], anneaux: [rectangle(10, 20, 30, 30)] },
      { nom: 'Estland', pointRepresentatif: [60, 25], lonLat: [36, 0], anneaux: [rectangle(40, 20, 80, 30)] },
    ],
  };
}

const versLonLat = (x: number, y: number): [number, number] => [(x / 50 - 1) * 180, 90 - (y / 50) * 180];

const monde = mondeJouet();
const repere = new RepereMonde(monde);
const grille = construireGrille(monde, 1);
const couleurs = { trace: '#000000', progression: '#ffffff' };
const epaisseurs = { parcouru: 2.5, restant: 1.5 };
const opacites = { trace: 0.55, progression: 1 };

const traversee = calculerTrajet(grille, versLonLat(20, 25), versLonLat(60, 25), 'combine')!;

describe('construireFil sur un trajet combiné', () => {
  const fil = construireFil(traversee, repere, couleurs, epaisseurs, opacites);

  it('découpe le fil comme les étapes, terre puis mer puis terre', () => {
    expect(fil.etapes.map((etape) => etape.milieu)).toEqual(['terre', 'mer', 'terre']);
  });

  it('pose terre et mer à la même altitude : aucune marche à la côte', () => {
    const hauteurs = fil.etapes.flatMap((etape) =>
      etape.brins.flatMap((brin) => brin.sommets.map((sommet) => sommet.y)),
    );
    for (const hauteur of hauteurs) expect(hauteur).toBeGreaterThan(EPAISSEUR_PAYS);
    expect(Math.max(...hauteurs) - Math.min(...hauteurs)).toBeCloseTo(0, 10);
  });

  it('plante un quai à chaque transfert, embarquement puis débarquement', () => {
    expect(fil.quais.map((quai) => quai.embarquement)).toEqual([true, false]);
  });

  it('le fil est continu : chaque étape reprend où la précédente s’arrête', () => {
    for (let i = 1; i < fil.etapes.length; i++) {
      const avant = fil.etapes[i - 1]!.brins.at(-1)!.sommets.at(-1)!;
      const apres = fil.etapes[i]!.brins[0]!.sommets[0]!;
      expect(Math.hypot(apres.x - avant.x, apres.z - avant.z)).toBeLessThan(1e-6);
    }
  });
});

describe('le jalon suit le temps, pas la distance', () => {
  const fil = construireFil(traversee, repere, couleurs, epaisseurs, opacites);
  const deroule = deroulerTrajet(traversee);

  /** Le trajet parcouru comme le fait la boucle du moteur : un instant entre, un point sort. */
  const jalonA = (t: number): Vector3 => {
    const { indexEtape, local } = viseeDuJalon(positionTemporelle(deroule, t));
    const point = new Vector3();
    pointSurEtape(fil.etapes[indexEtape]!, local, point);
    return point;
  };

  it('s’immobilise au quai : le jalon ne bouge plus pendant tout le transfert', () => {
    const quai = deroule.find((troncon) => troncon.genre === 'quai')!;
    const debutQuai = deroule.slice(0, deroule.indexOf(quai)).reduce((somme, t) => somme + t.part, 0);
    const arret = [0.02, 0.5, 0.98].map((part) => jalonA(debutQuai + quai.part * part));
    expect(arret[0]!.distanceTo(arret[1]!)).toBeCloseTo(0, 10);
    expect(arret[1]!.distanceTo(arret[2]!)).toBeCloseTo(0, 10);
    // Et il avance de nouveau dès la sortie du quai, sinon l'arrêt serait un blocage.
    expect(jalonA(debutQuai + quai.part * 1.2).distanceTo(arret[2]!)).toBeGreaterThan(0);
  });

  it('avance d’un bout à l’autre du fil sur la durée du trajet', () => {
    const depart = fil.etapes[0]!.brins[0]!.sommets[0]!;
    const arrivee = fil.etapes.at(-1)!.brins.at(-1)!.sommets.at(-1)!;
    expect(jalonA(0).distanceTo(depart)).toBeCloseTo(0, 6);
    expect(jalonA(1).distanceTo(arrivee)).toBeCloseTo(0, 6);
  });

  it('la traversée de mer prend moins de temps que sa part de distance', () => {
    const partTemps = deroule.find((t) => t.genre === 'etape' && t.milieu === 'mer')!.part;
    const partDistance = traversee.etapes[1]!.distanceUnites / traversee.distanceUnites;
    expect(partTemps).toBeLessThan(partDistance);
  });
});

describe('l’aérien', () => {
  it('la flèche suit la corde entre ses deux bornes, et s’y arrête', () => {
    expect(flecheAerienne(1)).toBe(FLECHE_AIR_MIN);
    expect(flecheAerienne(100)).toBeCloseTo(100 * PART_FLECHE_AIR, 10);
    expect(flecheAerienne(4000)).toBe(FLECHE_AIR_MAX);
  });

  it('l’apex de l’arc est bien la flèche demandée, pas le point de contrôle', () => {
    const fil = construireFil(
      trajetDirect(versLonLat(5, 25), versLonLat(95, 25), 'air', 1),
      repere,
      couleurs,
      epaisseurs,
      opacites,
    );
    const sommets = fil.etapes[0]!.brins[0]!.sommets;
    const corde = sommets[0]!.distanceTo(sommets.at(-1)!);
    const apex = Math.max(...sommets.map((sommet) => sommet.y)) - sommets[0]!.y;
    expect(apex).toBeCloseTo(flecheAerienne(corde), 6);
  });
});
