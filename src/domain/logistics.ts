import type { SupplyStocks } from './supplies';

/**
 * **La logistique passe par les pièces** (ADR 0028 §4, Mondiale seule) : un dépôt d'avant-poste
 * et un transport portent munitions, pétrole et charbon, dans **une seule charge maximale**
 * partagée librement. Le serveur et l'écran lisent les mêmes fonctions.
 */
export type SupplyLoad = SupplyStocks;

export const SUPPLY_KEYS: ReadonlyArray<keyof SupplyLoad> = ['ammunition', 'oil', 'coal'];

export const emptyLoad = (): SupplyLoad => ({ ammunition: 0, oil: 0, coal: 0 });

export const loadTotal = (load: SupplyLoad | undefined): number =>
  load === undefined ? 0 : load.ammunition + load.oil + load.coal;
