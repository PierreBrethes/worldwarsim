import type { BuildingKey, DepositKey } from '@/domain/ids';
import airfieldMaquette from './airfield.glb';
import arsenalMaquette from './arsenal.glb';
import barracksMaquette from './barracks.glb';
import billetsMaquette from './billets.glb';
import coalMineMaquette from './coalMine.glb';
import farmMaquette from './farm.glb';
import foundryMaquette from './foundry.glb';
import hqMaquette from './hq.glb';
import listeningMaquette from './listening.glb';
import millMaquette from './mill.glb';
import mineMaquette from './mine.glb';
import oilWellMaquette from './oilWell.glb';
import portMaquette from './port.glb';
import quartermasterMaquette from './quartermaster.glb';
import warehouseMaquette from './warehouse.glb';
import airfield from './airfield.webp';
import arsenal from './arsenal.webp';
import barracks from './barracks.webp';
import billets from './billets.webp';
import farm from './farm.webp';
import foundry from './foundry.webp';
import hq from './hq.webp';
import listening from './listening.webp';
import mill from './mill.webp';
import mine from './mine.webp';
import oilWell from './oilWell.webp';
import port from './port.webp';
import quartermaster from './quartermaster.webp';
import warehouse from './warehouse.webp';

/**
 * **Fifteen visuals, not a hundred and twenty.** One per `BuildingKey` — a pagoda barracks for
 * Japan would be beautiful and would cost eight plates for a sprite two centimetres tall on
 * screen.
 *
 * The plates are neutral, **and they stay neutral on screen**: no national ink is laid over
 * them, unlike the unit sprites. `PlayerView` never serves an enemy building, so everything
 * displayed already belongs to the player looking — a tint would cost a render pass to carry
 * no information at all. What carries ownership is the region fill and the marker's bar. Full
 * reasoning in `WWS/sprites/README.md` §7.
 *
 * The `Record` is complete: a key added to the domain without a plate stops the compilation
 * instead of showing a hole on the board, and a missing visual is written `null` — explicitly,
 * never by omission.
 */
export const BUILDING_SPRITES: Readonly<Record<BuildingKey, string | null>> = {
  hq,
  farm,
  mill,
  mine,
  oilWell,
  foundry,
  arsenal,
  quartermaster,
  barracks,
  airfield,
  port,
  listening,
  billets,
  warehouse,
  depot: warehouse,
  // ponytail: la ville de la Blitz porte la planche des baraquements, en attendant la sienne.
  city: billets,
};

export const buildingSprite = (key: BuildingKey): string | null => BUILDING_SPRITES[key];

/**
 * **The maquettes, one per plate and the same for every nation** (ADR 0026 §1): what stands at a
 * building's point up close, in place of its plate. Same sculpting brief as the figurines — y up,
 * origin on the ground. A historical depot reads as the warehouse it is now, as its plate does:
 * the `depot` maquette drawn for it is not used. `null` would leave the plate.
 */
export const BUILDING_MAQUETTES: Readonly<Record<BuildingKey, string | null>> = {
  hq: hqMaquette,
  farm: farmMaquette,
  mill: millMaquette,
  mine: mineMaquette,
  oilWell: oilWellMaquette,
  foundry: foundryMaquette,
  arsenal: arsenalMaquette,
  quartermaster: quartermasterMaquette,
  barracks: barracksMaquette,
  airfield: airfieldMaquette,
  port: portMaquette,
  listening: listeningMaquette,
  billets: billetsMaquette,
  warehouse: warehouseMaquette,
  depot: warehouseMaquette,
  city: billetsMaquette,
};

/** The one mine that changes with its ground: the region decides what it digs (`economy.ts`),
 *  and the headframe says it. The deposit is public, so it tells nothing the atlas does not. */
export const buildingMaquette = (key: BuildingKey, deposit: DepositKey | null): string | null =>
  key === 'mine' && deposit === 'coal' ? coalMineMaquette : BUILDING_MAQUETTES[key];
