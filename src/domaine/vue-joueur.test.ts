import { describe, expect, it } from 'vitest';
import { libellePile } from './vue-joueur';

describe('libellé d’une pile', () => {
  it('énonce chaque rôle avec son accord', () => {
    expect(libellePile({ infanterie: 6, blinde: 2, escorte: 1 })).toBe('6 infanterie · 2 blindés · 1 escorte');
  });

  it('ignore les rôles à zéro et dit — pour une pile vide', () => {
    expect(libellePile({ chasseur: 0 })).toBe('—');
    expect(libellePile({})).toBe('—');
  });
});
