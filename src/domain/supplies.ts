import {
  BAKU_REFUEL_MS,
  FAMILY_RESOURCE_OF_ROLE,
  FUEL_STEP_KM,
  PASSING_RESUPPLY_PER_MINUTE,
  SINGAPORE_FUEL_DISCOUNT_PCT,
  SUPPLY_BY_ROLE,
  SUPPLY_STEP_COST,
} from '../../convex/constants';
import { distanceKm, type LonLat } from './geo';
import type { UnitRole } from './ids';
import { INTERCEPTION_SAMPLES, mediumAt, positionAt, type MarchingForce } from './interception';

/**
 * **Coups et plein** (ADR 0028 §3, Mondiale seule) : ce que chaque troupe porte, en crans. Les
 * coups sont les passes qu'elle peut tirer, le plein la route que ses moteurs couvrent encore.
 * **Ancrée, elle se recharge ; ailleurs, elle vit sur ce qu'elle porte.** Le serveur et l'écran
 * lisent les mêmes fonctions : la recharge, le refus d'une route trop longue, l'attaque à sec.
 */
export type Supplies = { readonly rounds: number; readonly fuel: number };

/** Une troupe telle que ses crans se lisent : absents, elle n'a jamais rien dépensé. */
export type Carrying = {
  readonly role: UnitRole;
  readonly rounds?: number;
  readonly fuel?: number;
};

export const fullSupplies = (role: UnitRole): Supplies => SUPPLY_BY_ROLE[role];

export const suppliesOf = (troop: Carrying): Supplies => ({
  rounds: troop.rounds ?? SUPPLY_BY_ROLE[troop.role].rounds,
  fuel: troop.fuel ?? SUPPLY_BY_ROLE[troop.role].fuel,
});

/** Le plein d'un navire est de charbon, celui d'un moteur de terre ou d'un avion de pétrole. */
const fuelResourceOf = (role: UnitRole): 'oil' | 'coal' =>
  FAMILY_RESOURCE_OF_ROLE[role] === 'coal' ? 'coal' : 'oil';

/** Les moteurs que Singapour soulage. */
const SINGAPORE_ROLES: ReadonlyArray<UnitRole> = ['landTransport', 'cargo'];

/**
 * **Les crans de plein qu'une route coûte à ce moteur.** Au teneur de **Singapour**, un camion ou
 * un cargo paie `SINGAPORE_FUEL_DISCOUNT_PCT` % de moins, **arrondi au cran supérieur** : une route
 * d'un cran coûte toujours un cran, jamais zéro. Le calcul reste en entiers (pas de flottant). Le
 * serveur et l'écran lisent celle-ci, pour la dépense comme pour le refus.
 */
export const fuelStepsOf = (role: UnitRole, km: number, holdsSingapore = false): number => {
  const paidPct =
    holdsSingapore && SINGAPORE_ROLES.includes(role) ? 100 - SINGAPORE_FUEL_DISCOUNT_PCT : 100;
  return Math.ceil((km * paidPct) / (100 * FUEL_STEP_KM));
};

/**
 * **Bakou** : une troupe à l'arrêt, hors de toute ancre, reprend un cran de plein toutes les
 * `BAKU_REFUEL_MS`, jusqu'au plein. Calculé à la lecture depuis `since` (l'heure d'arrêt ou du
 * dernier gain), jamais par un job : le serveur règle ce gain avant toute écriture qui lit le plein,
 * l'écran le lit pour montrer le prochain cran. `since` avance du temps déjà compté, pour que le
 * reste d'une période ne se perde pas ; plein atteint, il n'y a plus de prochain cran (`nextAt`).
 */
export function bakuRefuel(
  role: UnitRole,
  held: number,
  since: number,
  now: number,
): { readonly steps: number; readonly since: number; readonly nextAt: number | null } {
  const missing = fullSupplies(role).fuel - held;
  if (missing <= 0) return { steps: 0, since: now, nextAt: null };
  const steps = Math.min(missing, Math.max(0, Math.floor((now - since) / BAKU_REFUEL_MS)));
  if (steps === missing) return { steps, since: now, nextAt: null };
  const counted = since + steps * BAKU_REFUEL_MS;
  return { steps, since: counted, nextAt: counted + BAKU_REFUEL_MS };
}

export type SupplyStocks = {
  readonly ammunition: number;
  readonly oil: number;
  readonly coal: number;
};

/**
 * **La recharge à l'ancre** : chaque troupe ancrée — sur son ancre et à l'arrêt, ce que
 * l'appelant lit — reprend ce qui lui manque, cran par cran entier, sur le stock et tant qu'il
 * dure. Rien ne se refuse : un stock court laisse la dernière à moitié vide, et c'est ce que la
 * pièce dira. **L'ordre est celui des identifiants**, jamais celui de l'appelant : l'écran et le
 * serveur partagent un stock court de la même façon. Une troupe non ancrée garde ses crans.
 */
export function topUp(
  troops: ReadonlyArray<Carrying & { readonly id: string; readonly anchored: boolean }>,
  stocks: SupplyStocks,
): { readonly supplies: ReadonlyMap<string, Supplies>; readonly cost: SupplyStocks } {
  const left = { ...stocks };
  const cost: { -readonly [K in keyof SupplyStocks]: number } = { ammunition: 0, oil: 0, coal: 0 };
  const take = (resource: keyof SupplyStocks, missing: number): number => {
    const steps = Math.min(missing, Math.floor(Math.max(0, left[resource]) / SUPPLY_STEP_COST));
    left[resource] -= steps * SUPPLY_STEP_COST;
    cost[resource] += steps * SUPPLY_STEP_COST;
    return steps;
  };
  const supplies = new Map<string, Supplies>();
  const anchored = troops
    .filter((troop) => troop.anchored)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const troop of anchored) {
    const held = suppliesOf(troop);
    const full = fullSupplies(troop.role);
    supplies.set(troop.id, {
      rounds: held.rounds + take('ammunition', full.rounds - held.rounds),
      fuel: held.fuel + take(fuelResourceOf(troop.role), full.fuel - held.fuel),
    });
  }
  return { supplies, cost };
}

export type FuelShortfall = {
  readonly needed: number;
  readonly held: number;
  readonly role: UnitRole;
};

/** **Le moteur qui borne la route** : celui à qui il reste le moins une fois la route payée, le
 *  plus vide à égalité. Le refus et la jauge lisent le même. `null` sans moteur. */
function bindingEngineOf(
  drivers: ReadonlyArray<Carrying>,
  km: number,
  holdsSingapore: boolean,
): { readonly role: UnitRole; readonly held: number; readonly needed: number } | null {
  let worst: { role: UnitRole; held: number; needed: number } | null = null;
  for (const troop of drivers) {
    if (fullSupplies(troop.role).fuel === 0) continue;
    const held = suppliesOf(troop).fuel;
    const needed = fuelStepsOf(troop.role, km, holdsSingapore);
    const left = held - needed;
    const worstLeft = worst === null ? Infinity : worst.held - worst.needed;
    if (left < worstLeft || (left === worstLeft && held < worst!.held))
      worst = { role: troop.role, held, needed };
  }
  return worst;
}

/** **Une route plus longue que le plein d'un moteur de l'escouade est refusée** ; le refus nomme
 *  celui qui manque le plus, et de combien. Les troupes sans moteur ne comptent pas. */
export function fuelRefusalOf(
  drivers: ReadonlyArray<Carrying>,
  km: number,
  holdsSingapore = false,
): FuelShortfall | null {
  const engine = bindingEngineOf(drivers, km, holdsSingapore);
  return engine !== null && engine.held < engine.needed ? engine : null;
}

/** **La jauge qu'une route ronge** (#250) : le plein du moteur qui borne la route, les crans
 *  qu'elle mange (Singapour déduit, `spared` dit combien il épargne) et ce qui manque. */
export type FuelGauge = {
  readonly held: number;
  readonly full: number;
  readonly resource: 'oil' | 'coal';
  readonly eaten: number;
  readonly spared: number;
  readonly short: number;
};

/** La jauge du moteur qui borne la route (`bindingEngineOf`). `null` sans moteur (à pied, en
 *  Blitz). */
export function fuelGaugeOf(
  drivers: ReadonlyArray<Carrying>,
  km: number,
  holdsSingapore = false,
): FuelGauge | null {
  const engine = bindingEngineOf(drivers, km, holdsSingapore);
  if (engine === null) return null;
  const { role, held, needed } = engine;
  return {
    held,
    full: fullSupplies(role).fuel,
    resource: fuelResourceOf(role),
    eaten: needed,
    spared: fuelStepsOf(role, km) - needed,
    short: Math.max(0, needed - held),
  };
}

/** **Sans coups, ni attaque ni riposte** : une colonne armée dont plus aucune troupe ne porte un
 *  coup n'attaque pas. Une colonne sans arme n'est pas « à sec ». */
export function outOfRounds(troops: ReadonlyArray<Carrying>): boolean {
  const armed = troops.filter((troop) => fullSupplies(troop.role).rounds > 0);
  return armed.length > 0 && armed.every((troop) => suppliesOf(troop).rounds === 0);
}

export type PileSupplies = {
  /** Les coups de la pile, troupes armées seulement : ce qu'elle peut encore tirer. */
  readonly rounds: { readonly held: number; readonly full: number } | null;
  /** **Le plus petit plein** : c'est lui qui borne la route de l'escouade. */
  readonly fuel: {
    readonly held: number;
    readonly full: number;
    readonly resource: 'oil' | 'coal';
    /** **Bakou** : quand le plus petit plein reprend son prochain cran, hors de toute ancre. */
    readonly refuelAt: number | null;
  } | null;
};

/**
 * **Ce que la pièce dit de ses crans** — sous la figurine, à l'affiche, à l'abaque : la somme
 * des coups de ses troupes armées, et le plein de celle qui en a le moins. `null` en Blitz, où
 * aucune troupe ne porte de crans.
 */
export function pileSupplies(
  troops: ReadonlyArray<{
    readonly role: UnitRole;
    readonly supplies?: Supplies;
    /** **Bakou** : l'heure du prochain cran de plein de cette troupe. */
    readonly refuelAt?: number;
  }>,
): PileSupplies | null {
  const counted = troops.filter(
    (troop): troop is typeof troop & { supplies: Supplies } => troop.supplies !== undefined,
  );
  if (counted.length === 0) return null;
  const armed = counted.filter((troop) => fullSupplies(troop.role).rounds > 0);
  const engines = counted
    .filter((troop) => fullSupplies(troop.role).fuel > 0)
    .sort((a, b) => a.supplies.fuel - b.supplies.fuel);
  const low = engines[0];
  return {
    rounds:
      armed.length === 0
        ? null
        : {
            held: armed.reduce((sum, troop) => sum + troop.supplies.rounds, 0),
            full: armed.reduce((sum, troop) => sum + fullSupplies(troop.role).rounds, 0),
          },
    fuel:
      low === undefined
        ? null
        : {
            held: low.supplies.fuel,
            full: fullSupplies(low.role).fuel,
            resource: fuelResourceOf(low.role),
            refuelAt: low.refuelAt ?? null,
          },
  };
}

/**
 * **Qui reprend un cran à Bakou, et depuis quand** : le seul prédicat, lu par le serveur
 * (`toppedUp`, `handOver`) et par la vue. Un moteur — une troupe sans plein n'a rien à reprendre —,
 * à l'arrêt, hors de toute ancre, d'un joueur qui tient le point (`heldSince`, `null` sinon).
 * **L'horloge part du plus tardif** de son dernier arrêt (`fuelAt`, à défaut sa formation) et de la
 * prise du point : le temps où Bakou n'était pas à lui ne compte pas.
 */
export function bakuGainOf(
  troop: Carrying & { readonly fuelAt?: number; readonly createdAt: number },
  state: {
    readonly heldSince: number | null;
    readonly marching: boolean;
    readonly anchored: boolean;
  },
  now: number,
): ReturnType<typeof bakuRefuel> | null {
  if (state.heldSince === null || state.marching || state.anchored) return null;
  if (fullSupplies(troop.role).fuel === 0) return null;
  const since = Math.max(troop.fuelAt ?? troop.createdAt, state.heldSince);
  return bakuRefuel(troop.role, suppliesOf(troop).fuel, since, now);
}

/** Un Magasin tel que le passage le lit : à soi, debout, en service et Magasin à l'arrivée. */
export type PassingStore<Id extends string = string> = {
  readonly id: Id;
  readonly point: LonLat;
  readonly reachKm: number;
  readonly depot: SupplyStocks;
};

export type PassingTake<Id extends string = string> = {
  readonly id: Id;
  /** Les crans de chaque troupe servie, ce Magasin et les précédents compris. */
  readonly supplies: ReadonlyMap<string, Supplies>;
  /** Ce que le dépôt rend (`takeFromDepot`). */
  readonly cost: SupplyStocks;
  readonly steps: { readonly rounds: number; readonly fuel: number };
  /** **Le dépôt n'a pas suffi** : un Magasin plein aurait versé davantage. */
  readonly short: boolean;
};

/**
 * **Le Magasin ravitaille la colonne qui le traverse** (ADR 0037 §4). Le temps passé dans chaque
 * rayon se mesure dans le temps (`positionAt`), pas en part de route : une route terre et mer
 * attend aux quais. Une minute compte une fois, au Magasin le plus proche qui la couvre ; une
 * minute de vol ne compte pas. Chaque Magasin verse `PASSING_RESUPPLY_PER_MINUTE` de chaque
 * ressource par minute, cran par cran (`topUp`), plancher à son dépôt, dans l'ordre où la colonne
 * les traverse. L'aperçu et l'arrivée lisent celle-ci ; l'appelant passe la force arrêtée à son
 * arrivée réelle (`heldAt` d'une colonne retenue).
 */
export function passingResupply<Id extends string>(
  force: MarchingForce,
  stores: ReadonlyArray<PassingStore<Id>>,
  troops: ReadonlyArray<Carrying & { readonly id: string }>,
  samples = INTERCEPTION_SAMPLES,
): Array<PassingTake<Id>> {
  const span = force.arrivesAt - force.departedAt;
  if (stores.length === 0 || span <= 0) return [];
  const step = span / samples;
  const minutes = new Map<PassingStore<Id>, number>();
  for (let index = 0; index < samples; index += 1) {
    const at = force.departedAt + (index + 0.5) * step;
    if (mediumAt(force, at) === 'air') continue;
    const here = positionAt(force, at);
    let nearest: PassingStore<Id> | null = null;
    let nearestKm = Infinity;
    for (const store of stores) {
      const km = distanceKm(here, store.point);
      if (km <= store.reachKm && km < nearestKm) [nearest, nearestKm] = [store, km];
    }
    if (nearest !== null) minutes.set(nearest, (minutes.get(nearest) ?? 0) + step / 60_000);
  }

  const supplies = new Map<string, Supplies>();
  return [...minutes].map(([store, spent]) => {
    const carried = troops.map((troop) => ({
      ...troop,
      ...supplies.get(troop.id),
      anchored: true,
    }));
    const poured = Math.floor(spent * PASSING_RESUPPLY_PER_MINUTE);
    const wanted = topUp(carried, { ammunition: poured, oil: poured, coal: poured });
    const got = topUp(carried, {
      ammunition: Math.min(poured, store.depot.ammunition),
      oil: Math.min(poured, store.depot.oil),
      coal: Math.min(poured, store.depot.coal),
    });
    for (const [id, refill] of got.supplies) supplies.set(id, refill);
    const total = (stocks: SupplyStocks) => stocks.ammunition + stocks.oil + stocks.coal;
    return {
      id: store.id,
      supplies: new Map(supplies),
      cost: got.cost,
      steps: {
        rounds: got.cost.ammunition / SUPPLY_STEP_COST,
        fuel: (got.cost.oil + got.cost.coal) / SUPPLY_STEP_COST,
      },
      short: total(got.cost) < total(wanted.cost),
    };
  });
}
