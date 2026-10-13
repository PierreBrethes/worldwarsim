import { loadingAt } from '@/domain/loading';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';

/**
 * **The load bar of my expedition on site** (table d'état-major, 14). The loot is only taken
 * when the presence ends, so the bar fills with the presence elapsed, never with a quantity the
 * server has not served. It beats with its own clock: CSS and text, the map is not asked for a
 * frame.
 */
export function LoadingGauge({ until, crawl }: { until: number; crawl: boolean }) {
  const loading = loadingAt(until, useClock());
  return (
    <div className="label-line label-line--loading">
      <span className={`loading-gauge${crawl ? ' loading-gauge--crawl' : ''}`}>
        <b style={{ width: `${100 * loading.share}%` }} />
      </span>
      {fr.loot.loading(loading.minutesLeft)}
    </div>
  );
}

/**
 * **The way my column has walked** (the prototype's `c-move`): the time elapsed over the whole
 * trip, both served. Its own clock, like the countdown above it: the map is not asked a frame.
 */
export function MarchGauge({ since, dueAt }: { since: number; dueAt: number }) {
  const now = useClock();
  const share = dueAt > since ? Math.min(1, Math.max(0, (now - since) / (dueAt - since))) : 1;
  return (
    <div className="label-line">
      <span className="loading-gauge loading-gauge--march" data-testid="march-gauge">
        <b style={{ width: `${100 * share}%` }} />
      </span>
    </div>
  );
}
