import { describe, expect, it } from 'vitest';
import { producingSites, workingSites } from './producing';

const me = {
  buildings: [
    { id: 'farm', key: 'farm', regionId: 'home', level: 1 },
    { id: 'cutFarm', key: 'farm', regionId: 'cut', level: 1 },
    { id: 'dryWell', key: 'oilWell', regionId: 'home', level: 1 },
    { id: 'arsenal', key: 'arsenal', regionId: 'home', level: 1 },
    { id: 'barracks', key: 'barracks', regionId: 'home', level: 1 },
  ],
  regions: [
    { id: 'home', linked: true },
    { id: 'cut', linked: false },
  ],
  extraction: [
    { key: 'farm', regionId: 'home', perHour: 12 },
    { key: 'farm', regionId: 'cut', perHour: 0 },
    { key: 'oilWell', regionId: 'home', perHour: 0 },
  ],
  chains: [{ by: 'arsenal', perHour: 4 }],
} as const;

describe('producingSites', () => {
  it('names the linked producers whose rate runs, and no other', () => {
    expect([...producingSites(me)].sort()).toEqual(['arsenal', 'farm']);
  });

  it('cuts a chain whose own region lost its colour, whatever its sisters make', () => {
    const cut = {
      ...me,
      buildings: [...me.buildings, { id: 'cutArsenal', key: 'arsenal', regionId: 'cut' } as const],
    };
    expect(producingSites(cut).has('cutArsenal')).toBe(false);
  });
});

describe('workingSites (#273)', () => {
  const busy = {
    ...me,
    buildings: [
      ...me.buildings,
      { id: 'centre', key: 'researchCenter', regionId: 'home', level: 1 },
      { id: 'taken', key: 'researchCenter', regionId: 'home', level: 3, captured: true },
      { id: 'yard', key: 'port', regionId: 'home', level: 1 },
      { id: 'idleYard', key: 'port', regionId: 'home', level: 1 },
    ],
    research: { running: { since: 0 } },
    recruiting: ['yard'],
  } as const;

  it('names the producers, my Centre while a card advances, and the yards with a hull on the slip', () => {
    expect([...workingSites(busy)].sort()).toEqual(['arsenal', 'centre', 'farm', 'yard']);
  });

  it('leaves the Centre at rest when no card is set, or the card waits for its headquarters', () => {
    expect(workingSites({ ...busy, research: { running: null } }).has('centre')).toBe(false);
    expect(workingSites({ ...busy, research: { running: { since: null } } }).has('centre')).toBe(
      false,
    );
  });
});
