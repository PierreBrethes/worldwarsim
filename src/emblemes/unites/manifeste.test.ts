import { describe, expect, it } from 'vitest';
import { DOMAINE_PAR_ROLE, PALIERS_PAR_ROLE } from '@/domaine/troupes';
import type { RoleUnite } from '@/domaine/vue-joueur';
import { SPRITES_PAR_NATION, urlSprite, type NationSprites } from './manifeste';

const ROLES = Object.keys(DOMAINE_PAR_ROLE) as ReadonlyArray<RoleUnite>;

function france(): NationSprites {
  const sprites = SPRITES_PAR_NATION.France;
  if (sprites === undefined) throw new Error('la France doit figurer au manifeste');
  return sprites;
}

describe('manifeste des sprites d’unités', () => {
  it('se prononce sur chacun des neuf rôles pour la France', () => {
    const sprites = france();
    for (const role of ROLES) {
      expect(sprites, role).toHaveProperty(role);
    }
    expect(Object.keys(sprites)).toHaveLength(ROLES.length);
  });

  it('n’annonce jamais deux niveaux là où le domaine n’en connaît qu’un', () => {
    const sprites = france();
    for (const role of ROLES) {
      const visuel = sprites[role];
      if (visuel === null) continue;
      if (PALIERS_PAR_ROLE[role] === 1) {
        expect(visuel.genre, role).toBe('unique');
        continue;
      }
      if (visuel.genre !== 'paliers') continue;
      expect(visuel.paliers, role).toHaveLength(2);
      expect(visuel.paliers[0], role).not.toBe(visuel.paliers[1]);
    }
  });

  /**
   * Le design donne deux paliers au porte-avions (`catalogueProduction`), la planche n'en a
   * dessiné qu'un. Le manifeste sert alors la même image aux deux niveaux plutôt que rien —
   * ce test tombera le jour où le sprite manquant arrivera, et c'est le but.
   */
  it('signale le palier 2 du porte-avions comme encore non dessiné', () => {
    expect(PALIERS_PAR_ROLE.porteAvions).toBe(2);
    expect(france().porteAvions?.genre).toBe('unique');
  });

  it('rend une image par palier, et rien là où le visuel manque', () => {
    expect(urlSprite('France', 'infanterie', 1)).not.toBe(urlSprite('France', 'infanterie', 2));
    expect(urlSprite('France', 'porteAvions', 1)).toBe(urlSprite('France', 'porteAvions', 2));
    expect(urlSprite('France', 'cargo', 1)).toBeNull();
    expect(urlSprite('Japon', 'chasseur', 1)).toBeNull();
    expect(urlSprite(null, 'chasseur', 1)).toBeNull();
  });
});
