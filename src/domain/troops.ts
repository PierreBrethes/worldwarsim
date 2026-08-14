import type { Medium, MovementType, UnitRole, UnitTier } from './ids';
import type { ArcView, PlayerView, Stack } from './player-view';

export type { UnitTier };
export type UnitDomain = Medium;

export const DOMAIN_BY_ROLE: Readonly<Record<UnitRole, UnitDomain>> = {
  infantry: 'land',
  armor: 'land',
  landTransport: 'land',
  fighter: 'air',
  bomber: 'air',
  airTransport: 'air',
  escort: 'sea',
  cargo: 'sea',
  carrier: 'sea',
};

/**
 * How many equipment tiers a role knows. Two for those whose gear gets replaced mid-season,
 * one for the others: this table decides what a workshop may produce, not the presence of a
 * sprite.
 */
export const TIERS_BY_ROLE: Readonly<Record<UnitRole, UnitTier>> = {
  infantry: 2,
  armor: 2,
  landTransport: 1,
  fighter: 1,
  bomber: 1,
  airTransport: 1,
  escort: 1,
  cargo: 1,
  carrier: 2,
};

export const tierLabel = (tier: UnitTier): string => `MK${tier}`;

/**
 * The full matrix is 9×9 and a player must never see it whole (brief 4.6): two short lists
 * suffice. A **support** unit structurally has neither strengths nor weaknesses — it does not
 * fight, it gets destroyed or intercepted. The lists themselves are display text and live in
 * `fr.unitSheets`.
 */
export type UnitSheet =
  | {
      readonly kind: 'combat';
      readonly strongAgainst: ReadonlyArray<string>;
      readonly weakAgainst: ReadonlyArray<string>;
    }
  | { readonly kind: 'support'; readonly contribution: string };

const ROLE_ORDER: ReadonlyArray<UnitRole> = [
  'infantry',
  'armor',
  'landTransport',
  'fighter',
  'bomber',
  'airTransport',
  'escort',
  'cargo',
  'carrier',
];

export type TroopSituation =
  | { readonly kind: 'home' }
  | {
      readonly kind: 'movement';
      readonly arcId: string;
      readonly movementType: MovementType;
      readonly destination: string;
      readonly minutesLeft: number;
    }
  | { readonly kind: 'garrison'; readonly outpostId: string; readonly hostCountry: string };

export type SituationKind = TroopSituation['kind'];

export type TroopLine = {
  readonly key: string;
  readonly role: UnitRole;
  readonly unitDomain: UnitDomain;
  readonly count: number;
  readonly situation: TroopSituation;
};

export type TroopFilter = {
  readonly situation: SituationKind | 'all';
  readonly unitDomain: UnitDomain | 'all';
};

export type TroopSort = 'role' | 'count' | 'due';

/**
 * The role that gives a movement its face on the map: the most numerous of the stack, ties
 * broken by the canonical role order. An empty stack has no face — it is the renderer's job
 * to decide what to show, not the domain's to invent a unit.
 */
export function representativeRole(stack: Stack): UnitRole | null {
  let kept: UnitRole | null = null;
  let maximum = 0;
  for (const role of ROLE_ORDER) {
    const count = stack[role] ?? 0;
    if (count > maximum) {
      kept = role;
      maximum = count;
    }
  }
  return kept;
}

/**
 * An outpost only exposes the head count of its garrison, not a stack: only infantry
 * garrisons an outpost (design sheet 09), so the inventory reports it under that role.
 */
export function inventoryTroops(
  me: PlayerView['me'],
  arcs: ReadonlyArray<ArcView>,
): ReadonlyArray<TroopLine> {
  const lines: TroopLine[] = [];

  for (const [role, count] of countsOf(me.armyPresent)) {
    lines.push(line(`home-${role}`, role, count, { kind: 'home' }));
  }

  for (const arc of arcs) {
    if (arc.state !== 'mine') continue;
    for (const [role, count] of countsOf(arc.stack)) {
      lines.push(
        line(`${arc.id}-${role}`, role, count, {
          kind: 'movement',
          arcId: arc.id,
          movementType: arc.type,
          destination: arc.destinationLabel,
          minutesLeft: arc.minutesLeft,
        }),
      );
    }
  }

  for (const outpost of me.outposts) {
    if (!outpost.isMine || outpost.garrison <= 0) continue;
    lines.push(
      line(`${outpost.id}-garrison`, 'infantry', outpost.garrison, {
        kind: 'garrison',
        outpostId: outpost.id,
        hostCountry: outpost.hostCountry,
      }),
    );
  }

  return lines;
}

export function organizeTroops(
  lines: ReadonlyArray<TroopLine>,
  filter: TroopFilter,
  sort: TroopSort,
): ReadonlyArray<TroopLine> {
  const kept = lines.filter(
    (candidate) =>
      (filter.situation === 'all' || candidate.situation.kind === filter.situation) &&
      (filter.unitDomain === 'all' || candidate.unitDomain === filter.unitDomain),
  );
  return kept.sort(compare(sort));
}

export function countTroops(lines: ReadonlyArray<TroopLine>): number {
  return lines.reduce((sum, candidate) => sum + candidate.count, 0);
}

function line(
  key: string,
  role: UnitRole,
  count: number,
  situation: TroopSituation,
): TroopLine {
  return { key, role, unitDomain: DOMAIN_BY_ROLE[role], count, situation };
}

function countsOf(stack: PlayerView['me']['armyPresent']): ReadonlyArray<[UnitRole, number]> {
  return (Object.entries(stack) as ReadonlyArray<[UnitRole, number]>).filter(
    ([, count]) => count > 0,
  );
}

function compare(sort: TroopSort): (a: TroopLine, b: TroopLine) => number {
  switch (sort) {
    case 'role':
      return (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.count - a.count;
    case 'count':
      return (a, b) => b.count - a.count;
    case 'due':
      return (a, b) => dueMinutes(a) - dueMinutes(b);
  }
}

function dueMinutes(candidate: TroopLine): number {
  return candidate.situation.kind === 'movement'
    ? candidate.situation.minutesLeft
    : Number.POSITIVE_INFINITY;
}
