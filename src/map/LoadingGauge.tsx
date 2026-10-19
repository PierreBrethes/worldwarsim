import { progressAt, type CaptureClock } from '@/domain/capture';
import { asClockTime } from '@/domain/duration';
import { loadingAt } from '@/domain/loading';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { useNarrowScreen } from '@/shell/viewport';

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
 * **La carte que porte mon QG** (ADR 0028 §5) : son nom, et sa barre qui court jusqu'à la fin ;
 * figée quand le QG manque. Sa propre horloge, comme la marche.
 */
export function ResearchLine({
  text,
  since,
  dueAt,
  share,
}: {
  text: string;
  since: number;
  dueAt: number | null;
  share: number;
}) {
  const now = useClock();
  const shown =
    dueAt === null || dueAt <= since
      ? share
      : Math.min(1, Math.max(0, (now - since) / (dueAt - since)));
  return (
    <div className="label-line label-line--research">
      <span className="block">{text}</span>
      <span className="loading-gauge loading-gauge--march" data-testid="research-gauge">
        <b style={{ width: `${100 * shown}%` }} />
      </span>
      {dueAt === null && <span className="block">{fr.research.waiting}</span>}
    </div>
  );
}

/**
 * **L'anneau d'une capture** (14/10) : il se remplit à l'horloge que le serveur a servie
 * (`progressAt`, la règle même qui date l'échéance) avec le tampon « capture » ; l'heure de fin —
 * de victoire chez le capteur, de perte chez le défenseur, à l'encre d'alerte — se lit à l'affiche, et sur
 * l'étiquette au téléphone, sans survol. Sa propre horloge, comme la barre du pillage : la carte ne rend pas une image pour lui.
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
  const said =
    side === 'capturer' ? fr.capture.endsAt(percent, hour) : fr.capture.lostAt(percent, hour, hq);
  /** No hover on a phone: the poster never opens, so the label keeps its words there. */
  const narrow = useNarrowScreen();
  return (
    <div
      className={`label-line capture-gauge capture-gauge--${side}`}
      data-testid="capture-gauge"
      role="img"
      aria-label={said}
    >
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
      {narrow && <span>{said}</span>}
    </div>
  );
}
