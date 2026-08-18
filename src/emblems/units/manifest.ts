import type { Nation, UnitRole } from '@/domain/ids';
import { representativeRole, type UnitTier } from '@/domain/troops';
import { isNation } from '@/domain/nations';
import type { ArcView } from '@/domain/player-view';
import armor1 from './france/armor-1.webp';
import armor2 from './france/armor-2.webp';
import bomber from './france/bomber.webp';
import fighter from './france/fighter.webp';
import escort from './france/escort.webp';
import infantry1 from './france/infantry-1.webp';
import infantry2 from './france/infantry-2.webp';
import carrier from './france/carrier.webp';
import airTransport from './france/airTransport.webp';
import landTransport from './france/landTransport.webp';
import usaArmor1 from './usa/armor-1.webp';
import usaArmor2 from './usa/armor-2.webp';
import usaBomber from './usa/bomber.webp';
import usaFighter from './usa/fighter.webp';
import usaEscort from './usa/escort.webp';
import usaInfantry1 from './usa/infantry-1.webp';
import usaInfantry2 from './usa/infantry-2.webp';
import usaCargo from './usa/cargo.webp';
import usaCarrier from './usa/carrier.webp';
import usaAirTransport from './usa/airTransport.webp';
import usaLandTransport from './usa/landTransport.webp';

/**
 * A tiered role exposes both of its levels, the others structurally only have one. The union
 * avoids an optional `tier` field that would end up read on a carrier.
 */
export type UnitVisual =
  | { readonly kind: 'single'; readonly url: string }
  | { readonly kind: 'tiered'; readonly tiers: readonly [string, string] };

/**
 * `null` says "this role has no visual yet", and the complete `Record` forces every added
 * nation to answer for all nine roles: an omission becomes a compile error, not a missing
 * image discovered on screen.
 */
export type NationSprites = Readonly<Record<UnitRole, UnitVisual | null>>;

const FRANCE: NationSprites = {
  infantry: { kind: 'tiered', tiers: [infantry1, infantry2] },
  armor: { kind: 'tiered', tiers: [armor1, armor2] },
  landTransport: { kind: 'single', url: landTransport },
  fighter: { kind: 'single', url: fighter },
  bomber: { kind: 'single', url: bomber },
  airTransport: { kind: 'single', url: airTransport },
  escort: { kind: 'single', url: escort },
  cargo: null,
  carrier: { kind: 'single', url: carrier },
};

/** The first complete plate of the project: all nine roles, `cargo` included. */
const USA: NationSprites = {
  infantry: { kind: 'tiered', tiers: [usaInfantry1, usaInfantry2] },
  armor: { kind: 'tiered', tiers: [usaArmor1, usaArmor2] },
  landTransport: { kind: 'single', url: usaLandTransport },
  fighter: { kind: 'single', url: usaFighter },
  bomber: { kind: 'single', url: usaBomber },
  airTransport: { kind: 'single', url: usaAirTransport },
  escort: { kind: 'single', url: usaEscort },
  cargo: { kind: 'single', url: usaCargo },
  carrier: { kind: 'single', url: usaCarrier },
};

export const SPRITES_BY_NATION: Readonly<Partial<Record<Nation, NationSprites>>> = {
  france: FRANCE,
  usa: USA,
};

/**
 * A movement's face on the map. Only a `mine` arc has one: the fog means an enemy arc
 * structurally has no stack, hence no sprite — the renderer falls back to its anonymous
 * marker without any display `if` able to leak the information.
 * Tier MK1 by default: a movement's stack does not carry the tier yet.
 */
export function movementSprite(arc: ArcView, playerNation: string | null): string | null {
  if (arc.state !== 'mine') return null;
  const role = representativeRole(arc.stack);
  if (role === null) return null;
  return spriteUrl(playerNation, role, 1);
}

export function spriteUrl(nation: string | null, role: UnitRole, tier: UnitTier): string | null {
  const sprites = nation !== null && isNation(nation) ? SPRITES_BY_NATION[nation] : undefined;
  const visual = sprites?.[role];
  if (visual === undefined || visual === null) return null;
  if (visual.kind === 'single') return visual.url;
  return tier === 1 ? visual.tiers[0] : visual.tiers[1];
}
