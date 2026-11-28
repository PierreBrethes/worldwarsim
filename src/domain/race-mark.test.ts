import { describe, expect, it } from 'vitest';
import type { PlayerView, StrategicPointView } from './player-view';
import { raceClockShortLabel } from '@/i18n/fr';
import { raceMarkOf } from './race-mark';

const point = (
  id: string,
  nation: string | null,
  extra: Partial<StrategicPointView> = {},
): StrategicPointView =>
  ({
    id,
    key: 'tangier',
    holder: nation === null ? null : { nation, heldMs: 0 },
    mine: false,
    contested: false,
    ...extra,
  }) as StrategicPointView;

const view = (
  points: ReadonlyArray<StrategicPointView>,
  race: { leaderNation: string; endsAt: number } | null = null,
  concludedAt: number | null = null,
): PlayerView =>
  ({
    me: { nation: 'france' },
    strategicPoints: points,
    season: { race, outcome: { concludedAt } },
  }) as unknown as PlayerView;

const HOUR = 3_600_000;

/** **La course aux Sept sur la réglette** (#670) : sept marques, le compte du joueur, la phrase. */
describe('raceMarkOf', () => {
  it('hides the cell when the season has no points', () => {
    expect(raceMarkOf(view([]), 0)).toBeNull();
  });

  it('inks each mark with its holder, hatched when contested, without ever naming the attacker', () => {
    const reading = raceMarkOf(
      view([
        point('a', 'germany', { contested: true }),
        point('b', null),
        point('c', 'france', { mine: true }),
      ]),
      0,
    )!;
    expect(reading.marks.map((mark) => [mark.nation, mark.contested])).toEqual([
      ['germany', true],
      [null, false],
      ['france', false],
    ]);
    expect(JSON.stringify(reading)).not.toContain('attacker');
  });

  it('counts my points, capped at four', () => {
    const mine = Array.from({ length: 5 }, (_, rank) =>
      point(`p${rank}`, 'france', { mine: true }),
    );
    expect(raceMarkOf(view(mine), 0)!.mine).toBe(4);
    expect(raceMarkOf(view(mine.slice(0, 2)), 0)!.mine).toBe(2);
  });

  it('says the leader and the time left from the race alone, never from the marks', () => {
    const fourGerman = Array.from({ length: 4 }, (_, rank) => point(`p${rank}`, 'germany'));
    expect(raceMarkOf(view(fourGerman), 0)!.phrase).toBeNull();
    const reading = raceMarkOf(
      view([], { leaderNation: 'germany', endsAt: 23 * HOUR + 12 * 60_000 }),
      0,
    );
    expect(reading).toBeNull();
    const running = raceMarkOf(
      view([point('a', 'germany')], { leaderNation: 'germany', endsAt: 23 * HOUR + 12 * 60_000 }),
      0,
    )!;
    expect(running.phrase).toMatchObject({ who: 'Allemagne', left: '23 h 12' });
  });

  it('says « vous » when the race runs and I hold four points, and counts the seconds under an hour', () => {
    const mine = Array.from({ length: 4 }, (_, rank) =>
      point(`p${rank}`, 'france', { mine: true }),
    );
    const reading = raceMarkOf(
      view(mine, { leaderNation: 'france', endsAt: 12 * 60_000 + 4_000 }),
      0,
    )!;
    expect(reading.phrase).toEqual({
      who: 'Vous',
      you: true,
      nation: null,
      left: '12 min 04 s',
      leftMs: 12 * 60_000 + 4_000,
    });
  });

  it('names the nation when it leads with one point of mine: two seats of one nation do not both read « vous »', () => {
    const reading = raceMarkOf(
      view([point('a', 'france', { mine: true })], { leaderNation: 'france', endsAt: HOUR }),
      0,
    )!;
    expect(reading.phrase).toMatchObject({ who: 'France', you: false, nation: 'france' });
  });

  it('gives no flag to a leader without a nation', () => {
    const reading = raceMarkOf(
      view([point('a', 'Théo')], { leaderNation: 'Théo', endsAt: HOUR }),
      0,
    )!;
    expect(reading.phrase).toMatchObject({ you: false, nation: null });
  });

  it('keeps no phrase once the season is concluded', () => {
    const reading = raceMarkOf(
      view([point('a', 'france')], { leaderNation: 'france', endsAt: HOUR }, 5),
      0,
    )!;
    expect(reading.phrase).toBeNull();
  });
});

describe('raceClockShortLabel', () => {
  it('reads the minute alone under an hour, and the seconds under a minute', () => {
    expect(raceClockShortLabel(47 * 60_000 + 52_000)).toBe('47 min');
    expect(raceClockShortLabel(52_000)).toBe('52 s');
    expect(raceClockShortLabel(23 * HOUR + 12 * 60_000)).toBe('23 h 12');
  });
});
