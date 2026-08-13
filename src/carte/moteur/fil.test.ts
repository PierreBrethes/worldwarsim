import { describe, expect, it } from 'vitest';
import { Vector3, type InterleavedBufferAttribute } from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
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
  PLAFOND_DERIVE_PX_S,
  VITESSE_DERIVE,
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
const epaisseur = 2.5;
const opacites = { trace: 0.55, progression: 1 };

const traversee = calculerTrajet(grille, versLonLat(20, 25), versLonLat(60, 25), 'combine')!;

describe('construireFil sur un trajet combiné', () => {
  const fil = construireFil(traversee, repere, couleurs, epaisseur, opacites);

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
  const fil = construireFil(traversee, repere, couleurs, epaisseur, opacites);
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

/** Les sommets d'un segment tels que la carte graphique les lira, pas tels qu'on les a écrits. */
function segment(ligne: Line2, index: number): { depuis: Vector3; vers: Vector3 } {
  const tampon = (ligne.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute).data.array;
  return {
    depuis: new Vector3(tampon[index * 6]!, tampon[index * 6 + 1]!, tampon[index * 6 + 2]!),
    vers: new Vector3(tampon[index * 6 + 3]!, tampon[index * 6 + 4]!, tampon[index * 6 + 5]!),
  };
}

const segmentsVisibles = (ligne: Line2): number => ligne.geometry.instanceCount;

const longueurVisible = (ligne: Line2): number => {
  let somme = 0;
  for (let i = 0; i < segmentsVisibles(ligne); i++) {
    const { depuis, vers } = segment(ligne, i);
    somme += depuis.distanceTo(vers);
  }
  return somme;
};

describe('la coupe du fil', () => {
  const fil = construireFil(traversee, repere, couleurs, epaisseur, opacites);
  const deroule = deroulerTrajet(traversee);
  // Les cibles sortent par paires, parcouru puis restant, dans l'ordre des brins.
  const paires = fil.cibles.reduce<Array<[Line2, Line2]>>((paires, ligne, i) => {
    if (i % 2 === 0) paires.push([ligne, fil.cibles[i + 1]!]);
    return paires;
  }, []);
  const longueurTotale = fil.etapes.reduce((somme, etape) => somme + etape.longueur, 0);

  const couperA = (t: number): Vector3 => {
    const { indexEtape, local } = viseeDuJalon(positionTemporelle(deroule, t));
    fil.couper(indexEtape, local);
    const point = new Vector3();
    pointSurEtape(fil.etapes[indexEtape]!, local, point);
    return point;
  };

  it('parcouru et restant se rejoignent sur le sommet du jalon, jamais ailleurs', () => {
    for (const t of [0.1, 0.27, 0.4, 0.63, 0.85, 0.99]) {
      const jalon = couperA(t);
      const entames = paires.filter(
        ([parcouru, restant]) => segmentsVisibles(parcouru) > 0 && segmentsVisibles(restant) > 0,
      );
      // Un seul brin porte la coupe : les autres sont tout parcourus ou tout à parcourir.
      expect(entames).toHaveLength(1);
      const [parcouru, restant] = entames[0]!;
      const finParcouru = segment(parcouru, segmentsVisibles(parcouru) - 1).vers;
      const finRestant = segment(restant, segmentsVisibles(restant) - 1).vers;
      // Le même sommet, au bit près : ce qui reste d'écart au jalon est la précision du
      // tampon, la même pour les deux — donc rien qui puisse se voir au raccord.
      expect(finParcouru.equals(finRestant)).toBe(true);
      expect(finParcouru.distanceTo(jalon)).toBeCloseTo(0, 5);
    }
  });

  it('les deux morceaux couvrent le fil entier : ni trou ni recouvrement', () => {
    for (const t of [0, 0.15, 0.5, 0.77, 1]) {
      couperA(t);
      const visible = paires.reduce(
        (somme, [parcouru, restant]) => somme + longueurVisible(parcouru) + longueurVisible(restant),
        0,
      );
      expect(visible).toBeCloseTo(longueurTotale, 6);
    }
  });

  it('revenir en arrière rend au fil sa longueur pleine : la coupe ne laisse pas de trace', () => {
    couperA(0.9);
    couperA(0.05);
    const [parcouru, restant] = paires[0]!;
    // Le premier brin est à peine entamé : son restant doit avoir retrouvé tous ses segments.
    expect(segmentsVisibles(restant)).toBe(restant.geometry.attributes.instanceStart!.count);
    expect(longueurVisible(parcouru) + longueurVisible(restant)).toBeCloseTo(
      fil.etapes[0]!.longueur,
      6,
    );
  });
});

describe('la dérive du pointillé', () => {
  const filDe = () => construireFil(traversee, repere, couleurs, epaisseur, opacites);
  const materiaux = (fil: ReturnType<typeof filDe>) => ({
    parcouru: fil.cibles[0]!.material as LineMaterial,
    restant: fil.cibles[1]!.material as LineMaterial,
  });

  it('n’anime que le restant : le parcouru n’est même pas pointillé', () => {
    const { parcouru, restant } = materiaux(filDe());
    expect(parcouru.dashed).toBe(false);
    expect(restant.dashed).toBe(true);
    // Un seul fil coupé, donc un seul trait : le restant n'est pas un fil au rabais.
    expect(restant.linewidth).toBe(parcouru.linewidth);
  });

  it('avance à vitesse constante dans le monde, et non à l’écran', () => {
    const fil = filDe();
    const { restant } = materiaux(fil);
    fil.reglerEchelle(0.5);
    fil.deriver(0.05);
    // `dashOffset` se compte dans la maille du pointillé : une unité de monde y vaut `dashScale`.
    expect(restant.dashOffset).toBeCloseTo(VITESSE_DERIVE * 0.05 * restant.dashScale, 10);
  });

  it('coule plus vite de près que de loin : c’est le signal de profondeur', () => {
    const [proche, lointain] = [filDe(), filDe()];
    proche.reglerEchelle(0.5);
    lointain.reglerEchelle(5);
    proche.deriver(0.05);
    lointain.deriver(0.05);
    const pasProche = materiaux(proche).restant.dashOffset;
    const pasLointain = materiaux(lointain).restant.dashOffset;
    expect(pasProche).toBeCloseTo(pasLointain * 10, 10);
  });

  it('plafonne au rapproché : le fil coule, il ne clignote pas', () => {
    const fil = filDe();
    const { restant } = materiaux(fil);
    // Deux millièmes d'unité par pixel : la butée de zoom, où la vitesse de monde s'emballe.
    fil.reglerEchelle(0.002);
    fil.deriver(0.1);
    expect(restant.dashOffset).toBeCloseTo(PLAFOND_DERIVE_PX_S * 0.1, 10);
  });

  it('un onglet revenu au premier plan ne rattrape pas sa dérive d’un coup', () => {
    const [normal, endormi] = [filDe(), filDe()];
    normal.reglerEchelle(1);
    endormi.reglerEchelle(1);
    normal.deriver(0.1);
    endormi.deriver(30);
    expect(materiaux(endormi).restant.dashOffset).toBeCloseTo(
      materiaux(normal).restant.dashOffset,
      10,
    );
  });
});

describe('les losanges de relais', () => {
  it('ne se dessinent plus : l’interception n’existe pas', () => {
    const fil = construireFil(traversee, repere, couleurs, epaisseur, opacites);
    const marques = fil.objet.children.filter((enfant) => enfant.type === 'Group');
    // Départ, arrivée, deux quais — et pas un nœud de grille de plus.
    expect(marques).toHaveLength(2 + fil.quais.length);
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
      epaisseur,
      opacites,
    );
    const sommets = fil.etapes[0]!.brins[0]!.sommets;
    const corde = sommets[0]!.distanceTo(sommets.at(-1)!);
    const apex = Math.max(...sommets.map((sommet) => sommet.y)) - sommets[0]!.y;
    expect(apex).toBeCloseTo(flecheAerienne(corde), 6);
  });
});
