import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FLY_MS,
  RETURN_MS,
  tourBeatsOf,
  type AbsenceTour,
  type TourBeat,
} from '@/domain/absence-tour';
import { asDatedClock } from '@/domain/duration';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import { fr } from '@/i18n/fr';
import { MAT_LIFT, useBoardInsets, useNarrowScreen } from '@/shell/viewport';
import type { CameraPose, MapEngine } from './engine';

/** What the band says: the intro, a stop, the end, or the gesture that stopped it. */
export type TourBand =
  | { readonly kind: 'intro' }
  | { readonly kind: 'stop'; readonly index: number }
  | { readonly kind: 'end' }
  | { readonly kind: 'stopped' };

/** @a-mesurer : le temps que la bande « Rejeu arrêté » reste lue. */
const STOPPED_BAND_MS = 2200;
/** @a-mesurer : le lieu se pose à gauche du centre, son tampon à droite (`WORDED_ASIDE`) : au
 *  téléphone, centré, le tampon sortait de l'écran. */
const STAMP_ASIDE_PX = 80;

/**
 * **Le rejeu d'absence, joué sur la carte** (#439). Il part une fois, quand la carte se voit
 * (`covered` faux, onglet visible) ; la file est figée. Chaque battement de `tourBeatsOf` rappelle
 * le moteur. `stop` — une main sur la carte, une scène de combat — lève les tampons et laisse la
 * caméra où elle est. `onSeen` marque le rejeu vu, à la fin comme à l'arrêt.
 */
export function useAbsenceTour(
  engine: MapEngine | null,
  /** La file, tirée au départ : elle lit le sol sous chaque lieu (« eaux tenues »). */
  queue: ((landAt: (at: LonLat) => boolean) => AbsenceTour | null) | null,
  {
    covered,
    motion,
    lift,
    onSeen,
  }: {
    covered: boolean;
    motion: MapMotion;
    lift: number;
    onSeen: () => void;
  },
): { tour: AbsenceTour | null; band: TourBand | null; stop: () => void } {
  const [tour, setTour] = useState<AbsenceTour | null>(null);
  const [band, setBand] = useState<TourBand | null>(null);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const state = useRef<'idle' | 'running' | 'over'>('idle');
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const seen = useRef(onSeen);
  useEffect(() => {
    seen.current = onSeen;
  }, [onSeen]);

  useEffect(() => {
    const watch = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', watch);
    return () => document.removeEventListener('visibilitychange', watch);
  }, []);

  const stop = useCallback(() => {
    if (state.current !== 'running') return;
    state.current = 'over';
    for (const timer of timers.current) clearTimeout(timer);
    engine?.liftStamps();
    seen.current();
    setBand({ kind: 'stopped' });
    timers.current = [setTimeout(() => setBand(null), STOPPED_BAND_MS)];
  }, [engine]);

  useEffect(() => {
    if (engine === null || queue === null || covered || !visible || state.current !== 'idle')
      return;
    const tour = queue((at) => engine.landAt(at));
    if (tour === null) {
      state.current = 'over';
      return;
    }
    state.current = 'running';
    setTour(tour);
    setBand({ kind: 'intro' });
    let start: CameraPose | null = null;
    let overview: CameraPose | null = null;
    const from = () => (start ??= engine.cameraPose());
    const wide = () => {
      from();
      return (overview ??= engine.cameraPose(tour.stops.map((stop) => stop.at)));
    };
    const play = ({ does, stop: index }: TourBeat) => {
      const stop = tour.stops[index]!;
      if (does === 'overview') engine.poseCamera(wide(), 0, lift);
      else if (does === 'fly') {
        setBand({ kind: 'stop', index });
        if (motion === 'full')
          engine.poseCamera(
            engine.cameraPose([stop.at], from().distance),
            FLY_MS,
            lift,
            STAMP_ASIDE_PX,
          );
        else engine.poseCamera(wide(), 0, lift);
      } else if (does === 'stamp') for (const burst of stop.stamps) engine.inkBurst(burst);
      else if (does === 'return') {
        engine.poseCamera(from(), motion === 'full' ? RETURN_MS : 0);
        setBand({ kind: 'end' });
        seen.current();
      } else {
        state.current = 'over';
        setBand(null);
      }
    };
    timers.current = tourBeatsOf(tour.stops.length, motion).map((beat) =>
      setTimeout(() => play(beat), beat.at),
    );
    // Motion and lift are read once, at the start: the tour does not change course midway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, queue, covered, visible]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return { tour, band, stop };
}

/** **La bande du rejeu** : au bas de la carte au bureau, sous l'en-tête au téléphone. */
export function AbsenceTourBand({ tour, band }: { tour: AbsenceTour; band: TourBand }) {
  const narrow = useNarrowScreen();
  const insets = useBoardInsets();
  const said = fr.absenceTour;
  const [eyebrow, line] =
    band.kind === 'intro'
      ? [
          said.eyebrow,
          said.intro(
            tour.fresh,
            tour.since === null ? null : asDatedClock(tour.since, Date.now()).replace(':', ' h '),
            tour.stops.length,
          ),
        ]
      : band.kind === 'stop'
        ? [said.stop(band.index + 1, tour.stops.length), null]
        : band.kind === 'end'
          ? [said.endEyebrow, said.end(tour.leftOut)]
          : [said.stoppedEyebrow, said.stopped(tour.fresh)];
  const stop = band.kind === 'stop' ? tour.stops[band.index]! : null;
  /** Placé hors du `.hud`, qui porte un `zoom` : sa position serait zoomée avec lui. Au bureau,
   *  au-dessus du plateau personnel (`MAT_LIFT`), comme l'aide des gestes. */
  return (
    <div
      className="pointer-events-none absolute z-[var(--z-band)]"
      style={
        narrow
          ? { top: insets.top + 6, left: 6, right: 6 }
          : {
              bottom: `calc(16px + ${MAT_LIFT})`,
              left: `calc(${insets.left}px + (100% - ${insets.left + insets.right}px) / 2)`,
              transform: 'translateX(-50%)',
              width: `min(560px, calc(100% - ${insets.left + insets.right + 48}px))`,
            }
      }
    >
      <div
        role="status"
        data-absence-tour={band.kind}
        className="hud paper-grain float relative overflow-hidden border border-l-[4px] border-[var(--ink)] px-[14px] pt-[8px] pb-[10px] font-(family-name:--font-body) text-[var(--ink)]"
      >
        <b className="eyebrow block">{eyebrow}</b>
        <p className="mt-[4px] text-[13px] leading-[1.38]">
          {stop === null ? (
            line
          ) : (
            <>
              <span className="mr-[4px] font-(family-name:--font-mono) text-[11.5px]">
                {stop.hour}
              </span>
              {stop.text}
            </>
          )}
        </p>
        {band.kind === 'stop' && (
          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-[3px] bg-[var(--notable)]"
            style={{ width: `${((band.index + 1) / tour.stops.length) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
