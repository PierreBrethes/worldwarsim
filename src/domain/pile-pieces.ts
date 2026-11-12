import type { UnitRole, UnitTier } from './ids';
import { batterySince } from './indirect-fire';
import type { ArcView, TroopView } from './player-view';
import {
  cargoOf,
  carrierIn,
  DOMAIN_BY_ROLE,
  PROJECTION_BY_DOMAIN,
  ROLE_ORDER,
  unitsOf,
  type UnitDomain,
} from './troops';

/**
 * Une pile posée se lit en groupes de figurines (ADR 0026 §5). La règle vit ici, pure, pour que
 * le moteur et la feuille de lecture partagent un seul avis sur ce qui se montre et ce qui s'use.
 */

type PileTroop = Pick<
  TroopView,
  'id' | 'role' | 'tier' | 'strength' | 'nominalStrength' | 'carriedBy' | 'emplacedAt' | 'formedAt'
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
  /** **Au repos à son poste** (#475, Mondiale) : l'avion sur l'aire de son aérodrome, la coque
   *  à son quai. Il n'est plus dans la formation de la pile : la carte le pose là où le site le
   *  range (`apron`, `berths`). */
  readonly posted?: true;
  /** **Formée à cet instant** (#524) : l'ordre où les pièces d'un poste sont arrivées. */
  readonly formedAt?: number;
  /** **Ce que ses transports portent** (15/10), à tous les étages : les passagers ne se voient
   *  pas, le jeton « N à bord » les compte. Absent sans passager. */
  readonly aboard?: number;
  /** **En batterie dès cet instant** (`batterySince`, #325) : ses pièces y ouvrent leurs flèches.
   *  Absent quand elles ne le sont jamais telles qu'elles se tiennent. */
  readonly battery?: number;
};

export type PilePieces = {
  readonly groups: ReadonlyArray<PieceGroup>;
  /** Every troop of the pile: what a press on the pile lifts. */
  readonly troopIds: ReadonlyArray<string>;
  /** **Une escouade** (POC « Manipuler les pions », 16/10) : deux pièces ou plus, détourées et
   *  sous un fanion. Jamais en Blitz, où chaque pièce est une unité. */
  readonly squad: boolean;
  /** **Le compte du fanion** (ADR 0028 §6) : toutes les troupes d'une escouade dessinée en une
   *  figurine par rôle. Absent quand chaque troupe a sa pièce. */
  readonly count?: number;
};

/** Jusque-là, une pièce par troupe ; au-delà, une par rôle (ADR 0028 §6). */
export const SQUAD_DRAWN_WHOLE = 12;

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

/** Troops by role: the most numerous role first, then the sheet's order (`ROLE_ORDER`). */
function runsOf<T extends { readonly role: UnitRole }>(
  troops: ReadonlyArray<T>,
): Array<readonly [UnitRole, T[]]> {
  const byRole = new Map<UnitRole, T[]>();
  for (const troop of troops) {
    const members = byRole.get(troop.role);
    if (members) members.push(troop);
    else byRole.set(troop.role, [troop]);
  }
  return [...byRole].sort(
    ([a, one], [b, other]) =>
      other.length - one.length || ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
  );
}

/** **The pieces of a pile in the order they stand** (`pilePieces`): what the crown of a
 *  disbanded squad ranks them by (`crownSeats`, #277). */
export const inPileOrder = <T extends { readonly role: UnitRole }>(pieces: ReadonlyArray<T>): T[] =>
  runsOf(pieces).flatMap(([, members]) => members);

function bucketsOf(troops: ReadonlyArray<PileTroop>): Bucket[] {
  return runsOf(troops).map(([role, members]) => {
    const nominal = members.reduce((sum, t) => sum + t.nominalStrength, 0);
    const strength = members.reduce((sum, t) => sum + t.strength, 0);
    // A zero nominal is no wound: reading it as 1 keeps NaN out of the notches.
    return { role, troops: members, ratio: nominal === 0 ? 1 : strength / nominal };
  });
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
export function pilePieces(
  troops: ReadonlyArray<PileTroop>,
  /** **Posée à une station** (#325), et au large ou non : ses pièces peuvent y être en batterie. */
  station?: { readonly afloat: boolean },
): PilePieces {
  const standing = troops.filter((troop) => carrierIn(troop, troops) === null);
  const piece = (bucket: Bucket): PieceGroup => {
    const riders = bucket.troops.flatMap((troop) => cargoOf(troop, troops));
    const battery = station === undefined ? null : batterySince(bucket.troops, station.afloat);
    return {
      role: bucket.role,
      troops: bucket.troops.length,
      troopIds: [...bucket.troops, ...riders].map((t) => t.id),
      figures: figuresOf(bucket),
      wear: wearOf(bucket.ratio),
      ...(bucket.troops[0]?.formedAt === undefined ? {} : { formedAt: bucket.troops[0].formedAt }),
      ...(riders.length === 0 ? {} : { aboard: riders.length }),
      ...(battery === null ? {} : { battery }),
    };
  };
  const ids = troops.map((t) => t.id);
  /** **Au-delà de douze troupes, une figurine par rôle** (ADR 0028 §6) : les passagers comptent,
   *  au seuil comme au fanion, et ce qu'on lève est le rôle. */
  if (ids.length > SQUAD_DRAWN_WHOLE)
    return {
      groups: bucketsOf(standing).map(piece),
      troopIds: ids,
      squad: true,
      count: ids.length,
    };
  const groups = bucketsOf(standing).flatMap(({ troops: members }) =>
    members.map((troop) => piece(bucketsOf([troop])[0]!)),
  );
  return { groups, troopIds: ids, squad: groups.length > 1 };
}

/**
 * **Les pièces d'une garnison qui se rangent au poste de leur site** (#475) : les avions d'un
 * aérodrome, les coques d'un port ; les hommes restent au rang. En Mondiale seulement — la Blitz
 * ne passe pas par ici (`unitPieces`).
 */
export function postedAt(pieces: PilePieces, building?: string): PilePieces {
  const kind =
    building === PROJECTION_BY_DOMAIN.air
      ? 'air'
      : building === PROJECTION_BY_DOMAIN.sea
        ? 'sea'
        : null;
  if (kind === null) return pieces;
  return {
    ...pieces,
    groups: pieces.groups.map((group) =>
      DOMAIN_BY_ROLE[group.role] === kind ? { ...group, posted: true as const } : group,
    ),
  };
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
