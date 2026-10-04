import { describe, expect, it } from 'vitest';
import { threadLayout, type ThreadEntry } from './telegraph';

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
