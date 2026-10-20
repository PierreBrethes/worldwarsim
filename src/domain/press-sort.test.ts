import { describe, expect, it } from 'vitest';
import { sortPressRows } from './press-sort';

const row = (rank: number, territory: number, general: number, deeds: number) => ({
  rank,
  territory,
  general,
  deeds,
});
const rows = [row(1, 30, 100, 2), row(2, 25, 300, 2), row(3, 10, 200, 9)];

describe('sortPressRows', () => {
  it('keeps the served order on territory, which is the rank', () => {
    expect(sortPressRows([rows[2]!, rows[0]!, rows[1]!], 'territory').map((r) => r.rank)).toEqual([
      1, 2, 3,
    ]);
  });

  it('puts the biggest first on the other columns', () => {
    expect(sortPressRows(rows, 'general').map((r) => r.rank)).toEqual([2, 3, 1]);
    expect(sortPressRows(rows, 'deeds').map((r) => r.rank)).toEqual([3, 1, 2]);
  });

  it('breaks a tie on the rank and leaves its input alone', () => {
    const input = [rows[1]!, rows[0]!];
    expect(sortPressRows(input, 'deeds').map((r) => r.rank)).toEqual([1, 2]);
    expect(input.map((r) => r.rank)).toEqual([2, 1]);
  });
});
