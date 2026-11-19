import { expect, it } from 'vitest';
import {
  forgetThen,
  garrisonRetouched,
  retouches,
  sheetAfterTouch,
  siteRetouched,
} from './retouch';

it('closes only on the phone, and only for the very object whose sheet is open', () => {
  expect(retouches(true, { id: 'camp-1' }, 'camp-1')).toBe(true);
  expect(retouches(true, { id: 'camp-1' }, 'camp-2')).toBe(false);
  expect(retouches(true, null, 'camp-1')).toBe(false);
  expect(retouches(false, { id: 'camp-1' }, 'camp-1')).toBe(false);
});

it('tells the next sheet from a retouch by the previous state alone', () => {
  const next = { id: 'camp-2', x: 1, y: 2 };
  expect(sheetAfterTouch(true, { id: 'camp-1' }, next)).toBe(next);
  expect(sheetAfterTouch(true, { id: 'camp-2' }, next)).toBeNull();
  expect(sheetAfterTouch(false, { id: 'camp-2' }, next)).toBe(next);
  expect(sheetAfterTouch(true, null, next)).toBe(next);
});

/** Le mode ne compte pas : en Blitz comme en Mondiale, sous le seuil, un doigt qui revient ferme. */
it('closes a site sheet or a garrison on a retouch under the threshold', () => {
  expect(siteRetouched(true, ['site'], 'k17', 'k17')).toBe(true);
  expect(siteRetouched(true, ['site'], 'k17', 'k18')).toBe(false);
  expect(siteRetouched(true, ['journal'], 'k17', 'k17')).toBe(false);
  expect(siteRetouched(false, ['site'], 'k17', 'k17')).toBe(false);
  expect(garrisonRetouched(true, 'building:k17', 'building:k17')).toBe(true);
  expect(garrisonRetouched(true, 'building:k17', 'building:k18')).toBe(false);
  expect(garrisonRetouched(true, null, 'building:k17')).toBe(false);
  expect(garrisonRetouched(false, 'building:k17', 'building:k17')).toBe(false);
});

it('forgets the frame before it closes', () => {
  const calls: string[] = [];
  forgetThen(
    () => calls.push('forget'),
    () => calls.push('close'),
  )();
  expect(calls).toEqual(['forget', 'close']);
});
