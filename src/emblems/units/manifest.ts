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
import chinaArmor1 from './china/armor-1.webp';
import chinaArmor2 from './china/armor-2.webp';
import chinaBomber from './china/bomber.webp';
import chinaFighter from './china/fighter.webp';
import chinaEscort from './china/escort.webp';
import chinaInfantry1 from './china/infantry-1.webp';
import chinaInfantry2 from './china/infantry-2.webp';
import chinaCargo from './china/cargo.webp';
import chinaAirTransport from './china/airTransport.webp';
import chinaLandTransport from './china/landTransport.webp';
import italyArmor1 from './italy/armor-1.webp';
import italyArmor2 from './italy/armor-2.webp';
import italyBomber from './italy/bomber.webp';
import italyFighter from './italy/fighter.webp';
import italyEscort from './italy/escort.webp';
import italyInfantry1 from './italy/infantry-1.webp';
import italyInfantry2 from './italy/infantry-2.webp';
import italyCargo from './italy/cargo.webp';
import italyAirTransport from './italy/airTransport.webp';
import italyLandTransport from './italy/landTransport.webp';
import japanArmor1 from './japan/armor-1.webp';
import japanArmor2 from './japan/armor-2.webp';
import japanBomber from './japan/bomber.webp';
import japanFighter from './japan/fighter.webp';
import japanEscort from './japan/escort.webp';
import japanInfantry1 from './japan/infantry-1.webp';
import japanInfantry2 from './japan/infantry-2.webp';
import japanCargo from './japan/cargo.webp';
import japanCarrier from './japan/carrier.webp';
import japanLandTransport from './japan/landTransport.webp';

/**
 * A tiered role exposes both of its levels, the others structurally only have one. The union
 * avoids an optional `tier` field that would end up read on a carrier.
 */
type UnitVisual =
  | { readonly kind: 'single'; readonly url: string }
  | { readonly kind: 'tiered'; readonly tiers: readonly [string, string] };

/**
 * `null` says "this role has no visual yet", and the complete `Record` forces every added
 * nation to answer for all ten roles: an omission becomes a compile error, not a missing
 * image discovered on screen.
 */
export type NationSprites = Readonly<Record<UnitRole, UnitVisual | null>>;

const FRANCE: NationSprites = {
  infantry: { kind: 'tiered', tiers: [infantry1, infantry2] },
  armor: { kind: 'tiered', tiers: [armor1, armor2] },
  landTransport: { kind: 'single', url: landTransport },
  artillery: null,
  fighter: { kind: 'single', url: fighter },
  bomber: { kind: 'single', url: bomber },
  airTransport: { kind: 'single', url: airTransport },
  escort: { kind: 'single', url: escort },
  // Stand-in: the French cargo is not drawn yet, and the band showed an empty "CARGO" frame.
  cargo: { kind: 'single', url: ukCargo },
  carrier: { kind: 'single', url: carrier },
};

/** Complete, `cargo` included — the plate that was drawn first and wired last. */
const UK: NationSprites = {
  infantry: { kind: 'tiered', tiers: [ukInfantry1, ukInfantry2] },
  armor: { kind: 'tiered', tiers: [ukArmor1, ukArmor2] },
  landTransport: { kind: 'single', url: ukLandTransport },
  artillery: null,
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
  artillery: null,
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
  artillery: null,
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
  artillery: null,
  fighter: { kind: 'single', url: germanyFighter },
  bomber: { kind: 'single', url: germanyBomber },
  airTransport: null,
  escort: { kind: 'single', url: germanyEscort },
  cargo: { kind: 'single', url: germanyCargo },
  carrier: { kind: 'single', url: germanyCarrier },
};

/** Sans porte-avions ni palier 2 dessinés en plus : la Chine de 1940 n'en avait pas. Dix planches. */
const CHINA: NationSprites = {
  infantry: { kind: 'tiered', tiers: [chinaInfantry1, chinaInfantry2] },
  armor: { kind: 'tiered', tiers: [chinaArmor1, chinaArmor2] },
  landTransport: { kind: 'single', url: chinaLandTransport },
  artillery: null,
  fighter: { kind: 'single', url: chinaFighter },
  bomber: { kind: 'single', url: chinaBomber },
  airTransport: { kind: 'single', url: chinaAirTransport },
  escort: { kind: 'single', url: chinaEscort },
  cargo: { kind: 'single', url: chinaCargo },
  carrier: null,
};

/** L'Aquila n'a jamais pris la mer : pas de porte-avions, et c'est historique, pas un trou. */
const ITALY: NationSprites = {
  infantry: { kind: 'tiered', tiers: [italyInfantry1, italyInfantry2] },
  armor: { kind: 'tiered', tiers: [italyArmor1, italyArmor2] },
  landTransport: { kind: 'single', url: italyLandTransport },
  artillery: null,
  fighter: { kind: 'single', url: italyFighter },
  bomber: { kind: 'single', url: italyBomber },
  airTransport: { kind: 'single', url: italyAirTransport },
  escort: { kind: 'single', url: italyEscort },
  cargo: { kind: 'single', url: italyCargo },
  carrier: null,
};

/**
 * Le transport aérien manque : la planche a livré deux bombardiers (le G3M « Nell », branché,
 * et le D3A « Val », gardé en source) et aucun Showa L2D. Le `null` attend le dessin.
 */
const JAPAN: NationSprites = {
  infantry: { kind: 'tiered', tiers: [japanInfantry1, japanInfantry2] },
  armor: { kind: 'tiered', tiers: [japanArmor1, japanArmor2] },
  landTransport: { kind: 'single', url: japanLandTransport },
  artillery: null,
  fighter: { kind: 'single', url: japanFighter },
  bomber: { kind: 'single', url: japanBomber },
  airTransport: null,
  escort: { kind: 'single', url: japanEscort },
  cargo: { kind: 'single', url: japanCargo },
  carrier: { kind: 'single', url: japanCarrier },
};

export const SPRITES_BY_NATION: Readonly<Partial<Record<Nation, NationSprites>>> = {
  france: FRANCE,
  uk: UK,
  usa: USA,
  ussr: USSR,
  germany: GERMANY,
  china: CHINA,
  italy: ITALY,
  japan: JAPAN,
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
  const roles = movementRoles(arc);
  if (roles === null) return null;
  const faceOf = (role: UnitRole | null): string | null =>
    role === null ? null : spriteUrl(playerNation, role, 1);
  return { land: faceOf(roles.land), sea: faceOf(roles.sea), air: faceOf(roles.air) };
}

/**
 * **The one place a movement's roles are read for display**, per medium: the plate and the
 * figurine both dress from it, so the fog is checked once — an enemy arc answers `null`.
 */
export function movementRoles(arc: ArcView): Readonly<Record<UnitDomain, UnitRole | null>> | null {
  if (arc.state !== 'mine') return null;
  const roleOf = (domain: UnitDomain): UnitRole | null =>
    representativeRole(stackInDomain(arc.stack, domain));
  return { land: roleOf('land'), sea: roleOf('sea'), air: roleOf('air') };
}

export function spriteUrl(nation: string | null, role: UnitRole, tier: UnitTier): string | null {
  const sprites = nation !== null && isNation(nation) ? SPRITES_BY_NATION[nation] : undefined;
  const visual = sprites?.[role];
  if (visual === undefined || visual === null) return null;
  if (visual.kind === 'single') return visual.url;
  return tier === 1 ? visual.tiers[0] : visual.tiers[1];
}
