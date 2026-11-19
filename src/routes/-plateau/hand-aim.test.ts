import { describe, expect, it } from 'vitest';
import { aimPlaceOf, cargoOpenUnder, handAimOf } from './hand-aim';
import type { MovementAim } from '@/domain/movement-orders';
import type { Previewed } from './order-wire';

const notes = [
  { text: '≈ 177 km · 8 h 51', alarm: false },
  { text: 'arrivée 22 h 53', alarm: false },
];

describe('handAimOf', () => {
  it('writes the verb and the place, then the notes of the aim as they are', () => {
    expect(handAimOf(['Marcher'], 0, 'près de Bourges', notes)).toEqual({
      verbs: ['Marcher'],
      chosen: 0,
      line: 'Marcher → près de Bourges · ≈ 177 km · 8 h 51 · arrivée 22 h 53',
      refusal: null,
    });
  });

  it('takes the chosen verb, and the first by default', () => {
    expect(handAimOf(['Marcher', 'Attaquer'], 1, 'Lyon', []).line).toBe('Attaquer → Lyon');
  });

  it('keeps a known refusal out of the line, to stand where « Envoyer » was', () => {
    const aim = handAimOf(['Marcher'], 0, 'Lyon', [
      { text: 'Aucune route', alarm: true, refusal: true },
    ]);
    expect(aim.refusal).toBe('Aucune route');
    expect(aim.line).toBe('Marcher → Lyon');
  });

  it('leaves « Envoyer » offered while the preview has not come', () => {
    expect(handAimOf(['Marcher'], 0, 'Lyon', []).refusal).toBeNull();
  });
});

const previewed = (destinationName: string) => ({ destinationName }) as unknown as Previewed;

describe('aimPlaceOf', () => {
  const point = { kind: 'point', lon: 2.35, lat: 48.85 } as unknown as MovementAim;

  it('names a touched point by the region the preview gives, not by its degrees', () => {
    expect(aimPlaceOf(point, previewed('FRA'))).toMatch(/^près /);
    expect(aimPlaceOf(point, previewed('FRA'))).not.toContain('°');
  });

  it('writes degrees while the preview has not come', () => {
    expect(aimPlaceOf(point, undefined)).toBe('48.9° N · 2.4° E');
  });

  it('says « en mer » at sea, without a « près de »', () => {
    expect(aimPlaceOf(point, previewed(''))).not.toContain('près');
  });
});

describe('cargoOpenUnder', () => {
  it('shows only the signs under an aim: no transport is made available, no tag opens', () => {
    expect(cargoOpenUnder(true, ['a'], true)).toEqual({ availablePiles: [], carriersShown: false });
  });

  it('leaves the transports to the hand without an aim', () => {
    expect(cargoOpenUnder(false, ['a'], true)).toEqual({
      availablePiles: ['a'],
      carriersShown: true,
    });
  });
});
