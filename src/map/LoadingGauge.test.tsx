import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadingGauge } from './LoadingGauge';

describe('LoadingGauge', () => {
  afterEach(() => vi.useRealTimers());

  const at32Left = () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    return 1_000_000_000 + 32 * 60_000;
  };

  it('says what is left and fills the bar with the presence elapsed', () => {
    const markup = renderToStaticMarkup(<LoadingGauge until={at32Left()} crawl />);
    expect(markup).toContain('chargement · reste 0 h 32');
    expect(markup).toMatch(/width:73\.3\d*%/);
  });

  it('crawls its hatches only at full motion', () => {
    expect(renderToStaticMarkup(<LoadingGauge until={at32Left()} crawl />)).toContain(
      'loading-gauge--crawl',
    );
    expect(renderToStaticMarkup(<LoadingGauge until={at32Left()} crawl={false} />)).not.toContain(
      'loading-gauge--crawl',
    );
  });
});
