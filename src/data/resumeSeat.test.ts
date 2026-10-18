// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import { readSeat, forgetSession, keepSession } from './session';
import { resumeSeat } from './resumeSeat';

afterEach(() => forgetSession());

const seasonId = 'season-1' as Id<'seasons'>;

/**
 * One way to go back to a seat, for the home page and for the invitation page: the lobby while
 * the season is still being registered, the board otherwise — and the seat is the one that stays active.
 */
it('keeps the seat active and opens the lobby of a season still being registered', () => {
  keepSession('token');
  const to = { salon: vi.fn(), plateau: vi.fn() };

  resumeSeat({ seasonId, status: 'lobby' }, to);

  expect(readSeat()).toEqual({ token: 'token', seasonId });
  expect(to.salon).toHaveBeenCalledOnce();
  expect(to.plateau).not.toHaveBeenCalled();
});

it('opens the board of a running season', () => {
  keepSession('token');
  const to = { salon: vi.fn(), plateau: vi.fn() };

  resumeSeat({ seasonId, status: 'launched' }, to);

  expect(to.plateau).toHaveBeenCalledOnce();
  expect(to.salon).not.toHaveBeenCalled();
});
