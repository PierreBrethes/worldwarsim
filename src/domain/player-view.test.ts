import { describe, expect, it } from 'vitest';
import { stackLabel } from '@/i18n/fr';
import { currentMinutes, currentStock } from './player-view';

describe('stack label', () => {
  it('spells out each role with its agreement', () => {
    expect(stackLabel({ infantry: 6, armor: 2, escort: 1 })).toBe('6 infanterie · 2 blindés · 1 escorte');
  });

  it('ignores zeroed roles and says — for an empty stack', () => {
    expect(stackLabel({ fighter: 0 })).toBe('—');
    expect(stackLabel({})).toBe('—');
  });
});

describe('client-side extrapolation', () => {
  const loadedAt = 1_000_000;

  it('lets a stock live at its rate, cap included', () => {
    const resource = { stock: 100, ratePerHour: 60, cap: 130 };
    expect(currentStock(resource, loadedAt, loadedAt)).toBe(100);
    expect(currentStock(resource, loadedAt, loadedAt + 30 * 60_000)).toBe(130);
    expect(currentStock(resource, loadedAt, loadedAt + 120 * 60_000)).toBe(130);
  });

  it('counts minutes down without going below zero', () => {
    expect(currentMinutes(10, loadedAt, loadedAt + 4 * 60_000)).toBe(6);
    expect(currentMinutes(10, loadedAt, loadedAt + 15 * 60_000)).toBe(0);
  });
});
