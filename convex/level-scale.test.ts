import { describe, expect, it } from 'vitest';
import { buildCost, buildMinutes } from './constants';

/** #672 : les premiers chantiers montent en minutes, un niveau de plus coûte une fois et demie. */
describe('le barème des niveaux', () => {
  it('le premier niveau de chaque bâtiment dure le tiers de l’ancien barème', () => {
    expect(buildMinutes('hq', 1)).toBe(15);
    expect(buildMinutes('farm', 1)).toBe(7);
    expect(buildMinutes('mine', 1)).toBe(10);
    expect(buildMinutes('oilWell', 1)).toBe(13);
    expect(buildMinutes('arsenal', 1)).toBe(18);
    expect(buildMinutes('barracks', 1)).toBe(13);
    expect(buildMinutes('airfield', 1)).toBe(23);
    expect(buildMinutes('port', 1)).toBe(22);
    expect(buildMinutes('listening', 1)).toBe(13);
    expect(buildMinutes('researchCenter', 1)).toBe(15);
    expect(buildMinutes('warehouse', 1)).toBe(8);
    expect(buildMinutes('depot', 1)).toBe(10);
    expect(buildMinutes('outpost', 1)).toBe(22);
  });

  it('chaque niveau coûte une fois et demie le précédent, en prix comme en durée', () => {
    expect(buildCost('mine', 1)).toEqual({ steel: 30, coal: 10 });
    expect(buildCost('mine', 3)).toEqual({ steel: 68, coal: 23 });
    expect(buildMinutes('mine', 3)).toBe(Math.round(10 * 2.25));
    expect(buildCost('outpost', 3).steel).toBe(Math.round(65 * 2.25));
  });
});
