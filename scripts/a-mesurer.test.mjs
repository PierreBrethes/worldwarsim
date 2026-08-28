import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectMarkers, REGISTER_PATH, renderRegister } from './generate-a-mesurer.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Same guard as the other generated assets: the register is a projection of the `@a-mesurer`
 * markers, so a hand edit of the table — or a constant marked without regenerating — has to
 * break here rather than drift quietly until the simulator reads a stale sheet.
 */
describe('registre des constantes à mesurer', () => {
  it('matches the committed file', () => {
    expect(renderRegister(collectMarkers())).toBe(readFileSync(root + REGISTER_PATH, 'utf8'));
  });

  it('names a constant and a reason for every marker', () => {
    for (const row of collectMarkers()) {
      expect(row.name, row.where).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(row.value, row.name).not.toBe('');
      expect(row.reason, row.name).not.toBe('');
    }
  });
});
