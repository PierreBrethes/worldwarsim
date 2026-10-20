import { describe, expect, it } from 'vitest';
import { DAMAGE_TABLE, RESEARCH_SPEC } from '../../convex/constants';
import { profileOf } from './combat';
import { RESEARCH_CARDS } from './ids';
import {
  RESEARCH_TREE,
  buildingLockOf,
  lineLockOf,
  counterOf,
  countersOf,
  researchScheduleOf,
  researchUnqueueRefusalOf,
  RESEARCH_QUEUE_MAX,
  researchWeight,
  researchMs,
  researchProgressOf,
  searcherLevel,
  researchRefusalOf,
  roleLockOf,
  slotCardsOf,
} from './research';

const stocks = { food: 500, steel: 500, coal: 500, oil: 500, ammunition: 0 };
const ready = { researched: [], running: null, queued: [], centerLevel: 1, stocks } as const;

describe('the research tree', () => {
  /**
   * **Le contre passe avant l'arme** (ADR 0028 §5) : une carte qui en demande une autre ouvre une
   * arme — une unité qui tire, ce qu'un transport ne fait pas —, et ce qui la contre — lu dans `DAMAGE_TABLE` — est au départ, ou coûte moins et dure
   * moins qu'elle. Ni le contre ni l'arme ne sont écrits ici : la table et `RESEARCH_SPEC` font foi.
   */
  it('lets the counter of every weapon pass before it, read off the damage table', () => {
    const weapons = RESEARCH_CARDS.filter(
      (card) =>
        RESEARCH_TREE[card].after.length > 0 &&
        RESEARCH_TREE[card].unlocks.some(
          (unlock) =>
            unlock.kind === 'role' &&
            Object.keys(DAMAGE_TABLE[profileOf(unlock.role, unlock.tier)]).length > 0,
        ),
    );
    expect(weapons.length).toBeGreaterThan(0);
    for (const weapon of weapons) {
      const counter = counterOf(weapon);
      expect(counter, weapon).not.toBeNull();
      if (counter === null || !('card' in counter)) continue;
      const { card } = counter;
      expect(RESEARCH_SPEC[card].hours, `${card} → ${weapon}`).toBeLessThan(
        RESEARCH_SPEC[weapon].hours,
      );
      expect(RESEARCH_SPEC[card].cost.steel ?? 0, `${card} → ${weapon}`).toBeLessThan(
        RESEARCH_SPEC[weapon].cost.steel ?? 0,
      );
      expect(researchWeight(card), `${card} → ${weapon}`).toBeLessThan(researchWeight(weapon));
    }
  });

  it('reads the counters off the table: the escort answers the carrier, the fighter the bomber', () => {
    expect(counterOf('carrier')).toEqual({ card: 'escort' });
    expect(countersOf('escort')).toEqual(['carrier', 'aviation']);
    expect(countersOf('aviation')).toEqual(expect.arrayContaining(['bomber']));
    expect(countersOf('aviation')).not.toContain('armor');
    expect(countersOf('infantryMk2')).toEqual(['armor']);
    expect(counterOf('airlift')).toBeNull();
    expect(counterOf('artillery')).toEqual({ start: 'infantry' });
    expect(counterOf('listening')).toBeNull();
  });

  it('researches only at a research centre of one’s own, never captured, at its level', () => {
    expect(searcherLevel([{ key: 'researchCenter', level: 2 }])).toBe(2);
    expect(searcherLevel([{ key: 'researchCenter', level: 2, captured: true }])).toBeNull();
    expect(searcherLevel([{ key: 'hq', level: 3 }])).toBeNull();
  });

  it('runs a card faster at a higher centre (ADR 0031)', () => {
    expect(researchMs('infantryMk2', 1)).toBe(8 * 3_600_000);
    expect(researchMs('infantryMk2', 2)).toBeCloseTo(8 * 3_600_000 * 0.8);
  });

  it('is not finished within a season', () => {
    const hours = RESEARCH_CARDS.reduce((sum, card) => sum + RESEARCH_SPEC[card].hours, 0);
    expect(hours).toBe(232);
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

  it('holds the oil line behind its card, and nothing else', () => {
    expect(lineLockOf('oil', [])).toBe('syntheticOil');
    expect(lineLockOf('oil', ['syntheticOil'])).toBeNull();
    expect(lineLockOf('ammunition', [])).toBeNull();
  });
});

describe('putting a card on the research centre', () => {
  it('takes a card whose prerequisites stand', () => {
    expect(researchRefusalOf('infantryMk2', ready)).toBeNull();
  });

  it('names the card to research first', () => {
    expect(researchRefusalOf('carrier', { ...ready, researched: ['escort'] })).toEqual({
      code: 'RESEARCH_AFTER',
      card: 'aviation',
    });
  });

  it('refuses a card already researched, in the file, no centre, no price', () => {
    expect(researchRefusalOf('armor', { ...ready, researched: ['infantryMk2', 'armor'] })).toEqual({
      code: 'RESEARCH_DONE',
      card: 'armor',
    });
    expect(researchRefusalOf('escort', { ...ready, running: 'escort' })).toEqual({
      code: 'RESEARCH_QUEUED',
      card: 'escort',
    });
    expect(
      researchRefusalOf('escort', { ...ready, running: 'infantryMk2', queued: ['escort'] }),
    ).toEqual({ code: 'RESEARCH_QUEUED', card: 'escort' });
    expect(researchRefusalOf('escort', { ...ready, centerLevel: null })).toEqual({
      code: 'RESEARCH_NEEDS_CENTER',
    });
    expect(researchRefusalOf('escort', { ...ready, stocks: { ...stocks, coal: 10 } })).toEqual({
      code: 'INSUFFICIENT_RESOURCE',
      resource: 'coal',
      needed: 60,
      available: 10,
    });
  });

  it('queues behind a running card up to the cap, then says the file is full', () => {
    expect(researchRefusalOf('escort', { ...ready, running: 'infantryMk2' })).toBeNull();
    expect(RESEARCH_QUEUE_MAX).toBe(3);
    expect(
      researchRefusalOf('aviation', {
        ...ready,
        running: 'infantryMk2',
        queued: ['escort', 'artillery'],
      }),
    ).toEqual({ code: 'RESEARCH_FULL' });
  });

  it('lets a card ride behind its prerequisite when that one is in the file', () => {
    expect(researchRefusalOf('armor', { ...ready, running: 'infantryMk2' })).toBeNull();
    expect(
      researchRefusalOf('armorMk2', { ...ready, running: 'infantryMk2', queued: ['armor'] }),
    ).toBeNull();
    expect(researchRefusalOf('armorMk2', { ...ready, running: 'infantryMk2' })).toEqual({
      code: 'RESEARCH_AFTER',
      card: 'armor',
    });
  });
});

describe('taking a waiting card out of the file', () => {
  const file = { running: 'infantryMk2', queued: ['armor', 'escort'] } as const;
  it('takes a waiting card, never the running one, never one another waits on', () => {
    expect(researchUnqueueRefusalOf('escort', file)).toBeNull();
    expect(researchUnqueueRefusalOf('infantryMk2', file)).toEqual({
      code: 'RESEARCH_RUNNING',
      card: 'infantryMk2',
    });
    expect(researchUnqueueRefusalOf('artillery', file)).toEqual({
      code: 'RESEARCH_NOT_QUEUED',
      card: 'artillery',
    });
    expect(
      researchUnqueueRefusalOf('armor', { running: 'infantryMk2', queued: ['armor', 'armorMk2'] }),
    ).toEqual({ code: 'RESEARCH_NEEDED', card: 'armorMk2' });
  });
});

describe('when the waiting cards should end', () => {
  const hour = 3_600_000;
  it('chains them after the running one at the centre level of the day, null when paused', () => {
    const running = {
      card: 'infantryMk2',
      totalMs: 8 * hour,
      remainingMs: 6 * hour,
      since: 1000,
    } as const;
    const [first, second] = researchScheduleOf(running, ['armor', 'escort'], 1, 1000);
    expect(first).toBe(1000 + 6 * hour + researchMs('armor'));
    expect(second).toBe(first! + researchMs('escort'));
    expect(researchScheduleOf({ ...running, since: null }, ['armor'], 1, 1000)).toEqual([null]);
  });
});

describe('a card under way', () => {
  const hour = 3_600_000;
  it('advances with the hours while its centre stands, and waits when it does not', () => {
    const running = {
      card: 'infantryMk2',
      totalMs: 8 * hour,
      remainingMs: 6 * hour,
      since: 1000,
    } as const;
    expect(researchProgressOf(running, 1000 + 2 * hour)).toEqual({
      share: 0.5,
      finishesAt: 1000 + 6 * hour,
    });
    expect(researchProgressOf(running, 0).share).toBe(0.25);
    expect(researchProgressOf({ ...running, since: null }, 1000 + 2 * hour)).toEqual({
      share: 0.25,
      finishesAt: null,
    });
  });
});

describe('the Transmissions cards', () => {
  it('chain one after the other, each opening a slot and nothing else', () => {
    expect(RESEARCH_TREE.transmissions1.after).toEqual([]);
    expect(RESEARCH_TREE.transmissions2.after).toEqual(['transmissions1']);
    expect(RESEARCH_TREE.transmissions3.after).toEqual(['transmissions2']);
    expect(slotCardsOf(['armor', 'transmissions1', 'transmissions2'])).toEqual([
      'transmissions1',
      'transmissions2',
    ]);
    for (const card of ['transmissions1', 'transmissions2', 'transmissions3'] as const) {
      expect(counterOf(card), card).toBeNull();
    }
  });
});
