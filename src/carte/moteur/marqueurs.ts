import { Group, Vector3, type Camera, type Mesh, type Raycaster } from 'three';
import { enHeuresMinutes } from '@/domaine/duree';
import type { LonLat } from '@/domaine/geo';
import type { RoleUnite } from '@/domaine/vue-joueur';
import { urlSprite } from '@/emblemes/unites/manifeste';
import { EtiquetteTexte, PlaqueBillboard, textureDe, textureSymbole } from './billboard';
import { EPAISSEUR_PAYS, type RepereMonde } from './repere';

/**
 * Ce que la carte sait planter au sol. Une union discriminée plutôt qu'un marqueur à champs
 * optionnels : un avant-poste n'a pas d'effectif de pile, un chantier n'a pas de garnison, et
 * l'étiquette de survol ne peut donc pas afficher le champ d'un autre genre par distraction.
 */
export type MarqueurCarte =
  | {
      readonly genre: 'avantPoste';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly specialisation: 'extraction' | 'relais' | 'ecoute';
      readonly niveau: number;
      readonly garnison: number;
      readonly encre: string;
    }
  | {
      readonly genre: 'pile';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly nation: string;
      readonly role: RoleUnite;
      readonly effectif: number;
      readonly detail: string;
      readonly encre: string;
    }
  | {
      readonly genre: 'chantier';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly nom: string;
      readonly acheveA: number;
      readonly encre: string;
    };

export const LIBELLE_SPECIALISATION: Readonly<
  Record<Extract<MarqueurCarte, { genre: 'avantPoste' }>['specialisation'], string>
> = {
  extraction: 'Extraction',
  relais: 'Relais logistique',
  ecoute: 'Station d’écoute',
};

/**
 * Trois parts de la distance caméra, jamais des tailles fixes : le symbole, son étiquette et
 * la hauteur qui les sépare gardent alors la même cote à l'écran de l'orbite au rapproché.
 */
const PART_MARQUEUR = 0.028;
const PART_ETIQUETTE = 0.022;
const PART_ELEVATION = 0.036;
const COTE_SYMBOLE = 64;
const PAPIER = '#e4d8bd';
const ENCRE = '#2a2118';

type RenduMarqueur = {
  readonly marqueur: MarqueurCarte;
  readonly plaque: PlaqueBillboard;
  readonly etiquette: EtiquetteTexte;
  readonly position: Vector3;
};

/**
 * Les avant-postes, la pile à domicile et le chantier en cours, plantés sur le plateau. Tout
 * ce qui bouge — orientation billboard, compte à rebours du chantier, apparition du détail au
 * zoom — est recalculé dans la boucle du moteur : aucune de ces trois couches ne remonte à React.
 */
export class CoucheMarqueurs {
  readonly groupe = new Group();
  private readonly point = new Vector3();
  private rendus: RenduMarqueur[] = [];
  private cibles: Mesh[] = [];
  private detaille = false;

  constructor(private readonly repere: RepereMonde) {}

  afficher(marqueurs: ReadonlyArray<MarqueurCarte>): void {
    this.vider();
    for (const marqueur of marqueurs) {
      const position = this.repere.projeterLonLat(marqueur.lonLat, EPAISSEUR_PAYS + 0.2);
      const plaque = new PlaqueBillboard(textureDeMarqueur(marqueur), 1);
      plaque.placer(position);
      plaque.objet.userData.marqueur = marqueur.id;
      this.groupe.add(plaque.objet);

      const etiquette = new EtiquetteTexte(1);
      etiquette.placer(position);
      etiquette.visible = false;
      this.groupe.add(etiquette.objet);

      // Seul l'avant-poste répond au pointeur : la pile et le chantier disent déjà tout ce
      // qu'ils ont sur leur étiquette de plateau, un doublon HTML au survol ne dirait rien de plus.
      if (marqueur.genre === 'avantPoste') this.cibles.push(plaque.objet);
      this.rendus.push({ marqueur, plaque, etiquette, position });
    }
  }

  animer(camera: Camera, detaille: boolean): void {
    this.detaille = detaille;
    const maintenant = Date.now();
    for (const rendu of this.rendus) {
      const distance = rendu.position.distanceTo(camera.position);
      rendu.plaque.orienter(camera.position, distance * PART_MARQUEUR);
      rendu.etiquette.visible = detaille;
      if (!detaille) continue;
      rendu.etiquette.definirTexte(libelleDetail(rendu.marqueur, maintenant));
      this.point.copy(rendu.position).setY(rendu.position.y + distance * PART_ELEVATION);
      rendu.etiquette.placer(this.point);
      rendu.etiquette.orienter(camera.quaternion, distance * PART_ETIQUETTE);
    }
  }

  /** L'identifiant du marqueur sous le pointeur, pour que l'interface pose son étiquette HTML. */
  survoler(rayon: Raycaster): string | null {
    if (!this.detaille) return null;
    const impact = rayon.intersectObjects(this.cibles, false)[0];
    return (impact?.object.userData.marqueur as string | undefined) ?? null;
  }

  private vider(): void {
    for (const rendu of this.rendus) {
      rendu.plaque.detruire();
      rendu.etiquette.detruire();
    }
    this.rendus = [];
    this.cibles = [];
  }
}

function libelleDetail(marqueur: MarqueurCarte, maintenant: number): string {
  switch (marqueur.genre) {
    case 'avantPoste':
      return `${LIBELLE_SPECIALISATION[marqueur.specialisation]} · niv. ${marqueur.niveau} · garnison ${marqueur.garnison}`;
    case 'pile':
      return `${marqueur.effectif} · ${marqueur.detail}`;
    case 'chantier':
      return `${marqueur.nom} · ${enHeuresMinutes(Math.max(0, (marqueur.acheveA - maintenant) / 60_000))}`;
  }
}

function textureDeMarqueur(marqueur: MarqueurCarte) {
  if (marqueur.genre === 'pile') {
    const url = urlSprite(marqueur.nation, marqueur.role, 1);
    if (url !== null) return textureDe(url);
    return textureSymbole(`pile:${marqueur.role}:${marqueur.encre}`, COTE_SYMBOLE, (contexte, cote) =>
      dessinerPile(contexte, cote, marqueur.encre),
    );
  }
  if (marqueur.genre === 'chantier') {
    return textureSymbole(`chantier:${marqueur.encre}`, COTE_SYMBOLE, (contexte, cote) =>
      dessinerChantier(contexte, cote, marqueur.encre),
    );
  }
  return textureSymbole(
    `avantPoste:${marqueur.specialisation}:${marqueur.encre}`,
    COTE_SYMBOLE,
    (contexte, cote) => dessinerAvantPoste(contexte, cote, marqueur.specialisation, marqueur.encre),
  );
}

/**
 * Le fanion de papier commun aux trois symboles : c'est lui qui fait lire le marqueur comme
 * une vignette imprimée posée sur la carte, et non comme une icône d'écran.
 */
function dessinerFanion(contexte: CanvasRenderingContext2D, cote: number, encre: string): void {
  contexte.clearRect(0, 0, cote, cote);
  contexte.fillStyle = PAPIER;
  contexte.fillRect(6, 4, cote - 12, cote - 14);
  contexte.strokeStyle = ENCRE;
  contexte.lineWidth = 1.5;
  contexte.strokeRect(6.75, 4.75, cote - 13.5, cote - 15.5);
  contexte.strokeStyle = encre;
  contexte.lineWidth = 3;
  contexte.beginPath();
  contexte.moveTo(cote / 2, cote - 10);
  contexte.lineTo(cote / 2, cote - 1);
  contexte.stroke();
}

function dessinerAvantPoste(
  contexte: CanvasRenderingContext2D,
  cote: number,
  specialisation: Extract<MarqueurCarte, { genre: 'avantPoste' }>['specialisation'],
  encre: string,
): void {
  dessinerFanion(contexte, cote, encre);
  contexte.strokeStyle = encre;
  contexte.fillStyle = encre;
  contexte.lineWidth = 3;
  const centre = cote / 2;

  if (specialisation === 'extraction') {
    contexte.beginPath();
    contexte.moveTo(centre - 12, cote - 20);
    contexte.lineTo(centre, 14);
    contexte.lineTo(centre + 12, cote - 20);
    contexte.moveTo(centre - 7, cote - 30);
    contexte.lineTo(centre + 7, cote - 30);
    contexte.stroke();
    return;
  }
  if (specialisation === 'relais') {
    contexte.beginPath();
    contexte.moveTo(centre - 9, 14);
    contexte.lineTo(centre - 9, cote - 18);
    contexte.stroke();
    contexte.beginPath();
    contexte.moveTo(centre - 9, 14);
    contexte.lineTo(centre + 14, 22);
    contexte.lineTo(centre - 9, 30);
    contexte.closePath();
    contexte.fill();
    return;
  }
  contexte.beginPath();
  contexte.moveTo(centre, 18);
  contexte.lineTo(centre, cote - 18);
  contexte.stroke();
  for (const rayon of [8, 14, 20]) {
    contexte.beginPath();
    contexte.arc(centre, 18, rayon, Math.PI * 0.15, Math.PI * 0.85);
    contexte.stroke();
  }
}

/** Sept nations sur huit n'ont pas de planche dessinée : le cadre pointillé est leur visage. */
function dessinerPile(contexte: CanvasRenderingContext2D, cote: number, encre: string): void {
  dessinerFanion(contexte, cote, encre);
  contexte.strokeStyle = encre;
  contexte.lineWidth = 2;
  contexte.setLineDash([4, 3]);
  contexte.strokeRect(13, 12, cote - 26, cote - 32);
  contexte.setLineDash([]);
  contexte.fillStyle = encre;
  contexte.beginPath();
  contexte.arc(cote / 2, cote / 2 - 4, 5, 0, Math.PI * 2);
  contexte.fill();
}

function dessinerChantier(contexte: CanvasRenderingContext2D, cote: number, encre: string): void {
  dessinerFanion(contexte, cote, encre);
  contexte.strokeStyle = encre;
  contexte.lineWidth = 3;
  const centre = cote / 2;
  contexte.beginPath();
  contexte.moveTo(centre - 13, cote - 20);
  contexte.lineTo(centre - 13, 14);
  contexte.lineTo(centre + 14, 14);
  contexte.moveTo(centre - 13, 22);
  contexte.lineTo(centre + 4, cote - 20);
  contexte.moveTo(centre + 14, 14);
  contexte.lineTo(centre + 14, 26);
  contexte.stroke();
}
