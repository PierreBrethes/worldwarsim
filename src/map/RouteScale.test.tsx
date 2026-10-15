// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PREVIEW_ARC_ID, type ArcView } from '@/domain/player-view';
import { RouteScale } from './RouteScale';

afterEach(cleanup);

const arc = (id: string, minutesLeft: number, progress: number) =>
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
    minutesLeft,
    progress,
  }) as unknown as ArcView;

describe('the route scale', () => {
  it('times a column in flight by its whole trip', () => {
    render(<RouteScale arc={arc('m1', 60, 0.5)} />);
    expect(screen.getAllByText(/02:00:00/).length).toBeGreaterThan(0);
  });

  /** The aimed arc carries no duration on purpose — its pawn would crawl off the barracks —
   *  and the scale read it as a trip of zero minute beside the card saying 2:40. */
  it('lays the aimed route out untimed, never at zero', () => {
    const { container } = render(<RouteScale arc={arc(PREVIEW_ARC_ID, 0, 0)} />);
    expect(container.textContent).not.toMatch(/00:00:00/);
  });
});
