import { progressAt, type CaptureClock } from '@/domain/capture';
import { asClockTime } from '@/domain/duration';
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

/**
 * **L'anneau d'une capture** (14/10) : il se remplit à l'horloge que le serveur a servie
 * (`progressAt`, la règle même qui date l'échéance), le tampon « capture » à côté et l'heure de
 * fin — de victoire chez le capteur, de perte chez le défenseur, à l'encre d'alerte. Sa propre
 * horloge, comme la barre du pillage : la carte ne rend pas une image pour lui.
 */
export function CaptureGauge({
  side,
  hq = false,
  clock,
  completesAt,
}: {
  side: 'capturer' | 'defender';
  /** Un QG de Blitz : sa chute élimine, et le défenseur le lit « QG perdu vers ». */
  hq?: boolean;
  clock: CaptureClock;
  completesAt: number;
}) {
  const share = progressAt(clock, useClock());
  const percent = Math.floor(share * 100);
  const hour = asClockTime(completesAt);
  return (
    <div className={`label-line capture-gauge capture-gauge--${side}`} data-testid="capture-gauge">
      <svg className="capture-ring" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" pathLength={1} className="capture-ring-track" />
        <circle
          cx="12"
          cy="12"
          r="9"
          pathLength={1}
          className="capture-ring-fill"
          strokeDasharray={`${share} 1`}
        />
      </svg>
      <span className="capture-stamp">{fr.capture.stamp}</span>
      <span>
        {side === 'capturer'
          ? fr.capture.endsAt(percent, hour)
          : fr.capture.lostAt(percent, hour, hq)}
      </span>
    </div>
  );
}
