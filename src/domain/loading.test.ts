import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { loadingAt, loadingUntilOf } from './loading';
import type { ArcView } from './player-view';

const HOUR = 3_600_000;
const until = 10 * HOUR;

describe('loadingAt', () => {
  it.each([
    // PLUNDER_HOURS_PRESENT is two hours: a crate drops at each half-hour.
    [until - 2 * HOUR, 0],
    [until - 1.5 * HOUR - 1, 0],
    [until - 1.5 * HOUR, 1],
    [until - HOUR, 2],
    [until - 0.5 * HOUR + 1, 3],
    [until, 4],
    [until + HOUR, 4],
  ])('drops one crate per quarter of the presence (at %d)', (now, crates) => {
    expect(loadingAt(until, now).crates).toBe(crates);
  });

  it('reads the share loaded and the minutes left', () => {
    const loading = loadingAt(until, until - 30 * 60_000);
    expect(loading.share).toBeCloseTo(0.75);
    expect(loading.minutesLeft).toBe(30);
  });
});

describe('fr.loot.loading', () => {
  it.each([
    [32, 'chargement · reste 0 h 32'],
    [32.9, 'chargement · reste 0 h 32'],
    [65, 'chargement · reste 1 h 05'],
    [0, 'chargement · reste 0 h 00'],
  ])('says %d minutes left as « %s »', (minutes, text) => {
    expect(fr.loot.loading(minutes)).toBe(text);
  });
});

describe('loadingUntilOf', () => {
  const mine = (mission: Extract<ArcView, { state: 'mine' }>['mission']) =>
    ({ state: 'mine', mission }) as ArcView;

  it('is the presence end of my expedition on site, and nothing else', () => {
    const plunder = { kind: 'plunder', buildingId: 'b' } as const;
    expect(loadingUntilOf(mine({ ...plunder, phase: 'presence', presenceEndsAt: until }))).toBe(
      until,
    );
    expect(loadingUntilOf(mine({ ...plunder, phase: 'outbound', presenceEndsAt: null }))).toBe(
      null,
    );
    expect(loadingUntilOf(mine(null))).toBe(null);
    expect(loadingUntilOf({ state: 'lastKnown' } as ArcView)).toBe(null);
  });
});
