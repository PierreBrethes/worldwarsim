import { describe, expect, it } from 'vitest';
import { frontPageOrder, soleAwaitingSeat, type FrontSeat } from './front-page';

const NOW = Date.UTC(2026, 9, 14, 18, 46);
const HOUR = 3_600_000;
const seat = (id: string, rest: Partial<FrontSeat>): FrontSeat & { id: string } => ({
  id,
  mode: 'mondiale',
  status: 'lobby',
  scheduledAt: null,
  createdAt: NOW - HOUR,
  awaited: false,
  ...rest,
});

describe('frontPageOrder', () => {
  it('leads with what presses most, then the lobbies, then the games to read back', () => {
    const order = frontPageOrder(
      [
        seat('read-back', { status: 'concluded' }),
        seat('other-lobby', {}),
        seat('awaited', { awaited: true }),
        seat('week', { status: 'launched' }),
        seat('far-blitz', { mode: 'blitz', scheduledAt: NOW + 5 * HOUR, createdAt: NOW }),
        seat('soon-blitz', { mode: 'blitz', scheduledAt: NOW + 2 * HOUR }),
        seat('running-blitz', { mode: 'blitz', status: 'launched' }),
      ],
      NOW,
    );
    expect(order.map((entry) => entry.id)).toEqual([
      'running-blitz',
      'soon-blitz',
      'week',
      'awaited',
      'far-blitz',
      'other-lobby',
      'read-back',
    ]);
  });

  it('puts the newest first among equals', () => {
    const order = frontPageOrder(
      [seat('old', { createdAt: NOW - 2 * HOUR }), seat('new', { createdAt: NOW })],
      NOW,
    );
    expect(order.map((entry) => entry.id)).toEqual(['new', 'old']);
  });
});

/**
 * **L'adresse nue mène droit à la partie quand il n'y en a qu'une** : zéro clic pour le joueur
 * qui revient. Deux parties, ou aucune, et c'est la une de son édition qui choisit avec lui.
 */
describe('soleAwaitingSeat', () => {
  const held = (id: string, status: FrontSeat['status'], defeated = false) => ({
    id,
    status,
    defeated,
  });

  it('is the one game still going, lobby or war, whatever was concluded beside it', () => {
    expect(soleAwaitingSeat([held('war', 'launched')])?.id).toBe('war');
    expect(soleAwaitingSeat([held('lobby', 'lobby'), held('old', 'concluded')])?.id).toBe('lobby');
  });

  it('is none when two games wait, or none does', () => {
    expect(soleAwaitingSeat([held('a', 'launched'), held('b', 'lobby')])).toBeNull();
    expect(soleAwaitingSeat([held('old', 'concluded')])).toBeNull();
    expect(soleAwaitingSeat([])).toBeNull();
  });

  it('does not count a war the player only watches', () => {
    expect(soleAwaitingSeat([held('lost', 'launched', true)])).toBeNull();
    expect(soleAwaitingSeat([held('lost', 'launched', true), held('war', 'launched')])?.id).toBe(
      'war',
    );
  });
});
