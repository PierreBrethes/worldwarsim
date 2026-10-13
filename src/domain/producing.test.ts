import { describe, expect, it } from 'vitest';
import { producingSites } from './producing';

const me = {
  buildings: [
    { id: 'farm', key: 'farm', regionId: 'home' },
    { id: 'cutFarm', key: 'farm', regionId: 'cut' },
    { id: 'dryWell', key: 'oilWell', regionId: 'home' },
    { id: 'foundry', key: 'foundry', regionId: 'home' },
    { id: 'arsenal', key: 'arsenal', regionId: 'home' },
    { id: 'barracks', key: 'barracks', regionId: 'home' },
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
  chains: [
    { by: 'foundry', perHour: 4 },
    { by: 'arsenal', perHour: 0 },
  ],
} as const;

describe('producingSites', () => {
  it('names the linked producers whose rate runs, and no other', () => {
    expect([...producingSites(me)].sort()).toEqual(['farm', 'foundry']);
  });

  it('cuts a chain whose own region lost its colour, whatever its sisters make', () => {
    const cut = {
      ...me,
      buildings: [...me.buildings, { id: 'cutFoundry', key: 'foundry', regionId: 'cut' } as const],
    };
    expect(producingSites(cut).has('cutFoundry')).toBe(false);
  });
});
