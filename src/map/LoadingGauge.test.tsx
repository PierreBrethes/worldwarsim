import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureGauge, LoadingGauge, MarchGauge } from './LoadingGauge';

const phone = (narrow: boolean) =>
  vi.stubGlobal('matchMedia', () => ({
    matches: narrow,
    addEventListener() {},
    removeEventListener() {},
  }));

describe('LoadingGauge', () => {
  beforeEach(() => phone(false));
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

describe('MarchGauge', () => {
  afterEach(() => vi.useRealTimers());

  it('fills with the time walked over the whole trip', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    expect(renderToStaticMarkup(<MarchGauge since={0} dueAt={4_000} />)).toContain('width:25%');
    expect(renderToStaticMarkup(<MarchGauge since={0} dueAt={500} />)).toContain('width:100%');
  });
});

describe('CaptureGauge', () => {
  beforeEach(() => phone(false));
  afterEach(() => vi.useRealTimers());

  it('keeps its words on a phone, which has no poster', () => {
    phone(true);
    const clock = { progress: 0.5, at: 0, rate: 1, durationMs: 3_600_000, rest: null };
    expect(
      renderToStaticMarkup(<CaptureGauge side="capturer" clock={clock} completesAt={3_600_000} />),
    ).toContain('fin vers');
  });

  it('fills the ring with the capture done, and says when the defender loses the site', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 14, 12, 15));
    const clock = {
      progress: 0.5,
      at: Date.UTC(2026, 9, 14, 12),
      rate: 1,
      durationMs: 3_600_000,
      rest: null,
    };
    const markup = renderToStaticMarkup(
      <CaptureGauge side="defender" clock={clock} completesAt={Date.UTC(2026, 9, 14, 12, 30)} />,
    );
    expect(markup).toContain('stroke-dasharray="0.75 1"');
    expect(markup).toContain('aria-label="75 % · perdu vers');
    expect(markup).toContain('capture-gauge--defender');
    expect(
      renderToStaticMarkup(
        <CaptureGauge
          side="defender"
          hq
          clock={clock}
          completesAt={Date.UTC(2026, 9, 14, 12, 30)}
        />,
      ),
    ).toContain('aria-label="75 % · QG perdu vers');
  });
});
