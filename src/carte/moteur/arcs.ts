import { Group, Vector3, type Camera, type Raycaster } from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import {
  deroulerTrajet,
  positionTemporelle,
  viseeDuJalon,
  type TronconDeroule,
} from '@/domaine/deroule-trajet';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { spriteDeMouvement } from '@/emblemes/unites/manifeste';
import {
  construireFil,
  pointSurEtape,
  projeterAuSol,
  tendreAttache,
  type Fil,
} from './fil';
import { Jalon } from './jalon';
import { COULEURS_ARC } from './palette';
import type { RepereMonde } from './repere';

type RenduArc = {
  arc: ArcAffiche;
  fil: Fil;
  deroule: ReadonlyArray<TronconDeroule>;
  jalon: Jalon;
  /** Réécrite en place à chaque image : c'est l'ancre de l'étiquette de tête de mouvement. */
  positionTete: Vector3;
};

/**
 * L'épaisseur porte la hiérarchie entre mouvements, en pixels et non en unités de monde : ce
 * qui n'est pas à moi ne s'impose pas au premier plan. À l'intérieur d'un fil, elle ne dit
 * rien — parcouru et restant sont le même trait, et c'est le pointillé qui les sépare.
 */
const EPAISSEURS: Readonly<Record<ArcAffiche['etat'], number>> = {
  mien: 2.5,
  adverseDetecte: 2,
  dernierePositionConnue: 2,
  maitriseDesMers: 2,
};

const OPACITE_TRACE = 0.55;

/**
 * L'accent est une affaire d'intensité, jamais de couleur : la couleur d'un fil dit à qui il
 * appartient, la changer au survol dirait autre chose. Le fil désigné monte, les autres
 * s'effacent — c'est l'écart qui se lit, pas la valeur absolue.
 */
const ACCENT_DESIGNE = 1.6;
const ACCENT_AUTRES = 0.4;
/** Rayon de saisie d'un fil au pointeur, en pixels : une fat line se vise à l'écran. */
export const SEUIL_SURVOL_ARC = 6;

export class CoucheArcs {
  readonly groupe = new Group();
  /** Les positions d'écran des étiquettes de tête s'y lisent : elles bougent à chaque image. */
  readonly positionsTetes = new Map<string, Vector3>();
  private readonly pointJalon = new Vector3();
  private readonly pointDevant = new Vector3();
  private readonly pointSol = new Vector3();
  private readonly positionCamera = new Vector3();
  private nationJoueur: string | null = null;
  private rendus: RenduArc[] = [];
  private cibles: Line2[] = [];
  private accentue: string | null = null;
  private largeur = 1;
  private hauteur = 1;
  private uniteParPixel = 1;
  /** L'horloge de la dérive du pointillé : elle vit dans la boucle, jamais dans un état React. */
  private derniereImageMs = 0;

  constructor(private readonly repere: RepereMonde) {}

  definirNationJoueur(nation: string | null): void {
    if (nation === this.nationJoueur) return;
    this.nationJoueur = nation;
    this.reconstruire();
  }

  /**
   * Une fat line s'épaissit en pixels : elle a besoin de la taille du canevas pour convertir.
   * La retenir ici évite qu'un fil construit après un redimensionnement naisse à la mauvaise
   * échelle — c'est le genre de bug qui ne se voit qu'après avoir bougé la fenêtre.
   */
  redimensionner(largeur: number, hauteur: number): void {
    this.largeur = largeur;
    this.hauteur = hauteur;
    for (const rendu of this.rendus) rendu.fil.reglerResolution(largeur, hauteur);
  }

  afficher(arcs: ReadonlyArray<ArcAffiche>): void {
    this.vider();
    for (const arc of arcs) {
      const perime = arc.etat === 'dernierePositionConnue';
      const fil = construireFil(arc.trajet, this.repere, COULEURS_ARC[arc.etat], EPAISSEURS[arc.etat], {
        trace: OPACITE_TRACE,
        progression: perime ? 0.45 : 1,
      });
      fil.reglerResolution(this.largeur, this.hauteur);
      fil.reglerEchelle(this.uniteParPixel);
      this.groupe.add(fil.objet);
      for (const cible of fil.cibles) {
        cible.userData.arc = arc.id;
        this.cibles.push(cible);
      }

      const jalon = new Jalon(
        spriteDeMouvement(arc, this.nationJoueur),
        COULEURS_ARC[arc.etat].progression,
      );
      jalon.visible = !perime;
      this.groupe.add(jalon.objet);

      const positionTete = new Vector3();
      this.positionsTetes.set(arc.id, positionTete);

      this.rendus.push({ arc, fil, deroule: deroulerTrajet(arc.trajet), jalon, positionTete });
    }
    this.appliquerAccent();
    this.animer();
  }

  /**
   * Le survol vient de la frise ou du pointeur, mais l'accent ne remonte jamais à React :
   * un identifiant entre, des opacités changent, la boucle continue à soixante images.
   */
  accentuer(id: string | null): void {
    if (id === this.accentue) return;
    this.accentue = id;
    this.appliquerAccent();
  }

  /** L'identifiant du mouvement sous le pointeur, pour que la frise surligne sa fiche. */
  survoler(rayon: Raycaster): string | null {
    const impact = rayon.intersectObjects(this.cibles, false)[0];
    return (impact?.object.userData.arc as string | undefined) ?? null;
  }

  /**
   * Le fil est cuit une fois ; par image on n'avance qu'un `instanceCount` et un jalon. La
   * position vient du temps, pas de la distance : un mouvement à cheval sur trois milieux
   * ne parcourt pas la mer à la vitesse de la route, et il s'arrête au quai.
   */
  animer(camera?: Camera, uniteParPixel?: number): void {
    if (camera) this.positionCamera.copy(camera.position);
    if (uniteParPixel !== undefined) this.uniteParPixel = uniteParPixel;

    const maintenant = performance.now();
    const ecoule = this.derniereImageMs === 0 ? 0 : (maintenant - this.derniereImageMs) / 1000;
    this.derniereImageMs = maintenant;

    for (const rendu of this.rendus) {
      if (uniteParPixel !== undefined) rendu.fil.reglerEchelle(uniteParPixel);
      rendu.fil.deriver(ecoule);

      const position = positionTemporelle(rendu.deroule, rendu.arc.avancement);
      const { indexEtape, local } = viseeDuJalon(position);

      rendu.fil.couper(indexEtape, local);

      const etape = rendu.fil.etapes[indexEtape];
      if (etape === undefined) continue;
      pointSurEtape(etape, local, this.pointJalon);
      pointSurEtape(etape, Math.min(1, local + 0.01), this.pointDevant);

      // Au quai, le jalon a déjà pris la silhouette de ce qu'il va devenir : c'est
      // l'embarquement lui-même qui s'affiche, et l'arrêt qui se voit.
      rendu.jalon.adopter(
        position.genre === 'quai'
          ? rendu.fil.etapes[position.indexEtape]?.milieu ?? etape.milieu
          : etape.milieu,
      );
      rendu.jalon.placer(this.pointJalon, this.pointDevant);
      rendu.jalon.orienter(this.positionCamera);
      rendu.positionTete.copy(this.pointJalon);

      if (rendu.fil.attache !== null) {
        projeterAuSol(this.pointJalon, this.repere, this.pointSol);
        tendreAttache(rendu.fil.attache, this.pointJalon, this.pointSol);
      }
    }
  }

  reconstruire(): void {
    this.afficher(this.rendus.map((rendu) => rendu.arc));
  }

  private appliquerAccent(): void {
    for (const rendu of this.rendus) {
      rendu.fil.regler(
        this.accentue === null ? 1 : rendu.arc.id === this.accentue ? ACCENT_DESIGNE : ACCENT_AUTRES,
      );
    }
  }

  private vider(): void {
    for (const rendu of this.rendus) {
      rendu.fil.detruire();
      rendu.jalon.detruire();
    }
    this.rendus = [];
    this.cibles = [];
    this.positionsTetes.clear();
  }
}
