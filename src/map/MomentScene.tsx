import { useCallback, useEffect, useRef, useState } from 'react';
import { LOSS_INK } from '@/domain/nations';
import type { MapMotion } from '@/domain/map-motion';
import {
  FALL_HOLD_MS,
  FLY_MS,
  PULL_MS,
  TRACE_PEN_MS,
  momentBeatsOf,
  type Moment,
  type MomentBeat,
} from '@/domain/moments';
import { fr } from '@/i18n/fr';
import { CURTAIN_MS } from './AbsenceTour';
import type { MapEngine } from './engine';
import { useBoardInsets } from '@/shell/viewport';

/** @a-mesurer : les cachets et le trait de la victoire tiennent jusqu'à l'édition. */
const VICTORY_HOLD_MS = 8000;
/** @a-mesurer : les cachets de la victoire, à 50 contre 84 dans la maquette (`victoire`). */
const VICTORY_SEAL_SCALE = 0.6;

/**
 * **Un grand moment, joué sur la carte avant sa feuille** (#442) : la chute de mon QG, la fin de
 * la saison. Il part quand la carte se voit, le cadrage d'ouverture posé ; une feuille sur la
 * carte, et il n'y a pas de scène : la feuille s'ouvre. `skip` (une main sur la carte, une touche,
 * `onHandOnBoard`) saute à l'état final.
 * `onDone` ouvre la feuille, une fois. `sepiaHeld` retient le sépia jusqu'à son temps.
 */
export function useMomentScene(
  engine: MapEngine | null,
  moment: Moment | null,
  {
    covered,
    motion,
    lift,
    onDone,
  }: { covered: boolean; motion: MapMotion; lift: number; onDone: () => void },
): { big: Extract<Moment, { kind: 'victory' }> | null; sepiaHeld: boolean; skip: () => boolean } {
  const [big, setBig] = useState<Extract<Moment, { kind: 'victory' }> | null>(null);
  const [sepiaHeld, setSepiaHeld] = useState(false);
  const running = useRef(false);
  /** Each moment plays once: a second, later one (my fall, then the season's end) plays too. */
  const played = useRef<Moment | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const finish = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    running.current = false;
    setBig(null);
    setSepiaHeld(false);
    done.current();
  }, []);

  const skip = useCallback((): boolean => {
    if (!running.current) return false;
    engine?.liftStamps();
    finish();
    return true;
  }, [engine, finish]);

  useEffect(() => {
    if (moment === null || engine === null || played.current === moment) return;
    played.current = moment;
    if (covered) return finish();
    running.current = true;
    if (moment.kind === 'victory') setSepiaHeld(true);
    const distance = engine.cameraPose().distance;
    const full = motion === 'full';
    const play = ({ does, index = 0 }: MomentBeat) => {
      if (does === 'open') return finish();
      if (moment.kind === 'fall') {
        if (does === 'fly')
          engine.poseCamera(engine.cameraPose([moment.at], distance), full ? FLY_MS : 0, lift);
        else if (does === 'stamp')
          engine.inkBurst({
            kind: 'captured',
            at: moment.at,
            words: { word: fr.stamps.hqFallen, hour: moment.hour },
            ink: LOSS_INK,
            holdMs: FALL_HOLD_MS,
            over: true,
          });
        return;
      }
      const held = moment.held ?? [];
      if (does === 'pull' && moment.seven !== null)
        engine.pullBack(moment.seven, full ? PULL_MS : 0, lift);
      else if (does === 'seal')
        engine.inkBurst({
          kind: 'seal',
          at: held[index]!.at,
          words: { word: held[index]!.name, hour: moment.hour },
          ink: moment.ink,
          held: held.length,
          scale: VICTORY_SEAL_SCALE,
          holdMs: VICTORY_HOLD_MS,
          over: true,
        });
      else if (does === 'trace')
        engine.traceThrough(
          held.map((point) => point.at),
          moment.ink,
          TRACE_PEN_MS,
          VICTORY_HOLD_MS,
        );
      else if (does === 'big') setBig(moment);
      else if (does === 'sepia') setSepiaHeld(false);
    };
    const opening = Math.max(CURTAIN_MS, engine.settlesIn());
    timers.current = momentBeatsOf(moment, motion).map((beat) =>
      setTimeout(() => play(beat), opening + beat.at),
    );
    // The motion and the cover are read once, at the start: the scene does not change course.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, moment]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return { big, sepiaHeld, skip };
}

/** **Le grand tampon de la fin** (`victoire.html`, `.bigstamp`) : au centre de ce que la coque
 *  laisse de carte, pressé de 1,7 à 1 quand les animations sont actives. */
export function BigStamp({ moment }: { moment: Extract<Moment, { kind: 'victory' }> }) {
  const insets = useBoardInsets();
  return (
    <div
      role="status"
      className="moment-bigstamp"
      style={{ left: `calc(${insets.left}px + (100% - ${insets.left + insets.right}px) / 2)` }}
    >
      <b>{moment.word}</b>
      <span>{moment.line}</span>
      <span>★ {moment.hour} ★</span>
    </div>
  );
}
