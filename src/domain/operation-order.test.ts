import { describe, expect, it } from 'vitest';
import {
  drawTheatre,
  launchPlanOf,
  nextEvening,
  presenceOf,
  seatCapOf,
  settingsRefusalOf,
  type Settings,
} from './operation-order';

const NOW = Date.UTC(2026, 9, 14, 18, 46);
const blitz: Settings = {
  mode: 'blitz',
  theatre: 'europe',
  scheduledAt: NOW + 3_600_000,
  remind: true,
  hqCaptureHours: null,
  seatCap: null,
};
const mondiale: Settings = {
  mode: 'mondiale',
  theatre: null,
  scheduledAt: null,
  remind: null,
  hqCaptureHours: 12,
  seatCap: null,
};
const refusal = (settings: Settings, seated = 1, rendezvousChanged = true) =>
  settingsRefusalOf(settings, { seated, now: NOW, rendezvousChanged });

describe('settingsRefusalOf', () => {
  it('accepts a Blitz on a theatre, at the table drawn by lot, and a Mondiale at 12 or 24 h', () => {
    expect(refusal(blitz)).toBeNull();
    expect(refusal({ ...blitz, theatre: 'draw' })).toBeNull();
    expect(refusal({ ...blitz, scheduledAt: null })).toBeNull();
    expect(refusal(mondiale)).toBeNull();
    expect(refusal({ ...mondiale, hqCaptureHours: 24 })).toBeNull();
  });

  it('refuses what the mode does not have', () => {
    expect(refusal({ ...mondiale, scheduledAt: NOW + 1 })).toBe('SETTING_NOT_IN_MODE');
    expect(refusal({ ...blitz, hqCaptureHours: 12 })).toBe('SETTING_NOT_IN_MODE');
    expect(refusal({ ...mondiale, theatre: 'europe' })).toBe('THEATRE_ONLY_IN_BLITZ');
    expect(refusal({ ...blitz, theatre: 'x' })).toBe('UNKNOWN_THEATRE');
    expect(refusal({ ...mondiale, hqCaptureHours: 6 })).toBe('INVALID_CAPTURE_HOURS');
  });

  it('refuses a rendezvous already past, but only when it is the one being set', () => {
    const past = { ...blitz, scheduledAt: NOW - 60_000 };
    expect(refusal(past)).toBe('RENDEZVOUS_PAST');
    expect(refusal(past, 1, false)).toBeNull();
  });

  it('keeps the seats between the seated and what the table holds', () => {
    expect(refusal({ ...blitz, seatCap: 3 }, 3)).toBeNull();
    expect(refusal({ ...blitz, seatCap: 2 }, 3)).toBe('SEATS_OUT_OF_RANGE');
    expect(refusal({ ...blitz, seatCap: 5 })).toBeNull();
    expect(refusal({ ...blitz, seatCap: 1 })).toBe('SEATS_OUT_OF_RANGE');
    expect(refusal({ ...mondiale, seatCap: 8 })).toBeNull();
  });

  it('refuses a theatre too small for those already seated', () => {
    expect(refusal({ ...blitz, theatre: 'pacific' }, 4)).toBe('THEATRE_TOO_SMALL');
  });
});

describe('seatCapOf', () => {
  it('is the table ceiling unless the founder set fewer, and a smaller theatre narrows it', () => {
    expect(seatCapOf(blitz)).toBe(4);
    expect(seatCapOf(mondiale)).toBe(8);
    expect(seatCapOf({ ...mondiale, seatCap: 5 })).toBe(5);
    expect(seatCapOf({ ...blitz, theatre: 'pacific', seatCap: 4 })).toBe(3);
  });
});

describe('presenceOf', () => {
  it('says at the table under a minute and a quarter, gone since otherwise, unknown if never seen', () => {
    expect(presenceOf(NOW - 30_000, NOW)).toEqual({ kind: 'present' });
    expect(presenceOf(NOW - 8 * 60_000, NOW)).toEqual({ kind: 'away', minutes: 8 });
    expect(presenceOf(null, NOW)).toEqual({ kind: 'unknown' });
  });
});

describe('launchPlanOf', () => {
  const seat = (id: string, ready: boolean, seenAt: number | null) => ({
    id,
    nickname: id,
    ready,
    seenAt,
  });
  const range = { min: 2, max: 4 };

  it('launches a Mondiale when everybody is ready, presence aside', () => {
    expect(
      launchPlanOf({
        mode: 'mondiale',
        scheduledAt: null,
        range: { min: 2, max: 8 },
        now: NOW,
        caller: 'a',
        seats: [seat('a', true, null), seat('b', true, NOW - 3_600_000)],
      }),
    ).toEqual({ refusal: null });
  });

  it('waits for a Blitz absentee before the hour, and leaves without him after it — seat kept', () => {
    const seats = [seat('a', true, null), seat('b', true, NOW), seat('c', true, NOW - 600_000)];
    const before = { mode: 'blitz' as const, range, caller: 'a', seats, now: NOW };
    expect(launchPlanOf({ ...before, scheduledAt: NOW + 60_000 })).toEqual({
      refusal: 'PLAYERS_ABSENT',
      nicknames: ['c'],
    });
    expect(launchPlanOf({ ...before, scheduledAt: null }).refusal).toBe('PLAYERS_ABSENT');
    expect(launchPlanOf({ ...before, scheduledAt: NOW - 60_000 })).toEqual({ refusal: null });
  });

  it('after the hour waives an absentee’s « prêt » and nation: he is placed like the others', () => {
    const after = {
      mode: 'blitz' as const,
      range,
      caller: 'a',
      now: NOW,
      scheduledAt: NOW - 60_000,
    };
    expect(
      launchPlanOf({ ...after, seats: [seat('a', true, NOW), seat('c', false, NOW - 600_000)] }),
    ).toEqual({ refusal: null });
  });

  it('still needs the ones present to be ready, and enough of them', () => {
    const plan = (seats: ReturnType<typeof seat>[]) =>
      launchPlanOf({ mode: 'blitz', range, caller: 'a', seats, now: NOW, scheduledAt: NOW - 1 });
    expect(plan([seat('a', true, NOW), seat('b', false, NOW)])).toEqual({
      refusal: 'PLAYERS_NOT_READY',
      nicknames: ['b'],
    });
    expect(plan([seat('a', true, NOW)])).toEqual({ refusal: 'NOT_ENOUGH_PLAYERS' });
  });

  it('counts a seat never measured as present, like a row from before the lamp', () => {
    expect(
      launchPlanOf({
        mode: 'blitz',
        range,
        caller: 'a',
        now: NOW,
        scheduledAt: NOW + 60_000,
        seats: [seat('a', true, null), seat('b', true, null)],
      }).refusal,
    ).toBeNull();
  });
});

describe('drawTheatre', () => {
  it('draws only a theatre that seats the table, the same one for the same seed', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      expect(drawTheatre(seed, 4)).not.toBe('pacific');
      expect(drawTheatre(seed, 3)).toBe(drawTheatre(seed, 3));
    }
    expect(new Set(Array.from({ length: 40 }, (_, seed) => drawTheatre(seed, 2))).size).toBe(4);
  });
});

describe('nextEvening', () => {
  it('is tonight at nine, or tomorrow once nine is past', () => {
    expect(new Date(nextEvening(new Date(2026, 9, 14, 18, 46))).getHours()).toBe(21);
    expect(new Date(nextEvening(new Date(2026, 9, 14, 18, 46))).getDate()).toBe(14);
    expect(new Date(nextEvening(new Date(2026, 9, 14, 21, 30))).getDate()).toBe(15);
  });
});
