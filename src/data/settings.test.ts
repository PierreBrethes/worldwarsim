import { beforeEach, describe, expect, it } from 'vitest';
import { CLASSIC_MAPPING, WHEEL_ACTS_MAPPING } from '@/domain/mouse-mapping';
import { keepMouseMapping, readMouseMapping } from './settings';

/** Le magasin du navigateur, réduit à ce que les réglages lui demandent. */
const kept = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  },
});

beforeEach(() => kept.clear());

describe('le mappage gardé par le navigateur', () => {
  it('retombe sur le défaut sans rien de gardé', () => {
    expect(readMouseMapping()).toEqual(CLASSIC_MAPPING);
  });

  it('rend ce qu’on lui a confié', () => {
    keepMouseMapping(WHEEL_ACTS_MAPPING);
    expect(readMouseMapping()).toEqual(WHEEL_ACTS_MAPPING);
  });

  /** Une valeur abîmée ne se rattrape pas : un mappage à moitié valide serait un plateau sur
   *  lequel un rôle manque, et personne pour dire lequel. */
  it('retombe sur le défaut sur une valeur abîmée', () => {
    for (const corrupt of ['{', 'null', '"classique"', '{"left":"act","middle":"act"}']) {
      kept.set('wws-mouse-mapping', corrupt);
      expect(readMouseMapping()).toEqual(CLASSIC_MAPPING);
    }
  });
});
