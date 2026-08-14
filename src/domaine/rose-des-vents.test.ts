import { describe, expect, it } from 'vitest';
import { roseDe, type CibleRose } from './rose-des-vents';
import type { VueJoueur } from './vue-joueur';

const vue = {
  moi: {
    nation: 'France',
    slots: { total: 4, utilises: 1 },
    avantPostes: [
      { id: 'AP-01', paysHote: 'Norway', lonLat: [0, 0], specialisation: 'extraction', garnison: 4, aMoi: true },
    ],
  },
  adversaires: [{ nation: 'Italie' }, { nation: 'URSS' }],
} as unknown as VueJoueur;

const libellesDe = (cible: CibleRose) =>
  roseDe(cible, vue)?.actions.map((action) => action.libelle) ?? null;

describe('menu radial', () => {
  it('n’offre que « voir » sur mon propre territoire', () => {
    expect(libellesDe({ genre: 'pays', pays: 'France' })).toEqual(['Voir le pays']);
  });

  it('n’offre que « voir » sur une nation adverse — l’attaque n’a pas de destination câblée', () => {
    expect(libellesDe({ genre: 'pays', pays: 'Italy' })).toEqual(['Voir le pays']);
  });

  it('ouvre la fondation d’avant-poste sur un pays neutre, avant le « voir »', () => {
    expect(libellesDe({ genre: 'pays', pays: 'Spain' })).toEqual([
      'Fonder un avant-poste',
      'Voir le pays',
    ]);
  });

  it('retire la fondation là où je tiens déjà un avant-poste, et le dit au contexte', () => {
    const rose = roseDe({ genre: 'pays', pays: 'Norway' }, vue);
    expect(rose?.actions.map((action) => action.libelle)).toEqual(['Voir le pays']);
    expect(rose?.kicker).toBe('pays neutre · avant-poste tenu');
  });

  it('préremplit la destination de la fondation et la chiffre en slots', () => {
    const fondation = roseDe({ genre: 'pays', pays: 'Spain' }, vue)?.actions[0];
    expect(fondation).toMatchObject({
      picto: 'ancre',
      destination: 'Spain',
      type: 'avantPoste',
      cout: '1 slot · 3 libres',
    });
  });

  it('ouvre l’envoi sur une de mes forces, sans destination quand elle est chez moi', () => {
    const rose = roseDe(
      { genre: 'force', id: 'pile-domicile', pays: 'France', nom: '24 INF · 6 BLD', effectif: 30 },
      vue,
    );
    expect(rose?.actions.map((action) => action.libelle)).toEqual([
      'Envoyer un mouvement',
      'Voir le pays',
    ]);
    expect(rose?.actions[0]).toMatchObject({ picto: 'helice', destination: null, type: null });
    expect(rose?.kicker).toBe('ma force · 30 unités');
    expect(rose?.nom).toBe('24 INF · 6 BLD');
  });

  it('laisse tomber « voir » quand le picking n’a pas de terre sous la force', () => {
    expect(
      libellesDe({ genre: 'force', id: 'pile-mer', pays: null, nom: '12 ESC', effectif: 12 }),
    ).toEqual(['Envoyer un mouvement']);
  });

  it('nomme la nation plutôt que le pays de la carte', () => {
    expect(roseDe({ genre: 'pays', pays: 'United Kingdom' }, vue)?.nom).toBe('Royaume-Uni');
    expect(roseDe({ genre: 'pays', pays: 'Spain' }, vue)?.nom).toBe('Spain');
  });

  it('donne la nature de la cible au contexte', () => {
    expect(roseDe({ genre: 'pays', pays: 'France' }, vue)?.kicker).toBe('mon territoire');
    expect(roseDe({ genre: 'pays', pays: 'Italy' }, vue)?.kicker).toBe('nation adverse');
    expect(roseDe({ genre: 'pays', pays: 'Spain' }, vue)?.kicker).toBe('pays neutre · sans avant-poste');
  });

  it('aucune action ne porte de coût qu’on ne sait pas chiffrer', () => {
    const rose = roseDe({ genre: 'pays', pays: 'Spain' }, vue);
    expect(rose?.actions.find((action) => action.cle === 'voir')?.cout).toBeNull();
  });

  it('un avant-poste renvoie vers son pays hôte', () => {
    const rose = roseDe(
      { genre: 'avantPoste', id: 'AP-01', paysHote: 'Norway', nom: 'extraction' },
      vue,
    );
    expect(rose?.kicker).toBe('avant-poste · Norway');
    expect(rose?.actions).toEqual([expect.objectContaining({ cle: 'voir', pays: 'Norway' })]);
  });
});
