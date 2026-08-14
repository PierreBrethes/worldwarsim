import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MOUSE,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type LineBasicMaterial,
  type LineSegments,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { saisieEnCours } from '@/carte/saisie';
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

/** Ce que le picking rapporte d'un clic droit. `pays` est nul en pleine mer. */
export type ClicDroitCarte = { pays: string | null; clientX: number; clientY: number };

/**
 * Le temps qu'on laisse à l'orbite pour s'immobiliser avant de recalculer le dégradé des
 * étiquettes qui se recouvrent. Ce calcul mesure du DOM ; le faire pendant que la caméra
 * tourne coûterait une mise en page par image.
 */
const REPOS_CAMERA_MS = 180;

/**
 * Le voyage vers une entité désignée au bord de l'écran. Assez long pour qu'on suive le
 * déplacement des yeux — c'est ce qui apprend où l'entité se trouvait — assez court pour ne
 * pas attendre. Le zoom ne bouge pas : seul un agrégat qui déborde du champ élargit la vue.
 */
const DUREE_VOYAGE_MS = 500;

/**
 * En deçà de ce déplacement cumulé, le geste est un clic net et désigne l'entité visée ;
 * au-delà, c'était une orientation de caméra et rien ne se sélectionne. Sans ce départage,
 * tout demi-tour amorcé sur un pays finirait par le sélectionner au relâché.
 */
const SEUIL_CLIC_NET_PX = 6;

/**
 * Ce qu'on retient d'un appui jusqu'à son relâché. `deplacement` est figé à l'appui : le
 * mappage ne bascule jamais au milieu d'un glisser, sinon le geste change de nature sous les
 * doigts du joueur.
 */
type Geste = {
  readonly bouton: number;
  readonly deplacement: boolean;
  parcouruPx: number;
  x: number;
  y: number;
  depasseSeuil: boolean;
};

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
  private readonly viseur = new Vector2();
  private readonly pointeurEcran = { x: 0, y: 0 };
  private survole: MeshPays | null = null;
  private selection: string | null = null;
  private animation = 0;
  private geste: Geste | null = null;
  private espaceTenu = false;
  private largeurEcran = 1;
  private hauteurEcran = 1;
  private minuteurRepos: ReturnType<typeof setTimeout> | null = null;
  private voyage: Voyage | null = null;
  private readonly ecouteursRepos = new Set<() => void>();

  onSurvol: (survol: SurvolCarte) => void = () => { };
  onSurvolRegion: (nom: string | null) => void = () => { };
  onSurvolArc: (id: string | null) => void = () => { };
  onSelection: (nom: string | null) => void = () => { };
  onClicDroit: (clic: ClicDroitCarte) => void = () => { };
  /**
   * Le premier glisser d'orientation. C'est l'instant où le joueur découvre que tirer la
   * souris ne déplace pas la carte : c'est là, et pas ailleurs, qu'on peut le lui dire.
   */
  onOrientationAmorcee: () => void = () => { };
  /** Appelée à chaque image : l'interface y écrit des transformations, jamais un rendu React. */
  onEtiquettes: (projections: ReadonlyArray<ProjectionEtiquette>) => void = () => { };
  /**
   * Les mêmes projections, pour la couche des indicateurs de bord. Deux appels plutôt qu'un
   * abonnement : ce sont deux couches distinctes du DOM, chacune ne lit que ses champs.
   */
  onBords: (projections: ReadonlyArray<ProjectionEtiquette>) => void = () => { };
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
    this.controles.minDistance = 4;
    this.controles.maxDistance = 300;
    this.controles.screenSpacePanning = false;
    // Le bouton droit appartient à la rose des vents, il ne pilote plus rien ici. Le
    // déplacement de carte passe par la molette enfoncée, doublé par l'alias espace : beaucoup
    // de pavés tactiles n'ont pas de troisième bouton, et ce chemin-là doit rester ouvert.
    this.controles.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: null };

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

  /** Le repos de caméra a deux auditoires — les étiquettes et le bord — d'où l'abonnement. */
  abonnerRepos(ecouteur: () => void): () => void {
    this.ecouteursRepos.add(ecouteur);
    return () => {
      this.ecouteursRepos.delete(ecouteur);
    };
  }

  /**
   * Amener la cible d'orbite sur une ou plusieurs ancres. Un indicateur agrégé cadre son
   * groupe : la vue s'élargit juste assez pour le contenir, et ne se resserre jamais — un clic
   * qui rapprocherait la caméra sans qu'on l'ait demandé ferait perdre le fil de la carte.
   */
  voyagerVers(ids: ReadonlyArray<string>): void {
    const points = ids
      .map((id) => this.etiquettes.position(id, this.arcs.positionsTetes))
      .filter((point): point is Vector3 => point !== undefined);
    if (points.length === 0) return;

    const arrivee = points
      .reduce((somme, point) => somme.add(point), new Vector3())
      .divideScalar(points.length);
    const rayon = Math.max(...points.map((point) => point.distanceTo(arrivee)));
    const distanceActuelle = this.camera.position.distanceTo(this.controles.target);
    const cadrage = rayon / Math.tan((this.camera.fov * Math.PI) / 360);

    this.voyage = {
      depart: this.controles.target.clone(),
      arrivee,
      orientation: this.camera.position.clone().sub(this.controles.target).normalize(),
      distanceDepart: distanceActuelle,
      distanceArrivee: Math.min(
        this.controles.maxDistance,
        Math.max(distanceActuelle, cadrage, this.controles.minDistance),
      ),
      debutMs: performance.now(),
    };
  }

  selectionner(nom: string | null): void {
    this.selection = nom;
  }

  /**
   * Le pays sous un point d'écran, visé à la demande. La rose s'ouvre aussi depuis une
   * étiquette HTML, qui a mangé le `pointermove` du canevas : lire le survol de la dernière
   * image donnerait la terre d'avant l'entrée dans l'étiquette, pas celle qu'elle désigne.
   */
  paysAuPoint(clientX: number, clientY: number): string | null {
    const cadre = this.rendu.domElement.getBoundingClientRect();
    if (!cadre.width || !cadre.height) return null;
    this.viseur.set(
      ((clientX - cadre.left) / cadre.width) * 2 - 1,
      -((clientY - cadre.top) / cadre.height) * 2 + 1,
    );
    this.rayon.setFromCamera(this.viseur, this.camera);
    const impact = this.rayon.intersectObjects(this.pays, false)[0];
    return (impact?.object as MeshPays | undefined)?.userData.nom ?? null;
  }

  /** La caméra ne bouge pas tant qu'une rose est ouverte : on ne vise pas une cible mouvante. */
  figerOrbite(fige: boolean): void {
    this.controles.enabled = !fige;
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
    removeEventListener('pointermove', this.suivreGeste);
    removeEventListener('pointerup', this.acheverGeste);
    removeEventListener('pointercancel', this.acheverGeste);
    removeEventListener('keydown', this.surToucheEnfoncee);
    removeEventListener('keyup', this.surToucheRelachee);
    removeEventListener('blur', this.surPerteDeFocus);
    this.regions.detruire();
    this.controles.dispose();
    this.rendu.dispose();
    this.rendu.domElement.remove();
  }

  private brancherEntrees(): void {
    const toile = this.rendu.domElement;
    this.controles.addEventListener('change', () => this.repousserRepos());
    toile.addEventListener('pointermove', (evenement) => {
      const cadre = toile.getBoundingClientRect();
      this.pointeurEcran.x = evenement.clientX - cadre.left;
      this.pointeurEcran.y = evenement.clientY - cadre.top;
      this.pointeur.x = (this.pointeurEcran.x / cadre.width) * 2 - 1;
      this.pointeur.y = -(this.pointeurEcran.y / cadre.height) * 2 + 1;
    });
    toile.addEventListener('pointerleave', () => {
      this.pointeur.set(-2, -2);
    });
    toile.addEventListener('pointerdown', (evenement) => {
      this.voyage = null;
      this.geste = {
        bouton: evenement.button,
        deplacement: evenement.button === 1 || this.espaceTenu,
        parcouruPx: 0,
        x: evenement.clientX,
        y: evenement.clientY,
        depasseSeuil: false,
      };
      this.rafraichirCurseur();
    });
    toile.addEventListener('wheel', () => {
      this.voyage = null;
    });
    // Le défilement automatique du navigateur s'arme au bouton du milieu et se pose en plein
    // écran sur la carte. Il ne se coupe qu'ici : les événements de pointeur n'y donnent pas
    // prise.
    toile.addEventListener('mousedown', (evenement) => {
      if (evenement.button === 1) evenement.preventDefault();
    });

    toile.addEventListener('contextmenu', (evenement) => {
      evenement.preventDefault();
      this.onClicDroit({
        pays: this.paysAuPoint(evenement.clientX, evenement.clientY),
        clientX: evenement.clientX,
        clientY: evenement.clientY,
      });
    });

    // Le geste se suit sur la fenêtre, pas sur le canevas : un glisser relâché au-dessus d'une
    // fiche reste un glisser, et le laisser en cours figerait le curseur sur une main fermée.
    addEventListener('pointermove', this.suivreGeste);
    addEventListener('pointerup', this.acheverGeste);
    addEventListener('pointercancel', this.acheverGeste);
    addEventListener('keydown', this.surToucheEnfoncee);
    addEventListener('keyup', this.surToucheRelachee);
    // Un changement de fenêtre avale le relâché : sans ça l'espace resterait tenu au retour.
    addEventListener('blur', this.surPerteDeFocus);
  }

  private suivreGeste = (evenement: PointerEvent): void => {
    const geste = this.geste;
    if (geste === null) return;
    geste.parcouruPx += Math.hypot(evenement.clientX - geste.x, evenement.clientY - geste.y);
    geste.x = evenement.clientX;
    geste.y = evenement.clientY;
    if (geste.depasseSeuil || geste.parcouruPx < SEUIL_CLIC_NET_PX) return;
    geste.depasseSeuil = true;
    if (geste.bouton === 0 && !geste.deplacement) this.onOrientationAmorcee();
  };

  /**
   * Seul un clic net au bouton gauche sélectionne. Un glisser était une orientation, le bouton
   * droit appartient à la rose — sans ce garde, toute rose arriverait sur une sélection qu'on
   * n'a pas demandée — et l'espace tenu fait du gauche un déplacement, pas une désignation.
   */
  private acheverGeste = (evenement: PointerEvent): void => {
    const geste = this.geste;
    this.geste = null;
    this.appliquerMappage();
    this.rafraichirCurseur();
    if (geste === null || evenement.type !== 'pointerup') return;
    if (geste.bouton !== 0 || geste.deplacement || geste.depasseSeuil) return;
    this.onSelection(this.survole?.userData.nom ?? null);
  };

  private surToucheEnfoncee = (evenement: KeyboardEvent): void => {
    if (evenement.code !== 'Space' || saisieEnCours()) return;
    // Sans ça, la page défile sous la carte à chaque appui.
    evenement.preventDefault();
    if (this.espaceTenu) return;
    this.espaceTenu = true;
    this.appliquerMappage();
    this.rafraichirCurseur();
  };

  private surToucheRelachee = (evenement: KeyboardEvent): void => {
    if (evenement.code !== 'Space' || !this.espaceTenu) return;
    this.espaceTenu = false;
    this.appliquerMappage();
    this.rafraichirCurseur();
  };

  private surPerteDeFocus = (): void => {
    if (!this.espaceTenu) return;
    this.espaceTenu = false;
    this.appliquerMappage();
    this.rafraichirCurseur();
  };

  /** Un glisser en cours garde le mappage qu'il avait à l'appui ; il reprendra au relâché. */
  private appliquerMappage(): void {
    if (this.geste !== null) return;
    this.controles.mouseButtons.LEFT = this.espaceTenu ? MOUSE.PAN : MOUSE.ROTATE;
  }

  /**
   * Sans ce retour visuel, le mode de déplacement est invisible : main ouverte dès que l'espace
   * est tenu, main fermée pendant le glisser. Le reste du temps, le curseur du système reste
   * celui du système.
   */
  private rafraichirCurseur(): void {
    const { style } = this.rendu.domElement;
    if (this.geste?.deplacement === true) style.cursor = 'grabbing';
    else if (this.espaceTenu) style.cursor = 'grab';
    else style.cursor = '';
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
      for (const ecouteur of this.ecouteursRepos) ecouteur();
    }, REPOS_CAMERA_MS);
  }

  /** Le voyage cède à la première main sur la caméra : on ne se bat pas avec le joueur. */
  private animerVoyage(): void {
    if (this.voyage === null) return;
    const part = Math.min(1, (performance.now() - this.voyage.debutMs) / DUREE_VOYAGE_MS);
    const adouci = part * part * (3 - 2 * part);

    this.controles.target.copy(this.voyage.depart).lerp(this.voyage.arrivee, adouci);
    const distance =
      this.voyage.distanceDepart +
      (this.voyage.distanceArrivee - this.voyage.distanceDepart) * adouci;
    this.camera.position
      .copy(this.controles.target)
      .addScaledVector(this.voyage.orientation, distance);

    if (part === 1) {
      this.voyage = null;
      this.repousserRepos();
    }
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
    this.animerVoyage();
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
    const projections = this.etiquettes.projeter(
      this.camera,
      this.largeurEcran,
      this.hauteurEcran,
      this.arcs.positionsTetes,
    );
    this.onEtiquettes(projections);
    this.onBords(projections);
  };
}

type Voyage = {
  readonly depart: Vector3;
  readonly arrivee: Vector3;
  readonly orientation: Vector3;
  readonly distanceDepart: number;
  readonly distanceArrivee: number;
  readonly debutMs: number;
};
