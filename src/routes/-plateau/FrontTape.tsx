import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { fr, cardinalLabel } from '@/i18n/fr';
import { asClockTime } from '@/domain/duration';
import { frontChangesOf, type DistanceStep, type FrontNature } from '@/domain/front-sound';
import type { PlayerView } from '@/domain/player-view';
import {
  hearFront,
  replay,
  resetFront,
  subscribeTape,
  tapeNow,
  type TapeLine,
} from '@/map/front-sound';

/**
 * **Le front s'entend au plateau** (#405) : chaque nouvelle vue se compare à la précédente, et ce
 * qui a changé fait une phrase. La première vue d'une saison amorce seulement, en silence, comme
 * le télégraphe sur l'arriéré ; une reconnexion se traite comme un retour d'onglet.
 */
export function useFrontSound(
  view: PlayerView | null,
  seasonId: string,
  interrupted: boolean,
): void {
  const previous = useRef<{ readonly season: string; readonly view: PlayerView } | null>(null);
  const cut = useRef(false);
  useEffect(() => {
    if (interrupted) cut.current = true;
  }, [interrupted]);
  useEffect(() => {
    if (view === null) return;
    const before = previous.current;
    previous.current = { season: seasonId, view };
    if (before === null) return;
    if (before.season !== seasonId) {
      resetFront();
      return;
    }
    if (before.view === view) return;
    hearFront(frontChangesOf(before.view, view), cut.current);
    cut.current = false;
  }, [view, seasonId]);
}

const ROW: Record<DistanceStep, number> = { near: 9, mid: 27, far: 45 };

/** Les pictos de la maquette D, à l'encre, posés sur la ligne de leur distance. */
const ICON: Record<FrontNature, string> = {
  combat: 'M6 6l12 12M18 6L6 18M12 2v3M12 19v3M2 12h3M19 12h3',
  fleet: 'M3 14h18l-3 5H6zM8 14V9h7l2 5M11 9V5',
  column: 'M4 7l5 5-5 5M10 7l5 5-5 5M16 7l5 5-5 5',
  aviation: 'M12 3v18M3 11l9 2.5 9-2.5M8.5 20l3.5-1 3.5 1',
  construction: 'M4 20l9-9M11 5l4-2 6 6-2 4-4-4z',
  edition: 'M5 5h14v14H5zM8 9h8M8 12h8M8 15h5',
  capture: 'M6 21V4M6 4h11l-2 4 2 4H6',
};

/**
 * **La bande du front**, au-dessus du fil du télégraphe : trois lignes, proche, moyen, loin ;
 * chaque phrase y laisse son picto et une légende. Toucher une ligne la rejoue.
 */
export function FrontTape() {
  const lines = useSyncExternalStore(subscribeTape, tapeNow);
  const strip = useRef<HTMLDivElement>(null);
  // La dernière phrase est à droite, toujours visible : les plus anciennes se déroulent à gauche.
  useLayoutEffect(() => {
    strip.current?.scrollTo({ left: strip.current.scrollWidth });
  }, [lines]);
  return (
    <div
      aria-label={fr.frontTape.label}
      className="relative flex h-[74px] shrink-0 border-b border-[var(--ink)] max-md:h-[64px]"
      style={{
        background:
          'repeating-linear-gradient(0deg, transparent 0 17px, color-mix(in srgb, var(--ink) 10%, transparent) 17px 18px), color-mix(in srgb, var(--paper) 60%, white)',
      }}
    >
      <div className="w-[58px] shrink-0 border-r border-[var(--ink)] bg-[var(--paper)] pt-[6px] pl-2 text-[8.5px] leading-[18px] font-semibold tracking-[.1em] whitespace-pre text-[var(--ink-soft)] uppercase max-md:w-[44px] max-md:pl-[5px] max-md:text-[7.5px] max-md:leading-[15px]">
        {fr.frontTape.steps.join('\n')}
      </div>
      <div ref={strip} className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        {lines.length === 0 ? (
          <span className="self-center pl-3 font-(family-name:--font-text) text-[13px] leading-[1.3] text-[var(--ink-soft)] italic">
            {fr.frontTape.empty}
          </span>
        ) : (
          <span className="ml-auto flex">
            {lines.map((line) => (
              <Phrase key={line.id} line={line} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function Phrase({ line }: { line: TapeLine }) {
  const { change } = line;
  const y = ROW[change.step];
  const width = change.inbound ? 40 : 20;
  const where = [
    fr.frontTape.step[change.step],
    ...(change.bearing === null ? [] : [cardinalLabel(change.bearing)]),
  ];
  const legend = [
    asClockTime(line.at),
    fr.frontTape.nature[change.nature],
    ...where,
    ...(change.inbound ? [fr.frontTape.inbound] : []),
  ].join(' · ');
  return (
    <button
      type="button"
      title={fr.frontTape.replay}
      onClick={() => replay(line)}
      className="grid flex-none cursor-pointer grid-rows-[54px_auto] border-l border-dashed border-(color:--ink)/35 px-3 text-left hover:bg-(--arc-mine)/14 max-md:grid-rows-[46px_auto] max-md:px-2"
    >
      <svg
        viewBox={`0 0 ${width} 54`}
        width={width}
        className={`block h-[54px] max-md:h-[46px] ${line.silent ? 'opacity-40' : ''}`}
        aria-hidden
      >
        <g
          stroke="var(--ink)"
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <svg x={2} y={y - 8} width={16} height={16} viewBox="0 0 24 24">
            <path d={ICON[change.nature]} />
          </svg>
          {change.inbound && (
            <>
              <path d={`M24 ${y + 5} L30 ${y - 1} M30 ${y - 1} L36 ${y - 7}`} strokeWidth={2.4} />
              <path d={`M32 ${y - 7} h4 v4`} />
            </>
          )}
        </g>
      </svg>
      <small className="pb-1 font-(family-name:--font-mono) text-[8.5px] leading-none font-semibold whitespace-nowrap text-[var(--ink-soft)] uppercase">
        {legend}
        {line.silent && (
          <span className="text-[var(--notable)]">{` · ${fr.frontTape.silent}`}</span>
        )}
      </small>
    </button>
  );
}
