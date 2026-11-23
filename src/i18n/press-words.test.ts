import { describe, expect, it } from 'vitest';
import { fr } from './fr';

/** #607 : la Presse n'imprime ni « 0 fait » ni un « = » sans légende. */
describe('les mots de la Presse', () => {
  it('writes the deeds as « faits d’armes », singular for one and zero', () => {
    expect(fr.press.deedsCount(0)).toBe('0 fait d’armes');
    expect(fr.press.deedsCount(1)).toBe('1 fait d’armes');
    expect(fr.press.deedsCount(3)).toBe('3 faits d’armes');
  });

  it('writes a trend as ▲, ▼ or « stable »', () => {
    expect(fr.press.delta(393)).toBe('▲ 393');
    expect(fr.press.delta(-12)).toBe('▼ 12');
    expect(fr.press.delta(0)).toBe('stable');
    expect(fr.press.delta(0.04, 1)).toBe('stable');
    expect(fr.press.delta(1.5, 1)).toBe('▲ 1,5');
  });
});
