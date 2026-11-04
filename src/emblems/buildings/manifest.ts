import type { BuildingKey, DepositKey } from '@/domain/ids';
import airfieldMaquette from './airfield.glb';
import arsenalMaquette from './arsenal.glb';
import barracksMaquette from './barracks.glb';
import cityMaquette from './city.glb';
import coalMineMaquette from './coalMine.glb';
import farmMaquette from './farm.glb';
import hqMaquette from './hq.glb';
import listeningMaquette from './listening.glb';
import mineMaquette from './mine.glb';
import oilWellMaquette from './oilWell.glb';
import portMaquette from './port.glb';
import researchCenterMaquette from './researchCenter.glb';
import warehouseMaquette from './warehouse.glb';
import airfield from './airfield.webp';
import arsenal from './arsenal.webp';
import barracks from './barracks.webp';
import city from './city.webp';
import farm from './farm.webp';
import hq from './hq.webp';
import listening from './listening.webp';
import mine from './mine.webp';
import oilWell from './oilWell.webp';
import port from './port.webp';
import researchCenter from './researchCenter.svg';
import warehouse from './warehouse.webp';

/**
 * **One visual per key, not one per nation.** One per `BuildingKey` — a pagoda barracks for
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
  mine,
  oilWell,
  arsenal,
  barracks,
  airfield,
  port,
  listening,
  researchCenter,
  warehouse,
  depot: warehouse,
  city,
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
  mine: mineMaquette,
  oilWell: oilWellMaquette,
  arsenal: arsenalMaquette,
  barracks: barracksMaquette,
  airfield: airfieldMaquette,
  port: portMaquette,
  listening: listeningMaquette,
  researchCenter: researchCenterMaquette,
  warehouse: warehouseMaquette,
  depot: warehouseMaquette,
  city: cityMaquette,
};

/** The one mine that changes with its ground: the region decides what it digs (`economy.ts`),
 *  and the headframe says it. The deposit is public, so it tells nothing the atlas does not. */
export const buildingMaquette = (key: BuildingKey, deposit: DepositKey | null): string | null =>
  key === 'mine' && deposit === 'coal' ? coalMineMaquette : BUILDING_MAQUETTES[key];

/**
 * **Where a site out of service wears its seals** (#279, Q3 du 04/11) : le milieu de la croix,
 * en mètres de son fichier, et le sens où elle regarde (+z tourné de tant). Devant sa porte quand
 * il en a une (`fx_sortie`), devant sa façade sinon — en attendant le repère `fx_scelles` des
 * GLB. Un entrepôt les porte devant son vantail (storyboard, 5,7 m). `@a-mesurer`
 */
export const BUILDING_SEALS: Readonly<
  Record<Exclude<BuildingKey, 'depot'>, readonly [x: number, y: number, z: number, yaw: number]>
> = {
  hq: [0, 4.8, 8.3, 0],
  farm: [11.5, 4, 8.7, 0],
  mine: [10.3, 3.8, 6, Math.PI / 2],
  oilWell: [0, 4, 9.1, 0],
  arsenal: [-6, 5.5, 15.4, 0],
  barracks: [0, 4.6, 8, 0],
  airfield: [-30, 5, 23.4, 0],
  port: [0, 5, 25.5, 0],
  listening: [0, 4.4, 8.3, 0],
  researchCenter: [-8, 4.6, 12.3, 0],
  warehouse: [0, 5.7, 20.5, 0],
  city: [0, 4, 14.1, 0],
};
