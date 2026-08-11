import { describe, expect, it } from 'vitest';
import { libellePile, minutesCourantes, stockCourant } from './vue-joueur';

describe('libellé d’une pile', () => {
  it('énonce chaque rôle avec son accord', () => {
    expect(libellePile({ infanterie: 6, blinde: 2, escorte: 1 })).toBe('6 infanterie · 2 blindés · 1 escorte');
  });

  it('ignore les rôles à zéro et dit — pour une pile vide', () => {
    expect(libellePile({ chasseur: 0 })).toBe('—');
    expect(libellePile({})).toBe('—');
  });
});

describe('l’extrapolation client', () => {
  const chargeeA = 1_000_000;

  it('fait vivre un stock au rythme du débit, plafond compris', () => {
    const ressource = { stock: 100, debitParHeure: 60, plafond: 130 };
    expect(stockCourant(ressource, chargeeA, chargeeA)).toBe(100);
    expect(stockCourant(ressource, chargeeA, chargeeA + 30 * 60_000)).toBe(130);
    expect(stockCourant(ressource, chargeeA, chargeeA + 120 * 60_000)).toBe(130);
  });

  it('fait décompter les minutes sans passer sous zéro', () => {
    expect(minutesCourantes(10, chargeeA, chargeeA + 4 * 60_000)).toBe(6);
    expect(minutesCourantes(10, chargeeA, chargeeA + 15 * 60_000)).toBe(0);
  });
});
