import { describe, expect, it } from 'vitest';
import { RESOURCES } from './ids';
import { horizonOf, ledgerNotesOf, ledgerOf } from './ledger';
import type { PlayerView } from './player-view';
import { armyUpkeep } from './upkeep';

/** Une nation qui nourrit, brûle, fond et écoute — chaque chiffre posé à la main, le débit net du
 *  bandeau en est la somme. */
const army = { troops: 14, unsupplied: 2 };
const food = armyUpkeep(army.troops - army.unsupplied, army.unsupplied);
const arsenal = {
  by: 'arsenal',
  output: 'ammunition',
  inputs: [
    { resource: 'coal', quantity: 1 },
    { resource: 'steel', quantity: 1 },
  ],
  perHour: 6,
  level: 2,
};

const view = {
  loadedAt: 1_000,
  me: {
    regions: [{ id: 'r1', name: 'Beauce' }],
    extraction: [
      { key: 'farm', regionId: 'r1', level: 2, deposit: 'food', perHour: 20, linked: true },
      { key: 'farm', regionId: 'r1', level: 1, deposit: 'food', perHour: 12, linked: true },
      { key: 'mine', regionId: 'r1', level: 2, deposit: 'coal', perHour: 12, linked: true },
      { key: 'mine', regionId: 'r1', level: 1, deposit: 'iron', perHour: 14, linked: true },
    ],
    chains: [arsenal],
    buildings: [
      { key: 'listening', regionId: 'r1' },
      { key: 'farm', regionId: 'r1' },
    ],
    outposts: [
      {
        isMine: true,
        standsAt: null,
        level: 1,
        regionId: 'r1',
        specialization: 'relay',
        disabledMinutesLeft: null,
      },
      {
        isMine: true,
        standsAt: null,
        level: 2,
        regionId: null,
        specialization: 'listening',
        disabledMinutesLeft: null,
      },
      {
        isMine: true,
        standsAt: 9_999,
        level: 3,
        regionId: null,
        specialization: 'listening',
        disabledMinutesLeft: null,
      },
      {
        isMine: false,
        standsAt: null,
        level: 3,
        regionId: null,
        specialization: 'relay',
        disabledMinutesLeft: null,
      },
    ],
    upkeep: { ...army, foodPerHour: food, outpostFoodPerHour: 3, listeningCoalPerHour: 2 },
    resources: {
      food: { ratePerHour: 32 - food - 3 },
      coal: { ratePerHour: 12 - 6 - 2 },
      steel: { ratePerHour: 14 - 6 },
      oil: { ratePerHour: 0 },
      ammunition: { ratePerHour: 6 },
    },
  },
} as unknown as PlayerView;

describe('the ledger', () => {
  it.each(RESOURCES)('closes on the net rate the band reads: %s', (resource) => {
    const ledger = ledgerOf(view, resource);
    expect(ledger.balance).toBeCloseTo(view.me.resources[resource].ratePerHour);
    expect(ledger.production + ledger.consumption).toBeCloseTo(ledger.balance);
  });

  it('details each category by rows that add up to its total', () => {
    for (const resource of RESOURCES)
      for (const section of ledgerOf(view, resource).sections)
        expect(section.rows.reduce((total, row) => total + row.perHour, 0)).toBeCloseTo(
          section.perHour,
        );
  });

  it('prices troops by step, double outside every anchor', () => {
    const troops = ledgerOf(view, 'food').sections.find((section) => section.id === 'troops')!;
    expect(troops.rows.map((row) => row.what)).toEqual([
      { kind: 'ranks', from: 1, to: 10, rate: 1, outside: false },
      { kind: 'ranks', from: 11, to: 12, rate: 2, outside: false },
      { kind: 'ranks', from: 13, to: 14, rate: 2, outside: true },
    ]);
  });

  it('counts only my standing outposts, and the listening ones that are in service', () => {
    const sections = (resource: 'food' | 'coal') => ledgerOf(view, resource).sections;
    expect(sections('food').find((s) => s.id === 'outposts')!.rows).toHaveLength(2);
    expect(sections('coal').find((s) => s.id === 'listening')!.rows).toHaveLength(2);
  });

  it('leaves a raided listening post out of the ticket', () => {
    const raided = {
      ...view,
      me: {
        ...view.me,
        buildings: [
          { key: 'listening', regionId: 'r1', disabled: true },
          ...view.me.buildings.slice(1),
        ],
      },
    } as unknown as PlayerView;
    expect(ledgerOf(raided, 'coal').sections.find((s) => s.id === 'listening')!.rows).toHaveLength(
      1,
    );
  });

  it('keeps the production out of consumption', () => {
    const coal = ledgerOf(view, 'coal');
    expect(coal.production).toBe(12);
    expect(coal.consumption).toBe(-8);
  });
});

describe('the horizon', () => {
  it('runs dry at a negative net, fills at a positive one, rests otherwise', () => {
    expect(horizonOf(100, 400, -10)).toEqual({ kind: 'dry', hours: 10 });
    expect(horizonOf(0, 400, 5)).toEqual({ kind: 'dry', hours: 0 });
    expect(horizonOf(100, 400, 30)).toEqual({ kind: 'full', hours: 10 });
    expect(horizonOf(400, 400, 30)).toEqual({ kind: 'steady' });
    expect(horizonOf(100, 400, 0)).toEqual({ kind: 'steady' });
  });
});

describe('what the ticket says beside its figures', () => {
  const with_ = (me: Record<string, unknown>) =>
    ({
      ...view,
      me: { ...view.me, constructionQueue: [], construction: null, starving: false, ...me },
    }) as unknown as PlayerView;
  const quiet = with_({ upkeep: { ...view.me.upkeep, listeningSilent: false } });

  it('says nothing of a reserve that runs', () => {
    expect(ledgerNotesOf(quiet, 'food')).toEqual([]);
  });

  it('says a starving nation stops recruiting and loses nothing', () => {
    expect(ledgerNotesOf(with_({ starving: true, upkeep: quiet.me.upkeep }), 'food')).toEqual([
      { kind: 'starving' },
    ]);
  });

  it('names a chain out of matter in the ticket of what it lacks and of what it makes', () => {
    const starved = with_({
      upkeep: quiet.me.upkeep,
      chains: [{ ...arsenal, state: 'starved', missing: 'coal' }],
    });
    const note = { kind: 'starvedChain', building: 'arsenal', missing: 'coal' };
    expect(ledgerNotesOf(starved, 'coal')).toContainEqual(note);
    expect(ledgerNotesOf(starved, 'ammunition')).toContainEqual(note);
    expect(ledgerNotesOf(starved, 'steel')).toEqual([]);
  });

  it('says the listening posts are silent in the coal ticket', () => {
    const silent = with_({ upkeep: { ...view.me.upkeep, listeningSilent: true } });
    expect(ledgerNotesOf(silent, 'coal')).toContainEqual({ kind: 'listeningSilent' });
  });

  it('says what to build when nothing fills a reserve', () => {
    expect(ledgerNotesOf(quiet, 'oil')).toEqual([{ kind: 'noProducer', producer: 'oilWell' }]);
    const queued = with_({
      upkeep: quiet.me.upkeep,
      constructionQueue: [{ key: 'oilWell' }],
    });
    expect(ledgerNotesOf(queued, 'oil')).toEqual([]);
  });
});
