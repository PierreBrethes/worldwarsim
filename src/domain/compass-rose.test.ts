import { describe, expect, it } from 'vitest';
import { compassOf, type CompassTarget } from './compass-rose';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import type { BuildSpec, PlayerView } from './player-view';

const view = {
  me: {
    nation: 'france',
    slots: { total: 4, used: 1 },
    outposts: [
      {
        id: 'AP-01',
        hostCountry: 'Norway',
        lonLat: [0, 0],
        specialization: 'relay',
        garrison: 4,
        isMine: true,
      },
    ],
    hqLevel: 1,
    buildingCap: 5,
    foundation: [],
    buildings: [],
    // Only home ground travels in the view: a region absent from it is a region the player
    // has no business building on, which is what the enemy-region test leans on.
    regions: [
      { id: 'FRA-5333', name: 'Paris', deposit: null, coastal: false, buildings: [] },
      {
        id: 'FRA-9999',
        name: 'Nord',
        deposit: 'coal',
        coastal: true,
        buildings: [{ key: 'mine', level: 1 }],
      },
    ],
    construction: null,
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 1000, ratePerHour: 0, cap: 1000 }]),
    ),
  },
  buildCatalog: Object.fromEntries(
    BUILDINGS.map((key) => [key, { cost: { alloy: 10 }, minutes: 20, unlockedAtHqLevel: 1 }]),
  ) as Record<BuildingKey, BuildSpec>,
  loadedAt: 0,
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

  it('says a neutral country is held without offering anything more there', () => {
    const compass = compassOf({ kind: 'country', country: 'Norway' }, view);
    expect(compass?.actions.map((action) => action.label)).toEqual(['Voir le pays']);
    expect(compass?.kicker).toBe('pays neutre · avant-poste tenu');
  });

  /**
   * A column in flight is observed and never commanded: the fan on one of my forces holds the
   * land underneath and nothing else. No handler exists to redirect it — that is the check.
   */
  it('offers no order on a movement in flight', () => {
    const compass = compassOf(
      { kind: 'force', id: 'stack-home', country: 'France', name: '24 INF · 6 BLD', headcount: 30 },
      view,
    );
    expect(compass?.actions.map((action) => action.key)).toEqual(['view']);
    expect(compass?.kicker).toBe('ma force · 30 unités');
    expect(compass?.name).toBe('24 INF · 6 BLD');
  });

  it('stays shut on a force with no land under it — nothing left to offer', () => {
    expect(
      labelsOf({ kind: 'force', id: 'stack-sea', country: null, name: '12 ESC', headcount: 12 }),
    ).toBeNull();
  });

  it('names the nation rather than the map country', () => {
    expect(compassOf({ kind: 'country', country: 'United Kingdom' }, view)?.name).toBe(
      'Royaume-Uni',
    );
    expect(compassOf({ kind: 'country', country: 'Spain' }, view)?.name).toBe('Spain');
  });

  it('gives the target’s nature to the context line', () => {
    expect(compassOf({ kind: 'country', country: 'France' }, view)?.kicker).toBe('mon territoire');
    expect(compassOf({ kind: 'country', country: 'Italy' }, view)?.kicker).toBe('nation adverse');
    expect(compassOf({ kind: 'country', country: 'Spain' }, view)?.kicker).toBe(
      'pays neutre · sans avant-poste',
    );
  });

  it('no action carries a cost we cannot quantify', () => {
    const compass = compassOf({ kind: 'country', country: 'Spain' }, view);
    expect(compass?.actions.find((action) => action.key === 'view')?.cost).toBeNull();
  });

  it('adds the crane on one of my regions, without taking the country’s actions away', () => {
    const compass = compassOf(
      { kind: 'region', id: 'FRA-5333', name: 'Paris', country: 'France' },
      view,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['Bâtir ici', 'Voir le pays']);
    expect(compass?.actions[0]).toMatchObject({ pictogram: 'crane', regionId: 'FRA-5333' });
    expect(compass?.name).toBe('Paris');
    expect(compass?.kicker).toBe('région · France');
  });

  it('withdraws the crane on an enemy region, leaving the fan as it was', () => {
    expect(labelsOf({ kind: 'region', id: 'ITA-5422', name: 'Roma', country: 'Italy' })).toEqual([
      'Voir le pays',
    ]);
  });

  it('withdraws the crane where a building already stands — nothing can go up there', () => {
    expect(labelsOf({ kind: 'region', id: 'FRA-9999', name: 'Nord', country: 'France' })).toEqual([
      'Voir le pays',
    ]);
  });

  it('an outpost points back to its host country', () => {
    const compass = compassOf(
      { kind: 'outpost', id: 'AP-01', hostCountry: 'Norway', name: 'relais logistique' },
      view,
    );
    expect(compass?.kicker).toBe('avant-poste · Norway');
    expect(compass?.actions).toEqual([expect.objectContaining({ key: 'view', country: 'Norway' })]);
  });
});

describe('in aim', () => {
  const column = {
    roles: ['infantry' as const],
    myRegionIds: new Set(['FRA-5333', 'FRA-9999']),
    myOutpostIds: new Set(['AP-01']),
    myBarracksRegionIds: new Set<string>(),
    origin: 'building' as const,
  };

  it('shows the marches and nothing else — no crane, no "view"', () => {
    const compass = compassOf(
      { kind: 'region', id: 'ESP-1234', name: 'Aragón', country: 'Spain' },
      view,
      column,
    );
    expect(compass?.actions.map((action) => action.key)).toEqual(['aim', 'aim']);
    expect(compass?.actions.map((action) => action.label)).toEqual([
      'attaque',
      'fondation d’avant-poste',
    ]);
    expect(compass?.kicker).toBe('visée armée · 1 troupe');
  });

  it('carries the aim and the type on the action, priced in slots', () => {
    const compass = compassOf(
      { kind: 'region', id: 'ESP-1234', name: 'Aragón', country: 'Spain' },
      view,
      column,
    );
    expect(compass?.actions[1]).toMatchObject({
      pictogram: 'cabin',
      type: 'outpost',
      aim: { kind: 'region', regionId: 'ESP-1234', country: 'Spain' },
      cost: '1 slot · 3 libres',
    });
  });

  /** Contextual, never greyed out: on my own ground the fan simply does not open. */
  it('stays shut on ground of mine', () => {
    expect(
      compassOf({ kind: 'region', id: 'FRA-5333', name: 'Paris', country: 'France' }, view, column),
    ).toBeNull();
    expect(
      compassOf(
        { kind: 'outpost', id: 'AP-01', hostCountry: 'Norway', name: 'relais' },
        view,
        column,
      ),
    ).toBeNull();
  });

  /**
   * The server marches at a region or at an outpost. Beyond the regions' fade-in threshold the
   * map only knows the country, and no aim can be made of it — the player comes closer.
   */
  it('stays shut on a whole country', () => {
    expect(compassOf({ kind: 'country', country: 'Spain' }, view, column)).toBeNull();
  });

  it('withdraws the foundation as soon as the column is not infantry alone', () => {
    const mixed = { ...column, roles: ['infantry' as const, 'armor' as const] };
    const compass = compassOf(
      { kind: 'region', id: 'ESP-1234', name: 'Aragón', country: 'Spain' },
      view,
      mixed,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['attaque']);
  });
});
