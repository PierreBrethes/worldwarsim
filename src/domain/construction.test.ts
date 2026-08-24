import { describe, expect, it } from 'vitest';
import { buildableOn, upgradeHold, type Site } from './construction';
import { BUILDINGS, RESOURCES, type BuildingKey, type ResourceKey, type SeasonFormat } from './ids';
import { unlockLevel } from '../../convex/constants';
import type { Building, BuildSpec, PlayerView } from './player-view';

/** Everything open at a headquarters of 1: the tier is under test on its own, below. */
const CATALOG = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { alloy: 20 }, minutes: 30, unlockedAtHqLevel: 1 }]),
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
  constructionHere: false,
  foundation: [],
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

  /**
   * A key the headquarters has not reached is **not drawn**, never drawn grey: the panel is
   * contextual (ADR 0015), and a line that can only be refused teaches nothing about the ground
   * it sits on. What holds a line back today it still says — that is `hold`, not this.
   */
  it('does not offer a key the headquarters has not opened yet', () => {
    const gated: Record<BuildingKey, BuildSpec> = {
      ...CATALOG,
      airfield: { cost: { alloy: 20 }, minutes: 30, unlockedAtHqLevel: 3 },
    };
    expect(buildableOn(site({ hqLevel: 2 }), gated).map((option) => option.key)).not.toContain(
      'airfield',
    );
    expect(buildableOn(site({ hqLevel: 3 }), gated).map((option) => option.key)).toContain(
      'airfield',
    );
  });

  /**
   * **A format that never climbs cannot tier its catalogue.** A skirkish's run is one single
   * headquarters level, so `unlockLevel` puts projection at the launch: the port and the
   * aerodrome are there from the first minute. A campaign keeps them at 3, four levels of run
   * away. What paces a skirmish is alloy and time, not the headquarters.
   */
  it('opens projection at the launch of a skirmish and holds it back in a campaign', () => {
    const catalogOf = (format: SeasonFormat): Record<BuildingKey, BuildSpec> =>
      Object.fromEntries(
        BUILDINGS.map((key) => [
          key,
          { cost: { alloy: 20 }, minutes: 30, unlockedAtHqLevel: unlockLevel(key, format) },
        ]),
      ) as Record<BuildingKey, BuildSpec>;

    const offered = (format: SeasonFormat, hqLevel: number) =>
      buildableOn(site({ hqLevel, coastal: true }), catalogOf(format)).map((option) => option.key);

    expect(offered('skirmish', 2)).toEqual(expect.arrayContaining(['port', 'airfield']));
    expect(offered('campaign', 2)).not.toContain('port');
    expect(offered('campaign', 2)).not.toContain('airfield');
    expect(offered('campaign', 3)).toEqual(expect.arrayContaining(['port', 'airfield']));
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
      barracks: { cost: { alloy: 5 }, minutes: 10, unlockedAtHqLevel: 1 },
    };
    const options = buildableOn(site({ stocks: { ...BROKE, alloy: 5 } }), cheap);
    expect(options.find((option) => option.key === 'barracks')?.hold).toBeNull();
    expect(options.find((option) => option.key === 'billets')?.hold).toBe('materials');
  });

  it('leaves a payable line clickable', () => {
    expect(buildableOn(site(), CATALOG).every((option) => option.hold === null)).toBe(true);
  });
});

/**
 * **The lock belongs to the construction, not to the placement.** A key the format still owes
 * costs nothing, stands at once and opens no site, so a running one has nothing to hold — the
 * playtest of 19/08 lost two extractors and an arsenal behind a paid mill, and the server has
 * been aligned on the same reading (`convex/constructions.ts`).
 */
describe('a placement the foundation owes, while a construction runs', () => {
  const OWED: ReadonlyArray<BuildingKey> = ['foundry', 'warehouse'];

  it('leaves the offered lines alive and holds the paid ones', () => {
    const options = buildableOn(site({ constructionRunning: true, foundation: OWED }), CATALOG);
    const free = options.filter((option) => option.free);
    expect(free.map((option) => option.key)).toEqual(expect.arrayContaining([...OWED]));
    expect(free.every((option) => option.hold === null)).toBe(true);
    expect(
      options
        .filter((option) => !option.free)
        .every((option) => option.hold === 'constructionRunning'),
    ).toBe(true);
  });

  /** The ceiling is the one refusal the foundation does not buy off: it pays the price and the
   *  wait, never a place on the map. */
  it('still holds an offered line at the building ceiling', () => {
    const options = buildableOn(
      site({ constructionRunning: true, foundation: OWED, standingCount: 5, cap: 5 }),
      CATALOG,
    );
    expect(options.filter((option) => option.free).every((o) => o.hold === 'buildingCap')).toBe(
      true,
    );
  });

  /** The hole the global lock used to hide: the ground under a running site is reserved by
   *  nobody, and a free placement there would leave two buildings on one region. */
  it('offers nothing at all on the region the construction is rising on', () => {
    expect(
      buildableOn(
        site({ constructionRunning: true, constructionHere: true, foundation: OWED }),
        CATALOG,
      ),
    ).toEqual([]);
  });
});

describe('what holds a raise back', () => {
  const LOADED_AT = 1_000_000;

  const building = (overrides: Partial<Building> = {}): Building => ({
    id: 'building-1',
    key: 'foundry',
    name: 'Fonderie',
    regionId: 'FRA-5328',
    level: 1,
    nextLevelCost: { alloy: 90, coal: 54 },
    nextLevelMinutes: 90,
    cappedByHq: false,
    ...overrides,
  });

  const viewWith = (overrides: {
    stocks?: Partial<Record<ResourceKey, number>>;
    construction?: PlayerView['me']['construction'];
  }): PlayerView =>
    ({
      me: {
        construction: overrides.construction ?? null,
        resources: Object.fromEntries(
          RESOURCES.map((key) => [
            key,
            { stock: overrides.stocks?.[key] ?? 1000, ratePerHour: 0, cap: 1000 },
          ]),
        ),
      },
      loadedAt: LOADED_AT,
    }) as unknown as PlayerView;

  it('lets a payable raise through', () => {
    expect(upgradeHold(building(), viewWith({}), LOADED_AT)).toBeNull();
  });

  /** A single construction per player (ADR 0015): it holds every other raise, not just its own. */
  it('holds every raise while a construction runs', () => {
    const running = {
      name: 'Mine',
      key: 'mine' as const,
      regionId: 'FRA-5325',
      regionName: 'Meurthe-et-Moselle',
      minutesLeft: 20,
    };
    expect(upgradeHold(building(), viewWith({ construction: running }), LOADED_AT)).toEqual({
      kind: 'constructionRunning',
    });
  });

  it('reads the headquarters ceiling off the view rather than deciding it again', () => {
    expect(upgradeHold(building({ cappedByHq: true }), viewWith({}), LOADED_AT)).toEqual({
      kind: 'cappedByHq',
    });
  });

  /** The whole point of anticipating the refusal: the shortfall is named, never "impossible". */
  it('names the resource that is short, and by how much', () => {
    const hold = upgradeHold(building(), viewWith({ stocks: { coal: 12 } }), LOADED_AT);
    expect(hold).toEqual({ kind: 'materials', resource: 'coal', needed: 54, available: 12 });
  });

  it('reads the stock as it stands now, not as it was served', () => {
    const view = {
      me: {
        construction: null,
        resources: Object.fromEntries(
          RESOURCES.map((key) => [
            key,
            { stock: key === 'coal' ? 50 : 1000, ratePerHour: 60, cap: 1000 },
          ]),
        ),
      },
      loadedAt: LOADED_AT,
    } as unknown as PlayerView;
    expect(upgradeHold(building(), view, LOADED_AT)?.kind).toBe('materials');
    expect(upgradeHold(building(), view, LOADED_AT + 10 * 60_000)).toBeNull();
  });
});
