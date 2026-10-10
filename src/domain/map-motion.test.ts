import { describe, expect, it } from 'vitest';
import { parseFx, resolveMapMotion } from './map-motion';

describe('resolveMapMotion', () => {
  it('follows the system only in auto', () => {
    expect(resolveMapMotion('auto', false)).toBe('full');
    expect(resolveMapMotion('auto', true)).toBe('reduced');
    expect(resolveMapMotion('full', true)).toBe('full');
    expect(resolveMapMotion('off', false)).toBe('off');
  });
});

describe('parseFx', () => {
  it('enables all three when absent, none when empty, and ignores unknown values', () => {
    expect([...parseFx('')].sort()).toEqual(['ink', 'sea', 'wind']);
    expect([...parseFx('?fx=')]).toEqual([]);
    expect([...parseFx('?fx=sea,ink')].sort()).toEqual(['ink', 'sea']);
    expect([...parseFx('?fx=sea,bogus')]).toEqual(['sea']);
  });
});
