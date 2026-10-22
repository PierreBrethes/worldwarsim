import { describe, expect, it } from 'vitest';
import type { MapMarker } from './labels';
import type { ArcView } from './player-view';
import { clusterSheetOf, pinsOf } from './pins';

const MY_INK = '#2a5ba8';

const stack = {
  kind: 'stack',
  id: 'pile-1',
  lonLat: [2, 48],
  station: {
    kind: 'point',
    lonLat: [2, 48],
    country: 'FRA',
    afloat: false,
    ground: 'land',
    coastal: false,
  },
  ink: MY_INK,
} as unknown as MapMarker;
const building = {
  kind: 'building',
  id: 'barracks-1',
  lonLat: null,
  regionId: 'FRA-5333',
  ink: MY_INK,
} as unknown as MapMarker;
const outpost = {
  kind: 'outpost',
  id: 'outpost-1',
  lonLat: [4, 50],
  ink: MY_INK,
} as unknown as MapMarker;
const camp = (extra: object = {}) =>
  ({
    kind: 'camp',
    id: 'camp-1',
    campId: 'c1',
    lonLat: [7, 49],
    medium: 'land',
    lastKnown: false,
    since: 1000,
    seenMinutesAgo: null,
    lastSeenAt: null,
    ...extra,
  }) as unknown as MapMarker;
const installation = {
  kind: 'installation',
  id: 'installation-1',
  lonLat: [8, 50],
  washed: true,
  neutral: null,
} as unknown as MapMarker;
const deposit = { kind: 'deposit', id: 'deposit-1', lonLat: [1, 1] } as unknown as MapMarker;

const arc = (state: ArcView['state'], extra: object = {}) =>
  ({ state, id: `arc-${state}`, ...extra }) as unknown as ArcView;

describe('pinsOf — what a pin far away says', () => {
  it('pins each of my pieces at my ink, by its shape: a pile round, a building square, an outpost a diamond', () => {
    expect(pinsOf([stack, building, outpost], [], MY_INK)).toEqual([
      {
        id: 'pile-1',
        anchor: { kind: 'ground', lonLat: [2, 48] },
        shape: 'pile',
        side: 'mine',
        ink: MY_INK,
      },
      {
        id: 'barracks-1',
        anchor: { kind: 'region', regionId: 'FRA-5333' },
        shape: 'building',
        side: 'mine',
        ink: MY_INK,
      },
      {
        id: 'outpost-1',
        anchor: { kind: 'ground', lonLat: [4, 50] },
        shape: 'outpost',
        side: 'mine',
        ink: MY_INK,
      },
    ]);
  });

  it('pins a surveyed force or building without its nation, and what the map does not put down not at all', () => {
    expect(pinsOf([camp(), installation, deposit], [], MY_INK)).toEqual([
      { id: 'camp-1', anchor: { kind: 'ground', lonLat: [7, 49] }, shape: 'pile', side: 'seen' },
      {
        id: 'installation-1',
        anchor: { kind: 'ground', lonLat: [8, 50] },
        shape: 'building',
        side: 'seen',
      },
    ]);
  });

  it('gives the holder of Lisbon the nation it serves him (P11), and no one else', () => {
    expect(pinsOf([camp({ nation: 'germany' })], [], MY_INK)[0]).toMatchObject({
      side: 'seen',
      nation: 'germany',
    });
  });

  it('greys a last known position with its hour, Lisbon or not', () => {
    expect(
      pinsOf([camp({ lastKnown: true, lastSeenAt: 5000, nation: 'germany' })], [], MY_INK),
    ).toEqual([
      {
        id: 'camp-1',
        anchor: { kind: 'ground', lonLat: [7, 49] },
        shape: 'pile',
        side: 'lost',
        seenAt: 5000,
      },
    ]);
  });

  it('pins a movement at its head and says it moves; a frozen one where it was last seen', () => {
    expect(
      pinsOf(
        [],
        [
          arc('mine'),
          arc('enemyDetected', { nation: 'italy' }),
          arc('lastKnown', { lastSeenAt: 7000, nation: 'italy' }),
          arc('seaControl'),
        ],
        MY_INK,
      ),
    ).toEqual([
      {
        id: 'arc-mine',
        anchor: { kind: 'movementHead', arc: 'arc-mine' },
        shape: 'pile',
        side: 'mine',
        ink: MY_INK,
        moving: true,
      },
      {
        id: 'arc-enemyDetected',
        anchor: { kind: 'movementHead', arc: 'arc-enemyDetected' },
        shape: 'pile',
        side: 'seen',
        nation: 'italy',
        moving: true,
      },
      {
        id: 'arc-lastKnown',
        anchor: { kind: 'movementHead', arc: 'arc-lastKnown' },
        shape: 'pile',
        side: 'lost',
        seenAt: 7000,
      },
    ]);
  });

  it('marks a building of mine still under the crane, and not one raising a level', () => {
    const site = { ...building, id: 'site-1', level: null } as unknown as MapMarker;
    const raised = { ...building, id: 'barracks-2', level: 2 } as unknown as MapMarker;
    expect(pinsOf([site, raised], [], MY_INK).map((pin) => 'works' in pin)).toEqual([true, false]);
  });
});

describe('clusterSheetOf — what a cluster says when it is opened', () => {
  it('counts my piles, buildings and outposts, and says a cluster is approached', () => {
    expect(
      clusterSheetOf(['stack', 'stack', 'stack', 'building', 'construction', 'outpost']),
    ).toEqual({
      kicker: 'grappe · 6 pièces à vous',
      lines: ['3 piles posées', '2 bâtiments', '1 avant-poste'],
      note: 'On ne lève pas une grappe : on approche, et elle s’ouvre en figurines.',
    });
  });

  it('counts what was surveyed, and nothing of what it is', () => {
    expect(clusterSheetOf(['camp', 'camp', 'intel', 'installation'])).toEqual({
      kicker: 'grappe · 4 relevés',
      lines: ['3 forces relevées', '1 bâtiment relevé'],
      note: 'On ne lève pas une grappe : on approche, et elle s’ouvre en figurines.',
    });
  });
});
