import { useMapMotion } from '@/data/mapMotion';
import type { MapLabel } from '@/domain/labels';
import { posterOf, type Poster } from '@/domain/map-poster';
import type { PlayerView } from '@/domain/player-view';
import { useClock } from '@/shell/clock';
import { LoadingGauge } from '@/map/LoadingGauge';
import { PileSheet } from './PileSheet';

/**
 * **L'affiche au survol** (table d'état-major) : une carte de presse, eyebrow, titre, ce que la
 * pièce dit d'elle. Read-only and pointer-transparent — the pointer never needs to enter it.
 * The map's label layer places it over the piece (`MapLabels`, `PosterLayer`).
 */
export function MapPoster({ poster }: { poster: Poster }) {
  const motion = useMapMotion();
  const classes = [
    'map-poster hud',
    poster.pile === null ? '' : 'map-poster--pile',
    poster.washed ? 'map-poster--washed' : '',
  ];
  return (
    <section className={classes.filter(Boolean).join(' ')}>
      <div className="map-poster-eyebrow">{poster.eyebrow}</div>
      <h3>{poster.title}</h3>
      {poster.pile !== null && <PileSheet {...poster.pile} />}
      {poster.lines.map((line, rank) =>
        line.kind === 'text' ? (
          <div key={rank}>{line.text}</div>
        ) : (
          <div key={rank} className="map-poster-row">
            <span>{line.label}</span>
            {line.kind === 'row' ? (
              <b className="map-poster-num">{line.value}</b>
            ) : (
              <span className={`map-poster-chip map-poster-chip--${line.tone}`}>{line.chip}</span>
            )}
          </div>
        ),
      )}
      {poster.loading !== null && <LoadingGauge until={poster.loading} crawl={motion === 'full'} />}
      {poster.bar !== null && (
        <div className="map-poster-bar">
          <i style={{ width: `${Math.round(poster.bar * 100)}%` }} />
        </div>
      )}
    </section>
  );
}

/** The poster read again every second: a site's « reste » counts down while it is hovered. */
export function LivePoster({ label, view }: { label: MapLabel; view: PlayerView }) {
  const now = useClock();
  const poster = posterOf(label, view, now);
  return poster === null ? null : <MapPoster poster={poster} />;
}
