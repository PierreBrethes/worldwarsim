import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { UnderCapture } from './SiteModal';

const AT = Date.UTC(2026, 9, 14, 12);
const view = {
  captures: [
    {
      side: 'defender',
      target: { kind: 'building', id: 'B-1' },
      site: { kind: 'building', building: 'arsenal', regionId: 'FRA-69' },
      clock: { progress: 1, at: AT, rate: 1, durationMs: 3_600_000, rest: null },
      completesAt: AT + 1_800_000,
    },
  ],
} as unknown as PlayerView;

describe('the site sheet of a site under capture (#622)', () => {
  it('names the hour while it runs, and says it concludes once the hour is past', () => {
    expect(renderToStaticMarkup(<UnderCapture view={view} buildingId="B-1" now={AT} />)).toContain(
      'change de main vers',
    );
    const late = renderToStaticMarkup(
      <UnderCapture view={view} buildingId="B-1" now={AT + 2_000_000} />,
    );
    expect(late).toContain('se conclut');
    expect(late).not.toContain('change de main vers');
  });
});
