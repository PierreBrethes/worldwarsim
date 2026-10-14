import { expect, it } from 'vitest';
import { assaultStepAt, captureShareAt, nightInstant, raceAt, RACE_TO_WIN } from './landing';

it('la course commence vide et finit sur un meneur qui tient quatre des Sept', () => {
  expect(raceAt(0).holders).toEqual({});
  expect(raceAt(0).countdown).toBeNull();

  const end = raceAt(1);
  expect(end.standings[0]).toEqual({
    nation: 'uk',
    points: ['gibraltar', 'malta', 'suez', 'lisbon'],
  });
  expect(end.standings[0]!.points).toHaveLength(RACE_TO_WIN);
  expect(end.countdown).toBe(60);
});

it('Malte change de main : l’Italie la tient, puis le Royaume-Uni', () => {
  expect(raceAt(0.6).holders.malta).toBe('italy');
  expect(raceAt(0.7).holders.malta).toBe('uk');
  expect(raceAt(0.7).countdown).toBe(24 * 60);
});

it('l’assaut se lit dans l’ordre : frappe, riposte, repli, capture', () => {
  expect([0, 2, 3.5, 5, 8].map(assaultStepAt)).toEqual([
    'order',
    'strike',
    'riposte',
    'rout',
    'capture',
  ]);
  expect(captureShareAt(0)).toBe(0);
  expect(captureShareAt(99)).toBe(1);
});

it('la chronique va de 14 h à 3 h UTC du jour', () => {
  const today = Date.UTC(2026, 9, 14, 9, 30);
  expect(new Date(nightInstant(0, today)).toISOString()).toBe('2026-10-14T14:00:00.000Z');
  expect(new Date(nightInstant(1, today)).toISOString()).toBe('2026-10-15T03:00:00.000Z');
});
