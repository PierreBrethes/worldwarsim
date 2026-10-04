import { describe, expect, it } from 'vitest';
import { URGENCY_MS, type MapLabel } from './labels';
import {
  CATEGORIES,
  CATEGORY_BY_TYPE,
  DEFAULT_TOGGLES,
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
  ...override,
});

const label = (override: Partial<MapLabel>): MapLabel => ({
  id: 'e-1',
  type: 'inbound-movement',
  priority: 5,
  anchor: { kind: 'movementHead', arc: 'mv-1' },
  reach: null,
  force: null,
  washed: false,
  installation: null,
  camp: null,
  objective: null,
  ink: null,
  pictogram: null,
  plate: null,
  deposit: null,
  lootSightingId: null,
  lootCurrent: true,
  lines: [],
  identified: false,
  offensive: false,
  idle: false,
  building: null,
  station: null,
  hostCountry: null,
  ...override,
});

describe('toggles', () => {
  // Buildings, deposits and outposts sit apart: their bascules govern the board itself, so
  // lighting them costs the edge nothing, and hiding them would cost the player his own
  // economy, the only map of where he may put one, and the points his spent columns hold.
  it('only lights what the player owns on the ground, plus inbound, on first load', () => {
    expect(Object.entries(DEFAULT_TOGGLES).filter(([, on]) => on)).toEqual([
      ['buildings', true],
      ['deposits', true],
      ['outposts', true],
      ['inbound', true],
    ]);
  });

  it('gives a category to each label type', () => {
    expect(new Set(Object.values(CATEGORY_BY_TYPE)).size).toBe(CATEGORIES.length);
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
  it('merges two nearby indicators of the same category', () => {
    const groups = cluster([raw({ id: 'a', x: 100, y: 100 }), raw({ id: 'b', x: 120, y: 110 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members).toEqual(['a', 'b']);
  });

  it('never merges two different categories', () => {
    const groups = cluster([
      raw({ id: 'a', x: 100, y: 100 }),
      raw({ id: 'b', category: 'forces', x: 101, y: 100 }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('keeps apart two indicators beyond the threshold', () => {
    const groups = cluster([raw({ id: 'a', x: 100, y: 100 }), raw({ id: 'b', x: 100, y: 200 })]);
    expect(groups).toHaveLength(2);
  });

  it('opens the group with the highest priority — the kernel carries it', () => {
    const groups = cluster([
      raw({ id: 'a', priority: 1, x: 100, y: 100 }),
      raw({ id: 'b', priority: 4, x: 110, y: 100 }),
    ]);
    expect(groups[0]?.members).toEqual(['b', 'a']);
    expect(groups[0]?.priority).toBe(4);
  });

  it('yields the same partition twice in a row — what allows computing at rest', () => {
    const raws = [
      raw({ id: 'a', x: 100, y: 100 }),
      raw({ id: 'b', x: 130, y: 100 }),
      raw({ id: 'c', x: 400, y: 100 }),
    ];
    expect(cluster(raws)).toEqual(cluster(raws));
  });
});

describe('alert mark', () => {
  it('leaves the glyph neutral while the movement is unidentified', () => {
    expect(alertMark(label({}), NOW)).toBe('threat');
  });

  it('only arms the triangle on an identified, offensive movement', () => {
    const pierced = label({
      identified: true,
      offensive: true,
      lines: [{ role: 'countdown', dueAt: NOW + 60 * 60_000, prefix: '~' }],
    });
    expect(alertMark(pierced, NOW)).toBe('offensive');
    expect(alertMark(label({ identified: true, offensive: false }), NOW)).toBe('threat');
  });

  it('turns imminent below the urgency threshold', () => {
    const near = label({
      identified: true,
      offensive: true,
      lines: [{ role: 'countdown', dueAt: NOW + URGENCY_MS - 1, prefix: '~' }],
    });
    expect(alertMark(near, NOW)).toBe('imminent');
  });

  it('marks nothing outside inbound — the critical accent is its alone', () => {
    expect(alertMark(label({ type: 'intel' }), NOW)).toBe('none');
    expect(alertMark(label({ type: 'my-movement' }), NOW)).toBe('none');
  });

  it('keeps a cluster’s strongest mark', () => {
    expect(strongestMark(['threat', 'imminent', 'none'])).toBe('imminent');
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
