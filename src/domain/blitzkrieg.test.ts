import { describe, expect, it } from 'vitest';
import { chainRefusalOf, secondTargetRefusalOf } from './blitzkrieg';
import type { BuildingKey, UnitRole } from './ids';
import type { Column, MovementAim } from './movement-orders';

const column = (roles: ReadonlyArray<UnitRole>, held: Partial<Column> = {}): Column => ({
  roles,
  myRegionIds: new Set(),
  myOutpostIds: new Set(['bastogne']),
  departureBuildings: new Set<BuildingKey>(),
  afloat: false,
  coastal: false,
  ...held,
});

const outpost = (outpostId: string): MovementAim => ({
  kind: 'outpost',
  outpostId,
  hostCountry: 'BEL',
  coastal: false,
});
const LIEGE = outpost('liege');
const NAMUR = outpost('namur');
const BASTOGNE = outpost('bastogne');
const ROAD = [{ medium: 'land' as const }];
const FERRY = [{ medium: 'land' as const }, { medium: 'sea' as const }];
const ATTACK = { type: 'attack' as const, mission: { kind: 'march' } };
const tanks = column(['armor']);

describe('the blitzkrieg (ADR 0039 §6)', () => {
  it('chains a plain German attack ashore, and nothing else', () => {
    expect(chainRefusalOf('blitzkrieg', ATTACK, ROAD)).toBeNull();
    /** The route is not known yet while the hand hovers: the gate waits for it. */
    expect(chainRefusalOf('blitzkrieg', ATTACK, null)).toBeNull();
    expect(chainRefusalOf(null, ATTACK, ROAD)).toBe('NO_BLITZKRIEG');
    expect(chainRefusalOf('carrierDoctrine', ATTACK, ROAD)).toBe('NO_BLITZKRIEG');
    expect(chainRefusalOf('blitzkrieg', { ...ATTACK, type: 'march' }, ROAD)).toBe(
      'CHAIN_ATTACK_ONLY',
    );
    expect(chainRefusalOf('blitzkrieg', { ...ATTACK, type: 'raid' }, ROAD)).toBe(
      'CHAIN_ATTACK_ONLY',
    );
    /** A capture is an attack with a mission: it does not chain. */
    expect(chainRefusalOf('blitzkrieg', { ...ATTACK, mission: { kind: 'capture' } }, ROAD)).toBe(
      'CHAIN_ATTACK_ONLY',
    );
    expect(chainRefusalOf('blitzkrieg', ATTACK, FERRY)).toBe('CHAIN_ASHORE_ONLY');
    expect(chainRefusalOf('blitzkrieg', ATTACK, [{ medium: 'air' }])).toBe('CHAIN_ASHORE_ONLY');
  });

  it('takes as second target what an attack may aim at, from the first', () => {
    const first = { aim: LIEGE, legs: ROAD };
    expect(secondTargetRefusalOf('blitzkrieg', first, NAMUR, tanks)).toBe(null);
    expect(secondTargetRefusalOf('blitzkrieg', first, BASTOGNE, tanks)).toBe('FRIENDLY_TARGET');
    expect(secondTargetRefusalOf('blitzkrieg', first, LIEGE, tanks)).toBe('SAME_TARGET');
    expect(
      secondTargetRefusalOf('blitzkrieg', first, NAMUR, {
        ...tanks,
        outOfRounds: true,
      }),
    ).toBe('NO_ROUNDS');
    expect(secondTargetRefusalOf(null, first, NAMUR, tanks)).toBe('NO_BLITZKRIEG');
    expect(secondTargetRefusalOf('blitzkrieg', { aim: LIEGE, legs: FERRY }, NAMUR, tanks)).toBe(
      'CHAIN_ASHORE_ONLY',
    );
  });

  it('tells two points apart by where they are', () => {
    const point = (lon: number): MovementAim => ({
      kind: 'point',
      lon,
      lat: 50,
      ground: 'land',
      coastal: false,
      surveyed: true,
    });
    const first = { aim: point(5), legs: ROAD };
    expect(secondTargetRefusalOf('blitzkrieg', first, point(5), tanks)).toBe('SAME_TARGET');
    expect(secondTargetRefusalOf('blitzkrieg', first, point(6), tanks)).toBeNull();
  });
});
