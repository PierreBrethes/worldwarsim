import { describe, expect, it } from 'vitest';
import { blockedOn, buildableOn, placementOf, upgradeHold, type Site } from './construction';
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
  constructionHere: false,
  foundation: [],
  ...overrides,
});

const keysOn = (overrides: Partial<Site> = {}): ReadonlyArray<BuildingKey> =>
  buildableOn(site(overrides), CATALOG).map((option) => option.key);

describe('the rest of the catalogue', () => {
  const blockedKeys = (overrides: Partial<Site> = {}): ReadonlyArray<BuildingKey> =>
    blockedOn(site(overrides), CATALOG).map((option) => option.key);

  const reasonFor = (key: BuildingKey, overrides: Partial<Site> = {}) =>
    blockedOn(site(overrides), CATALOG).find((option) => option.key === key)?.reason;

  it('partitions the fifteen with the offer, whatever the ground', () => {
    for (const overrides of [
      {},
      { deposit: 'coal' as const },
      { coastal: true },
      { hqLevel: 0 },
      { standing: 'farm' as const },
      { constructionHere: true },
      { standingCount: 5, cap: 5 },
    ]) {
      const offered = keysOn(overrides);
      const blocked = blockedKeys(overrides);
      expect([...offered, ...blocked].sort()).toEqual([...BUILDINGS].sort());
    }
  });

  // A ceiling and an empty warehouse are holds, not facts about the ground: they must not
  // move a single line onto the shelf, or the panel would teach the region wrong.
  it('leaves a held line in the offer rather than on the shelf', () => {
    expect(blockedKeys({ standingCount: 5, cap: 5 })).toEqual(blockedKeys());
    expect(blockedKeys({ stocks: BROKE })).toEqual(blockedKeys());
  });

  it('names the deposit a mine wants, not a bare refusal', () => {
    expect(reasonFor('mine')).toEqual({ kind: 'deposit', deposits: ['coal', 'ore'] });
    expect(reasonFor('port')).toEqual({ kind: 'coastal' });
  });

  it('names the tier the headquarters has not reached', () => {
    const gated = { ...CATALOG, airfield: { ...CATALOG.airfield, unlockedAtHqLevel: 3 } };
    const [airfield] = blockedOn(site({ hqLevel: 2 }), gated).filter((o) => o.key === 'airfield');
    expect(airfield?.reason).toEqual({ kind: 'locked', hqLevel: 3 });
  });

  it('says a second headquarters is one too many', () => {
    expect(reasonFor('hq', { hqLevel: 2 })).toEqual({ kind: 'unique' });
  });

  it('says what the region already carries', () => {
    expect(reasonFor('farm', { standing: 'farm', deposit: 'food' })).toEqual({ kind: 'standing' });
    expect(reasonFor('barracks', { standing: 'farm' })).toEqual({
      kind: 'regionTaken',
      by: 'farm',
    });
  });

  it('serves the bill of what it cannot place — that is what a plan is made of', () => {
    const [port] = blockedOn(site(), CATALOG).filter((option) => option.key === 'port');
    expect(port?.cost).toEqual({ alloy: 20 });
    expect(port?.minutes).toBe(30);
  });
});

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
 * **A running site holds nothing back any more** (25/08): the queue is unbounded and paid at
 * the enqueue, so what is left of the holds is the ceiling and the bill. What survives of the
 * old rule is the ground — one entry per region, standing or queued.
 */
describe('a placement the foundation owes, beside a queue', () => {
  const OWED: ReadonlyArray<BuildingKey> = ['foundry', 'warehouse'];

  it('leaves every line clickable while chantiers are queued elsewhere', () => {
    const options = buildableOn(site({ foundation: OWED }), CATALOG);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.hold === null)).toBe(true);
  });

  /**
   * **The ceiling does not hold an owed line either, since 25/08.** It did, and a debt of the
   * format then became unpayable by a rule of the format — a campaign at headquarters 1 carries
   * five buildings, and an American ground is owed five extractors. The paid lines behind it
   * are still held: the debt outranks the ambition, the ambition waits for the headquarters.
   */
  it('lets an offered line through at the building ceiling, and holds the paid ones', () => {
    const options = buildableOn(site({ foundation: OWED, standingCount: 5, cap: 5 }), CATALOG);
    const free = options.filter((option) => option.free);
    expect(free.map((option) => option.key)).toEqual(expect.arrayContaining([...OWED]));
    expect(free.every((option) => option.hold === null)).toBe(true);
    expect(
      options.filter((option) => !option.free).every((option) => option.hold === 'buildingCap'),
    ).toBe(true);
  });

  /** The ground under an entry of the queue is reserved by it: a free placement there would
   *  leave two buildings on one region once the `finish` lands. */
  it('offers nothing at all on the region an entry of the queue aims at', () => {
    expect(buildableOn(site({ constructionHere: true, foundation: OWED }), CATALOG)).toEqual([]);
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
    queue?: PlayerView['me']['constructionQueue'];
  }): PlayerView =>
    ({
      me: {
        construction: overrides.construction ?? null,
        constructionQueue: overrides.queue ?? [],
        buildings: [],
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

  /** The queue is unbounded and prepaid (25/08), so a chantier elsewhere holds nothing: what
   *  a raise still waits on is an entry already aimed at its own region. */
  it('lets a raise through while a chantier runs on another region', () => {
    const running = {
      id: 'construction-1',
      name: 'Mine',
      key: 'mine' as const,
      regionId: 'FRA-5325',
      regionName: 'Meurthe-et-Moselle',
      minutesLeft: 20,
    };
    expect(upgradeHold(building(), viewWith({ construction: running }), LOADED_AT)).toBeNull();
  });

  it('holds a raise the queue already carries for this very region', () => {
    const queued = [
      {
        id: 'construction-2',
        name: 'Fonderie',
        key: 'foundry' as const,
        regionId: 'FRA-5328',
        regionName: 'Moselle',
        level: 2,
      },
    ];
    expect(upgradeHold(building(), viewWith({ queue: queued }), LOADED_AT)).toEqual({
      kind: 'alreadyQueued',
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
        constructionQueue: [],
        buildings: [],
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

/**
 * Where a key goes down over the whole of a player's ground — the rule the mobilisation order
 * highlights with and the supply chart writes its conditions from. It must never offer ground
 * `constructions.start` would refuse, nor refuse for a reason the panel would not repeat.
 */
describe('placement over the whole estate', () => {
  const catalog = (overrides: Partial<Record<BuildingKey, number>> = {}) =>
    Object.fromEntries(
      BUILDINGS.map((key) => [
        key,
        { cost: { alloy: 20 }, minutes: 30, unlockedAtHqLevel: overrides[key] ?? 1 },
      ]),
    ) as Record<BuildingKey, BuildSpec>;

  const estate = (overrides: {
    regions?: PlayerView['me']['regions'];
    buildings?: ReadonlyArray<{ key: BuildingKey; regionId: string }>;
    hqLevel?: number;
    cap?: number;
    foundation?: ReadonlyArray<BuildingKey>;
    construction?: PlayerView['me']['construction'];
    queue?: PlayerView['me']['constructionQueue'];
    unlocked?: Partial<Record<BuildingKey, number>>;
  }): PlayerView =>
    ({
      me: {
        hqLevel: overrides.hqLevel ?? 1,
        buildingCap: overrides.cap ?? 5,
        foundation: overrides.foundation ?? [],
        construction: overrides.construction ?? null,
        constructionQueue: overrides.queue ?? [],
        buildings: overrides.buildings ?? [],
        regions: overrides.regions ?? [],
      },
      buildCatalog: catalog(overrides.unlocked),
    }) as unknown as PlayerView;

  const region = (
    id: string,
    extra: Partial<PlayerView['me']['regions'][number]> = {},
  ): PlayerView['me']['regions'][number] => ({
    id,
    name: id,
    deposit: null,
    coastal: false,
    buildings: [],
    ...extra,
  });

  it('keeps only the regions whose deposit the exploitation works', () => {
    const view = estate({
      regions: [region('a', { deposit: 'coal' }), region('b'), region('c', { deposit: 'ore' })],
    });
    expect(placementOf(view, 'mine').regionIds).toEqual(['a', 'c']);
    expect(placementOf(view, 'farm').regionIds).toEqual([]);
  });

  it('names the deposit when no ground holds it, and never the ceiling first', () => {
    const view = estate({ regions: [region('a')], cap: 0 });
    expect(placementOf(view, 'oilWell').condition).toEqual({ kind: 'deposit', deposits: ['oil'] });
  });

  /** The tier is the one refusal a player can always act on — it must outrank the ground. */
  it('names the headquarters level a locked key waits on', () => {
    const view = estate({
      regions: [region('a', { coastal: true })],
      unlocked: { port: 3 },
    });
    expect(placementOf(view, 'port').condition).toEqual({ kind: 'locked', hqLevel: 3 });
  });

  it('separates a ceiling from a ground that is simply taken', () => {
    const carriable = [region('a'), region('b')];
    expect(placementOf(estate({ regions: carriable, cap: 0 }), 'billets').condition).toEqual({
      kind: 'cap',
    });
    expect(
      placementOf(
        estate({
          regions: [region('a', { buildings: [{ key: 'farm', level: 1 }] })],
          buildings: [{ key: 'farm', regionId: 'a' }],
        }),
        'billets',
      ).condition,
    ).toEqual({ kind: 'regionsTaken' });
  });

  /** A region under the crane is taken though nothing stands on it — the server refuses it
   *  (`constructions.start`), so the order must not light it up. */
  it('leaves out the region a construction is rising on', () => {
    const view = estate({
      regions: [region('a'), region('b')],
      construction: {
        id: 'construction-1',
        name: 'Ferme',
        key: 'farm',
        regionId: 'a',
        regionName: 'a',
        minutesLeft: 10,
      },
    });
    expect(placementOf(view, 'billets').regionIds).toEqual(['b']);
  });

  /** And so is one a **queued** entry aims at: it is paid for, and the server refuses a second
   *  entry on it exactly as it refuses one under the crane. */
  it('leaves out the region an entry of the queue aims at, and counts it against the ceiling', () => {
    const queued = [
      {
        id: 'construction-2',
        name: 'Ferme',
        key: 'farm' as const,
        regionId: 'a',
        regionName: 'a',
        level: 1,
      },
    ];
    const view = estate({ regions: [region('a'), region('b')], queue: queued });
    expect(placementOf(view, 'billets').regionIds).toEqual(['b']);

    const full = estate({ regions: [region('a'), region('b')], queue: queued, cap: 1 });
    expect(placementOf(full, 'billets').condition).toEqual({ kind: 'cap' });
  });

  it('marks a key the foundation still owes as free', () => {
    const view = estate({ regions: [region('a')], foundation: ['warehouse'] });
    expect(placementOf(view, 'warehouse')).toMatchObject({ free: true, condition: null });
    expect(placementOf(view, 'depot').free).toBe(false);
  });

  /** The estate reading and the per-region reading are the same rule: whatever `placementOf`
   *  hands the map, the panel opened on that very region has to offer. */
  it('agrees with the region panel, region by region', () => {
    const view = estate({
      regions: [region('a', { deposit: 'coal' }), region('b', { coastal: true }), region('c')],
      foundation: ['mine'],
    });
    for (const key of BUILDINGS) {
      const offered = new Set(
        view.me.regions
          .filter((candidate) =>
            buildableOn(
              site({
                deposit: candidate.deposit,
                coastal: candidate.coastal,
                standing: candidate.buildings[0]?.key ?? null,
                standingCount: view.me.buildings.length,
                cap: view.me.buildingCap,
                hqLevel: view.me.hqLevel,
                foundation: view.me.foundation,
              }),
              view.buildCatalog,
            ).some((option) => option.key === key && option.hold === null),
          )
          .map((candidate) => candidate.id),
      );
      expect(new Set(placementOf(view, key).regionIds)).toEqual(offered);
    }
  });
});
