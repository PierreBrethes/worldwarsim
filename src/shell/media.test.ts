import { expect, it } from 'vitest';
import { filmBackdrop } from './media';

const wide = { reducedMotion: false, saveData: false, width: 1440 };

it('plays the loop on a wide screen that asks for nothing', () => {
  expect(filmBackdrop(wide)).toBe('video');
});

it('shows the still image when motion is reduced', () => {
  expect(filmBackdrop({ ...wide, reducedMotion: true })).toBe('poster');
});

it('keeps the map table under 900 px, where the sheet covers the screen', () => {
  expect(filmBackdrop({ ...wide, width: 899 })).toBe('map');
  expect(filmBackdrop({ ...wide, width: 900 })).toBe('video');
});

it('keeps the map table when data is saved, even with reduced motion', () => {
  expect(filmBackdrop({ ...wide, saveData: true })).toBe('map');
  expect(filmBackdrop({ ...wide, saveData: true, reducedMotion: true })).toBe('map');
  expect(filmBackdrop({ ...wide, width: 390, reducedMotion: true })).toBe('map');
});
