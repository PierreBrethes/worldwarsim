import { describe, expect, it, vi } from 'vitest';
import { HullBoardings, type Started } from './hull-boardings';
import type { Cue } from './sequences';

type HullCue = Extract<Cue, { kind: 'embarquement' }>;
const cue = (hull = 'p/0', carrierId = 'h'): HullCue => ({
  kind: 'embarquement',
  hull,
  carrierId,
  ground: 'quay',
  riders: [
    { troopId: 'a', role: 'infantry', figures: [1] },
    { troopId: 'b', role: 'infantry', figures: [1] },
    { troopId: 'tank', role: 'armor', figures: [1] },
  ],
});

const setup = (answers: Array<Started | 'wait' | null>) => {
  const fed: Array<[string, string[]]> = [];
  const unplayed = vi.fn();
  const asked = vi.fn();
  const boardings = new HullBoardings({
    feed: (carrier, riders) => fed.push([carrier, [...riders]]),
    start: (c, now) => {
      asked(c, now);
      return answers.length > 1 ? answers.shift()! : answers[0]!;
    },
    unplayed,
  });
  return { boardings, fed, unplayed, asked };
};
const playing = (over = () => false, end = vi.fn()): Started => ({
  ms: 5000,
  feeds: [
    { at: 0, riders: ['tank'] },
    { at: 2000, riders: ['a'] },
    { at: 4000, riders: ['b'] },
  ],
  over,
  end,
});

describe('a hull’s boarding waits for its hull (#479)', () => {
  it('keeps the old count while the hull is not drawn, then feeds the riders as the men pass', () => {
    const { boardings, fed } = setup(['wait', 'wait', playing()]);
    expect(boardings.cue(cue(), 0)).toBe(true);
    boardings.step(16);
    boardings.step(32);
    expect(fed).toEqual([]);
    boardings.step(48);
    // Started at 48: the vehicle is posed at once, the men one by one as each is through the door.
    expect(fed).toEqual([['h', ['tank']]]);
    boardings.step(48 + 1999);
    expect(fed).toHaveLength(1);
    boardings.step(48 + 2000);
    expect(fed.at(-1)).toEqual(['h', ['a']]);
    boardings.step(48 + 4000);
    expect(fed.at(-1)).toEqual(['h', ['b']]);
    expect(boardings.active).toBe(true);
    boardings.step(48 + 5000);
    expect(boardings.active).toBe(false);
  });

  it('gives the whole count after the wait when the hull never stands (far, no port drawn, pile in hand)', () => {
    const { boardings, fed, unplayed } = setup(['wait']);
    boardings.cue(cue(), 0);
    boardings.step(1999);
    expect(fed).toEqual([]);
    boardings.step(2000);
    expect(fed).toEqual([['h', ['a', 'b', 'tank']]]);
    expect(unplayed).toHaveBeenCalledTimes(1);
    expect(boardings.active).toBe(false);
    boardings.step(4000);
    expect(fed).toHaveLength(1);
  });

  it('feeds everything at once when nothing can play', () => {
    const { boardings, fed, unplayed } = setup([null]);
    boardings.cue(cue(), 0);
    boardings.step(16);
    expect(fed).toEqual([['h', ['a', 'b', 'tank']]]);
    expect(unplayed).toHaveBeenCalledTimes(1);
  });

  it('feeds what is left, once, when the sequence is cut before its end', () => {
    let cut = false;
    const end = vi.fn();
    const { boardings, fed } = setup([playing(() => cut, end)]);
    boardings.cue(cue(), 0);
    boardings.step(0);
    boardings.step(2500);
    expect(fed.flatMap(([, riders]) => riders)).toEqual(['tank', 'a']);
    cut = true;
    boardings.step(2600);
    expect(fed.flatMap(([, riders]) => riders)).toEqual(['tank', 'a', 'b']);
    expect(end).toHaveBeenCalledTimes(1);
    boardings.step(9000);
    expect(fed.flatMap(([, riders]) => riders)).toHaveLength(3);
  });

  it('plays one boarding per hull: a second cue while it waits or plays is refused', () => {
    const { boardings } = setup([playing()]);
    expect(boardings.cue(cue(), 0)).toBe(true);
    expect(boardings.cue(cue(), 10)).toBe(false);
    boardings.step(20);
    expect(boardings.cue(cue(), 30)).toBe(false);
    expect(boardings.cue(cue('p/1', 'other'), 30)).toBe(true);
  });

  it('frees the hull once its boarding is over', () => {
    const { boardings } = setup([playing()]);
    boardings.cue(cue(), 0);
    boardings.step(0);
    boardings.step(6000);
    expect(boardings.cue(cue(), 6100)).toBe(true);
  });
});
