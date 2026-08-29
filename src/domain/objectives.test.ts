import { describe, expect, it } from 'vitest';
import { knownObjectiveAt } from './objectives';
import type { PlayerView } from './player-view';

/**
 * La règle du 29/08 : on n'ordonne un assaut que sur un objectif identifié. Ce qui « identifie »
 * se lit dans la vue du joueur et nulle part ailleurs — c'est le brouillard qui en dépend, pas
 * seulement le confort du menu.
 */
const board = (over: Partial<PlayerView['me']> & { arcs?: unknown } = {}) =>
  ({
    me: { nation: 'france', outposts: [], ...over },
    opponents: [{ nation: 'italy' }],
    arcs: over.arcs ?? [],
  }) as unknown as PlayerView;

describe('what the player’s own view calls attackable', () => {
  it('says yes on an opponent’s soil — a claimed nation is public from the first hour', () => {
    expect(knownObjectiveAt(board(), [12.5, 41.9], 'ITA', 25)).toBe(true);
  });

  it('says no on my own soil, and no on a neutral nobody has been seen in', () => {
    expect(knownObjectiveAt(board(), [2.3, 48.8], 'FRA', 25)).toBe(false);
    expect(knownObjectiveAt(board(), [-3.7, 40.4], 'ESP', 25)).toBe(false);
  });

  it('says no over water with nothing reported there', () => {
    expect(knownObjectiveAt(board(), [-30, 40], null, 25)).toBe(false);
  });

  /** Un relevé est un fil : ce qu'il désigne, c'est là où la colonne se tient à l'instant. */
  it('says yes where a sighting stands, and no along the rest of its thread', () => {
    const sighted = board({
      arcs: [
        {
          state: 'enemyDetected',
          progress: 0.5,
          route: {
            points: [
              [0, 0],
              [2, 0],
            ],
          },
        },
      ],
    });
    expect(knownObjectiveAt(sighted, [1, 0], 'ESP', 25)).toBe(true);
    expect(knownObjectiveAt(sighted, [2, 0], 'ESP', 25)).toBe(false);
  });

  /** Ce que la vue ne porte pas ne répond pas : un mouvement à moi n'est pas un objectif. */
  it('never reads my own movements as something to strike', () => {
    const mine = board({
      arcs: [
        {
          state: 'mine',
          progress: 0.5,
          route: {
            points: [
              [0, 0],
              [2, 0],
            ],
          },
        },
      ],
    });
    expect(knownObjectiveAt(mine, [1, 0], 'ESP', 25)).toBe(false);
  });
});
