import { describe, expect, it } from 'vitest';
import {
  BLITZ,
  CARRY_CAPACITY_BY_ROLE,
  contactKm,
  detectionRangeOf,
  GARRISON_DAMAGE_TAKEN,
  MAX_HQ_LEVEL,
  nominalStrength,
  recruitmentCost,
} from '../../convex/constants';
import { fireReachOf } from './indirect-fire';
import { levelGain } from './level-speed';
import { minutesPer1000KmOf } from './pace';
import type { TroopView } from './player-view';
import { buildingStats, PIECES, pileStats, scaleOf, shareOn, troopStats } from './stat-sheet';
import { THEATRES } from './theatres';

const europe = THEATRES[0];
const rowOf = <Key extends string>(rows: ReadonlyArray<{ key: Key; reading: unknown }>, key: Key) =>
  rows.find((row) => row.key === key)?.reading;

const troop = (id: string, role: TroopView['role'], extra: Partial<TroopView> = {}): TroopView =>
  ({
    id,
    role,
    tier: 1,
    strength: nominalStrength(role, 1),
    nominalStrength: nominalStrength(role, 1),
    stationedAt: { kind: 'home' },
    supplied: true,
    ...extra,
  }) as TroopView;

describe('scaleOf', () => {
  it('spans the whole game: the strongest and the weakest piece', () => {
    const strengths = PIECES.map(({ role, tier }) => nominalStrength(role, tier));
    expect(scaleOf('strength', null)).toEqual({
      min: Math.min(...strengths),
      max: Math.max(...strengths),
    });
  });

  it('reads the pace off the same function as a movement', () => {
    const { min, max } = scaleOf('pace', null);
    expect(min).toBe(minutesPer1000KmOf(['cargo'], null));
    expect(max).toBe(minutesPer1000KmOf(['infantry'], null));
  });

  it('reads the Blitz distances as a share of the theatre', () => {
    const pacific = THEATRES[2];
    const { max } = scaleOf('detection', pacific);
    expect(max).toBe(detectionRangeOf(['carrier'], pacific));
    expect(max).not.toBe(detectionRangeOf(['carrier'], null));
  });
});

describe('shareOn', () => {
  it('puts the best of the game at one, whatever the direction', () => {
    const pace = scaleOf('pace', null);
    expect(shareOn('pace', pace.min, pace)).toBe(1);
    expect(shareOn('pace', pace.max, pace)).toBe(0);
    const strength = scaleOf('strength', null);
    expect(shareOn('strength', strength.max, strength)).toBe(1);
  });

  it('keeps a value outside the scale on its edge', () => {
    expect(shareOn('strength', 10_000, { min: 0, max: 10 })).toBe(1);
  });
});

describe('troopStats', () => {
  it('says in words what has no scale', () => {
    const infantry = troopStats('infantry', 1, null);
    expect(rowOf(infantry, 'reach')).toEqual({
      kind: 'word',
      word: 'contact',
      km: contactKm(null),
    });
    expect(rowOf(infantry, 'fuel')).toEqual({ kind: 'word', word: 'walks' });
    expect(rowOf(troopStats('landTransport', 1, null), 'rounds')).toEqual({
      kind: 'word',
      word: 'noFire',
    });
  });

  it('scales the artillery reach and keeps its dead zone', () => {
    expect(rowOf(troopStats('artillery', 1, null), 'reach')).toMatchObject({
      kind: 'scaled',
      value: fireReachOf(null).rangeKm,
      floor: fireReachOf(null).deadZoneKm,
    });
  });

  it('omits what the piece does not have', () => {
    expect(troopStats('infantry', 1, null).map((row) => row.key)).not.toContain('seats');
    expect(troopStats('landTransport', 1, null).map((row) => row.key)).toEqual(
      expect.arrayContaining(['seats', 'load', 'loot']),
    );
  });

  it('prices a Mondiale troop in resources and a Blitz one in funds', () => {
    expect(rowOf(troopStats('armor', 2, null), 'cost')).toMatchObject({
      kind: 'price',
      costs: recruitmentCost('armor', 2).costs,
    });
    expect(rowOf(troopStats('armor', 2, europe), 'cost')).toMatchObject({
      kind: 'funds',
      amount: BLITZ.rolePrice.armor,
    });
  });

  it('has neither crans nor loot in a Blitz', () => {
    const keys = troopStats('cargo', 1, europe).map((row) => row.key);
    for (const absent of ['fuel', 'rounds', 'load', 'loot'] as const)
      expect(keys).not.toContain(absent);
    expect(keys).toContain('reload');
  });

  it('gives the bigger piece the longer bar', () => {
    const share = (role: 'infantry' | 'carrier') =>
      (rowOf(troopStats(role, 1, null), 'strength') as { share: number }).share;
    expect(share('infantry')).toBeGreaterThan(share('carrier'));
  });
});

describe('pileStats', () => {
  const context = { mode: 'mondiale', theatre: null, armyTroops: 3, lootCarried: 0 } as const;
  const pace = (rows: ReturnType<typeof pileStats>) =>
    (rowOf(rows, 'pace') as { value: number }).value;

  it('walks at the pace of the infantry, rolls when the truck seats them', () => {
    const walking = pileStats(
      [
        troop('a', 'infantry'),
        troop('b', 'infantry'),
        troop('c', 'infantry'),
        troop('t', 'landTransport'),
      ],
      context,
    );
    const rolling = pileStats(
      [troop('a', 'infantry'), troop('b', 'infantry'), troop('t', 'landTransport')],
      context,
    );
    expect(pace(walking)).toBe(minutesPer1000KmOf(['infantry'], null));
    expect(pace(rolling)).toBe(minutesPer1000KmOf(['landTransport'], null));
  });

  it('reads the held crans against their ceiling', () => {
    const rows = pileStats(
      [troop('t', 'landTransport', { supplies: { rounds: 0, fuel: 3 } })],
      context,
    );
    expect(rowOf(rows, 'fuel')).toMatchObject({ kind: 'scaled', value: 3, of: 4 });
  });

  it('counts the free seats and the loot capacity', () => {
    const rows = pileStats(
      [troop('t', 'landTransport'), troop('i', 'infantry', { carriedBy: 't' })],
      { ...context, lootCarried: 12 },
    );
    expect(rowOf(rows, 'seats')).toMatchObject({ value: 1, of: 2 });
    expect(rowOf(rows, 'loot')).toMatchObject({
      value: 12,
      of: CARRY_CAPACITY_BY_ROLE.landTransport + CARRY_CAPACITY_BY_ROLE.infantry,
    });
  });

  it('prints what the ranks of the pile eat: the last two of twelve cost two each', () => {
    const rows = pileStats([troop('a', 'infantry'), troop('b', 'armor')], {
      ...context,
      armyTroops: 12,
    });
    expect(rowOf(rows, 'upkeep')).toEqual({ kind: 'figure', value: 4 });
  });

  it('keeps Blitz free of crans, loot and upkeep', () => {
    const rows = pileStats([troop('a', 'fighter')], { ...context, mode: 'blitz', theatre: europe });
    expect(rows.map((row) => row.key)).toEqual(['pace', 'detection', 'reach']);
  });
});

describe('buildingStats', () => {
  const base = { level: 2, nextLevelCost: { steel: 80 }, nextLevelMinutes: 40, cappedByHq: false };
  const mondiale = { mode: 'mondiale', perHour: null } as const;

  it('gives a forming site the effect of its level and what it forms', () => {
    const rows = buildingStats({ ...base, key: 'barracks' }, mondiale);
    expect(rowOf(rows, 'levelGain')).toMatchObject({ value: levelGain(2) });
    expect(rowOf(rows, 'forms')).toEqual({
      kind: 'roles',
      roles: ['infantry', 'armor', 'landTransport', 'artillery'],
    });
    expect(rowOf(rows, 'protection')).toEqual({
      kind: 'figure',
      value: Math.round(GARRISON_DAMAGE_TAKEN * 100),
    });
  });

  it('says the cap in words and the next level otherwise', () => {
    expect(
      rowOf(buildingStats({ ...base, key: 'mine', cappedByHq: true }, mondiale), 'raise'),
    ).toEqual({
      kind: 'word',
      word: 'cappedByHq',
    });
    expect(rowOf(buildingStats({ ...base, key: 'mine' }, mondiale), 'raise')).toEqual({
      kind: 'raise',
      costs: { steel: 80 },
      minutes: 40,
    });
  });

  it('scales a production against the best level of the best deposit', () => {
    const rows = buildingStats({ ...base, key: 'farm' }, { ...mondiale, perHour: 24 });
    expect(rowOf(rows, 'production')).toMatchObject({ value: 24, share: 24 / (12 * MAX_HQ_LEVEL) });
  });

  it('asks nothing of a Blitz site but its capture', () => {
    const keys = buildingStats({ ...base, key: 'hq' }, { mode: 'blitz', perHour: null }).map(
      (row) => row.key,
    );
    expect(keys).not.toContain('raise');
    expect(keys).toContain('capture');
  });

  it('gives a listening post its radius and its coal', () => {
    expect(buildingStats({ ...base, key: 'listening' }, mondiale).map((row) => row.key)).toEqual(
      expect.arrayContaining(['listening', 'consumption']),
    );
  });
});
