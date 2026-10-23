import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  depositSweep,
  SWEEP_MS,
  SWEEP_RANGE_KM,
  type SweepCandidate,
  type SweepHit,
} from '@/domain/deposit-sweep';
import { YIELD_OF } from '@/domain/economy';
import type { DepositKey } from '@/domain/ids';
import { ResourcePlate } from '@/emblems/Plate';
import { countryLabel, fr } from '@/i18n/fr';
import { useMapMotion } from '@/data/mapMotion';
import { MAT_LIFT_HUD, useBoardInsets } from '@/shell/viewport';
import type { MapEngine, SweepTag } from './engine';
import { WASH } from './engine/deposit-basins';

/** A sweep the board asked for: a new `nonce` is a new wave. */
export type SweepRequest = {
  readonly nonce: number;
  readonly species: DepositKey;
  readonly candidates: ReadonlyArray<SweepCandidate>;
};

/** How long each name stays on the map from the moment the front reaches its basin, and its fades
 *  in and out (maquette `radar.js`). @a-mesurer */
const TAG_MS = 12_000;
const FADE_IN_MS = 250;
const FADE_OUT_MS = 1200;
/** Below the basin's point: clear of its drawn radius at the zoom one reads names at. */
const TAG_GAP_PX = 20;
const MARGIN_PX = 8;

/**
 * **Ce que la sonde pose sur la carte** (#249, maquette `radar-gisements/choisie.html`) : l'onde
 * et l'éveil des bassins sont au moteur ; ici, le cartouche de chaque gisement atteint (espèce,
 * lieu, distance, cap, « hors de portée »), la flèche au bord de la carte quand il est hors champ,
 * et la dépêche quand l'onde n'en trouve aucun. Un clic y mène la caméra ; Échap efface tout.
 */
export function SweepOverlay({
  engine,
  sweep,
  onEnd,
}: {
  engine: MapEngine | null;
  sweep: SweepRequest;
  onEnd: () => void;
}) {
  const motion = useMapMotion();
  const still = motion !== 'full';
  const insets = useBoardInsets();
  const result = useMemo(() => {
    if (engine === null) return null;
    const from = engine.sweepOrigin();
    return { from, ...depositSweep(sweep.candidates, from) };
  }, [engine, sweep]);
  const [tags, setTags] = useState<ReadonlyArray<SweepTag> | null>(null);
  const [ran, setRan] = useState(still);

  useEffect(() => {
    if (engine === null || result === null) return;
    engine.onSweep = setTags;
    engine.sweepDeposits({
      from: result.from,
      species: sweep.species,
      targets: result.found.map((hit) => ({
        id: hit.deposit.id,
        lonLat: hit.deposit.lonLat,
        hitMs: hit.hitMs,
      })),
    });
    // The last name goes TAG_MS after its basin is reached; the dispatch, TAG_MS after the wave.
    const last = still
      ? 0
      : result.found.length === 0
        ? SWEEP_MS
        : Math.max(...result.found.map((hit) => hit.hitMs));
    const ran = setTimeout(() => setRan(true), still ? 0 : SWEEP_MS);
    const ended = setTimeout(onEnd, last + TAG_MS);
    return () => {
      clearTimeout(ran);
      clearTimeout(ended);
      engine.onSweep = undefined;
      engine.sweepDeposits(null);
    };
    // A new wave only for a new request: the end callback and the motion are read at launch; a
    // setting changed mid-wave applies to the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, result]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEnd();
    };
    addEventListener('keydown', escape);
    return () => removeEventListener('keydown', escape);
  }, [onEnd]);

  if (engine === null || result === null) return null;
  const goTo = (hit: SweepHit) => engine.journeyTo([], [hit.deposit.lonLat]);
  const placeOf = (hit: SweepHit) =>
    engine.regionAtLonLat(hit.deposit.lonLat)?.name ?? countryLabel(hit.deposit.country);
  return (
    <div className="pointer-events-none absolute inset-0 z-[var(--z-band)] overflow-hidden">
      {tags?.map((tag) => {
        const hit = result.found.find((one) => one.deposit.id === tag.id);
        if (hit === undefined) return null;
        const place = placeOf(hit);
        return (
          <SweepTagCard
            key={tag.id}
            tag={tag}
            hit={hit}
            place={place}
            still={still}
            onGo={() => goTo(hit)}
          />
        );
      })}
      {ran && result.found.length === 0 && (
        <div
          role="status"
          // Over the personal board's mat, as the gesture hint.
          style={{ bottom: insets.bottom + 28, marginBottom: MAT_LIFT_HUD }}
          className="hud paper-grain float pointer-events-auto absolute left-1/2 max-w-[min(520px,calc(100%-28px))] -translate-x-1/2 border border-[var(--ink)] px-[14px] pt-[8px] pb-[10px] font-(family-name:--font-body) text-[var(--ink)]"
        >
          <p className="text-[10px] font-semibold tracking-[.16em] text-[var(--critical)] uppercase">
            {fr.sweep.dispatch}
          </p>
          <p className="mt-[3px] text-[14px] leading-[1.35]">
            {fr.sweep.none(sweep.species, SWEEP_RANGE_KM)}
            {result.nearest !== null && (
              <>
                {' '}
                {fr.sweep.nearest(placeOf(result.nearest), fr.sweep.km(result.nearest.km))}{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => result.nearest !== null && goTo(result.nearest)}
                >
                  {fr.sweep.goThere}
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** The cartouche, under its basin or at the edge of the map with an arrow pointing the way. */
function SweepTagCard({
  tag,
  hit,
  place,
  still,
  onGo,
}: {
  tag: SweepTag;
  hit: SweepHit;
  place: string;
  still: boolean;
  onGo: () => void;
}) {
  const species = hit.deposit.deposit;
  // Told when the front reaches its basin, the card lives TAG_MS from its own mount.
  const [phase, setPhase] = useState<'entering' | 'held' | 'leaving' | 'gone'>('entering');
  useEffect(() => {
    const held = requestAnimationFrame(() => setPhase('held'));
    const leaving = setTimeout(() => setPhase('leaving'), TAG_MS - FADE_OUT_MS);
    const gone = setTimeout(() => setPhase('gone'), TAG_MS);
    return () => {
      cancelAnimationFrame(held);
      clearTimeout(leaving);
      clearTimeout(gone);
    };
  }, []);
  // Under its basin, the card is kept inside the map: by an edge it would be cut by it.
  const card = useRef<HTMLButtonElement>(null);
  const [nudge, setNudge] = useState(0);
  useLayoutEffect(() => {
    const node = card.current;
    const map = node?.offsetParent;
    if (!node || !(map instanceof HTMLElement) || tag.off) return setNudge(0);
    const left = tag.x - node.offsetWidth / 2;
    setNudge(
      Math.max(0, MARGIN_PX - left) +
        Math.min(0, map.clientWidth - MARGIN_PX - left - node.offsetWidth),
    );
  }, [tag.x, tag.off]);
  const cos = Math.cos(tag.angle);
  const sin = Math.sin(tag.angle);
  // At the edge the card stands behind the arrow's tip, towards the middle of the map.
  const sideways = Math.abs(cos) > Math.abs(sin);
  const anchor = !tag.off
    ? `translate(calc(-50% + ${nudge}px), ${TAG_GAP_PX}px)`
    : sideways
      ? `translate(${cos > 0 ? 'calc(-100% - 18px)' : '18px'}, -50%)`
      : `translate(-50%, ${sin > 0 ? 'calc(-100% - 18px)' : '18px'})`;
  if (phase === 'gone') return null;
  const fade = {
    opacity: phase === 'held' ? 1 : 0,
    transition: still
      ? 'none'
      : `opacity ${phase === 'leaving' ? FADE_OUT_MS : FADE_IN_MS}ms linear`,
  };
  return (
    <>
      {tag.off && (
        <span
          aria-hidden
          className="absolute h-0 w-0"
          style={{
            left: tag.x,
            top: tag.y,
            transform: `rotate(${tag.angle}rad)`,
            ...fade,
          }}
        >
          <span className="absolute top-[-0.75px] left-[-26px] w-[16px] border-t-[1.5px] border-[var(--ink)]" />
          <span className="absolute top-[-7px] left-[-12px] border-y-[7px] border-l-[12px] border-y-transparent border-l-[var(--ink)]" />
        </span>
      )}
      <button
        ref={card}
        type="button"
        title={fr.sweep.goTo(species, place)}
        onClick={onGo}
        className="group pointer-events-auto absolute w-max border border-(color:--ink)/60 bg-[rgb(241_232_210/95%)] px-[8px] pt-[3px] pb-[4px] text-left font-(family-name:--font-body) text-[var(--ink)] shadow-[0_4px_10px_rgb(20_14_6/25%)]"
        style={{
          left: tag.x,
          top: tag.y,
          transform: anchor,
          borderTop: `3px solid ${WASH[species]}`,
          ...fade,
        }}
      >
        <span className="flex items-center gap-[5px] text-[12.5px] font-semibold whitespace-nowrap">
          {!tag.off && <ResourcePlate resource={YIELD_OF[species]} height={15} boxed={false} />}
          <span className="group-hover:underline">
            {fr.sweep.species(species)} · {place}
          </span>
        </span>
        <span className="block font-(family-name:--font-mono) text-[11.5px] whitespace-nowrap tabular-nums">
          {fr.sweep.km(hit.km)} <span className="text-[var(--ink-soft)]">·</span>{' '}
          {fr.sweep.heading(hit.bearing)}
        </span>
        {!hit.reached && (
          <span className="block font-(family-name:--font-display) text-[12px] text-[var(--critical)] italic">
            {fr.sweep.outOfReach}
          </span>
        )}
      </button>
    </>
  );
}
