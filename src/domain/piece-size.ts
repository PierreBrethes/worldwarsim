import type { BuildingKey, UnitRole } from './ids';
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

/** **Un modèle qui n'a pas la mesure de son rôle** : le premier char, un R35, fait 4 m. */
const TIER_METRES: Partial<Record<UnitRole, Partial<Record<UnitTier, number>>>> = {
  armor: { 1: 4 },
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
  airfield: 60,
  port: 210,
  listening: 30,
  researchCenter: 50,
  warehouse: 60,
  depot: 60,
  city: 50,
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
 *  l'envergure du reste (`TROOP_METRES`) ; d'un modèle quand son rang est dit (`TIER_METRES`). */
export const troopSpan = (role: UnitRole, tier?: UnitTier): number =>
  onBoard(
    (tier === undefined ? undefined : TIER_METRES[role]?.[tier]) ?? TROOP_METRES[role],
    (role === 'infantry' ? MAN_EXAGGERATION : 1) * (DOMAIN_BY_ROLE[role] === 'sea' ? SEA_SHARE : 1),
  );

/** **Le plus grand côté au sol d'un bâtiment sur le plateau**, en unités. */
export const buildingSpan = (key: BuildingKey): number =>
  onBoard(BUILDING_METRES[key], key === 'port' ? SEA_SHARE : 1);

/** Un archétype sans mesure prend celle d'un entrepôt. */
export const objectiveSpan = (key: string): number =>
  onBoard(OBJECTIVE_METRES[key] ?? BUILDING_METRES.warehouse);

/** **Les avions volent à trois envergures du sol** (§7), celles d'un chasseur : un fil ne dit pas
 *  ce qui vole, la même hauteur sert à tous. */
export const AIR_ALTITUDE = 3 * troopSpan('fighter');
