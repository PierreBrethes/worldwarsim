import { describe, expect, it } from 'vitest';
import { fr } from '../i18n/fr';
import { HQ_RAISE_DELAY_MS, hqRaiseRefusalOf } from './hq-raise';

const FELL = Date.UTC(2026, 10, 28, 12);
const OPEN = FELL + HQ_RAISE_DELAY_MS;
const free = { country: 'FRA', linked: true };
const held = { country: 'FRA', linked: false };
const ask = (over: Partial<Parameters<typeof hqRaiseRefusalOf>[0]> = {}) =>
  hqRaiseRefusalOf({
    now: OPEN,
    hqFellAt: FELL,
    homeCountry: 'FRA',
    region: free,
    homeRegions: [free, held],
    ...over,
  });

describe('raising a fallen headquarters', () => {
  it('opens twelve hours after the fall, and says when before', () => {
    expect(HQ_RAISE_DELAY_MS).toBe(12 * 3_600_000);
    expect(ask({ now: OPEN - 1 })).toEqual({ code: 'HQ_RAISE_TOO_EARLY', details: { at: OPEN } });
    expect(ask({ now: OPEN })).toBeNull();
  });

  it('stands on any free region of its own country, and nowhere else', () => {
    expect(ask({ region: { country: 'BEL', linked: true } })).toEqual({
      code: 'HQ_RAISE_OFF_HOME',
      details: { country: 'FRA' },
    });
    expect(ask({ region: held })).toEqual({
      code: 'HQ_RAISE_REGION_HELD',
      details: { country: 'FRA' },
    });
  });

  it('is refused when another holds every region of its country, wherever it is aimed', () => {
    for (const region of [held, { country: 'BEL', linked: true }]) {
      expect(ask({ region, homeRegions: [held, held] })).toEqual({
        code: 'HQ_RAISE_HOME_HELD',
        details: { country: 'FRA' },
      });
    }
  });

  it('says the hour first: the ground may change before it', () => {
    expect(ask({ now: FELL, region: held, homeRegions: [held] })).toMatchObject({
      code: 'HQ_RAISE_TOO_EARLY',
    });
  });

  it('names the country by its nation, with its article', () => {
    expect(fr.errors.HQ_RAISE_REGION_HELD({ country: 'FRA' })).toContain('libre de la France');
    expect(fr.errors.HQ_RAISE_HOME_HELD({ country: 'JPN' })).toContain('sol du Japon');
  });
});
