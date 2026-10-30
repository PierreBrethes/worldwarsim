import { describe, expect, it } from 'vitest';
import {
  chosenLoadOf,
  fineLoadOf,
  fullLoadOf,
  loadWordOf,
  railLoadOf,
  wheelLoadOf,
} from './load-gauge';

describe('the full load of a transport', () => {
  it('is the smaller of what the source holds and the room left, and says which one binds', () => {
    expect(fullLoadOf(301, 140)).toEqual({ max: 140, bound: 'room' });
    expect(fullLoadOf(23.7, 140)).toEqual({ max: 23, bound: 'stock' });
    expect(fullLoadOf(28, 28)).toEqual({ max: 28, bound: 'room' });
    expect(fullLoadOf(50, 0)).toEqual({ max: 0, bound: 'room' });
  });
});

describe('the load chosen', () => {
  it('is the full load until the hand sets one, rounded and held within it after', () => {
    expect(chosenLoadOf(140, null)).toBe(140);
    expect(chosenLoadOf(140, 36.6)).toBe(37);
    expect(chosenLoadOf(140, 400)).toBe(140);
    expect(chosenLoadOf(140, -3)).toBe(0);
  });
});

describe('moving the load', () => {
  it('reads the rail from the hand, past what is already aboard', () => {
    expect(railLoadOf({ fraction: 0.5, held: 20, capacity: 200, max: 140 })).toBe(80);
    expect(railLoadOf({ fraction: 0.05, held: 20, capacity: 200, max: 140 })).toBe(0);
    expect(railLoadOf({ fraction: 1, held: 20, capacity: 200, max: 140 })).toBe(140);
  });
  it('goes five times finer above the gauge', () => {
    expect(fineLoadOf({ value: 50, dx: 10, railWidth: 100, capacity: 200, max: 140 })).toBe(54);
    expect(fineLoadOf({ value: 1, dx: -50, railWidth: 100, capacity: 200, max: 140 })).toBe(0);
  });
  it('takes one by the wheel, ten with shift, and stays within the load', () => {
    expect(wheelLoadOf({ value: 36.6, deltaY: -100, shift: false, max: 140 })).toBe(38);
    expect(wheelLoadOf({ value: 36, deltaY: 100, shift: true, max: 140 })).toBe(26);
    expect(wheelLoadOf({ value: 139, deltaY: -100, shift: true, max: 140 })).toBe(140);
  });
});

describe('the word under the load', () => {
  it('says full only when the transport is full, and the whole source when it binds', () => {
    expect(loadWordOf({ held: 60, amount: 140, capacity: 200, max: 140, bound: 'room' })).toBe(
      'full',
    );
    expect(loadWordOf({ held: 0, amount: 23, capacity: 200, max: 23, bound: 'stock' })).toBe(
      'whole',
    );
    expect(loadWordOf({ held: 0, amount: 20, capacity: 200, max: 23, bound: 'stock' })).toBeNull();
    expect(loadWordOf({ held: 0, amount: 0, capacity: 200, max: 0, bound: 'stock' })).toBeNull();
  });
});
