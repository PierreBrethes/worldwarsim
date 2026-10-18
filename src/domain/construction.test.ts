import { describe, expect, it } from 'vitest';
import {
  blockedOn,
  buildableOn,
  outpostRaiseHold,
  placementOf,
  riseOf,
  upgradeHold,
  workSitesOf,
  type OutpostRaise,
  type Site,
} from './construction';
import {
  BUILDABLE_BUILDINGS,
  BUILDINGS,
  RESOURCES,
  type BuildingKey,
  type ResourceKey,
} from './ids';
import { unlockLevel } from '../../convex/constants';
import type { Building, BuildSpec, Cost, PlayerView } from './player-view';

/** Everything open at a headquarters of 1: the tier is under test on its own, below. */
const CATALOG = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { steel: 20 }, minutes: 30, unlockedAtHqLevel: 1 }]),
) as Record<BuildingKey, BuildSpec>;

const RICH = Object.fromEntries(RESOURCES.map((key) => [key, 1000])) as Record<ResourceKey, number>;
const BROKE = Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>;

const site = (overrides: Partial<Site> = {}): Site => ({
  deposit: null,
  coastal: false,
  standing: null,
  site: { outpostId: null },
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

  it('partitions the current catalogue with the offer, whatever the ground', () => {
    for (const overrides of [
      {},
      { deposit: 'coal' as const },
      { coastal: true },
      { hqLevel: 0 },
      { standing: 'farm' as const },
      { constructionHere: true },
      { stocks: BROKE },
    ]) {
      const offered = keysOn(overrides);
      const blocked = blockedKeys(overrides);
      expect([...offered, ...blocked].sort()).toEqual([...BUILDABLE_BUILDINGS].sort());
    }
  });

  // An empty warehouse is a hold, not a fact about the ground: it must not move a single
  // line onto the shelf, or the panel would teach the region wrong.
  it('leaves a held line in the offer rather than on the shelf', () => {
    expect(blockedKeys({ stocks: BROKE })).toEqual(blockedKeys());
  });

  it('names the deposit a mine wants, not a bare refusal', () => {
    expect(reasonFor('mine')).toEqual({ kind: 'deposit', deposits: ['coal', 'iron'] });
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
    expect(port?.cost).toEqual({ steel: 20 });
    expect(port?.minutes).toBe(30);
  });
});

describe('what a region can carry', () => {
  it('offers a mine only where the deposit is a mine’s', () => {
    expect(keysOn({ deposit: 'coal' })).toContain('mine');
    expect(keysOn({ deposit: 'iron' })).toContain('mine');
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
      airfield: { cost: { steel: 20 }, minutes: 30, unlockedAtHqLevel: 3 },
    };
    expect(buildableOn(site({ hqLevel: 2 }), gated).map((option) => option.key)).not.toContain(
      'airfield',
    );
    expect(buildableOn(site({ hqLevel: 3 }), gated).map((option) => option.key)).toContain(
      'airfield',
    );
  });

  /**
   * **The real ladder, read off `unlockLevel`.** Projection travels with the age of the army
   * since the 04/09 (66a): the port and the airfield open one level above the one the season
   * plants, and the catalogue offers them the minute it gets there.
   */
  it('holds projection back until the headquarters reaches its level', () => {
    const catalog = Object.fromEntries(
      BUILDINGS.map((key) => [
        key,
        { cost: { steel: 20 }, minutes: 30, unlockedAtHqLevel: unlockLevel(key) },
      ]),
    ) as Record<BuildingKey, BuildSpec>;

    const offered = (hqLevel: number) =>
      buildableOn(site({ hqLevel, coastal: true }), catalog).map((option) => option.key);

    expect(offered(1)).not.toContain('port');
    expect(offered(1)).not.toContain('airfield');
    expect(offered(unlockLevel('port'))).toEqual(expect.arrayContaining(['port', 'airfield']));
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
  it('holds only what the stocks cannot pay for', () => {
    const cheap: Record<BuildingKey, BuildSpec> = {
      ...CATALOG,
      barracks: { cost: { steel: 5 }, minutes: 10, unlockedAtHqLevel: 1 },
    };
    const options = buildableOn(site({ stocks: { ...BROKE, steel: 5 } }), cheap);
    expect(options.find((option) => option.key === 'barracks')?.hold).toBeNull();
    expect(options.find((option) => option.key === 'airfield')?.hold).toBe('materials');
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
  /** Une dette est un couple : elle ne s'acquitte que sur son gisement, donc le sol de ces cas
   *  porte celui qu'elle nomme. */
  const OWED = [{ key: 'mine', deposit: 'coal' }] as const;
  const owedSite = (overrides: Partial<Site> = {}): Partial<Site> => ({
    deposit: 'coal',
    foundation: OWED,
    ...overrides,
  });

  it('leaves every line clickable while chantiers are queued elsewhere', () => {
    const options = buildableOn(site(owedSite()), CATALOG);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.hold === null)).toBe(true);
  });

  /** The ground under an entry of the queue is reserved by it: a free placement there would
   *  leave two buildings on one region once the `finish` lands. */
  it('offers nothing at all on the region an entry of the queue aims at', () => {
    expect(buildableOn(site(owedSite({ constructionHere: true })), CATALOG)).toEqual([]);
  });

  /**
   * **La dette que le sol ne nomme pas** : le quartier général (décision 1b du 13/09). À zéro,
   * il est la seule chose qu'on offre — et il est offert sur n'importe quelle région, gisement
   * ou non, ce qui est exactement la liberté que la décision achète.
   */
  const HQ_OWED = [{ key: 'hq', deposit: null }] as const;

  it('offers the headquarters alone while it is owed, and on any ground', () => {
    for (const deposit of [null, 'coal'] as const) {
      const options = buildableOn(site({ hqLevel: 0, deposit, foundation: HQ_OWED }), CATALOG);
      expect(options.map((option) => option.key)).toEqual(['hq']);
      expect(options[0]).toMatchObject({ free: true, cost: {}, minutes: 0, hold: null });
    }
  });

  /** Et plus jamais ensuite : rien ne remplace un quartier général debout. */
  it('stops offering it the moment one stands', () => {
    expect(keysOn({ hqLevel: 1, foundation: [] })).not.toContain('hq');
  });
});

describe('what holds a raise back', () => {
  const LOADED_AT = 1_000_000;

  const building = (overrides: Partial<Building> = {}): Building => ({
    id: 'building-1',
    key: 'arsenal',
    name: 'Arsenal',
    regionId: 'FRA-5328',
    point: null,
    level: 1,
    nextLevelCost: { steel: 90, coal: 54 },
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
      outpostId: null,
      point: null,
      minutesLeft: 20,
    };
    expect(upgradeHold(building(), viewWith({ construction: running }), LOADED_AT)).toBeNull();
  });

  it('holds a raise the queue already carries for this very region', () => {
    const queued = [
      {
        id: 'construction-2',
        name: 'Arsenal',
        key: 'arsenal' as const,
        outpostId: null,
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
        { cost: { steel: 20 }, minutes: 30, unlockedAtHqLevel: overrides[key] ?? 1 },
      ]),
    ) as Record<BuildingKey, BuildSpec>;

  const estate = (overrides: {
    regions?: PlayerView['me']['regions'];
    buildings?: ReadonlyArray<{ key: BuildingKey; regionId: string }>;
    hqLevel?: number;
    foundation?: PlayerView['me']['foundation'];
    construction?: PlayerView['me']['construction'];
    queue?: PlayerView['me']['constructionQueue'];
    unlocked?: Partial<Record<BuildingKey, number>>;
  }): PlayerView =>
    ({
      me: {
        hqLevel: overrides.hqLevel ?? 1,
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
    point: [0, 0],
    linked: true,
    buildings: [],
    site: { outpostId: null },
    ...extra,
  });

  it('keeps only the regions whose deposit the exploitation works', () => {
    const view = estate({
      regions: [region('a', { deposit: 'coal' }), region('b'), region('c', { deposit: 'iron' })],
    });
    expect(placementOf(view, 'mine').regionIds).toEqual(['a', 'c']);
    expect(placementOf(view, 'farm').regionIds).toEqual([]);
  });

  it('names the deposit when no ground holds it', () => {
    const view = estate({ regions: [region('a')] });
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

  it('names a ground that is simply taken', () => {
    expect(
      placementOf(
        estate({
          regions: [region('a', { buildings: [{ key: 'farm', level: 1 }] })],
          buildings: [{ key: 'farm', regionId: 'a' }],
        }),
        'barracks',
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
        outpostId: null,
        regionId: 'a',
        regionName: 'a',
        point: null,
        minutesLeft: 10,
      },
    });
    expect(placementOf(view, 'barracks').regionIds).toEqual(['b']);
  });

  /** And so is one a **queued** entry aims at: it is paid for, and the server refuses a second
   *  entry on it exactly as it refuses one under the crane. */
  it('leaves out the region an entry of the queue aims at', () => {
    const queued = [
      {
        id: 'construction-2',
        name: 'Ferme',
        key: 'farm' as const,
        outpostId: null,
        regionId: 'a',
        regionName: 'a',
        level: 1,
      },
    ];
    const view = estate({ regions: [region('a'), region('b')], queue: queued });
    expect(placementOf(view, 'barracks').regionIds).toEqual(['b']);
  });

  it('marks a key the foundation still owes as free', () => {
    const view = estate({
      regions: [region('a', { deposit: 'iron' })],
      foundation: [{ key: 'mine', deposit: 'iron' }],
    });
    expect(placementOf(view, 'mine')).toMatchObject({ free: true, condition: null });
    expect(placementOf(view, 'warehouse').free).toBe(false);
  });

  /** The estate reading and the per-region reading are the same rule: whatever `placementOf`
   *  hands the map, the panel opened on that very region has to offer. */
  it('agrees with the region panel, region by region', () => {
    const view = estate({
      regions: [region('a', { deposit: 'coal' }), region('b', { coastal: true }), region('c')],
      foundation: [{ key: 'mine', deposit: 'coal' }],
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
                site: { outpostId: null },
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

it('offers warehouse alone and keeps depot off the reference shelf', () => {
  expect(keysOn()).toContain('warehouse');
  expect(keysOn()).not.toContain('depot');
  expect(blockedOn(site(), CATALOG).map((option) => option.key)).not.toContain('depot');
});

/**
 * **Ce qui empêche de monter un avant-poste** (précision du 15/09 de l'ADR 0020 §10). La
 * fonction est lue par les deux bouts — le bouton du panneau de garnison et la mutation qui met
 * en file — donc elle se tient ici, seule, avec ses quatre empêchements et leur ordre.
 */
describe('raising an outpost', () => {
  const STOCKED: Record<ResourceKey, number> = Object.fromEntries(
    RESOURCES.map((key) => [key, 1000]),
  ) as Record<ResourceKey, number>;

  const point = (over: Partial<OutpostRaise> = {}): OutpostRaise => ({
    level: 1,
    disabled: false,
    queued: false,
    stocks: STOCKED,
    ...over,
  });

  const COST: Cost = { steel: 117, coal: 36 };

  it('lets a payable raise through', () => {
    expect(outpostRaiseHold(point(), COST, 3)).toBeNull();
  });

  it('names the ceiling at the last level, and the figure with it', () => {
    expect(outpostRaiseHold(point({ level: 3 }), COST, 3)).toEqual({
      kind: 'maxLevel',
      maximum: 3,
    });
  });

  /** **On ne rénove pas sous le feu** (décision 3a) : l'état, pas une perte — le point revient. */
  it('refuses a point a raid has put out of service', () => {
    expect(outpostRaiseHold(point({ disabled: true }), COST, 3)).toEqual({ kind: 'disabled' });
  });

  /** Une seconde élévation attendrait un niveau que la première n'a pas atteint, donc tarifé
   *  faux : une seule à la fois, par point. */
  it('refuses a second raise while the first is queued', () => {
    expect(outpostRaiseHold(point({ queued: true }), COST, 3)).toEqual({ kind: 'alreadyQueued' });
  });

  /** Le premier manque dans l'ordre des ressources, jamais une liste : une facture se paie
   *  entière ou pas du tout. */
  it('names the first resource short, and only it', () => {
    const short = point({ stocks: { ...STOCKED, steel: 40, coal: 0 } });
    expect(outpostRaiseHold(short, COST, 3)).toEqual({
      kind: 'materials',
      resource: 'steel',
      needed: 117,
      available: 40,
    });
  });

  /** L'ordre compte : un point au maximum n'a pas de facture à présenter, et un point hors
   *  service ne doit pas s'entendre reprocher sa caisse. */
  it('puts the ceiling and the disabling ahead of the bill', () => {
    const broke = {
      stocks: Object.fromEntries(RESOURCES.map((key) => [key, 0])),
    } as Partial<OutpostRaise>;
    expect(outpostRaiseHold(point({ level: 3, ...broke }), COST, 3)?.kind).toBe('maxLevel');
    expect(outpostRaiseHold(point({ disabled: true, ...broke }), COST, 3)?.kind).toBe('disabled');
  });
});

describe('riseOf', () => {
  it('reads how far a site has risen from the minutes left out of the minutes it lasts', () => {
    expect(riseOf(30, 30)).toBe(0);
    expect(riseOf(27, 30)).toBeCloseTo(0.1);
    expect(riseOf(3, 30)).toBeCloseTo(0.9);
    expect(riseOf(0, 30)).toBe(1);
  });

  it('never overflows when the clock or the scale disagree with the site', () => {
    expect(riseOf(-5, 30)).toBe(1);
    expect(riseOf(45, 30)).toBe(0);
    expect(riseOf(0, 0)).toBe(1);
  });
});

describe('workSitesOf', () => {
  const LOADED = 1_000_000;
  const me = (over: Partial<PlayerView['me']>) =>
    ({
      buildings: [
        { id: 'b-arsenal', key: 'arsenal', regionId: 'r-f', level: 2, nextLevelMinutes: 90 },
      ],
      construction: null,
      constructionQueue: [],
      ...over,
    }) as unknown as PlayerView['me'];
  const head = (key: BuildingKey | 'outpost', regionId: string, minutesLeft: number) => ({
    id: 'w',
    name: key,
    key,
    outpostId: null,
    regionId,
    regionName: 'Marne',
    point: null,
    minutesLeft,
  });
  const queued = (
    key: BuildingKey | 'outpost',
    regionId: string,
    level: number,
    outpostId: string | null = null,
  ) => ({
    id: `q-${regionId}`,
    name: key,
    key,
    outpostId,
    regionId,
    regionName: 'Meuse',
    level,
  });

  it('dates the head of the queue — a first level rises by the catalog, a raise by the building', () => {
    expect(workSitesOf(me({ construction: head('farm', 'r-a', 10) }), CATALOG, LOADED)).toEqual([
      expect.objectContaining({
        phase: 'rising',
        key: 'farm',
        regionId: 'r-a',
        level: 1,
        finishesAt: LOADED + 600_000,
        minutes: 30,
      }),
    ]);
    expect(workSitesOf(me({ construction: head('arsenal', 'r-f', 45) }), CATALOG, LOADED)).toEqual([
      expect.objectContaining({
        phase: 'raising',
        key: 'arsenal',
        level: 3,
        finishesAt: LOADED + 2_700_000,
        minutes: 90,
      }),
    ]);
  });

  it('plans a queued first level by its rank and leaves it undated; a queued raise draws nothing', () => {
    const sites = workSitesOf(
      me({
        construction: head('farm', 'r-a', 10),
        constructionQueue: [
          queued('warehouse', 'r-b', 1),
          queued('arsenal', 'r-f', 3),
          queued('barracks', 'r-c', 1),
        ],
      }) as PlayerView['me'],
      CATALOG,
      LOADED,
    );
    expect(sites.map((site) => [site.phase, site.regionId, site.rank, site.finishesAt])).toEqual([
      ['rising', 'r-a', 0, LOADED + 600_000],
      ['queued', 'r-b', 1, null],
      ['queued', 'r-c', 3, null],
    ]);
  });

  it("leaves an outpost's works to its own mast", () => {
    const outpost = { ...head('outpost', 'r-o', 5), outpostId: 'o1' };
    expect(
      workSitesOf(
        me({
          construction: outpost,
          constructionQueue: [queued('outpost', 'r-p', 2, 'o2')],
        }) as PlayerView['me'],
        CATALOG,
        LOADED,
      ),
    ).toEqual([]);
  });
});
