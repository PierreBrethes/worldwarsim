// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArcView } from '@/domain/player-view';
import { RouteScale } from './RouteScale';

afterEach(cleanup);

const HOUR = 3_600_000;
const arc = (id: string, departedAt: number, arrivesAt: number) =>
  ({
    state: 'mine',
    id,
    route: {
      mode: 'land',
      points: [],
      distanceUnits: 2,
      costUnits: 2,
      legs: [{ medium: 'land', distanceUnits: 2 }],
    },
    schedule: { departedAt, arrivesAt, heldAt: null, holdUntil: null },
  }) as unknown as ArcView;

describe('the route scale', () => {
  it('times a column in flight by its whole trip', () => {
    render(<RouteScale arc={arc('m1', -HOUR, HOUR)} />);
    expect(screen.getAllByText(/02:00:00/).length).toBeGreaterThan(0);
  });
});
