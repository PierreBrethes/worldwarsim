import { describe, expect, it } from 'vitest';
import { typo } from './typo';

describe('typo', () => {
  it('binds the high punctuation marks to the word before them', () => {
    expect(typo('La guerre court : France attend ; vite ! Prêt ?')).toBe(
      'La guerre court : France attend ; vite ! Prêt ?',
    );
  });

  it('leaves the rest alone', () => {
    expect(typo('12:30 — fin')).toBe('12:30 — fin');
  });
});
