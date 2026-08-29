import type { Nation, UnitRole } from '@/domain/ids';
import { representativeRole, stackInDomain, type UnitDomain, type UnitTier } from '@/domain/troops';
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
import ukArmor1 from './uk/armor-1.webp';
import ukArmor2 from './uk/armor-2.webp';
import ukBomber from './uk/bomber.webp';
import ukFighter from './uk/fighter.webp';
import ukEscort from './uk/escort.webp';
import ukInfantry1 from './uk/infantry-1.webp';
import ukInfantry2 from './uk/infantry-2.webp';
import ukCargo from './uk/cargo.webp';
import ukCarrier from './uk/carrier.webp';
import ukAirTransport from './uk/airTransport.webp';
import ukLandTransport from './uk/landTransport.webp';
import ussrArmor1 from './ussr/armor-1.webp';
import ussrArmor2 from './ussr/armor-2.webp';
import ussrBomber from './ussr/bomber.webp';
import ussrFighter from './ussr/fighter.webp';
import ussrEscort from './ussr/escort.webp';
import ussrInfantry1 from './ussr/infantry-1.webp';
import ussrInfantry2 from './ussr/infantry-2.webp';
import ussrCargo from './ussr/cargo.webp';
import ussrAirTransport from './ussr/airTransport.webp';
import ussrLandTransport from './ussr/landTransport.webp';
import germanyArmor1 from './germany/armor-1.webp';
import germanyArmor2 from './germany/armor-2.webp';
import germanyBomber from './germany/bomber.webp';
import germanyFighter from './germany/fighter.webp';
import germanyEscort from './germany/escort.webp';
import germanyInfantry1 from './germany/infantry-1.webp';
import germanyInfantry2 from './germany/infantry-2.webp';
import germanyCargo from './germany/cargo.webp';
import germanyCarrier from './germany/carrier.webp';
import germanyLandTransport from './germany/landTransport.webp';

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

/** Complete, `cargo` included — the plate that was drawn first and wired last. */
const UK: NationSprites = {
  infantry: { kind: 'tiered', tiers: [ukInfantry1, ukInfantry2] },
  armor: { kind: 'tiered', tiers: [ukArmor1, ukArmor2] },
  landTransport: { kind: 'single', url: ukLandTransport },
  fighter: { kind: 'single', url: ukFighter },
  bomber: { kind: 'single', url: ukBomber },
  airTransport: { kind: 'single', url: ukAirTransport },
  escort: { kind: 'single', url: ukEscort },
  cargo: { kind: 'single', url: ukCargo },
  carrier: { kind: 'single', url: ukCarrier },
};

/** The first complete plate wired to the front: all nine roles, `cargo` included. */
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

/** Everything but the carrier, still undrawn: `null` is the answer the type asks for. */
const USSR: NationSprites = {
  infantry: { kind: 'tiered', tiers: [ussrInfantry1, ussrInfantry2] },
  armor: { kind: 'tiered', tiers: [ussrArmor1, ussrArmor2] },
  landTransport: { kind: 'single', url: ussrLandTransport },
  fighter: { kind: 'single', url: ussrFighter },
  bomber: { kind: 'single', url: ussrBomber },
  airTransport: { kind: 'single', url: ussrAirTransport },
  escort: { kind: 'single', url: ussrEscort },
  cargo: { kind: 'single', url: ussrCargo },
  carrier: null,
};

/** The Junkers is the one plate still to redraw: its render came out with a baked motion blur. */
const GERMANY: NationSprites = {
  infantry: { kind: 'tiered', tiers: [germanyInfantry1, germanyInfantry2] },
  armor: { kind: 'tiered', tiers: [germanyArmor1, germanyArmor2] },
  landTransport: { kind: 'single', url: germanyLandTransport },
  fighter: { kind: 'single', url: germanyFighter },
  bomber: { kind: 'single', url: germanyBomber },
  airTransport: null,
  escort: { kind: 'single', url: germanyEscort },
  cargo: { kind: 'single', url: germanyCargo },
  carrier: { kind: 'single', url: germanyCarrier },
};

export const SPRITES_BY_NATION: Readonly<Partial<Record<Nation, NationSprites>>> = {
  france: FRANCE,
  uk: UK,
  usa: USA,
  ussr: USSR,
  germany: GERMANY,
};

/** One face per medium the route may cross — what the pawn wears leg by leg. */
export type MediumSprites = Readonly<Record<UnitDomain, string | null>>;

/**
 * A movement's faces on the map, **one per medium and each read on that medium's own units**.
 * A column shows its majority boots on the road, the hull that ferries it on the water, the
 * wing that lifts it in the sky — never the same drawing carried across a dock it just used.
 *
 * Only a `mine` arc has any: the fog means an enemy arc structurally has no stack, hence no
 * sprite, and the renderer falls back to its anonymous silhouettes without a single display
 * `if` able to leak a role. A medium the pile carries nothing for answers `null` the same way
 * — a pile with no hull never sails, so that face is never asked for.
 *
 * Tier MK1 by default: a movement's stack does not carry the tier yet.
 */
export function movementSprites(arc: ArcView, playerNation: string | null): MediumSprites | null {
  if (arc.state !== 'mine') return null;
  const faceOf = (domain: UnitDomain): string | null => {
    const role = representativeRole(stackInDomain(arc.stack, domain));
    return role === null ? null : spriteUrl(playerNation, role, 1);
  };
  return { land: faceOf('land'), sea: faceOf('sea'), air: faceOf('air') };
}

export function spriteUrl(nation: string | null, role: UnitRole, tier: UnitTier): string | null {
  const sprites = nation !== null && isNation(nation) ? SPRITES_BY_NATION[nation] : undefined;
  const visual = sprites?.[role];
  if (visual === undefined || visual === null) return null;
  if (visual.kind === 'single') return visual.url;
  return tier === 1 ? visual.tiers[0] : visual.tiers[1];
}
