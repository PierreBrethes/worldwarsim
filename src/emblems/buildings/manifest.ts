import type { BuildingKey } from '@/domain/ids';
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
  depot,
};

export const buildingSprite = (key: BuildingKey): string | null => BUILDING_SPRITES[key];
