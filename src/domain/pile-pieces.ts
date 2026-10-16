import type { UnitRole, UnitTier } from './ids';
import type { ArcView, TroopView } from './player-view';
import { cargoOf, carrierIn, DOMAIN_BY_ROLE, ROLE_ORDER, unitsOf, type UnitDomain } from './troops';

/**
 * Une pile posée se lit en groupes de figurines (ADR 0026 §5). La règle vit ici, pure, pour que
 * le moteur et la feuille de lecture partagent un seul avis sur ce qui se montre et ce qui s'use.
 */

type PileTroop = Pick<
  TroopView,
  'id' | 'role' | 'tier' | 'strength' | 'nominalStrength' | 'carriedBy'
>;

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
  /** **En Blitz, un avion reste en l'air** (décision de Pierre, 15/10) : posé, il plane. */
  readonly aloft?: true;
  /** **Ce que ses transports portent** (15/10), à tous les étages : les passagers ne se voient
   *  pas, le jeton « N à bord » les compte. Absent sans passager. */
  readonly aboard?: number;
};

export type PilePieces = {
  readonly groups: ReadonlyArray<PieceGroup>;
  /** Every troop of the pile: what a press on the pile lifts. */
  readonly troopIds: ReadonlyArray<string>;
  /** **Une escouade** (POC « Manipuler les pions », 16/10) : deux pièces ou plus, détourées et
   *  sous un fanion. Jamais en Blitz, où chaque pièce est une unité. */
  readonly squad: boolean;
};

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

/**
 * **Une pièce par troupe** (POC « Manipuler les pions », 16/10) : l'escouade montre tout ce
 * qu'elle tient, rôle par rôle dans l'ordre de la fiche — plus de « +N » ni de « ×N », on ne
 * voit plus la première troupe seule. **Ce qui est à bord ne se voit pas** (15/10) : seul ce qui
 * se tient debout se dessine, et un transport emmène ce qu'il porte.
 */
export function pilePieces(troops: ReadonlyArray<PileTroop>): PilePieces {
  const standing = troops.filter((troop) => carrierIn(troop, troops) === null);
  const groups = bucketsOf(standing).flatMap(({ troops: members }) =>
    members.map((troop): PieceGroup => {
      const [alone] = bucketsOf([troop]) as [Bucket];
      const riders = cargoOf(troop, troops);
      return {
        role: troop.role,
        troops: 1,
        troopIds: [troop, ...riders].map((t) => t.id),
        figures: figuresOf(alone),
        wear: wearOf(alone.ratio),
        ...(riders.length === 0 ? {} : { aboard: riders.length }),
      };
    }),
  );
  return { groups, troopIds: troops.map((t) => t.id), squad: groups.length > 1 };
}

/**
 * **En Blitz, une pièce par unité** (règle de Pierre, 15/10) : deux fantassins au même point se
 * tiennent côte à côte et se lèvent chacun ; un transport se dessine pour ses passagers, qui
 * partent avec lui. Rien ne se déploie : la pièce est déjà l'unité.
 */
export function unitPieces(troops: ReadonlyArray<PileTroop>): PilePieces {
  return {
    groups: unitsOf(troops).map((unit) => {
      const [face] = bucketsOf(unit.slice(0, 1)) as [Bucket];
      return {
        role: face.role,
        troops: 1,
        troopIds: unit.map((t) => t.id),
        figures: figuresOf(face),
        wear: wearOf(face.ratio),
        ...(DOMAIN_BY_ROLE[face.role] === 'air' ? { aloft: true as const } : {}),
        ...(unit.length > 1 ? { aboard: unit.length - 1 } : {}),
      };
    }),
    troopIds: troops.map((t) => t.id),
    squad: false,
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
