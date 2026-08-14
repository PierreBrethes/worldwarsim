import { describe, expect, it } from 'vitest';
import { compassOf, type CompassTarget } from './compass-rose';
import type { PlayerView } from './player-view';

const view = {
  me: {
    nation: 'france',
    slots: { total: 4, used: 1 },
    outposts: [
      { id: 'AP-01', hostCountry: 'Norway', lonLat: [0, 0], specialization: 'extraction', garrison: 4, isMine: true },
    ],
  },
  opponents: [{ nation: 'italy' }, { nation: 'ussr' }],
} as unknown as PlayerView;

const labelsOf = (target: CompassTarget) =>
  compassOf(target, view)?.actions.map((action) => action.label) ?? null;

describe('radial menu', () => {
  it('only offers "view" on my own territory', () => {
    expect(labelsOf({ kind: 'country', country: 'France' })).toEqual(['Voir le pays']);
  });

  it('only offers "view" on an enemy nation — attack has no wired destination', () => {
    expect(labelsOf({ kind: 'country', country: 'Italy' })).toEqual(['Voir le pays']);
  });

  it('opens the outpost founding on a neutral country, before "view"', () => {
    expect(labelsOf({ kind: 'country', country: 'Spain' })).toEqual([
      'Fonder un avant-poste',
      'Voir le pays',
    ]);
  });

  it('withdraws founding where I already hold an outpost, and says so in context', () => {
    const compass = compassOf({ kind: 'country', country: 'Norway' }, view);
    expect(compass?.actions.map((action) => action.label)).toEqual(['Voir le pays']);
    expect(compass?.kicker).toBe('pays neutre · avant-poste tenu');
  });

  it('prefills the founding destination and prices it in slots', () => {
    const founding = compassOf({ kind: 'country', country: 'Spain' }, view)?.actions[0];
    expect(founding).toMatchObject({
      pictogram: 'anchor',
      destination: 'Spain',
      type: 'outpost',
      cost: '1 slot · 3 libres',
    });
  });

  it('opens sending on one of my forces, without a destination when it is at home', () => {
    const compass = compassOf(
      { kind: 'force', id: 'stack-home', country: 'France', name: '24 INF · 6 BLD', headcount: 30 },
      view,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual([
      'Envoyer un mouvement',
      'Voir le pays',
    ]);
    expect(compass?.actions[0]).toMatchObject({ pictogram: 'propeller', destination: null, type: null });
    expect(compass?.kicker).toBe('ma force · 30 unités');
    expect(compass?.name).toBe('24 INF · 6 BLD');
  });

  it('drops "view" when picking has no land under the force', () => {
    expect(
      labelsOf({ kind: 'force', id: 'stack-sea', country: null, name: '12 ESC', headcount: 12 }),
    ).toEqual(['Envoyer un mouvement']);
  });

  it('names the nation rather than the map country', () => {
    expect(compassOf({ kind: 'country', country: 'United Kingdom' }, view)?.name).toBe('Royaume-Uni');
    expect(compassOf({ kind: 'country', country: 'Spain' }, view)?.name).toBe('Spain');
  });

  it('gives the target’s nature to the context line', () => {
    expect(compassOf({ kind: 'country', country: 'France' }, view)?.kicker).toBe('mon territoire');
    expect(compassOf({ kind: 'country', country: 'Italy' }, view)?.kicker).toBe('nation adverse');
    expect(compassOf({ kind: 'country', country: 'Spain' }, view)?.kicker).toBe('pays neutre · sans avant-poste');
  });

  it('no action carries a cost we cannot quantify', () => {
    const compass = compassOf({ kind: 'country', country: 'Spain' }, view);
    expect(compass?.actions.find((action) => action.key === 'view')?.cost).toBeNull();
  });

  it('an outpost points back to its host country', () => {
    const compass = compassOf(
      { kind: 'outpost', id: 'AP-01', hostCountry: 'Norway', name: 'extraction' },
      view,
    );
    expect(compass?.kicker).toBe('avant-poste · Norway');
    expect(compass?.actions).toEqual([expect.objectContaining({ key: 'view', country: 'Norway' })]);
  });
});
