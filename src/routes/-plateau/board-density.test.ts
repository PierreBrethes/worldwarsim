import { describe, expect, it } from 'vitest';
import { densityOf } from './board-density';

describe('the gauges density', () => {
  it('follows the band, not the screen: ample from 1300, moyen from 1000, serre below', () => {
    expect(densityOf(1460)).toBe('ample');
    expect(densityOf(1300)).toBe('ample');
    expect(densityOf(1060)).toBe('moyen');
    expect(densityOf(1000)).toBe('moyen');
    expect(densityOf(926)).toBe('serre');
  });

  it('keeps today’s gauges for a band that is not measured yet', () => {
    expect(densityOf(0)).toBe('ample');
  });
});
