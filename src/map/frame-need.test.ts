import { describe, expect, it } from 'vitest';
import { REVEAL_MARGIN, hiddenBy, needsFrame } from './frame-need';

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

describe('hiddenBy, top edge', () => {
  it('frames a subject above the free frame or within the margin of its top', () => {
    expect(hiddenBy(-10, 700, 300)).toBe(true);
    expect(hiddenBy(REVEAL_MARGIN - 1, 700, 300)).toBe(true);
    expect(hiddenBy(REVEAL_MARGIN, 700, 300)).toBe(false);
  });
});

describe('needsFrame', () => {
  const rect = { top: 100, height: 700 };

  it('frames when any subject spot is hidden', () => {
    expect(needsFrame([{ y: 150 }, { y: 100 + 650 }], rect, 300)).toBe(true);
  });

  it('keeps the map still when every spot is visible', () => {
    expect(needsFrame([{ y: 300 }], rect, 300)).toBe(false);
  });

  it('keeps the map still when no id could be found', () => {
    expect(needsFrame([], rect, 300)).toBe(false);
  });
});
