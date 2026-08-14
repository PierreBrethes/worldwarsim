import { describe, expect, it } from 'vitest';
import type { Milieu } from '@/domaine/trajets';
import { Jalon } from './jalon';

/**
 * Les costumes sont rangés dans l'ordre `terre`, `mer`, `air` : l'index dit lequel est porté,
 * sans que le jalon ait à exposer son état interne pour se laisser vérifier.
 */
const MILIEUX: ReadonlyArray<Milieu> = ['terre', 'mer', 'air'];

const costumePorte = (jalon: Jalon): Milieu | null => {
  const portes = jalon.objet.children.flatMap((costume, index) =>
    costume.visible ? [MILIEUX[index]!] : [],
  );
  return portes.length === 1 ? portes[0]! : null;
};

/**
 * Le sprite ne se teste pas ici : `TextureLoader` demande un `document`, et la règle qu'il
 * faut graver — un arc adverse n'a structurellement pas d'URL de sprite — vit dans
 * `spriteDeMouvement`, donc dans `manifeste.test.ts`.
 */
describe('le jalon sans sprite', () => {
  it('tient les trois silhouettes de domaine et n’en porte qu’une', () => {
    const jalon = new Jalon(null, '#000');
    expect(jalon.objet.children).toHaveLength(3);
    expect(costumePorte(jalon)).toBe('terre');
  });

  it('change de costume au passage du quai', () => {
    const jalon = new Jalon(null, '#000');
    jalon.adopter('mer');
    expect(costumePorte(jalon)).toBe('mer');
    jalon.adopter('terre');
    expect(costumePorte(jalon)).toBe('terre');
    jalon.adopter('air');
    expect(costumePorte(jalon)).toBe('air');
  });
});
