import { describe, expect, it } from 'vitest';
import { DOMAINE_PAR_ROLE, PALIERS_PAR_ROLE } from '@/domaine/troupes';
import { trajetDirect } from '@/domaine/trajets';
import type { ArcAffiche, RoleUnite } from '@/domaine/vue-joueur';
import { SPRITES_PAR_NATION, spriteDeMouvement, urlSprite, type NationSprites } from './manifeste';

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

describe('spriteDeMouvement', () => {
  const mien = {
    etat: 'mien',
    id: 'MVT-1',
    depuis: [0, 0],
    vers: [10, 10],
    trajet: trajetDirect([0, 0], [1, 1], 'terre', 10),
    origineNom: 'France',
    destinationNom: 'Chad',
    origineLibelle: 'France',
    destinationLibelle: 'Tchad',
    type: 'attaque',
    pile: { infanterie: 2, blinde: 5 },
    minutesRestantes: 60,
    attenteFrontiere: null,
    avancement: 0.4,
  } as const satisfies ArcAffiche;

  it('montre le rôle dominant de ma pile', () => {
    expect(spriteDeMouvement(mien, 'France')).toBe(urlSprite('France', 'blinde', 1));
  });

  it('ne montre structurellement rien d’un arc adverse', () => {
    const adverse: ArcAffiche = {
      etat: 'adverseDetecte',
      id: 'MVT-2',
      depuis: [0, 0],
      vers: [10, 10],
      trajet: trajetDirect([0, 0], [1, 1], 'terre', 10),
      nationSuspectee: 'France',
      capDegres: 45,
      capSurMoi: false,
      identification: { perce: false },
      minutesRestantesEstimees: null,
      avancement: 0.1,
    };
    expect(spriteDeMouvement(adverse, 'France')).toBeNull();
  });

  /**
   * Percer un mouvement ouvre sa fiche de frise, pas son jalon : la carte reste au domaine.
   * Sans ce test, la lecture de `identification.pile` paraîtrait un jour légitime.
   */
  it('reste muet sur un adverse identifié, pile connue comprise', () => {
    const identifie: ArcAffiche = {
      etat: 'adverseDetecte',
      id: 'MVT-3',
      depuis: [0, 0],
      vers: [10, 10],
      trajet: trajetDirect([0, 0], [1, 1], 'terre', 10),
      nationSuspectee: 'Allemagne',
      capDegres: 90,
      capSurMoi: true,
      identification: { perce: true, type: 'attaque', pile: { blinde: 9 } },
      minutesRestantesEstimees: 30,
      avancement: 0.6,
    };
    expect(spriteDeMouvement(identifie, 'France')).toBeNull();
  });

  it('rend null sans planche dessinée ou sur pile vide', () => {
    expect(spriteDeMouvement(mien, 'Japon')).toBeNull();
    expect(spriteDeMouvement({ ...mien, pile: {} }, 'France')).toBeNull();
  });
});
