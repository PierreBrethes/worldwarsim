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
  airfield: 50,
  port: 210,
  listening: 30,
  researchCenter: 50,
  warehouse: 60,
  depot: 60,
  city: 50,
};

/**
 * **Le plus grand côté au sol de l'emprise réelle de chaque bâtiment, en mètres**, hampe et
 * drapeau exclus : l'anneau espace les sites par elle, car la remise de la caserne la porte à
 * 65 m quand ses `murs` en font 50. `maquettes.test.ts` la mesure sur les GLB.
 */
export const BUILDING_FOOTPRINT_METRES: Readonly<Record<BuildingKey, number>> = {
  hq: 61,
  farm: 41,
  mine: 50,
  oilWell: 25,
  arsenal: 80,
  barracks: 65,
  airfield: 51,
  port: 222,
  listening: 31,
  researchCenter: 50,
  warehouse: 61,
  depot: 61,
  city: 51,
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

/** **Le plus grand côté au sol d'un bâtiment, en mètres** : ce que son modèle, dessiné en mètres, mesure. */
export const buildingMetres = (key: BuildingKey): number => BUILDING_METRES[key];

/** **Le plus grand côté au sol d'un bâtiment sur le plateau**, en unités. */
export const buildingSpan = (key: BuildingKey): number =>
  onBoard(BUILDING_METRES[key], key === 'port' ? SEA_SHARE : 1);

/** **L'emprise d'un bâtiment sur le plateau**, en unités : ce dont l'anneau le sépare de ses voisins. */
export const buildingFootprint = (key: BuildingKey): number =>
  onBoard(BUILDING_FOOTPRINT_METRES[key], key === 'port' ? SEA_SHARE : 1);

/** Un archétype sans mesure prend celle d'un entrepôt. */
export const objectiveSpan = (key: string): number =>
  onBoard(OBJECTIVE_METRES[key] ?? BUILDING_METRES.warehouse);

/** **Les avions volent à trois envergures du sol** (§7), celles d'un chasseur : un fil ne dit pas
 *  ce qui vole, la même hauteur sert à tous. */
export const AIR_ALTITUDE = 3 * troopSpan('fighter');
