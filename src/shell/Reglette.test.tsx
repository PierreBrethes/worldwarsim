import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { BlitzClock } from './Reglette';

const view = (elapsedHours: number, concludedAt: number | null) =>
  ({
    loadedAt: 0,
    season: { durationHours: 2, elapsedHours, reduction: { concludedAt } },
  }) as unknown as PlayerView;

describe('BlitzClock', () => {
  it('counts down to the end of the Blitz', () => {
    expect(renderToStaticMarkup(<BlitzClock view={view(1.5, null)} now={0} />)).toContain(
      '00:30:00',
    );
  });

  it('never goes under zero while the closing job is on its way', () => {
    expect(renderToStaticMarkup(<BlitzClock view={view(2, null)} now={90_000} />)).toContain(
      '00:00:00',
    );
  });
});
