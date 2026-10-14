import { describe, expect, it } from 'vitest';
import { canRead, threadLayout, unreadCount, type ThreadEntry } from './telegraph';

const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
const message = (nickname: string, when: number, mine = false): ThreadEntry => ({
  nickname,
  at: when,
  mine,
});

describe('the thread’s layout', () => {
  it('opens a run on each new sender and keeps the following bands under the same name', () => {
    const layout = threadLayout([
      message('Koval', at(4, 14)),
      message('Koval', at(4, 15)),
      message('Bastien', at(4, 15)),
      message('Théo', at(4, 15), true),
      message('Théo', at(4, 16), true),
    ]);
    expect(layout.map(({ opensRun }) => opensRun)).toEqual([true, false, true, true, false]);
  });

  it('lays a date across the thread at each new day, and reopens the run there', () => {
    const layout = threadLayout([
      message('Koval', at(3, 23)),
      message('Koval', at(4, 1)),
      message('Koval', at(4, 2)),
    ]);
    expect(layout.map(({ opensDay }) => opensDay)).toEqual([true, true, false]);
    expect(layout.map(({ opensRun }) => opensRun)).toEqual([true, true, false]);
  });
});

describe('who reads a message', () => {
  const general = { playerId: 'a', to: undefined };
  const aToB = { playerId: 'a', to: 'b' };

  it('serves the general channel to everybody', () => {
    expect(canRead(general, 'c')).toBe(true);
  });

  it('serves a private message to its two participants and nobody else', () => {
    expect(canRead(aToB, 'a')).toBe(true);
    expect(canRead(aToB, 'b')).toBe(true);
    expect(canRead(aToB, 'c')).toBe(false);
  });
});

describe('the unread count of a channel', () => {
  const entries = [
    { at: 10, mine: false },
    { at: 20, mine: true },
    { at: 30, mine: false },
  ];

  it('counts everything of the others while the channel was never read', () => {
    expect(unreadCount(entries, null)).toBe(2);
  });

  it('counts only what came after the last reading, and never one’s own', () => {
    expect(unreadCount(entries, 10)).toBe(1);
    expect(unreadCount(entries, 30)).toBe(0);
  });
});
