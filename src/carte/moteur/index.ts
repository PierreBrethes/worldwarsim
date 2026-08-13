import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type LineBasicMaterial,
  type LineSegments,
  type Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DonneesRegions, Monde } from '@/domaine/monde';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { CoucheArcs, SEUIL_SURVOL_ARC } from './arcs';
import { Courbure } from './courbure';
import { CoucheEtiquettes, type AncreNommee, type ProjectionEtiquette } from './etiquettes';
import { construireLavisCotier } from './lavis';
import { PALETTE } from './palette';
import { construirePays, type MeshPays } from './pays';
import { construirePlateau } from './plateau';
import { CoucheRegions, DISTANCE_REGIONS_ABSENTES } from './regions';
import { RepereMonde } from './repere';

export type SurvolCarte = { nom: string; ecranX: number; ecranY: number } | null;

/**
 * Le temps qu'on laisse à l'orbite pour s'immobiliser avant de recalculer le dégradé des
 * étiquettes qui se recouvrent. Ce calcul mesure du DOM ; le faire pendant que la caméra
 * tourne coûterait une mise en page par image.
 */
const REPOS_CAMERA_MS = 180;

/**
 * Moteur impératif : la scène est construite une fois puis pilotée par des appels.
 * Aucune dépendance React — c'est ce qui permet de garder trois.js d'un côté et
 * l'interface de l'autre, avec une seule frontière.
 */
export class MoteurCarte {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly rendu: WebGLRenderer;
  private readonly controles: OrbitControls;
  private readonly repere: RepereMonde;
  private readonly courbure: Courbure;
  private readonly arcs: CoucheArcs;
  private readonly etiquettes: CoucheEtiquettes;
  private readonly regions: CoucheRegions;
  private readonly pays: MeshPays[];
  private readonly frontieres: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly rayon = new Raycaster();
  private readonly pointeur = new Vector2(-2, -2);
  private readonly pointeurEcran = { x: 0, y: 0 };
  private survole: MeshPays | null = null;
  private selection: string | null = null;
  private animation = 0;
  private aOrbite = false;
  private largeurEcran = 1;
  private hauteurEcran = 1;
  private minuteurRepos: ReturnType<typeof setTimeout> | null = null;

  onSurvol: (survol: SurvolCarte) => void = () => {};
  onSurvolRegion: (nom: string | null) => void = () => {};
  onSurvolArc: (id: string | null) => void = () => {};
  onSelection: (nom: string | null) => void = () => {};
  /** Appelée à chaque image : l'interface y écrit des transformations, jamais un rendu React. */
  onEtiquettes: (projections: ReadonlyArray<ProjectionEtiquette>) => void = () => {};
  onReposCamera: () => void = () => {};
  private regionSurvolee: string | null = null;
  private arcSurvole: string | null = null;
  private etiquettePays: string | null = null;

  constructor(
    private readonly conteneur: HTMLElement,
    monde: Monde,
  ) {
    this.repere = new RepereMonde(monde);
    this.courbure = new Courbure(this.repere);

    this.scene.background = new Color(PALETTE.bureau);
    this.scene.fog = new Fog(PALETTE.bureau, 460, 950);

    this.camera = new PerspectiveCamera(42, 1, 0.5, 3000);
    this.camera.position.set(30, 250, 300);

    // Le pochoir sert au lavis côtier, dont les rubans se recouvrent : sans lui, three ouvre
    // le contexte sans tampon de stencil depuis r163 et le matériau réclamerait dans le vide.
    this.rendu = new WebGLRenderer({ antialias: true, stencil: true });
    this.rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
    conteneur.appendChild(this.rendu.domElement);

    this.controles = new OrbitControls(this.camera, this.rendu.domElement);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.minPolarAngle = 0.3;
    this.controles.maxPolarAngle = 1.15;
    this.controles.minDistance = 8;
    this.controles.maxDistance = 640;
    this.controles.screenSpacePanning = false;

    this.scene.add(new HemisphereLight('#fff3dc', '#5a4e3a', 1.35));
    const soleil = new DirectionalLight('#fffaf0', 0.5);
    soleil.position.set(-180, 320, 160);
    this.scene.add(soleil);

    for (const objet of construirePlateau(
      monde,
      this.repere,
      this.courbure,
      this.rendu.capabilities.getMaxAnisotropy(),
    )) {
      this.scene.add(objet);
    }

    this.scene.add(construireLavisCotier(monde, this.repere, this.courbure));

    const { meshes, frontieres } = construirePays(monde, this.repere, this.courbure);
    this.pays = meshes;
    this.frontieres = frontieres;
    for (const mesh of meshes) this.scene.add(mesh);
    this.scene.add(frontieres);

    this.arcs = new CoucheArcs(this.repere);
    this.scene.add(this.arcs.groupe);

    this.etiquettes = new CoucheEtiquettes(this.repere);

    this.regions = new CoucheRegions(this.repere, this.courbure);
    this.scene.add(this.regions.lignes);
    this.scene.add(this.regions.surbrillance);
    this.scene.add(this.regions.accessoires);

    // Le fil se vise à l'écran comme il s'y dessine : le seuil s'ajoute à l'épaisseur en
    // pixels du matériau. Sans lui, un trait de 1,5 px ne serait survolable qu'au pixel près.
    this.rayon.params.Line2 = { threshold: SEUIL_SURVOL_ARC };

    this.brancherEntrees();
    this.redimensionner();
    this.boucle();
  }

  afficherArcs(arcs: ReadonlyArray<ArcAffiche>): void {
    this.arcs.afficher(arcs);
  }

  definirAncresEtiquettes(ancres: ReadonlyArray<AncreNommee>): void {
    this.etiquettes.definirAncres(ancres);
    // Le jeu d'étiquettes a changé : le dégradé au chevauchement est à refaire, mais pas avant
    // que la boucle ait posé les nouvelles positions — le repos de caméra sert aussi à ça.
    this.repousserRepos();
  }

  afficherRegions(donnees: DonneesRegions): void {
    this.regions.afficher(donnees);
  }

  definirNationJoueur(nation: string | null): void {
    this.arcs.definirNationJoueur(nation);
  }

  accentuerArc(id: string | null): void {
    this.arcs.accentuer(id);
  }

  selectionner(nom: string | null): void {
    this.selection = nom;
  }

  /**
   * Un pays porte l'encre d'une nation parce qu'un joueur l'a réservée, jamais parce qu'il
   * s'appelle comme elle : la carte reçoit la table des preneurs, elle ne la déduit pas.
   * Tout ce qui n'y figure pas revient en terre neutre — reposer la table suffit à défaire.
   */
  colorerNations(encreParPays: ReadonlyMap<string, string>): void {
    for (const mesh of this.pays) {
      mesh.material.color.set(encreParPays.get(mesh.userData.nom) ?? PALETTE.terreNeutre);
    }
  }

  reglerCourbure(intensite: number): void {
    this.repere.courbure = intensite;
    this.courbure.appliquerToutes();
    this.arcs.reconstruire();
    this.etiquettes.reconstruire();
  }

  redimensionner(): void {
    const { clientWidth, clientHeight } = this.conteneur;
    if (!clientWidth || !clientHeight) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.rendu.setSize(clientWidth, clientHeight);
    this.largeurEcran = clientWidth;
    this.hauteurEcran = clientHeight;
    this.arcs.redimensionner(clientWidth, clientHeight);
  }

  detruire(): void {
    cancelAnimationFrame(this.animation);
    if (this.minuteurRepos !== null) clearTimeout(this.minuteurRepos);
    this.regions.detruire();
    this.controles.dispose();
    this.rendu.dispose();
    this.rendu.domElement.remove();
  }

  private brancherEntrees(): void {
    const toile = this.rendu.domElement;
    this.controles.addEventListener('change', () => this.repousserRepos());
    toile.addEventListener('pointermove', (evenement) => {
      if (evenement.buttons) this.aOrbite = true;
      const cadre = toile.getBoundingClientRect();
      this.pointeurEcran.x = evenement.clientX - cadre.left;
      this.pointeurEcran.y = evenement.clientY - cadre.top;
      this.pointeur.x = (this.pointeurEcran.x / cadre.width) * 2 - 1;
      this.pointeur.y = -(this.pointeurEcran.y / cadre.height) * 2 + 1;
    });
    toile.addEventListener('pointerleave', () => {
      this.pointeur.set(-2, -2);
    });
    toile.addEventListener('pointerdown', () => {
      this.aOrbite = false;
    });
    toile.addEventListener('pointerup', () => {
      if (this.aOrbite) return;
      this.onSelection(this.survole?.userData.nom ?? null);
    });
  }

  /**
   * Combien d'unités de plateau tient un pixel à cette distance. Marques, pointillés et
   * jalons s'en servent pour garder leur cote à l'écran : c'est la seule mesure qui relie
   * une taille dessinée à une taille perçue, et elle vaut mieux qu'un facteur ajusté à l'œil.
   */
  private uniteParPixel(distance: number): number {
    return (2 * Math.tan((this.camera.fov * Math.PI) / 360) * distance) / this.hauteurEcran;
  }

  private repousserRepos(): void {
    if (this.minuteurRepos !== null) clearTimeout(this.minuteurRepos);
    this.minuteurRepos = setTimeout(() => {
      this.minuteurRepos = null;
      this.onReposCamera();
    }, REPOS_CAMERA_MS);
  }

  private mettreAJourSurvol(): void {
    this.rayon.setFromCamera(this.pointeur, this.camera);
    const impact = this.rayon.intersectObjects(this.pays, false)[0];
    const touche = impact?.object as MeshPays | undefined;

    this.mettreAJourSurvolRegion(impact?.point ?? null);

    const arc = this.arcs.survoler(this.rayon);
    if (arc !== this.arcSurvole) {
      this.arcSurvole = arc;
      this.onSurvolArc(arc);
    }

    this.survole = touche ?? null;

    const etiquette = this.survole?.userData.nom ?? null;
    if (etiquette === this.etiquettePays) return;
    this.etiquettePays = etiquette;
    this.onSurvol(
      etiquette ? { nom: etiquette, ecranX: this.pointeurEcran.x, ecranY: this.pointeurEcran.y } : null,
    );
  }

  /** Le survol de région n'existe qu'une fois la couche fondue à l'écran, jamais au large. */
  private mettreAJourSurvolRegion(point: Vector3 | null): void {
    let nom: string | null = null;
    if (point !== null && this.regions.estActive) {
      nom = this.regions.survoler(point.x + this.repere.centreX, point.z + this.repere.centreY);
    } else {
      this.regions.effacerSurvol();
    }
    if (nom !== this.regionSurvolee) {
      this.regionSurvolee = nom;
      this.onSurvolRegion(nom);
    }
  }

  private eclairerPays(): void {
    for (const mesh of this.pays) {
      const estSurvole = mesh === this.survole;
      const estSelectionne = mesh.userData.nom === this.selection;
      const intensite = estSelectionne ? 0.26 : estSurvole ? 0.12 : 0;
      mesh.material.emissive.setRGB(intensite, intensite * 0.85, intensite * 0.55);
    }
  }

  private boucle = (): void => {
    this.animation = requestAnimationFrame(this.boucle);
    this.controles.update();
    this.mettreAJourSurvol();
    this.eclairerPays();

    // Au zoom, la hiérarchie des traits s'inverse d'encre : les frontières de pays foncent
    // pendant que les régions apparaissent en dessous — WebGL ne connaît qu'un pixel de large.
    const distance = this.camera.position.distanceTo(this.controles.target);
    this.arcs.animer(this.camera, this.uniteParPixel(distance));
    this.regions.animer(distance);
    this.frontieres.material.opacity =
      distance < DISTANCE_REGIONS_ABSENTES
        ? Math.min(0.95, 0.62 + (DISTANCE_REGIONS_ABSENTES - distance) * 0.007)
        : 0.62;

    this.rendu.render(this.scene, this.camera);
    this.onEtiquettes(
      this.etiquettes.projeter(
        this.camera,
        this.largeurEcran,
        this.hauteurEcran,
        this.arcs.positionsTetes,
      ),
    );
  };
}
