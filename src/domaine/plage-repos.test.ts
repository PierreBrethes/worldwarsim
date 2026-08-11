import { describe, expect, it } from 'vitest';
import { dansLaPlage, lirePlage } from './plage-repos';

describe('lecture d’une plage déclarée', () => {
  it('accepte les deux notations rencontrées dans les données', () => {
    expect(lirePlage('12h00 – 19h00')).toEqual({ debutMinutes: 720, finMinutes: 1140 });
    expect(lirePlage('23:00 → 06:00')).toEqual({ debutMinutes: 1380, finMinutes: 360 });
  });

  it('refuse une chaîne sans deux horaires', () => {
    expect(lirePlage('repos')).toBeNull();
  });
});

describe('appartenance à la plage', () => {
  it('couvre une plage dans la même journée', () => {
    const plage = lirePlage('12h00 – 19h00')!;
    expect(dansLaPlage(13 * 60, plage)).toBe(true);
    expect(dansLaPlage(19 * 60, plage)).toBe(false);
  });

  it('couvre une plage qui enjambe minuit', () => {
    const plage = lirePlage('18h00 – 01h00')!;
    expect(dansLaPlage(23 * 60, plage)).toBe(true);
    expect(dansLaPlage(0, plage)).toBe(true);
    expect(dansLaPlage(2 * 60, plage)).toBe(false);
  });
});
