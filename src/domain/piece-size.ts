import type { BuildingKey, Nation, UnitRole } from './ids';
import { DOMAIN_BY_ROLE, type UnitTier } from './troops';

/**
 * **Une échelle commune des pièces** (ADR 0035) : chaque troupe et chaque bâtiment à sa taille
 * réelle, multipliée par une seule exagération — ce qui sort d'un bâtiment garde sa taille en
 * sortant. Deux écarts déclarés : l'homme agrandi, la mer à demi-échelle.
 */
const EXAGGERATION = 1600;
/** L'homme ×1,5 (§2, 2,6 m) : à hauteur du char, et sous la porte de sa caserne (3,4 m). */
const MAN_EXAGGERATION = 1.5;
/** La mer à demi-échelle (§2) : ports et navires liés entre eux, sans couvrir la côte. */
const SEA_SHARE = 0.5;

/** **Une unité du plateau, en kilomètres, là où l'on joue** : 78 d'est en ouest et 88 du sud au
 *  nord à 45° de latitude (`nearestCoast`) ; `KM_PER_UNIT` lit l'équateur. */
export const BOARD_KM = 83;

/**
 * **La mesure réelle de chaque rôle, en mètres** : la taille d'un homme, l'envergure d'un avion,
 * la longueur de tout le reste — le plus grand côté au sol.
 */
const TROOP_METRES: Readonly<Record<UnitRole, number>> = {
  infantry: 1.75,
  armor: 6,
  landTransport: 6.5,
  artillery: 6,
  fighter: 11,
  bomber: 25,
  airTransport: 29,
  escort: 110,
  cargo: 130,
  carrier: 250,
};

/**
 * **La longueur de caisse réelle des chars de chaque nation**, rang 1 puis rang 2, lus sur les
 * modèles (`src/emblems/figurines/<nation>/armor-*.glb`) ; un char sans nation est mesuré à 6 m.
 * En Chine le Vickers 6-Ton dépasse le T-26 qui le suit : l'ordre de leurs rangs n'est pas celui
 * de leurs tailles.
 * @a-mesurer longueurs de caisse publiées (fiches Wikipédia des modèles), sans canon ni garde-boue
 */
const ARMOR_METRES: Readonly<Record<Nation, readonly [number, number]>> = {
  france: [4.02, 6.37], // Renault R35, Char B1 bis
  uk: [3.96, 5.61], // Vickers Light Tank Mk VI, Matilda II
  usa: [4.84, 5.84], // M5 Stuart, M4 Sherman
  ussr: [5.66, 6.68], // BT-7, T-34 (1941)
  germany: [4.81, 5.92], // Panzer II, Panzer IV
  japan: [4.38, 5.52], // Type 95 Ha-Go, Type 97 Chi-Ha
  italy: [3.17, 4.92], // L3/35, M13/40
  china: [4.88, 4.62], // Vickers 6-Ton, T-26
};

/**
 * **Le plus grand côté au sol de chaque bâtiment, en mètres.** Une ville réelle ferait des
 * milliers de kilomètres : elle est un symbole, comme la piste (§8), à la taille d'une caserne —
 * les villes d'une Blitz grandies du même ×1,37 que l'anneau.
 * @a-mesurer la ville seule, un symbole sans mesure réelle ; le reste suit l'ADR 0035
 */
const BUILDING_METRES: Readonly<Record<BuildingKey, number>> = {
  hq: 60,
  farm: 40,
  mine: 50,
  oilWell: 25,
  arsenal: 80,
  barracks: 50,
  airfield: 110,
  port: 210,
  listening: 30,
  researchCenter: 50,
  warehouse: 60,
  depot: 60,
  city: 50,
};

/**
 * **Le plus grand côté au sol de l'emprise de chaque site, en mètres** : la boîte de son
 * `socle` (ADR 0038 §6), car le socle déborde de 6 à 9 m du bâtiment, et de 20 à 25 m côté
 * façade. `maquettes.test.ts` la mesure sur les GLB.
 */
export const BUILDING_FOOTPRINT_METRES: Readonly<Record<BuildingKey, number>> = {
  hq: 90,
  farm: 66,
  mine: 75,
  oilWell: 49,
  arsenal: 98,
  barracks: 82,
  airfield: 128,
  port: 222,
  listening: 53,
  researchCenter: 68,
  warehouse: 78,
  depot: 78,
  city: 68,
};

/**
 * **La portée de chaque site depuis son point, en mètres** : la distance de l'origine au coin le
 * plus loin de la boîte de son `socle`, quel que soit son tour. Le socle n'est pas centré (la cour
 * déborde de 20 à 25 m côté façade) : c'est elle, et non la moitié du côté, qui espace deux sites
 * voisins.
 */
export const BUILDING_REACH_METRES: Readonly<Record<BuildingKey, number>> = {
  hq: 64,
  farm: 52,
  mine: 57,
  oilWell: 36,
  arsenal: 66,
  barracks: 57,
  airfield: 87,
  port: 146,
  listening: 42,
  researchCenter: 53,
  warehouse: 62,
  depot: 62,
  city: 50,
};

/**
 * **La portée d'un site avec le kit que le moteur pose à côté** (ADR 0038 §10, #269-#270) : le coin
 * lointain de la piste de l'aérodrome, la tête du môle du port. L'anneau réserve cette emprise en
 * plus du socle. `kits.test.ts` la mesure sur le plan des kits.
 */
export const KIT_REACH_METRES: Readonly<Partial<Record<BuildingKey, number>>> = {
  airfield: 169,
  port: 302,
};

/**
 * Les objectifs neutres, au plus grand côté de leur modèle.
 * @a-mesurer lus sur les modèles (un convoi de quelques camions, un dépôt), sans plan réel
 */
const OBJECTIVE_METRES: Readonly<Record<string, number>> = {
  abandonedStores: 40,
  stalledConvoy: 30,
  fuelDump: 40,
  irregularArsenal: 40,
};

const onBoard = (metres: number, share = 1): number =>
  (metres * EXAGGERATION * share) / 1000 / BOARD_KM;

/** **Une distance réelle sur le plateau**, en unités, à l'exagération commune. */
export const metresOnBoard = (metres: number): number => onBoard(metres);

/** **La mesure d'un rôle sur le plateau**, en unités : la taille de l'homme, la longueur ou
 *  l'envergure du reste (`TROOP_METRES`) ; d'un char, celle du modèle de sa nation et de son rang
 *  quand ils sont dits (`ARMOR_METRES`). */
export const troopSpan = (role: UnitRole, nation?: Nation, tier?: UnitTier): number =>
  onBoard(
    (role === 'armor' && nation !== undefined && tier !== undefined
      ? ARMOR_METRES[nation][tier - 1]
      : undefined) ?? TROOP_METRES[role],
    (role === 'infantry' ? MAN_EXAGGERATION : 1) * (DOMAIN_BY_ROLE[role] === 'sea' ? SEA_SHARE : 1),
  );

/** **La mesure réelle d'un rôle, en mètres** (`TROOP_METRES`) : ce sur quoi un repère posé à la
 *  boîte du modèle (les feux de position, #269) prend sa taille. */
export const troopMetres = (role: UnitRole): number => TROOP_METRES[role];

/** **La taille d'un homme debout, en mètres** : ce que mesure un fantassin dessiné en mètres, quelle que soit sa pose. */
export const MAN_METRES = TROOP_METRES.infantry;

/** **Le plus grand côté au sol d'un bâtiment, en mètres** : ce que son modèle, dessiné en mètres, mesure. */
export const buildingMetres = (key: BuildingKey): number => BUILDING_METRES[key];

/** **Le plus grand côté au sol d'un bâtiment sur le plateau**, en unités. */
export const buildingSpan = (key: BuildingKey): number =>
  onBoard(BUILDING_METRES[key], key === 'port' ? SEA_SHARE : 1);

/** **L'emprise d'un bâtiment sur le plateau**, en unités : ce dont l'anneau le sépare de ses voisins. */
export const buildingFootprint = (key: BuildingKey): number =>
  onBoard(BUILDING_FOOTPRINT_METRES[key], key === 'port' ? SEA_SHARE : 1);

/** **La portée d'un site depuis son point**, en unités : ce dont l'anneau l'espace d'un voisin. */
export const buildingReach = (key: BuildingKey): number =>
  onBoard(KIT_REACH_METRES[key] ?? BUILDING_REACH_METRES[key], key === 'port' ? SEA_SHARE : 1);

/**
 * **Toute pièce, troupe ou bâtiment, est dessinée à cette part de l'échelle commune** (Pierre,
 * 11/11/2026 : « une impression de grandeur », « que tout scale bien ensemble »). Le dessin seul :
 * les mesures de ce fichier, et les règles qui en sortent (la couronne de dissolution,
 * `movement-orders.ts`), restent à `EXAGGERATION`. Le curseur « Taille des pièces » s'applique
 * par-dessus, et le zoom le plus proche, le plancher et le seuil d'épingle la suivent
 * (`src/map/engine/figurines/figurine.ts`).
 * @a-mesurer 0,25, choix de Pierre du 11/11/2026 après captures à 0,5, 0,35 et 0,25 ; à revoir en partie
 */
export const DRAWN_SHARE = 0.25;

/** Un archétype sans mesure prend celle d'un entrepôt. */
export const objectiveSpan = (key: string): number =>
  onBoard(OBJECTIVE_METRES[key] ?? BUILDING_METRES.warehouse);

/** **Les avions volent à trois envergures du sol** (§7), celles d'un chasseur : un fil ne dit pas
 *  ce qui vole, la même hauteur sert à tous. */
export const AIR_ALTITUDE = 3 * troopSpan('fighter');
