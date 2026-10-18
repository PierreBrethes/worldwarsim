import { describe, expect, it } from 'vitest';
import { seasonReportOf, type ReportInput } from './season-report';

const HOUR = 3_600_000;
const LAUNCH = 1_000 * HOUR;

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  launchedAt: LAUNCH,
  now: LAUNCH + 48 * HOUR,
  stepHours: 24,
  bound: 150,
  players: [
    { id: 'a', nation: 'france', nickname: 'Alice' },
    { id: 'b', nation: 'usa', nickname: 'Bob' },
    { id: 'n', nation: null, nickname: 'irregular', irregular: true },
  ],
  editions: [],
  troops: [],
  queued: {},
  outposts: [],
  engagements: [],
  ...over,
});

const edition = (playerId: string, hour: number, industry: number, military: number) => ({
  playerId,
  at: LAUNCH + hour * HOUR,
  territory: 50,
  industry,
  military,
});

describe('marks', () => {
  it('cuts the season every step and ends on the reading hour', () => {
    expect(seasonReportOf(input({ now: LAUNCH + 60 * HOUR })).marks).toEqual([24, 48, 60]);
    expect(seasonReportOf(input()).marks).toEqual([24, 48]);
  });
});

describe('snowball', () => {
  it("reads the richest player's share of army and production at each mark", () => {
    const report = seasonReportOf(
      input({
        editions: [
          edition('a', 20, 100, 100),
          edition('b', 20, 100, 100),
          edition('a', 44, 300, 600),
          edition('b', 44, 100, 200),
        ],
      }),
    );
    expect(report.snowball).toEqual([
      { hour: 24, edition: 20, leaderId: 'a', lead: 1, army: 50, production: 50, territory: 50 },
      {
        hour: 48,
        edition: 44,
        leaderId: 'a',
        lead: 900 / 300,
        army: 75,
        production: 75,
        territory: 50,
      },
    ]);
  });

  it('takes the last edition at or before a mark and skips marks without any', () => {
    const report = seasonReportOf(input({ editions: [edition('a', 30, 10, 10)] }));
    expect(report.snowball.map((row) => row.hour)).toEqual([48]);
  });
});

const troop = (
  playerId: string,
  place: string,
  where: 'home' | 'abroad' | 'marching' = 'home',
) => ({
  playerId,
  place,
  where,
});

describe('turtle, squad and load', () => {
  const report = seasonReportOf(
    input({
      troops: [
        troop('a', 'building:1'),
        troop('a', 'building:1'),
        troop('a', 'outpost:9', 'abroad'),
        troop('b', 'march:3', 'marching'),
        troop('b', 'march:3', 'marching'),
        troop('b', 'march:3', 'marching'),
        troop('n', 'point:1,2', 'abroad'),
      ],
      queued: { a: 4 },
    }),
  );

  it('counts troops by where they stand, the neutral seat apart', () => {
    expect(report.troops).toEqual([
      { playerId: 'a', total: 3, home: 2, abroad: 1, marching: 0 },
      { playerId: 'b', total: 3, home: 0, abroad: 0, marching: 3 },
    ]);
  });

  it('finds the biggest squad: same place, or the same column on the road', () => {
    expect(report.squads).toEqual([
      { playerId: 'a', largest: 2, where: 'home' },
      { playerId: 'b', largest: 3, where: 'marching' },
    ]);
  });

  it('weighs pieces, queue included, against the bound', () => {
    expect(report.load).toEqual([
      { playerId: 'a', pieces: 3, queued: 4, bound: 150 },
      { playerId: 'b', pieces: 3, queued: 0, bound: 150 },
    ]);
  });
});

const outpost = (
  playerId: string,
  hour: number,
  kind: 'stands' | 'raised' | 'dismantled' | 'captured' | 'taken' | 'lost',
) => ({ playerId, at: LAUNCH + hour * HOUR, kind });

describe('outposts', () => {
  const report = seasonReportOf(
    input({
      outposts: [
        outpost('a', 2, 'stands'),
        outpost('a', 5, 'stands'),
        outpost('a', 7, 'lost'),
        outpost('a', 9, 'raised'),
        outpost('a', 30, 'dismantled'),
        outpost('b', 10, 'stands'),
        outpost('a', 40, 'taken'),
        outpost('b', 40, 'captured'),
      ],
    }),
  );
  const rowOf = (id: string) => report.outposts.find((row) => row.playerId === id);

  it('follows the standing count at each mark and keeps the peak between them', () => {
    expect(rowOf('a')).toMatchObject({ series: [2, 0], standing: 0, peak: 2 });
    expect(rowOf('b')).toMatchObject({ series: [1, 2], standing: 2, peak: 2 });
  });

  it('counts foundations and elevations apart, for the build-or-raise question', () => {
    expect(rowOf('a')).toMatchObject({ founded: 2, raised: 1, dismantled: 1, taken: 1, lost: 1 });
    expect(rowOf('b')).toMatchObject({ founded: 1, raised: 0, captured: 1 });
  });
});

describe('isolation', () => {
  const at = (hour: number) => LAUNCH + hour * HOUR;
  const report = seasonReportOf(
    input({
      players: [
        { id: 'a', nation: 'france', nickname: 'Alice' },
        { id: 'b', nation: 'usa', nickname: 'Bob' },
        { id: 'c', nation: 'ussr', nickname: 'Chloé' },
        { id: 'n', nation: null, nickname: 'irregular', irregular: true },
      ],
      engagements: [
        { attackerId: 'a', defenderId: 'c', at: at(10) },
        { attackerId: 'c', defenderId: 'a', at: at(6) },
        { attackerId: 'a', defenderId: 'c', at: at(12) },
        { attackerId: 'b', defenderId: 'n', at: at(3) },
      ],
    }),
  );
  const rowOf = (nation: string) => report.isolation.find((row) => row.nation === nation);

  it('counts engagements given and suffered per nation, against whom, and the first contact', () => {
    expect(rowOf('france')).toEqual({
      nation: 'france',
      given: 2,
      suffered: 1,
      vsNeutral: 0,
      firstContact: 6,
      against: { ussr: 3 },
    });
    expect(rowOf('ussr')).toMatchObject({ given: 1, suffered: 2, firstContact: 6 });
  });

  it('keeps a nation nobody touched in the table, and neutral garrisons out of contact', () => {
    expect(rowOf('usa')).toEqual({
      nation: 'usa',
      given: 0,
      suffered: 0,
      vsNeutral: 1,
      firstContact: null,
      against: {},
    });
  });
});
