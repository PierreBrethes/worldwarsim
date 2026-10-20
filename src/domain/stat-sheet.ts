import {
  BLITZ,
  CAPTURE_MINUTES,
  CARRY_CAPACITY_BY_ROLE,
  contactKm,
  detectionRangeOf,
  EXTRACTION_PER_HOUR,
  GARRISON_DAMAGE_TAKEN,
  LISTENING_COAL_PER_HOUR,
  LISTENING_STATION_RADIUS_KM,
  LOAD_CAPACITY_BY_ROLE,
  MAX_HQ_LEVEL,
  nominalStrength,
  recruitmentCost,
  RELOAD_SECONDS_BY_ROLE,
  STORAGE_CAP_PER_LEVEL,
  SUPPLY_BY_ROLE,
} from '../../convex/constants';
import { bombardsWith, fireReachOf, firesIndirect } from './indirect-fire';
import { levelGain, speedsUp } from './level-speed';
import { carryCapacityOf } from './loot';
import { loadTotal } from './logistics';
import { minutesPer1000KmOf } from './pace';
import type { BuildingKey, UnitRole, UnitTier } from './ids';
import type { Building, Cost, TroopView } from './player-view';
import type { SeasonMode } from './season-mode';
import type { Theatre } from './theatres';
import {
  garrisons,
  LIFT_COST,
  projectionKeyOf,
  ROLE_ORDER,
  seatsOf,
  seatsLeft,
  TIERS_BY_ROLE,
} from './troops';
import { cumulative } from './upkeep';
import { BUILDINGS } from './ids';

/**
 * **Toutes les statistiques d'une pièce, lues là où le serveur les lit** (#191). Ce module ne
 * recopie aucun chiffre : il appelle les constantes et les fonctions pures du jeu, et y ajoute
 * ce que le joueur ne devine pas, **l'échelle** — le plus petit et le plus grand de chaque
 * statistique parmi toutes les pièces, pour qu'un « 60 km » se lise en « peu » ou « beaucoup ».
 *
 * Une valeur sans échelle ne se gradue pas : « au contact », « marche », « ne tire pas » sont des
 * mots (`word`), jamais une réglette posée sur un zéro.
 */
export type TroopStatKey =
  | 'strength'
  | 'pace'
  | 'fuel'
  | 'detection'
  | 'rounds'
  | 'reach'
  | 'reload'
  | 'seats'
  | 'boarding'
  | 'load'
  | 'loot'
  | 'cost'
  | 'training';

export type PileStatKey =
  Exclude<TroopStatKey, 'strength' | 'reload' | 'boarding' | 'cost' | 'training'> | 'upkeep';

export type BuildingStatKey =
  | 'levelGain'
  | 'production'
  | 'storage'
  | 'listening'
  | 'consumption'
  | 'protection'
  | 'capture'
  | 'garrison'
  | 'forms'
  | 'raise';

export type StatKey = TroopStatKey | PileStatKey | BuildingStatKey;

/** Ce qui se dit en toutes lettres, faute d'échelle. */
export type StatWord = 'contact' | 'walks' | 'noFire' | 'cappedByHq';

export type StatReading =
  /** `share` : 0 au pire du jeu, 1 au meilleur (le plus rapide, le plus fort, le moins cher).
   *  `of` : le plafond d'une réserve (« 3 / 4 crans »), la réglette se place sur lui ; `floor` :
   *  la zone morte sous une portée de tir. */
  | {
      readonly kind: 'scaled';
      readonly value: number;
      readonly share: number;
      readonly of?: number;
      readonly floor?: number;
    }
  | { readonly kind: 'figure'; readonly value: number }
  | { readonly kind: 'word'; readonly word: StatWord; readonly km?: number }
  | { readonly kind: 'roles'; readonly roles: ReadonlyArray<UnitRole> }
  | { readonly kind: 'price'; readonly costs: Cost; readonly share: number }
  | { readonly kind: 'funds'; readonly amount: number; readonly share: number }
  | { readonly kind: 'raise'; readonly costs: Cost; readonly minutes: number };

export type StatRow<Key extends StatKey = StatKey> = {
  readonly key: Key;
  readonly reading: StatReading;
};

/** Ce qui descend : plus petit vaut mieux. */
const LOWER_IS_BETTER: ReadonlySet<StatKey> = new Set(['pace', 'reload', 'cost', 'training']);

type Piece = { readonly role: UnitRole; readonly tier: UnitTier };

/** Toutes les pièces du jeu : un rôle, et sa marque quand il en a deux. */
export const PIECES: ReadonlyArray<Piece> = ROLE_ORDER.flatMap((role) =>
  (TIERS_BY_ROLE[role] === 2 ? ([1, 2] as const) : ([1] as const)).map((tier) => ({ role, tier })),
);

const isBlitz = (theatre: Theatre | null): boolean => theatre !== null;

const costTotal = (costs: Cost): number => Object.values(costs).reduce((sum, n) => sum + n, 0);

/** Le nombre sur lequel une statistique se classe, `null` quand la pièce n'en a pas. */
function valueOf(key: TroopStatKey, { role, tier }: Piece, theatre: Theatre | null): number | null {
  const blitz = isBlitz(theatre);
  const positive = (n: number): number | null => (n > 0 ? n : null);
  switch (key) {
    case 'strength':
      return nominalStrength(role, tier);
    case 'pace':
      return minutesPer1000KmOf([role], theatre);
    case 'fuel':
      return blitz ? null : positive(SUPPLY_BY_ROLE[role].fuel);
    case 'detection':
      return detectionRangeOf([role], theatre);
    case 'rounds':
      return blitz ? null : positive(SUPPLY_BY_ROLE[role].rounds);
    case 'reach':
      return firesIndirect(role) ? fireReachOf(theatre).rangeKm : null;
    case 'reload':
      return RELOAD_SECONDS_BY_ROLE[role];
    case 'seats':
      return positive(seatsOf(role));
    case 'boarding':
      return LIFT_COST[role] ?? null;
    case 'load':
      return blitz ? null : positive(LOAD_CAPACITY_BY_ROLE[role]);
    case 'loot':
      return blitz ? null : positive(CARRY_CAPACITY_BY_ROLE[role]);
    case 'cost':
      return blitz ? BLITZ.rolePrice[role] : costTotal(recruitmentCost(role, tier).costs);
    case 'training':
      return blitz ? BLITZ.recruitMinutes : recruitmentCost(role, tier).minutes;
  }
}

export type Scale = { readonly min: number; readonly max: number };

/** **L'échelle d'une statistique : le plus petit et le plus grand du jeu**, lus sur toutes les
 *  pièces par les mêmes fonctions que le serveur. */
export function scaleOf(key: TroopStatKey, theatre: Theatre | null): Scale {
  const values = PIECES.map((piece) => valueOf(key, piece, theatre)).filter(
    (value): value is number => value !== null,
  );
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Où tombe `value` sur l'échelle : 0 au pire, 1 au meilleur, bornée. */
export function shareOn(key: StatKey, value: number, { min, max }: Scale): number {
  if (max === min) return 1;
  const share = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return LOWER_IS_BETTER.has(key) ? 1 - share : share;
}

const scaled = (
  key: TroopStatKey,
  value: number,
  theatre: Theatre | null,
  extra: { of?: number; floor?: number } = {},
): StatReading => ({
  kind: 'scaled',
  value,
  share: shareOn(key, extra.of ?? value, scaleOf(key, theatre)),
  ...extra,
});

/** Ce que le type dit de lui, dans l'ordre où la fiche et l'abaque le lisent. Une statistique
 *  que la pièce n'a pas (un fantassin n'assoit personne) n'a pas de ligne. */
export function troopStats(
  role: UnitRole,
  tier: UnitTier,
  theatre: Theatre | null,
): ReadonlyArray<StatRow<TroopStatKey>> {
  const piece = { role, tier };
  const blitz = isBlitz(theatre);
  const rows: StatRow<TroopStatKey>[] = [];
  const add = (key: TroopStatKey, reading: StatReading) => rows.push({ key, reading });
  const read = (key: TroopStatKey, extra?: { of?: number; floor?: number }) => {
    const value = valueOf(key, piece, theatre);
    if (value !== null) add(key, scaled(key, value, theatre, extra));
  };

  read('strength');
  read('pace');
  if (!blitz) {
    if (SUPPLY_BY_ROLE[role].fuel > 0) read('fuel');
    else add('fuel', { kind: 'word', word: 'walks' });
  }
  read('detection');
  if (!blitz) {
    if (SUPPLY_BY_ROLE[role].rounds > 0) read('rounds');
    else add('rounds', { kind: 'word', word: 'noFire' });
  }
  if (firesIndirect(role)) read('reach', { floor: fireReachOf(theatre).deadZoneKm });
  else add('reach', { kind: 'word', word: 'contact', km: contactKm(theatre) });
  if (blitz || firesIndirect(role)) read('reload');
  read('seats');
  read('boarding');
  read('load');
  read('loot');
  if (blitz)
    add('cost', {
      kind: 'funds',
      amount: BLITZ.rolePrice[role],
      share: shareOn('cost', BLITZ.rolePrice[role], scaleOf('cost', theatre)),
    });
  else {
    const { costs } = recruitmentCost(role, tier);
    add('cost', {
      kind: 'price',
      costs,
      share: shareOn('cost', costTotal(costs), scaleOf('cost', theatre)),
    });
  }
  read('training');
  return rows;
}

/** Une pile se lit sur les échelles des pièces : sa vitesse est celle de son élément le plus
 *  lent, sa vue celle de son meilleur guetteur, son plein le plus petit (`pileSupplies`). */
export function pileStats(
  troops: ReadonlyArray<TroopView>,
  context: {
    readonly mode: SeasonMode;
    readonly theatre: Theatre | null;
    /** Toutes les troupes de l'armée : le rang de l'entretien. */
    readonly armyTroops: number;
    /** Le butin que la pile porte, en unités. */
    readonly lootCarried: number;
  },
): ReadonlyArray<StatRow<PileStatKey>> {
  const { theatre } = context;
  const roles = troops.map((troop) => troop.role);
  const blitz = context.mode === 'blitz';
  const rows: StatRow<PileStatKey>[] = [];
  const add = (key: PileStatKey, reading: StatReading) => rows.push({ key, reading });

  add('pace', scaled('pace', minutesPer1000KmOf(roles, theatre), theatre));
  if (!blitz) {
    const engines = troops.filter((troop) => SUPPLY_BY_ROLE[troop.role].fuel > 0);
    const lowest = engines.reduce<TroopView | null>(
      (low, troop) =>
        low === null || (troop.supplies?.fuel ?? Infinity) < (low.supplies?.fuel ?? Infinity)
          ? troop
          : low,
      null,
    );
    if (lowest === null) add('fuel', { kind: 'word', word: 'walks' });
    else
      add(
        'fuel',
        scaled('fuel', lowest.supplies?.fuel ?? SUPPLY_BY_ROLE[lowest.role].fuel, theatre, {
          of: SUPPLY_BY_ROLE[lowest.role].fuel,
        }),
      );
  }
  add('detection', scaled('detection', detectionRangeOf(roles, theatre), theatre));
  if (!blitz) {
    const armed = troops.filter((troop) => SUPPLY_BY_ROLE[troop.role].rounds > 0);
    if (armed.length === 0) add('rounds', { kind: 'word', word: 'noFire' });
    else
      add(
        'rounds',
        scaled(
          'rounds',
          armed.reduce(
            (sum, troop) => sum + (troop.supplies?.rounds ?? SUPPLY_BY_ROLE[troop.role].rounds),
            0,
          ),
          theatre,
          {
            of: armed.reduce((sum, troop) => sum + SUPPLY_BY_ROLE[troop.role].rounds, 0),
          },
        ),
      );
  }
  if (bombardsWith(roles, context.mode)) {
    const { rangeKm, deadZoneKm } = fireReachOf(theatre);
    add('reach', scaled('reach', rangeKm, theatre, { floor: deadZoneKm }));
  } else add('reach', { kind: 'word', word: 'contact', km: contactKm(theatre) });

  const carriers = troops.filter((troop) => seatsOf(troop.role) > 0);
  if (carriers.length > 0) {
    const seats = carriers.reduce((sum, troop) => sum + seatsOf(troop.role), 0);
    const free = carriers.reduce((sum, troop) => sum + seatsLeft(troop, troops), 0);
    add('seats', scaled('seats', free, theatre, { of: seats }));
  }
  if (!blitz) {
    const loaders = troops.filter((troop) => LOAD_CAPACITY_BY_ROLE[troop.role] > 0);
    if (loaders.length > 0) {
      const capacity = loaders.reduce((sum, troop) => sum + LOAD_CAPACITY_BY_ROLE[troop.role], 0);
      add(
        'load',
        scaled(
          'load',
          loaders.reduce((sum, troop) => sum + loadTotal(troop.load), 0),
          theatre,
          {
            of: capacity,
          },
        ),
      );
    }
    const capacity = Math.floor(carryCapacityOf(troops, CARRY_CAPACITY_BY_ROLE));
    if (capacity > 0) add('loot', scaled('loot', context.lootCarried, theatre, { of: capacity }));
    add('upkeep', {
      kind: 'figure',
      value:
        cumulative(context.armyTroops) -
        cumulative(Math.max(0, context.armyTroops - troops.length)),
    });
  }
  return rows;
}

const FORMING_BUILDINGS: ReadonlyArray<BuildingKey> = BUILDINGS.filter((key) =>
  ROLE_ORDER.some((role) => projectionKeyOf(role) === key),
);

const rolesOf = (pick: (role: UnitRole) => boolean): ReadonlyArray<UnitRole> =>
  ROLE_ORDER.filter(pick);

/**
 * **Un bâtiment, ses chiffres** : l'effet de son niveau, ce qu'il verse, ce qu'il loge, ce que son
 * niveau suivant coûte. `perHour` est le débit que la vue sert pour ce site (le gisement sous lui,
 * la chaîne qu'il tient) : la fiche ne le devine pas.
 */
export function buildingStats(
  building: Pick<Building, 'key' | 'level' | 'nextLevelCost' | 'nextLevelMinutes' | 'cappedByHq'>,
  context: { readonly mode: SeasonMode; readonly perHour: number | null },
): ReadonlyArray<StatRow<BuildingStatKey>> {
  const { key, level } = building;
  const rows: StatRow<BuildingStatKey>[] = [];
  const add = (stat: BuildingStatKey, reading: StatReading) => rows.push({ key: stat, reading });
  const ceiling = (value: number, max: number): StatReading => ({
    kind: 'scaled',
    value,
    share: max === 0 ? 1 : Math.min(1, value / max),
  });

  if (speedsUp(key)) add('levelGain', ceiling(levelGain(level), levelGain(MAX_HQ_LEVEL)));
  if (context.perHour !== null)
    add(
      'production',
      ceiling(context.perHour, Math.max(...Object.values(EXTRACTION_PER_HOUR)) * MAX_HQ_LEVEL),
    );
  if (key === 'warehouse' || key === 'depot')
    add('storage', ceiling(STORAGE_CAP_PER_LEVEL * level, STORAGE_CAP_PER_LEVEL * MAX_HQ_LEVEL));
  if (key === 'listening') {
    add('listening', { kind: 'figure', value: LISTENING_STATION_RADIUS_KM });
    add('consumption', { kind: 'figure', value: LISTENING_COAL_PER_HOUR });
  }
  const formed = rolesOf((role) => projectionKeyOf(role) === key);
  if (formed.length > 0 && FORMING_BUILDINGS.includes(key))
    add('forms', { kind: 'roles', roles: formed });
  const garrisoned = rolesOf((role) => garrisons(role, key));
  if (garrisoned.length > 0) {
    add('garrison', { kind: 'roles', roles: garrisoned });
    add('protection', { kind: 'figure', value: Math.round(GARRISON_DAMAGE_TAKEN * 100) });
  }
  const blitz = context.mode === 'blitz';
  if (key !== 'hq' || blitz)
    add('capture', {
      kind: 'figure',
      value:
        blitz && key === 'hq' ? CAPTURE_MINUTES.blitz.hq : CAPTURE_MINUTES[context.mode].building,
    });
  if (!blitz)
    add(
      'raise',
      building.cappedByHq
        ? { kind: 'word', word: 'cappedByHq' }
        : { kind: 'raise', costs: building.nextLevelCost, minutes: building.nextLevelMinutes },
    );
  return rows;
}
