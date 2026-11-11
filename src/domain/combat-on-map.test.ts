import { describe, expect, it } from 'vitest';
import {
  afloat,
  COMBAT_LIMITS,
  sceneDomain,
  sceneSpan,
  combatAt,
  FINAL_POSE_MS,
  freshCombats,
  scenesToPlay,
  homewardOf,
  playsWhole,
  reportOf,
  sceneOf,
  seatsTagOf,
  stampStays,
} from './combat-on-map';
import { SQUAD_DRAWN_WHOLE } from './pile-pieces';
import { troopSpan } from './piece-size';
import { REPLAY_MS, SINK_HOLD_MS, stepBounds } from './replay';
import type { ArcView, CombatReport, ReplayView } from './player-view';

const NOW = 1_800_000_000_000;
const report = (id: string, cause: CombatReport['cause'] = 'arrival', at = NOW - 1000) =>
  ({ id, cause, at, point: { lon: 4.9, lat: 49.7 } }) as CombatReport;

const view: ReplayView = {
  combatId: 'c1',
  at: 0,
  point: { lon: 4.9, lat: 49.7 },
  side: 'attacker',
  won: true,
  mine: [
    { role: 'infantry', tier: 1, troops: 2, lost: 120, routed: 0, destroyed: 1 },
    { role: 'armor', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 },
  ],
  theirs: { troops: 3, lost: 300, routed: 1, destroyed: 1 },
};

describe('scenesToPlay', () => {
  it('plays a fresh combat in Mondiale and none in a Blitz, so nothing is held there', () => {
    const known = new Set(['a']);
    expect(scenesToPlay(false, known, [report('b')], NOW).map((one) => one.id)).toEqual(['b']);
    expect(scenesToPlay(true, known, [report('b')], NOW)).toEqual([]);
  });
});

describe('freshCombats', () => {
  it('plays nothing on the first view', () => {
    expect(freshCombats(null, [report('a')], NOW)).toEqual([]);
  });

  it('plays the reports the view before did not have, an arrival or a bombardment (#325)', () => {
    const fresh = freshCombats(
      new Set(['a']),
      [report('a'), report('b'), report('c', 'interception'), report('d', 'bombardment')],
      NOW,
    );
    expect(fresh.map((each) => each.id)).toEqual(['b', 'd']);
  });

  it('plays no combat older than a replay and its margin: a laptop woken an hour later', () => {
    const fresh = freshCombats(
      new Set(),
      [report('old', 'arrival', NOW - 3_600_000), report('new', 'arrival', NOW - 2000)],
      NOW,
    );
    expect(fresh.map((each) => each.id)).toEqual(['new']);
  });
});

describe('playsWhole', () => {
  it('plays up to twelve pieces a side at the desk, six on a phone, and beyond only the final pose', () => {
    expect(SQUAD_DRAWN_WHOLE).toBe(12);
    const theirs = (troops: number) => ({ ...view, theirs: { ...view.theirs, troops } });
    expect(playsWhole(theirs(12), false)).toBe(true);
    expect(playsWhole(theirs(13), false)).toBe(false);
    expect(playsWhole(theirs(6), true)).toBe(true);
    expect(playsWhole(theirs(7), true)).toBe(false);
    const mine: ReplayView = {
      ...view,
      mine: [
        { role: 'infantry', tier: 1, troops: 7, lost: 0, routed: 0, destroyed: 0 },
        { role: 'armor', tier: 1, troops: 6, lost: 0, routed: 0, destroyed: 0 },
      ],
    };
    expect(playsWhole(mine, false)).toBe(false);
  });

  it('keeps three combats at once at the desk, one on a phone (décision de Pierre du 31/10)', () => {
    expect(COMBAT_LIMITS.desk.atOnce).toBe(3);
    expect(COMBAT_LIMITS.phone.atOnce).toBe(1);
  });
});

describe('combatAt', () => {
  const inStrike = stepBounds('frappe').start + 100;

  it('plays the replay at full motion, to its end', () => {
    const shown = combatAt(view, inStrike, 'full', true);
    expect(shown.frame.step).toBe('frappe');
    expect(shown.frame.progress).toBeLessThan(0.1);
    expect(shown.over).toBe(false);
    expect(combatAt(view, REPLAY_MS, 'full', true).over).toBe(true);
  });

  it('holds each of the six steps played out when reduced', () => {
    const shown = combatAt(view, inStrike, 'reduced', true);
    expect(shown.frame).toMatchObject({ step: 'frappe', progress: 1 });
    expect(shown.over).toBe(false);
  });

  it('shows the final pose alone when cut, and for a combat that does not play', () => {
    for (const shown of [combatAt(view, 0, 'off', true), combatAt(view, 0, 'full', false)]) {
      expect(shown.frame.step).toBe('compte-rendu');
      expect(shown.frame.pieces.filter((piece) => piece.fate === 'fallen')).toHaveLength(2);
      expect(shown.over).toBe(false);
    }
    expect(combatAt(view, FINAL_POSE_MS, 'off', true).over).toBe(true);
  });

  it('turns the routed about as they rout, and every survivor of the attacker home by the end', () => {
    // Mine: a man down, a man and a tank standing; theirs: one down, one routed, one standing.
    const before = combatAt(view, stepBounds('deroute').start, 'full', true).turns;
    expect(before).toEqual([0, 0, 0, 0, 0, 0]);
    const end = combatAt(view, REPLAY_MS - 1, 'full', true).turns;
    expect(end.map((turn) => Math.round(turn * 100) / 100)).toEqual([0, 1, 1, 0, 1, 0]);
    expect(combatAt(view, 0, 'off', true).turns).toEqual([0, 1, 1, 0, 1, 0]);
  });
});

describe('a scene where a hull sinks lasts past the six steps (#514)', () => {
  const sinking: ReplayView = {
    ...view,
    atSea: true,
    mine: [{ role: 'cargo', tier: 1, troops: 1, lost: 12, routed: 0, destroyed: 1 }],
    theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
  };

  it('holds the empty sea two seconds more, the stamp posed as the six steps end', () => {
    expect(combatAt(sinking, REPLAY_MS, 'full', true).over).toBe(false);
    expect(combatAt(sinking, REPLAY_MS + SINK_HOLD_MS - 1, 'full', true).over).toBe(false);
    expect(combatAt(sinking, REPLAY_MS + SINK_HOLD_MS, 'full', true).over).toBe(true);
    expect(combatAt(sinking, REPLAY_MS + 700, 'full', true).frame.overtime).toBe(700);
    expect(combatAt(sinking, REPLAY_MS - 1, 'full', true).reportDue).toBe(false);
    expect(combatAt(sinking, REPLAY_MS, 'full', true).reportDue).toBe(true);
  });

  it('leaves every other combat its six steps, and stamps it as its account begins', () => {
    expect(combatAt(view, REPLAY_MS, 'full', true).over).toBe(true);
    // At sea, with nothing of a ship going down but men: no overtime.
    const standing = { ...sinking, mine: [{ ...sinking.mine[0]!, destroyed: 0 }] };
    expect(combatAt(standing, REPLAY_MS, 'full', true).over).toBe(true);
    const account = stepBounds('compte-rendu').start;
    expect(combatAt(view, account - 1, 'full', true).reportDue).toBe(false);
    expect(combatAt(view, account, 'full', true).reportDue).toBe(true);
  });

  it('holds the six steps alone at reduced motion and in the final pose, the stamp with the account', () => {
    expect(combatAt(sinking, REPLAY_MS, 'reduced', true).over).toBe(true);
    expect(combatAt(sinking, 0, 'off', true).reportDue).toBe(true);
    expect(combatAt(sinking, 0, 'full', false).reportDue).toBe(true);
    expect(combatAt(sinking, stepBounds('frappe').start, 'reduced', true).reportDue).toBe(false);
  });
});

describe('homewardOf', () => {
  const arc = (
    from: readonly [number, number],
    next: readonly [number, number],
    state: ArcView['state'] = 'mine',
  ) => ({ state, from, to: next, route: { points: [from, next] } }) as unknown as ArcView;
  const point = { lon: 4.9, lat: 49.7 };

  it('reads home off the column that walks back from the point', () => {
    expect(
      homewardOf(point, [arc([10, 50], [11, 50]), arc([4.9, 49.7], [3, 49])], 'attacker'),
    ).toEqual([3, 49]);
    expect(homewardOf(point, [arc([10, 50], [11, 50])], 'attacker')).toBeNull();
  });

  it("reads the attacker's way home, never the routed defender's", () => {
    // Both columns walk back from the point: the defender routs east, the attacker goes west.
    const mineEast = arc([4.9, 49.7], [6, 50]);
    const theirsWest = arc([4.9, 49.7], [3, 49], 'enemyDetected');
    // The defender's own rout first: the defender reads the attacker's column, not his own.
    expect(homewardOf(point, [mineEast, theirsWest], 'defender')).toEqual([3, 49]);
    const mineWest = arc([4.9, 49.7], [3, 49]);
    const theirsEast = arc([4.9, 49.7], [6, 50], 'enemyDetected');
    expect(homewardOf(point, [theirsEast, mineWest], 'attacker')).toEqual([3, 49]);
  });
});

describe('reportOf', () => {
  const lose = (mine: ReplayView['mine'], over: Partial<ReplayView> = {}): ReplayView => ({
    ...view,
    mine,
    ...over,
  });

  it('reads the attacker who wins, then who loses', () => {
    expect(reportOf(view).title).toBe('position enlevée');
    expect(reportOf({ ...view, won: false }).title).toBe('attaque repoussée');
  });

  it('reads the defender who wins, then who loses', () => {
    expect(reportOf({ ...view, side: 'defender' }).title).toBe('position tenue');
    expect(reportOf({ ...view, side: 'defender', won: false }).title).toBe('position perdue');
  });

  it('is red when the reader wins, black when he loses', () => {
    expect(reportOf(view).won).toBe(true);
    expect(reportOf({ ...view, won: false }).won).toBe(false);
  });

  it('counts our own pieces lost, summed over the kinds, destroyed then routed', () => {
    const mine = [
      { role: 'infantry', tier: 1, troops: 3, lost: 5, routed: 1, destroyed: 2 },
      { role: 'armor', tier: 1, troops: 2, lost: 5, routed: 1, destroyed: 1 },
    ] as const;
    expect(reportOf(lose(mine)).losses).toBe('nos pièces : 3 détruites, 2 en déroute');
  });

  it('agrees in number, and drops the part that is zero', () => {
    const one = (destroyed: number, routed: number) =>
      lose([{ role: 'infantry', tier: 1, troops: 3, lost: 1, routed, destroyed }]);
    expect(reportOf(one(1, 0)).losses).toBe('nos pièces : 1 détruite');
    expect(reportOf(one(0, 2)).losses).toBe('nos pièces : 2 en déroute');
  });

  it('says no loss when nothing fell nor fled', () => {
    expect(
      reportOf(lose([{ role: 'infantry', tier: 1, troops: 3, lost: 0, routed: 0, destroyed: 0 }]))
        .losses,
    ).toBe('nos pièces : aucune perte');
  });
});

describe('stampStays', () => {
  it('stays when the camera arrives by the combat, goes when it arrives far from it', () => {
    expect(stampStays(2, 10)).toBe(true);
    expect(stampStays(30, 10)).toBe(false);
  });
});

/** My escort carrying a squad and a tank, against an escort and a cargo carrying men. */
const atSea: ReplayView = {
  ...view,
  mine: [
    { role: 'escort', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 },
    { role: 'infantry', tier: 1, troops: 2, lost: 0, routed: 0, destroyed: 0 },
    { role: 'armor', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 },
  ],
  theirs: { troops: 4, lost: 300, routed: 0, destroyed: 2 },
  faced: {
    nation: 'germany',
    forces: [
      { role: 'escort', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 1, strength: 100 },
      { role: 'cargo', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0, strength: 100 },
      { role: 'infantry', tier: 1, troops: 2, lost: 0, routed: 0, destroyed: 1, strength: 100 },
    ],
  },
};

describe('afloat', () => {
  it('keeps the ships of a sea combat: what they carry drowns in the dispatch, not on the map', () => {
    const ships = afloat({
      ...atSea,
      mine: [...atSea.mine, { ...atSea.mine[0]!, role: 'bomber' }],
    });
    expect(ships.mine.map((entry) => entry.role)).toEqual(['escort', 'bomber']);
    expect(ships.faced!.forces.map((force) => force.role)).toEqual(['escort', 'cargo']);
    expect(ships.theirs).toMatchObject({ troops: 2, destroyed: 1, routed: 0 });
  });

  it('leaves an unseen enemy as it was counted', () => {
    const { faced: _, ...unseen } = atSea;
    expect(afloat(unseen).theirs).toEqual(atSea.theirs);
  });
});

describe('sceneSpan', () => {
  it("reads a scene on its longest piece, never below a tank's", () => {
    expect(sceneSpan(view)).toBe(troopSpan('armor'));
    expect(sceneSpan(atSea)).toBe(troopSpan('cargo'));
  });
});

describe('sceneDomain', () => {
  it('reads the domain of the longest piece of a scene: a tank land, a cargo sea, a fighter air', () => {
    expect(sceneDomain(view)).toBe('land');
    expect(sceneDomain(atSea)).toBe('sea');
    const planes: ReplayView = {
      ...view,
      mine: [{ role: 'fighter', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
    };
    // Planes fighting over land keep the plane's own floor.
    expect(sceneDomain(planes)).toBe('air');
  });
});

describe('reportOf at sea', () => {
  it('says the engagement in words of the sea', () => {
    expect(reportOf(view, 'sea').title).toBe('engagement gagné');
    expect(reportOf({ ...view, won: false, side: 'defender' }, 'sea').title).toBe(
      'engagement perdu',
    );
    expect(reportOf(view).title).toBe('position enlevée');
  });
});

describe('the sinking told to the side that loses its passengers (#514)', () => {
  const sunk: ReplayView = {
    ...view,
    side: 'defender',
    won: false,
    mine: [
      { role: 'cargo', tier: 1, troops: 1, lost: 12, routed: 0, destroyed: 1 },
      { role: 'infantry', tier: 1, troops: 3, lost: 90, routed: 0, destroyed: 3 },
    ],
    drowned: { men: 100, machines: 48, seats: 9 },
  };
  const { drowned: _drowned, ...seen } = sunk;

  it('stamps « coulés en mer » over an engagement lost with its cargo', () => {
    expect(reportOf(sunk, 'sea').title).toBe('coulés en mer');
    // The other side sees the ship go down and was told nothing of the cargo.
    expect(reportOf(seen, 'sea').title).toBe('engagement perdu');
  });

  it('keeps « engagement gagné » on an engagement won, the line under it telling the sea took pieces', () => {
    const won = { ...sunk, won: true };
    expect(reportOf(won, 'sea').title).toBe('engagement gagné');
    expect(reportOf(won, 'sea').losses).toBe('nos pièces : 1 détruite, 3 coulées en mer');
    expect(reportOf(sunk, 'sea').losses).toBe('nos pièces : 1 détruite, 3 coulées en mer');
    expect(reportOf(seen, 'sea').losses).toBe('nos pièces : 4 détruites');
  });

  it("tags the hull with the sign of the pile's label and the seats it carried, of those it had", () => {
    expect(seatsTagOf(sunk)).toEqual({ sign: 'CGO', whole: 'CGO · 9/12' });
    expect(seatsTagOf(seen)).toBeNull();
  });

  it('counts the seats of the hulls that carried, in one tag for the point', () => {
    const fleet = (seats: number) => ({
      ...sunk,
      mine: [
        { role: 'carrier' as const, tier: 1 as const, troops: 1, lost: 6, routed: 0, destroyed: 1 },
        { role: 'cargo' as const, tier: 1 as const, troops: 2, lost: 24, routed: 0, destroyed: 2 },
      ],
      drowned: { men: 100, machines: 48, seats },
    });
    // Nine seats fit the one biggest hull: the others sank empty.
    expect(seatsTagOf(fleet(9))?.whole).toBe('CGO · 9/12');
    // Fifteen take two cargos; the carrier did not carry.
    expect(seatsTagOf(fleet(15))?.whole).toBe('CGO · 15/24');
    // Thirty fill both cargos and the carrier: the sign is the most loaded hull's.
    expect(seatsTagOf(fleet(30))).toEqual({ sign: 'CGO', whole: 'CGO · 30/30' });
  });

  it('signs a lone carrier by its own abbreviation', () => {
    const carrier = {
      ...sunk,
      mine: [
        { role: 'carrier' as const, tier: 1 as const, troops: 1, lost: 6, routed: 0, destroyed: 1 },
      ],
      drowned: { men: 5, machines: 0, seats: 5 },
    };
    expect(seatsTagOf(carrier)).toEqual({ sign: 'PAV', whole: 'PAV · 5/6' });
  });
});

/** **Le bombardement sur la carte** (#325) : chez le tireur, la scène au point de la cible ne pose
 *  que le camp d'en face — sa batterie reste sa pile —, chez la cible, ses seules pièces. */
describe('a bombardment on the map', () => {
  const shelled: ReplayView = {
    ...view,
    mine: [{ role: 'artillery', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
    bombardment: { from: { lon: 4.0, lat: 49.5 } },
  };
  it("stands the shooter's target alone, its battery staying in its pile", () => {
    expect(sceneOf(shelled).mine).toEqual([]);
    expect(sceneOf(shelled).theirs).toEqual(shelled.theirs);
    expect(sceneOf(view)).toBe(view);
    const target = { ...shelled, side: 'defender' as const, bombardment: {} };
    expect(sceneOf(target)).toBe(target);
  });
  it('stamps a hit for the shooter, shelled for the target', () => {
    expect(reportOf(shelled).title).toBe('coup au but');
    expect(reportOf({ ...shelled, side: 'defender', bombardment: {} }).title).toBe('pilonnés');
  });
});
