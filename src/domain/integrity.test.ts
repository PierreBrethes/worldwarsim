import { describe, expect, it } from 'vitest';
import {
  BUILDING_DISABLED_HOURS,
  BUILDING_IMMUNITY_HOURS,
  DAMAGED_HOURS,
} from '../../convex/constants';
import {
  disablingOf,
  hqDisabledAt,
  integrityOf,
  restoresAtOf,
  servedDates,
  shelteredFromStrike,
  struckOf,
} from './integrity';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 25, 12);

describe('integrityOf', () => {
  it('reads a building with no date as intact', () => {
    expect(integrityOf({}, NOW)).toBe('intact');
  });

  it('reads the sabotage date as the one désactivé, inclusive at its end like inService', () => {
    expect(integrityOf({ disabledUntil: NOW }, NOW)).toBe('disabled');
    expect(integrityOf({ disabledUntil: NOW - 1 }, NOW)).toBe('intact');
  });

  it('reads damaged until its date, and disabled over damaged', () => {
    expect(integrityOf({ damagedUntil: NOW }, NOW)).toBe('damaged');
    expect(integrityOf({ damagedUntil: NOW - 1 }, NOW)).toBe('intact');
    expect(integrityOf({ damagedUntil: NOW + HOUR, disabledUntil: NOW + HOUR }, NOW)).toBe(
      'disabled',
    );
  });
});

describe('struckOf', () => {
  it('takes an intact building down one notch, to damaged, sheltered once it is back', () => {
    expect(struckOf({}, NOW)).toEqual({
      damagedUntil: NOW + DAMAGED_HOURS * HOUR,
      immuneUntil: NOW + (DAMAGED_HOURS + BUILDING_IMMUNITY_HOURS) * HOUR,
    });
  });

  it('takes a damaged building to disabled and clears the damage it no longer reads', () => {
    expect(struckOf({ damagedUntil: NOW + HOUR }, NOW)).toEqual({
      damagedUntil: undefined,
      ...disablingOf(NOW),
    });
  });

  it('has no notch left on a disabled building', () => {
    expect(struckOf({ disabledUntil: NOW + HOUR }, NOW)).toBeNull();
  });
});

describe('disablingOf', () => {
  it('disables for its hours and shelters behind them, the sabotage as the strike', () => {
    expect(disablingOf(NOW)).toEqual({
      disabledUntil: NOW + BUILDING_DISABLED_HOURS * HOUR,
      immuneUntil: NOW + (BUILDING_DISABLED_HOURS + BUILDING_IMMUNITY_HOURS) * HOUR,
    });
  });
});

describe('shelteredFromStrike', () => {
  it('shelters only an intact building, until its date', () => {
    const struck = { ...struckOf({}, NOW)! };
    expect(shelteredFromStrike(struck, NOW)).toBe(false);
    const back = struck.damagedUntil! + 1;
    expect(shelteredFromStrike(struck, back)).toBe(true);
    expect(shelteredFromStrike(struck, struck.immuneUntil)).toBe(true);
    expect(shelteredFromStrike(struck, struck.immuneUntil + 1)).toBe(false);
  });
});

describe('restoresAtOf', () => {
  it('says when the building comes back intact, and nothing for an intact one', () => {
    expect(restoresAtOf({}, NOW)).toBeNull();
    expect(restoresAtOf({ damagedUntil: NOW + HOUR }, NOW)).toBe(NOW + HOUR);
    expect(restoresAtOf({ disabledUntil: NOW + 2 * HOUR }, NOW)).toBe(NOW + 2 * HOUR);
  });
});

/** ADR 0046 §8 (#648) : le QG désactivé est le sien, jamais un QG pris à un autre. */
describe('hqDisabledAt', () => {
  const hq = { key: 'hq' as const, disabledUntil: NOW + HOUR };

  it('reads his own headquarters disabled, and nothing else', () => {
    expect(hqDisabledAt([hq], NOW)).toBe(true);
    expect(hqDisabledAt([{ ...hq, disabledUntil: NOW - 1 }], NOW)).toBe(false);
    expect(hqDisabledAt([{ ...hq, key: 'barracks' }], NOW)).toBe(false);
    expect(hqDisabledAt([{ ...hq, captured: true }], NOW)).toBe(false);
  });

  it('reads the view the owner is served as the server reads its dates', () => {
    expect(
      hqDisabledAt(
        [{ key: 'hq', ...servedDates({ integrity: 'disabled', restoresAt: NOW }) }],
        NOW,
      ),
    ).toBe(true);
    expect(
      hqDisabledAt(
        [{ key: 'hq', ...servedDates({ integrity: 'disabled', restoresAt: NOW - 1 }) }],
        NOW,
      ),
    ).toBe(false);
    expect(integrityOf(servedDates({ integrity: 'damaged', restoresAt: NOW }), NOW)).toBe(
      'damaged',
    );
    expect(integrityOf(servedDates({}), NOW)).toBe('intact');
  });
});
