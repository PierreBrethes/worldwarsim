import { describe, expect, it } from 'vitest';
import { buildableOn, type Site } from './construction';
import { BUILDINGS, RESOURCES, type BuildingKey, type ResourceKey } from './ids';
import type { BuildSpec } from './player-view';

const CATALOG = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { alloy: 20 }, minutes: 30 }]),
) as Record<BuildingKey, BuildSpec>;

const RICH = Object.fromEntries(RESOURCES.map((key) => [key, 1000])) as Record<ResourceKey, number>;
const BROKE = Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>;

const site = (overrides: Partial<Site> = {}): Site => ({
  deposit: null,
  coastal: false,
  standing: null,
  standingCount: 2,
  cap: 5,
  hqLevel: 1,
  stocks: RICH,
  constructionRunning: false,
  ...overrides,
});

const keysOn = (overrides: Partial<Site> = {}): ReadonlyArray<BuildingKey> =>
  buildableOn(site(overrides), CATALOG).map((option) => option.key);

describe('what a region can carry', () => {
  it('offers a mine only where the deposit is a mine’s', () => {
    expect(keysOn({ deposit: 'coal' })).toContain('mine');
    expect(keysOn({ deposit: 'ore' })).toContain('mine');
    expect(keysOn({ deposit: 'oil' })).not.toContain('mine');
    expect(keysOn()).not.toContain('mine');
  });

  it('offers a port only on a coast', () => {
    expect(keysOn({ coastal: true })).toContain('port');
    expect(keysOn()).not.toContain('port');
  });

  it('never offers a second headquarters', () => {
    expect(keysOn({ hqLevel: 3 })).not.toContain('hq');
  });

  it('offers nothing but the headquarters when none stands', () => {
    expect(keysOn({ hqLevel: 0 })).toEqual(['hq']);
  });

  it('offers nothing at all on a region already taken — one building per region', () => {
    expect(keysOn({ standing: 'barracks' })).toEqual([]);
  });

  it('says why a building is offered, and stays silent when there is nothing to say', () => {
    const [mine] = buildableOn(site({ deposit: 'coal' }), CATALOG).filter((o) => o.key === 'mine');
    const [port] = buildableOn(site({ coastal: true }), CATALOG).filter((o) => o.key === 'port');
    const [barracks] = buildableOn(site(), CATALOG).filter((o) => o.key === 'barracks');
    expect(mine?.reason).toEqual({ kind: 'deposit', deposit: 'coal' });
    expect(port?.reason).toEqual({ kind: 'coastal' });
    expect(barracks?.reason).toBeNull();
  });
});

describe('what merely holds a line back', () => {
  it('keeps the lines when the ceiling is reached, and names the hold', () => {
    const options = buildableOn(site({ standingCount: 5, cap: 5 }), CATALOG);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.hold === 'buildingCap')).toBe(true);
  });

  it('keeps the lines while a construction runs', () => {
    const options = buildableOn(site({ constructionRunning: true }), CATALOG);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.hold === 'constructionRunning')).toBe(true);
  });

  it('holds only what the stocks cannot pay for', () => {
    const cheap: Record<BuildingKey, BuildSpec> = {
      ...CATALOG,
      barracks: { cost: { alloy: 5 }, minutes: 10 },
    };
    const options = buildableOn(site({ stocks: { ...BROKE, alloy: 5 } }), cheap);
    expect(options.find((option) => option.key === 'barracks')?.hold).toBeNull();
    expect(options.find((option) => option.key === 'billets')?.hold).toBe('materials');
  });

  it('leaves a payable line clickable', () => {
    expect(buildableOn(site(), CATALOG).every((option) => option.hold === null)).toBe(true);
  });
});
