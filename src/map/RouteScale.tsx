import { useMemo } from 'react';
import { fr } from '@/i18n/fr';
import { unrollRoute } from '@/domain/route-timing';
import { asDuration } from '@/domain/duration';
import type { Medium } from '@/domain/routing';
import type { ArcView } from '@/domain/player-view';

/**
 * The segmented scale of plate 2d: the route laid flat, each section as wide as its
 * duration, docks included. It only shows on hover or selection — permanent, it would
 * double the timeline and eat the contrast budget that belongs to the board.
 */
const MEDIUM_INK: Readonly<Record<Medium, string>> = {
  land: '#c98a3c',
  sea: 'rgba(201,138,60,.55)',
  air: '#e0a552',
};

/** Below this share, a section's label no longer fits: it falls back to the rule alone. */
const READABLE_SHARE = 0.09;

export function RouteScale({ arc }: { arc: ArcView }) {
  const segments = useMemo(() => unrollRoute(arc.route), [arc.route]);
  const durationMinutes = totalDuration(arc);
  if (segments.length === 0) return null;

  return (
    <div className="hud pointer-events-none w-[520px] max-w-full border border-[var(--ink-quiet)] bg-[rgba(15,10,4,.86)] px-3 pt-[7px] pb-[9px]">
      <div className="flex items-baseline justify-between pb-[7px]">
        <span className="eyebrow-dark">{fr.mapUi.routeScale}</span>
        {durationMinutes !== null && (
          <span className="font-(family-name:--font-mono) text-[10px] text-[var(--paper-dim)]">
            {asDuration(durationMinutes)}
          </span>
        )}
      </div>
      <div className="flex items-stretch gap-[2px]">
        {segments.map((segment, rank) => {
          const dock = segment.kind === 'dock';
          const label = dock ? fr.mapUi.dock : fr.mediums[segment.medium];
          const ink = dock ? 'var(--paper)' : MEDIUM_INK[segment.medium];
          return (
            <div
              key={rank}
              className="overflow-hidden pt-[5px] font-(family-name:--font-mono) text-[9px] tracking-[.14em] whitespace-nowrap uppercase"
              style={{
                flex: `${Math.max(0.02, segment.share)} 1 0`,
                borderTop: `2px solid ${ink}`,
                color: dock ? 'var(--paper)' : 'var(--paper-dim)',
              }}
            >
              {segment.share < READABLE_SHARE
                ? ''
                : durationMinutes === null
                  ? label
                  : `${label} · ${asDuration(segment.share * durationMinutes)}`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * `PlayerView` only carries the time left: the total is derived from progress. A frozen arc
 * or sea control has no schedule at all — the scale then shows the breakdown alone, which
 * remains the right answer to "which way does it go". A column held at the border is the same
 * case: at the end of its thread it has no time left, and a trip of zero minute would be a lie.
 */
function totalDuration(arc: ArcView): number | null {
  const left =
    arc.state === 'mine'
      ? arc.minutesLeft
      : arc.state === 'enemyDetected'
        ? arc.estimatedMinutesLeft
        : null;
  if (left === null || arc.progress >= 1) return null;
  return Math.max(0, left) / (1 - arc.progress);
}
