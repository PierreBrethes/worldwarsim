import { describe, expect, it } from 'vitest';
import { LISTED_MINIMUM, departureOf, listingRefusalOf, roundHourAfter } from './listing';

const HOUR = 3_600_000;
/** Jeudi 26/11/2026, 13:50 UTC : ni une heure ronde, ni une minute ronde. */
const NOW = Date.UTC(2026, 10, 26, 13, 50, 17);

describe('a round hour at least so long after', () => {
  it('climbs to the next round hour', () => {
    expect(roundHourAfter(NOW, 24 * HOUR)).toBe(Date.UTC(2026, 10, 27, 14));
    expect(roundHourAfter(NOW, HOUR)).toBe(Date.UTC(2026, 10, 26, 15));
  });

  it('keeps an hour already round', () => {
    expect(roundHourAfter(Date.UTC(2026, 10, 26, 13), HOUR)).toBe(Date.UTC(2026, 10, 26, 14));
  });
});

describe('the departure of a listed lobby', () => {
  const at = (seats: number, departureAt: number | null = null, maximum = 8) =>
    departureOf({ seats, minimum: LISTED_MINIMUM, maximum, departureAt, now: NOW });

  it('waits for its minimum', () => {
    expect(at(LISTED_MINIMUM - 1)).toBeNull();
  });

  it('is fixed at a round hour at least 24 h later once the minimum is reached', () => {
    expect(at(LISTED_MINIMUM)).toBe(Date.UTC(2026, 10, 27, 14));
  });

  it('does not move when a later sign-up leaves the lobby short of full', () => {
    const fixed = Date.UTC(2026, 10, 27, 9);
    expect(at(LISTED_MINIMUM + 1, fixed)).toBe(fixed);
  });

  it('is brought forward to a round hour at least 1 h later when the lobby is full', () => {
    expect(at(8, Date.UTC(2026, 10, 27, 9))).toBe(Date.UTC(2026, 10, 26, 15));
  });

  it('is never pushed back by a full lobby', () => {
    const soon = Date.UTC(2026, 10, 26, 14);
    expect(at(8, soon)).toBe(soon);
  });

  it('fills straight to the hour when the maximum is the minimum', () => {
    expect(at(4, null, 4)).toBe(Date.UTC(2026, 10, 26, 15));
  });
});

describe('what the founder may do with the listing', () => {
  it('lists a Mondiale, never a Blitz', () => {
    expect(listingRefusalOf({ mode: 'mondiale', listed: true, departureAt: null })).toBeNull();
    expect(listingRefusalOf({ mode: 'blitz', listed: true, departureAt: null })).toBe(
      'SETTING_NOT_IN_MODE',
    );
  });

  it('takes it back only while no departure is fixed', () => {
    expect(listingRefusalOf({ mode: 'mondiale', listed: false, departureAt: null })).toBeNull();
    expect(listingRefusalOf({ mode: 'mondiale', listed: false, departureAt: NOW + HOUR })).toBe(
      'DEPARTURE_FIXED',
    );
  });
});
