import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureGauge, LoadingGauge, MarchGauge, RaceGauge } from './LoadingGauge';

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

const SITE = { kind: 'building', building: 'mine', regionId: 'x' } as const;

describe('CaptureGauge', () => {
  beforeEach(() => phone(false));
  afterEach(() => vi.useRealTimers());

  /** **Gelée à 100 % faute de vivres** (ADR 0044, #622) : le mot reste lisible sans survol. */
  it('says a suspended capture waits for food, and fills the ring', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 14, 14));
    const clock = {
      progress: 0.5,
      at: Date.UTC(2026, 9, 14, 12),
      rate: 1,
      durationMs: 3_600_000,
      rest: null,
    };
    const markup = renderToStaticMarkup(
      <CaptureGauge
        side="capturer"
        site={SITE}
        suspended
        clock={clock}
        completesAt={Date.UTC(2026, 9, 14, 12, 30)}
      />,
    );
    expect(markup).toContain('suspendue : l’armée a faim');
    expect(markup).toContain('stroke-dasharray="1 1"');
    expect(markup).not.toContain('fin vers');
  });

  /** **Le défenseur ne lit jamais la famine** : une capture due se lit « en cours de conclusion ». */
  it('reads a capture past its hour as concluding, not as a late loss', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 14, 14));
    const clock = {
      progress: 0.5,
      at: Date.UTC(2026, 9, 14, 12),
      rate: 1,
      durationMs: 3_600_000,
      rest: null,
    };
    const markup = renderToStaticMarkup(
      <CaptureGauge
        side="defender"
        site={SITE}
        clock={clock}
        completesAt={Date.UTC(2026, 9, 14, 12, 30)}
      />,
    );
    expect(markup).toContain('aria-label="100 % · en cours de conclusion"');
    expect(markup).not.toContain('perdu vers');
  });

  it('keeps its words on a phone, which has no poster', () => {
    phone(true);
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const clock = { progress: 0.5, at: 0, rate: 1, durationMs: 3_600_000, rest: null };
    expect(
      renderToStaticMarkup(
        <CaptureGauge side="capturer" site={SITE} clock={clock} completesAt={3_600_000} />,
      ),
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
      <CaptureGauge
        side="defender"
        site={SITE}
        clock={clock}
        completesAt={Date.UTC(2026, 9, 14, 12, 30)}
      />,
    );
    expect(markup).toContain('stroke-dasharray="0.75 1"');
    expect(markup).toContain('aria-label="75 % · perdu vers');
    expect(markup).toContain('capture-gauge--defender');
    expect(
      renderToStaticMarkup(
        <CaptureGauge
          side="defender"
          site={{ kind: 'building', building: 'hq', regionId: 'x' }}
          clock={clock}
          completesAt={Date.UTC(2026, 9, 14, 12, 30)}
        />,
      ),
    ).toContain('aria-label="75 % · QG perdu vers');
  });
});

/** **Le compte en anneaux** (#442) : l'anneau du meneur se vide sur 24 h, l'heure restante dessous ;
 *  il se trace à l'apparition seulement quand le compte vient de partir. */
describe('RaceGauge', () => {
  afterEach(() => vi.useRealTimers());
  const NOW = Date.UTC(2026, 10, 5, 12);
  const left = (minutes: number) => NOW + minutes * 60_000;

  it('empties its ring like a clock, and says the hours left', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const markup = renderToStaticMarkup(
      <RaceGauge endsAt={left(6 * 60)} ink="#2b6974" fading={false} fresh={false} />,
    );
    expect(markup).toContain('6 h 00');
    expect(markup).toContain('stroke-dasharray="0.25 1"');
    expect(markup).toContain('#2b6974');
    expect(markup).not.toContain('race-gauge--traced');
  });

  it('counts the seconds under the hour, as the ruler does (#678)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const markup = renderToStaticMarkup(
      <RaceGauge endsAt={NOW + (12 * 60 + 4) * 1000} ink="#2b6974" fading={false} fresh={false} />,
    );
    expect(markup).toContain('12 min 04 s');
  });

  it('is traced when the count started under the eyes, and fades when it falls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(
      renderToStaticMarkup(<RaceGauge endsAt={left(60)} ink="#2b6974" fading={false} fresh />),
    ).toContain('race-gauge--traced');
    expect(
      renderToStaticMarkup(<RaceGauge endsAt={left(60)} ink="#2b6974" fading fresh={false} />),
    ).toContain('race-gauge--fading');
  });
});
