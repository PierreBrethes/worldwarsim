import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { asLocalTime } from '@/domain/duration';
import { StruckState } from './SiteModal';

const BACK = Date.UTC(2026, 10, 25, 18);
const site = (over: Partial<PlayerView['me']['buildings'][number]>) =>
  ({
    id: 'B-1',
    key: 'barracks',
    level: 1,
    regionId: 'FRA-69',
    ...over,
  }) as PlayerView['me']['buildings'][number];

describe('the site sheet of a struck building (ADR 0046)', () => {
  it('stamps a disabled site and dates its return', () => {
    const html = renderToStaticMarkup(
      <StruckState building={site({ integrity: 'disabled', restoresAt: BACK })} />,
    );
    expect(html).toContain('désactivé');
    expect(html).toContain(asLocalTime(BACK));
    expect(html).toContain('ni formation');
  });

  it('stamps a damaged site, which still works, and says what a second blow does', () => {
    const html = renderToStaticMarkup(
      <StruckState building={site({ integrity: 'damaged', restoresAt: BACK })} />,
    );
    expect(html).toContain('endommagé');
    expect(html).toContain('un second coup le désactiverait');
  });

  it('says nothing of an intact site', () => {
    expect(renderToStaticMarkup(<StruckState building={site({})} />)).toBe('');
  });
});
