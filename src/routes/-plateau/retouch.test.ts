import { expect, it } from 'vitest';
import { retouches } from './retouch';

it('closes only on the phone, and only for the very object whose sheet is open', () => {
  expect(retouches(true, { id: 'camp-1' }, 'camp-1')).toBe(true);
  expect(retouches(true, { id: 'camp-1' }, 'camp-2')).toBe(false);
  expect(retouches(true, null, 'camp-1')).toBe(false);
  expect(retouches(false, { id: 'camp-1' }, 'camp-1')).toBe(false);
});
