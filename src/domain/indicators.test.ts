import { describe, expect, it } from 'vitest';
import type { MapLabel } from './labels';
import {
  clearOfColumns,
  glideToward,
  slideAxisOf,
  CATEGORY_BY_TYPE,
  DEFAULT_TOGGLES,
  layerOf,
  EDGE_MARGIN,
  alertMark,
  clampToEdge,
  cluster,
  idleConstruction,
  strongestMark,
  type RawIndicator,
} from './indicators';

const WIDTH = 1000;
const HEIGHT = 600;
const NOW = 1_700_000_000_000;

const raw = (override: Partial<RawIndicator>): RawIndicator => ({
  id: 'i-1',
  category: 'outposts',
  priority: 1,
  x: 0,
  y: 0,
  reach: 0,
  ...override,
});

const label = (override: Partial<MapLabel>): MapLabel => ({
  id: 'e-1',
  type: 'inbound-movement',
  priority: 5,
  anchor: { kind: 'movementHead', arc: 'mv-1' },
  reach: null,
  force: null,
  works: null,
  washed: false,
  installation: null,
  camp: null,
  objective: null,
  strategic: null,
  ink: null,
  pictogram: null,
  plate: null,
  lootSightingId: null,
  lootCurrent: true,
  lines: [],
  identified: false,
  idle: false,
  building: null,
  station: null,
  hostCountry: null,
  ...override,
});

describe('toggles', () => {
  // Buildings, deposits, objectives and the outposts zones govern the board itself; inbound is
  // the only alert. Everything else only parks at the edge, under one « hors champ » bascule.
  it('lights the board layers and inbound on first load, not the rest of the edge', () => {
    expect(Object.entries(DEFAULT_TOGGLES).filter(([, on]) => on)).toEqual([
      ['buildings', true],
      ['deposits', true],
      ['objectives', true],
      ['outpost-zones', true],
      ['inbound', true],
      ['city-names', true],
    ]);
  });

  it('files the neutral objectives under their own layer, and every surveyed opponent under intel', () => {
    expect(CATEGORY_BY_TYPE.objective).toBe('objectives');
    expect(CATEGORY_BY_TYPE.camp).toBe('intel');
    expect(CATEGORY_BY_TYPE.installation).toBe('intel');
  });

  it('puts every edge category that changes nothing on the board under « hors champ »', () => {
    const offscreen = Object.values(CATEGORY_BY_TYPE).filter((c) => layerOf(c) === 'offscreen');
    expect(new Set(offscreen)).toEqual(
      new Set(['outposts', 'constructions', 'forces', 'my-movements', 'intel']),
    );
    expect(layerOf('buildings')).toBe('buildings');
    expect(layerOf('inbound')).toBe('inbound');
  });
});

describe('clampToEdge', () => {
  it('parks the anchor inside the inner rectangle', () => {
    const edge = clampToEdge(4000, -900, WIDTH, HEIGHT);
    expect(edge.x).toBeLessThanOrEqual(WIDTH - EDGE_MARGIN);
    expect(edge.y).toBeGreaterThanOrEqual(EDGE_MARGIN);
  });

  it('keeps the real heading rather than the reached edge’s', () => {
    // Due east and barely north: the touched edge is the right one, heading stays ~0.
    const edge = clampToEdge(9000, HEIGHT / 2 - 10, WIDTH, HEIGHT);
    expect(Math.abs(edge.heading)).toBeLessThan(0.01);
    expect(edge.x).toBeCloseTo(WIDTH - EDGE_MARGIN, 6);
  });

  it('sends a dead-center anchor out through the bottom rather than dividing by zero', () => {
    const edge = clampToEdge(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT);
    expect(Number.isFinite(edge.x)).toBe(true);
    expect(edge.y).toBeCloseTo(HEIGHT - EDGE_MARGIN, 6);
  });
});

describe('cluster', () => {
  const RIGHT = WIDTH - EDGE_MARGIN;
  const BOTTOM = HEIGHT - EDGE_MARGIN;

  it('folds every indicator of a category on one edge into a single token, however far apart', () => {
    const groups = cluster(
      [raw({ id: 'a', x: RIGHT, y: 60 }), raw({ id: 'b', x: RIGHT, y: 540 })],
      WIDTH,
      HEIGHT,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members).toEqual(['a', 'b']);
  });

  it('keeps one token per edge', () => {
    const groups = cluster(
      [raw({ id: 'a', x: RIGHT, y: 300 }), raw({ id: 'b', x: 500, y: BOTTOM })],
      WIDTH,
      HEIGHT,
    );
    expect(groups.map((group) => group.id).sort()).toEqual(['outposts:bottom', 'outposts:right']);
  });

  it('never merges two different categories', () => {
    const groups = cluster(
      [raw({ id: 'a', x: RIGHT, y: 100 }), raw({ id: 'b', category: 'forces', x: RIGHT, y: 101 })],
      WIDTH,
      HEIGHT,
    );
    expect(groups).toHaveLength(2);
  });

  it('carries the highest priority, and leads with it', () => {
    const groups = cluster(
      [
        raw({ id: 'a', priority: 1, x: RIGHT, y: 100 }),
        raw({ id: 'b', priority: 4, x: RIGHT, y: 400 }),
      ],
      WIDTH,
      HEIGHT,
    );
    expect(groups[0]?.members).toEqual(['b', 'a']);
    expect(groups[0]?.priority).toBe(4);
  });

  it('names the member nearest the view — the one a click brings back', () => {
    const groups = cluster(
      [
        raw({ id: 'far', x: RIGHT, y: 100, reach: 4000 }),
        raw({ id: 'near', x: RIGHT, y: 400, reach: 700 }),
      ],
      WIDTH,
      HEIGHT,
    );
    expect(groups[0]?.nearest).toBe('near');
  });

  it('answers the same whatever the order it is handed — what allows computing at rest', () => {
    const raws = [
      raw({ id: 'a', x: RIGHT, y: 100 }),
      raw({ id: 'b', x: 30, y: 100 }),
      raw({ id: 'c', x: 400, y: EDGE_MARGIN }),
    ];
    expect(cluster(raws, WIDTH, HEIGHT)).toEqual(cluster([...raws].reverse(), WIDTH, HEIGHT));
  });

  it('files a corner under one edge, and says which', () => {
    const groups = cluster([raw({ id: 'a', x: RIGHT, y: EDGE_MARGIN })], WIDTH, HEIGHT);
    expect(groups[0]?.side).toBe('top');
  });
});

describe('alert mark', () => {
  it('leaves the glyph neutral on a heading at me, its pile read or not', () => {
    expect(alertMark(label({}))).toBe('threat');
    expect(alertMark(label({ identified: true }))).toBe('threat');
  });

  it('marks nothing outside inbound — the critical accent is its alone', () => {
    expect(alertMark(label({ type: 'intel' }))).toBe('none');
    expect(alertMark(label({ type: 'my-movement' }))).toBe('none');
  });

  it('keeps a cluster’s strongest mark', () => {
    expect(strongestMark(['none', 'threat', 'none'])).toBe('threat');
    expect(strongestMark([])).toBe('none');
  });
});

describe('idleConstruction', () => {
  const construction = (finishedAt: number, idle: boolean): MapLabel =>
    label({
      type: 'construction',
      idle,
      lines: [{ role: 'countdown', dueAt: finishedAt, prefix: 'chantier ' }],
    });

  it('flags a finished construction that nothing follows', () => {
    expect(idleConstruction(construction(NOW - 1, true), NOW)).toBe(true);
  });

  it('stays quiet while the construction runs', () => {
    expect(idleConstruction(construction(NOW + 60_000, true), NOW)).toBe(false);
  });

  it('stays quiet when an order takes over', () => {
    expect(idleConstruction(construction(NOW - 1, false), NOW)).toBe(false);
  });
});

/** **Un nom au bord ne couvre pas ma colonne** (#376) : il passe dessous, ou dessus au pied. */
describe('a destination named at the edge, beside my column', () => {
  const label = { left: 200, top: 380, right: 360, bottom: 450 };
  it('keeps its place when it covers nothing', () => {
    expect(clearOfColumns({ left: 250, top: 100, right: 380, bottom: 144 }, [label], 844)).toBe(
      100,
    );
  });
  it('steps below the label it would cover, or above it near the foot of the screen', () => {
    expect(clearOfColumns({ left: 250, top: 380, right: 380, bottom: 424 }, [label], 844)).toBe(
      454,
    );
    expect(clearOfColumns({ left: 250, top: 380, right: 380, bottom: 424 }, [label], 480)).toBe(
      332,
    );
  });
});

/** **Le jeton glisse le long de son bord** pour dégager la bulle de pile (#623). */
describe('a destination token sliding along its edge, clear of the bubble', () => {
  const bubble = { left: 100, top: 300, right: 290, bottom: 420 };
  const edgeBubble = { left: 330, top: 300, right: 390, bottom: 420 };
  it('slides on the axis of its edge: up and down on the sides, across on top and bottom', () => {
    expect(slideAxisOf('left')).toBe('y');
    expect(slideAxisOf('right')).toBe('y');
    expect(slideAxisOf('top')).toBe('x');
    expect(slideAxisOf('bottom')).toBe('x');
  });
  it('steps past a bubble that covers it across the axis of a top or bottom edge', () => {
    const token = { left: 150, top: 0, right: 230, bottom: 44 };
    expect(clearOfColumns(token, [{ ...bubble, top: 0, bottom: 120 }], 390, 'x')).toBe(294);
    expect(clearOfColumns({ ...token, left: 20, right: 100 }, [bubble], 390, 'x')).toBe(20);
  });
  it('goes to the side that has room: below a bubble in the middle, above it at the foot', () => {
    const token = { left: 340, top: 340, right: 390, bottom: 384 };
    expect(clearOfColumns(token, [edgeBubble], 844, 'y')).toBe(424);
    expect(clearOfColumns(token, [edgeBubble], 430, 'y')).toBe(252);
  });
  it('never leaves the screen at a corner', () => {
    const token = { left: 0, top: 0, right: 80, bottom: 44 };
    expect(clearOfColumns(token, [{ left: 0, top: 0, right: 200, bottom: 80 }], 90, 'y', 0)).toBe(
      0,
    );
  });
  it('climbs above a column from the foot of the screen, and keeps the margins it is given (#376)', () => {
    const token = { left: 150, top: 800, right: 230, bottom: 844 };
    const column = { left: 100, top: 790, right: 290, bottom: 830 };
    expect(clearOfColumns(token, [column], 844)).toBe(742);
    expect(clearOfColumns(token, [column], 844, 'y', 760)).toBe(760);
  });
  it('glides toward its place, and lands on it', () => {
    const half = glideToward(0, 100, 80);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(100);
    expect(glideToward(99.8, 100, 16)).toBe(100);
    expect(glideToward(0, 100, 5000)).toBe(100);
  });
});
