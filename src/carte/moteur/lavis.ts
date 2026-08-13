import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  Uint32BufferAttribute,
} from 'three';
import type { Monde } from '@/domaine/monde';
import type { Courbure } from './courbure';
import { PALETTE } from './palette';
import { NIVEAU_MER, type RepereMonde } from './repere';

const LARGEUR_LAVIS = 0.8;
const OPACITE_RIVAGE = 0.35;
const POSE_LAVIS = 0.005;
const PAS_JOINT = Math.PI / 12;
const PAS_CONTOUR = 0.4;
/** Au-delà, l'onglet d'un angle concave rentrant partirait au large. */
const LIMITE_BISEAU = 1.8;

type Point = readonly [x: number, z: number];

/**
 * Le lavis posé au pinceau le long d'un rivage : une encre qui part du trait de côte et se
 * perd vers le large. Géométrique et non cuit — c'est ce qui lui permet de rester franc au
 * zoom le plus serré, là où une bande de texels se pixelise.
 *
 * Le ruban suit tout le contour, côtes ou non : un segment qui longe une frontière terrestre
 * passe sous le pays voisin, dont la dalle plonge sous la mer. Détecter les côtes coûterait
 * une passe de voisinage pour un résultat que la profondeur donne déjà.
 */
export function construireLavisCotier(
  monde: Monde,
  repere: RepereMonde,
  courbure: Courbure,
): Mesh<BufferGeometry, MeshBasicMaterial> {
  const ruban = new Ruban(new Color(PALETTE.encreMer), NIVEAU_MER + POSE_LAVIS);

  for (const pays of monde.pays) {
    for (const anneau of pays.anneaux) {
      const contour = degrossir(
        anneau.map(([px, py]) => [px - repere.centreX, py - repere.centreY] as const),
      );
      if (contour.length < 3) continue;
      ruban.anneau(contour, orientation(contour));
    }
  }

  const maille = new Mesh(
    courbure.enregistrer(ruban.geometrie()),
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      // Un pixel ne prend l'encre qu'une fois : sans le pochoir, chaque recouvrement de rubans
      // — caps, îlots, détroits — encrerait deux fois et dessinerait un soleil sur l'eau.
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: NotEqualStencilFunc,
      stencilZPass: ReplaceStencilOp,
    }),
  );
  // La mer est opaque, donc déjà dessinée : le rang n'ordonne le lavis que face aux autres
  // transparents posés au sol.
  maille.renderOrder = 1;
  return maille;
}

class Ruban {
  private readonly positions: number[] = [];
  private readonly couleurs: number[] = [];
  private readonly indices: number[] = [];

  constructor(
    private readonly encre: Color,
    private readonly altitude: number,
  ) {}

  /**
   * Un anneau, ruban fermé. Deux régimes au coin, et c'est toute la difficulté : à l'angle
   * saillant les deux quads laissent un coin vide, qu'un éventail referme ; à l'angle rentrant
   * ils se recouvrent, et le lavis s'y encrerait deux fois — un onglet partagé les raboute.
   */
  anneau(contour: ReadonlyArray<Point>, sens: number): void {
    const normales = contour.map((point, index) =>
      normaleExterieure(point, contour[(index + 1) % contour.length]!, sens),
    );

    const entrees: Point[] = [];
    const sorties: Point[] = [];
    const eventails: Array<{
      sommet: Point;
      depuis: Point;
      vers: Point;
      angle: number;
    } | null> = [];

    contour.forEach((sommet, index) => {
      const entrante = normales[(index - 1 + contour.length) % contour.length]!;
      const sortante = normales[index]!;
      const produit = entrante[0] * sortante[1] - entrante[1] * sortante[0];
      const angle = Math.atan2(produit, entrante[0] * sortante[0] + entrante[1] * sortante[1]);

      // L'onglet raboute le coin des deux côtés tant qu'il reste court : il ne laisse ni fente
      // à l'angle saillant, ni recouvrement au rentrant. En épingle il part tangentiellement,
      // et c'est l'éventail qui prend le relais.
      const onglet = biseau(sommet, entrante, sortante);
      if (onglet) {
        sorties[index] = onglet;
        entrees[index] = onglet;
        eventails[index] = null;
        return;
      }

      sorties[index] = deplace(sommet, entrante, LARGEUR_LAVIS);
      entrees[index] = deplace(sommet, sortante, LARGEUR_LAVIS);
      eventails[index] =
        angle * sens > 0 ? { sommet, depuis: entrante, vers: sortante, angle } : null;
    });

    contour.forEach((sommet, index) => {
      const suivant = (index + 1) % contour.length;
      this.quad(sommet, entrees[index]!, contour[suivant]!, sorties[suivant]!);
      const eventail = eventails[index];
      if (eventail) {
        this.eventail(eventail.sommet, eventail.depuis, eventail.vers, eventail.angle);
      }
    });
  }

  geometrie(): BufferGeometry {
    const geometrie = new BufferGeometry();
    geometrie.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometrie.setAttribute('color', new Float32BufferAttribute(this.couleurs, 4));
    geometrie.setIndex(new Uint32BufferAttribute(this.indices, 1));
    return geometrie;
  }

  private quad(rivageA: Point, largeA: Point, rivageB: Point, largeB: Point): void {
    const base = this.positions.length / 3;
    this.rivage(rivageA);
    this.large(largeA);
    this.rivage(rivageB);
    this.large(largeB);
    this.indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }

  private eventail(sommet: Point, depuis: Point, vers: Point, angle: number): void {
    const pas = Math.ceil(Math.abs(angle) / PAS_JOINT);
    const centre = this.positions.length / 3;
    this.rivage(sommet);
    for (let i = 0; i <= pas; i++) {
      // Le dernier rayon reprend la normale sortante telle quelle : reconstruite par rotation,
      // elle raterait le bord du quad suivant d'un poil, et le poil se voit en clair sur l'eau.
      const tourne = angle * (i / pas);
      const cos = Math.cos(tourne);
      const sin = Math.sin(tourne);
      const normale: Point =
        i === pas ? vers : [depuis[0] * cos - depuis[1] * sin, depuis[0] * sin + depuis[1] * cos];
      this.large(deplace(sommet, normale, LARGEUR_LAVIS));
    }
    for (let i = 0; i < pas; i++) this.indices.push(centre, centre + 1 + i, centre + 2 + i);
  }

  private rivage(point: Point): void {
    this.positions.push(point[0], this.altitude, point[1]);
    this.couleurs.push(this.encre.r, this.encre.g, this.encre.b, OPACITE_RIVAGE);
  }

  private large(point: Point): void {
    this.positions.push(point[0], this.altitude, point[1]);
    this.couleurs.push(this.encre.r, this.encre.g, this.encre.b, 0);
  }
}

const deplace = (point: Point, direction: Point, distance: number): Point => [
  point[0] + direction[0] * distance,
  point[1] + direction[1] * distance,
];

/**
 * Le point où les deux bords extérieurs d'un angle rentrant se rejoignent. `null` quand
 * l'onglet dépasse la limite : le coin est alors laissé ouvert, deux bords francs qui se
 * recouvrent — le pochoir absorbe le recouvrement, une aiguille de plusieurs unités non.
 */
function biseau(sommet: Point, entrante: Point, sortante: Point): Point | null {
  const bx = entrante[0] + sortante[0];
  const bz = entrante[1] + sortante[1];
  const longueur = Math.hypot(bx, bz);
  if (longueur < 1e-6) return null;
  const ux = bx / longueur;
  const uz = bz / longueur;
  const cosinus = ux * sortante[0] + uz * sortante[1];
  if (cosinus < 1 / LIMITE_BISEAU) return null;
  return deplace(sommet, [ux, uz], LARGEUR_LAVIS / cosinus);
}

/**
 * Le contour est bien plus fin que le lavis n'est large : une découpe de fjord de 0,02 unité
 * projetée à 0,8 se retourne sur ses voisines, et le ruban part en aiguilles. On dégrossit
 * donc le tracé au demi-lavis avant de décaler — la silhouette nette reste celle du pays,
 * dessinée par sa dalle ; le lavis, lui, n'a qu'à border.
 */
function degrossir(contour: ReadonlyArray<Point>): ReadonlyArray<Point> {
  const garde: Point[] = [];
  let ancre: Point | null = null;
  for (const point of contour) {
    if (ancre === null || Math.hypot(point[0] - ancre[0], point[1] - ancre[1]) >= PAS_CONTOUR) {
      garde.push(point);
      ancre = point;
    }
  }
  // Une île plus petite que le pas ne survivrait pas au dégrossissage : elle garde son tracé.
  return garde.length >= 3 ? garde : contour;
}

/** +1 si l'anneau tourne dans le sens trigonométrique du plan (x, z), -1 sinon. */
function orientation(contour: ReadonlyArray<Point>): number {
  let aire = 0;
  for (let i = 0; i < contour.length; i++) {
    const [ax, az] = contour[i]!;
    const [bx, bz] = contour[(i + 1) % contour.length]!;
    aire += ax * bz - bx * az;
  }
  return aire >= 0 ? 1 : -1;
}

function normaleExterieure(a: Point, b: Point, sens: number): Point {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const longueur = Math.hypot(dx, dz);
  if (longueur < 1e-9) return [0, 0];
  return [(dz / longueur) * sens, (-dx / longueur) * sens];
}
