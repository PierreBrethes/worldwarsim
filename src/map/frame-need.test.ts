import { describe, expect, it } from 'vitest';
import { REVEAL_MARGIN, hiddenBy } from './frame-need';

/** Une feuille qu'on lâche ne recadre la carte que si elle cache l'objet : chaque recadrage
 *  coûte 1,5 s d'images. */
describe('hiddenBy', () => {
  const board = 700;

  it('keeps the map still when the subject stays above the sheet with its margin', () => {
    expect(hiddenBy(200, board, 300)).toBe(false);
    expect(hiddenBy(board - 300 - REVEAL_MARGIN, board, 300)).toBe(false);
  });

  it('frames when the sheet covers the subject or comes within the margin of it', () => {
    expect(hiddenBy(board - 300 - REVEAL_MARGIN + 1, board, 300)).toBe(true);
    expect(hiddenBy(600, board, 300)).toBe(true);
  });

  it('frames a subject the taller step now hides, not the one the old step hid', () => {
    expect(hiddenBy(450, board, 200)).toBe(false);
    expect(hiddenBy(450, board, 420)).toBe(true);
  });
});
