import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NATIONS, PAYS_DE_NATION, encreParPaysPris } from './nations';

const paysDuMonde = new Set(
  (JSON.parse(readFileSync('public/monde.json', 'utf8')) as { countries: Array<{ n: string }> })
    .countries.map((pays) => pays.n),
);

describe('les nations s’assoient sur des pays qui existent', () => {
  /**
   * Le monde est nommé en anglais et les nations en français : seule « France » coïncide
   * par accident. Une table qui ne matche pas est silencieuse — la carte reste neutre et
   * personne ne le voit. C'est exactement le bug que ce test grave.
   */
  it('donne à chaque nation un pays présent dans monde.json', () => {
    for (const nation of NATIONS) {
      expect(paysDuMonde.has(PAYS_DE_NATION[nation])).toBe(true);
    }
  });

  it('ne fait porter un pays qu’à une seule nation', () => {
    const pays = NATIONS.map((nation) => PAYS_DE_NATION[nation]);
    expect(new Set(pays).size).toBe(pays.length);
  });
});

describe('l’encre suit le joueur, pas le nom du pays', () => {
  it('n’encre que les nations réellement prises', () => {
    const encres = encreParPaysPris([
      { nation: 'France', encre: '#3f5a7d' },
      { nation: 'Japon', encre: '#a44a5e' },
    ]);
    expect(encres.get('France')).toBe('#3f5a7d');
    expect(encres.get('Japan')).toBe('#a44a5e');
    expect(encres.has('Germany')).toBe(false);
  });

  it('ignore un joueur sans nation', () => {
    expect(encreParPaysPris([{ nation: null, encre: '#000' }]).size).toBe(0);
    expect(encreParPaysPris([{ nation: 'kaspar', encre: '#000' }]).size).toBe(0);
  });
});
