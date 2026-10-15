import type { UnitRole, UnitTier } from './ids';
import type { ArcView, TroopView } from './player-view';
import { DOMAIN_BY_ROLE, ROLE_ORDER, type UnitDomain } from './troops';

/**
 * Une pile posée se lit en groupes de figurines (ADR 0026 §5). La règle vit ici, pure, pour que
 * le moteur et la feuille de lecture partagent un seul avis sur ce qui se montre et ce qui s'use.
 */

type PileTroop = Pick<TroopView, 'id' | 'role' | 'tier' | 'strength' | 'nominalStrength'>;

export type Wear = 'whole' | 'smoking' | 'burning';

type PieceGroup = {
  readonly role: UnitRole;
  /** Troops of this role in the pile — the ×N counter shows when > 1. */
  readonly troops: number;
  /** What a click on the group lifts (ADR 0026 §6). */
  readonly troopIds: ReadonlyArray<string>;
  /** Marks of the figures that stand, front first. */
  readonly figures: ReadonlyArray<UnitTier>;
  readonly wear: Wear;
};

export type PilePieces = {
  readonly groups: ReadonlyArray<PieceGroup>;
  /** Roles present beyond the three shown — the "+N" counter, 0 when none. */
  readonly more: number;
  /** Every troop of the pile, the +N's included: what a click on a counter lifts. */
  readonly troopIds: ReadonlyArray<string>;
  /** **The pile deployed** while it is in hand (ADR 0026 §6, 13/10): one piece per troop, the
   *  +N's included, in the groups' order — each read alone, as if it stood by itself. */
  readonly spread: ReadonlyArray<SpreadPiece>;
};

export type SpreadPiece = Pick<PieceGroup, 'role' | 'figures' | 'wear'> &
  Pick<SheetLine, 'notches' | 'ink'> & { readonly troopId: string };

export type SheetLine = {
  readonly role: UnitRole;
  readonly troops: number;
  readonly troopIds: ReadonlyArray<string>;
  /** 0..100, the group's strength against its nominal, rounded. */
  readonly health: number;
  /** Ten notches, how many are inked: Math.round(health / 10). */
  readonly notches: number;
  readonly ink: 'ink' | 'ochre' | 'red';
};

const SHOWN_GROUPS = 3;

type Bucket = { role: UnitRole; troops: PileTroop[]; ratio: number };

function bucketsOf(troops: ReadonlyArray<PileTroop>): Bucket[] {
  const byRole = new Map<UnitRole, PileTroop[]>();
  for (const troop of troops) {
    const members = byRole.get(troop.role);
    if (members) members.push(troop);
    else byRole.set(troop.role, [troop]);
  }
  return [...byRole]
    .map(([role, members]) => {
      const nominal = members.reduce((sum, t) => sum + t.nominalStrength, 0);
      const strength = members.reduce((sum, t) => sum + t.strength, 0);
      // A zero nominal is no wound: reading it as 1 keeps NaN out of the notches.
      return { role, troops: members, ratio: nominal === 0 ? 1 : strength / nominal };
    })
    .sort(
      (a, b) =>
        b.troops.length - a.troops.length ||
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );
}

function wearOf(ratio: number): Wear {
  return ratio > 2 / 3 ? 'whole' : ratio > 1 / 3 ? 'smoking' : 'burning';
}

function figuresOf({ role, troops, ratio }: Bucket): UnitTier[] {
  const count = role === 'infantry' ? (ratio > 2 / 3 ? 3 : ratio > 1 / 3 ? 2 : 1) : 1;
  const mk2 = troops.filter((t) => t.tier === 2).length;
  const mk1 = troops.length - mk2;
  if (mk2 === 0) return Array<UnitTier>(count).fill(1);
  if (mk1 === 0) return Array<UnitTier>(count).fill(2);
  if (count === 1) return [mk2 > mk1 ? 2 : 1];
  const front = Math.min(count - 1, Math.max(1, Math.round((count * mk2) / troops.length)));
  // MK2 stands in front: the French MK2 is a kneeling bazooka carrier.
  return [...Array<UnitTier>(front).fill(2), ...Array<UnitTier>(count - front).fill(1)];
}

export function pilePieces(troops: ReadonlyArray<PileTroop>): PilePieces {
  const buckets = bucketsOf(troops);
  return {
    groups: buckets.slice(0, SHOWN_GROUPS).map((bucket) => ({
      role: bucket.role,
      troops: bucket.troops.length,
      troopIds: bucket.troops.map((t) => t.id),
      figures: figuresOf(bucket),
      wear: wearOf(bucket.ratio),
    })),
    more: Math.max(0, buckets.length - SHOWN_GROUPS),
    troopIds: troops.map((t) => t.id),
    spread: buckets.flatMap(({ troops: members }) =>
      members.map((troop) => {
        const [alone] = bucketsOf([troop]) as [Bucket];
        const [line] = pileSheet([troop]) as [SheetLine];
        return {
          troopId: troop.id,
          role: troop.role,
          figures: figuresOf(alone),
          wear: wearOf(alone.ratio),
          notches: line.notches,
          ink: line.ink,
        };
      }),
    ),
  };
}

export function pileSheet(troops: ReadonlyArray<PileTroop>): ReadonlyArray<SheetLine> {
  return bucketsOf(troops).map(({ role, troops: members, ratio }) => {
    const health = Math.round(100 * ratio);
    return {
      role,
      troops: members.length,
      troopIds: members.map((t) => t.id),
      health,
      notches: Math.round(health / 10),
      ink: ratio > 2 / 3 ? 'ink' : ratio > 1 / 3 ? 'ochre' : 'red',
    };
  });
}

/**
 * **What wear each medium of my movement shows**, read off the troops it carries — the arc does
 * not carry strength, the troop list does. The face of a medium is its most numerous role, as for
 * the figurine (`movementRoles`), and infantry never smokes. `null` for anything not mine: an
 * enemy column has no troops to read (fog).
 */
export function movementWear(
  arc: ArcView,
  troops: ReadonlyArray<PileTroop>,
): Readonly<Record<UnitDomain, Wear>> | null {
  if (arc.state !== 'mine') return null;
  const carried = new Set(arc.troopIds);
  const wearIn = (domain: UnitDomain): Wear => {
    const face = bucketsOf(
      troops.filter((t) => carried.has(t.id) && DOMAIN_BY_ROLE[t.role] === domain),
    )[0];
    return face === undefined || face.role === 'infantry' ? 'whole' : wearOf(face.ratio);
  };
  return { land: wearIn('land'), sea: wearIn('sea'), air: wearIn('air') };
}
