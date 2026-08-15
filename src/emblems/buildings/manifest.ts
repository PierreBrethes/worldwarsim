import { BUILDINGS, type BuildingKey } from '@/domain/ids';
import airfield from './airfield.webp';
import arsenal from './arsenal.webp';
import barracks from './barracks.webp';
import billets from './billets.webp';
import depot from './depot.webp';
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
 * **Fifteen visuals, not a hundred and twenty.** One per `BuildingKey`, neutral, tinted with
 * the national ink at display time — a pagoda barracks for Japan would be beautiful and would
 * cost eight plates for a sprite two centimetres tall on screen.
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
  depot,
};

export const buildingSprite = (key: BuildingKey): string | null => BUILDING_SPRITES[key];

/**
 * The plates are scaled by their **height** at bake time (`WWS/sprites/optimiser.py`): the
 * headquarters is the reference at 512 px, a listening post half of it. The board must
 * therefore give the sprite its own share of the screen and not a common one, otherwise the
 * hierarchy baked into the assets is flattened at draw time.
 */
export const BUILDING_REFERENCE_HEIGHT = 512;

export const isBuildingKey = (value: string): value is BuildingKey =>
  (BUILDINGS as ReadonlyArray<string>).includes(value);
