import { describe, expect, it } from 'vitest';
import { RESEARCH_SPEC } from '../../convex/constants';
import { RESEARCH_CARDS, type ResearchCard } from './ids';
import {
  RESEARCH_TREE,
  buildingLockOf,
  comingSoon,
  researchProgressOf,
  researchRefusalOf,
  roleLockOf,
} from './research';

const total = (card: ResearchCard) =>
  Object.values(RESEARCH_SPEC[card].cost).reduce((sum, amount) => sum + (amount ?? 0), 0);

const stocks = { food: 500, steel: 500, coal: 500, oil: 500, ammunition: 0 };
const ready = { researched: [], running: null, hqHeld: true, stocks } as const;

describe('the research tree', () => {
  it('lets the counter pass before the weapon: it costs less and lasts less', () => {
    const couples = RESEARCH_CARDS.flatMap((weapon) =>
      RESEARCH_TREE[weapon].counteredBy.map((counter) => [weapon, counter] as const),
    );
    expect(couples).toEqual(
      expect.arrayContaining([
        ['armor', 'infantryMk2'],
        ['bomber', 'aviation'],
        ['carrier', 'escort'],
        ['carrier', 'aviation'],
      ]),
    );
    for (const [weapon, counter] of couples) {
      expect(RESEARCH_SPEC[counter].hours).toBeLessThan(RESEARCH_SPEC[weapon].hours);
      expect(RESEARCH_SPEC[counter].cost.steel ?? 0).toBeLessThan(
        RESEARCH_SPEC[weapon].cost.steel ?? 0,
      );
      expect(total(counter)).toBeLessThan(total(weapon));
    }
  });

  it('is not finished within a season', () => {
    const hours = RESEARCH_CARDS.reduce((sum, card) => sum + RESEARCH_SPEC[card].hours, 0);
    expect(hours).toBe(182);
  });

  it('opens with mark-1 infantry, the truck and the cargo, everything else behind a card', () => {
    expect(roleLockOf('infantry', 1, [])).toBeNull();
    expect(roleLockOf('landTransport', 1, [])).toBeNull();
    expect(roleLockOf('cargo', 1, [])).toBeNull();
    expect(roleLockOf('infantry', 2, [])).toBe('infantryMk2');
    expect(roleLockOf('armor', 1, [])).toBe('armor');
    expect(roleLockOf('armor', 2, ['armor'])).toBe('armorMk2');
    expect(roleLockOf('fighter', 1, [])).toBe('aviation');
    expect(roleLockOf('carrier', 1, [])).toBe('carrier');
    expect(roleLockOf('carrier', 1, ['carrier'])).toBeNull();
  });

  it('keeps the airfield and the listening post behind their cards', () => {
    expect(buildingLockOf('airfield', [])).toBe('aviation');
    expect(buildingLockOf('listening', [])).toBe('listening');
    expect(buildingLockOf('listening', ['listening'])).toBeNull();
    for (const key of [
      'hq',
      'farm',
      'mine',
      'oilWell',
      'arsenal',
      'warehouse',
      'barracks',
      'port',
    ] as const)
      expect(buildingLockOf(key, [])).toBeNull();
  });

  it('says what is still to come: a line the factory does not have, a role only the Blitz fires', () => {
    expect(comingSoon('syntheticOil')).toBe(true);
    expect(comingSoon('artillery')).toBe(true);
    expect(comingSoon('armor')).toBe(false);
  });
});

describe('putting a card on the headquarters', () => {
  it('takes a card whose prerequisites stand', () => {
    expect(researchRefusalOf('infantryMk2', ready)).toBeNull();
  });

  it('names the card to research first', () => {
    expect(researchRefusalOf('carrier', { ...ready, researched: ['escort'] })).toEqual({
      code: 'RESEARCH_AFTER',
      card: 'aviation',
    });
  });

  it('refuses a card already researched, one to come, a second at a time, no headquarters, no price', () => {
    expect(researchRefusalOf('armor', { ...ready, researched: ['infantryMk2', 'armor'] })).toEqual({
      code: 'RESEARCH_DONE',
      card: 'armor',
    });
    expect(researchRefusalOf('syntheticOil', ready)).toEqual({
      code: 'RESEARCH_COMING',
      card: 'syntheticOil',
    });
    expect(researchRefusalOf('escort', { ...ready, running: 'infantryMk2' })).toEqual({
      code: 'RESEARCH_BUSY',
      card: 'infantryMk2',
    });
    expect(researchRefusalOf('escort', { ...ready, hqHeld: false })).toEqual({
      code: 'RESEARCH_NEEDS_HQ',
    });
    expect(researchRefusalOf('escort', { ...ready, stocks: { ...stocks, coal: 10 } })).toEqual({
      code: 'INSUFFICIENT_RESOURCE',
      resource: 'coal',
      needed: 60,
      available: 10,
    });
  });
});

describe('a card under way', () => {
  const hour = 3_600_000;
  it('advances with the hours while the headquarters stands, and waits when it does not', () => {
    const running = { card: 'infantryMk2', remainingMs: 6 * hour, since: 1000 } as const;
    expect(researchProgressOf(running, 1000 + 2 * hour)).toEqual({
      share: 0.5,
      finishesAt: 1000 + 6 * hour,
    });
    expect(researchProgressOf({ ...running, since: null }, 1000 + 2 * hour)).toEqual({
      share: 0.25,
      finishesAt: null,
    });
  });
});
