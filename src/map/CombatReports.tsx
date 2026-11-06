import { useEffect, useLayoutEffect, useRef } from 'react';
import { REPORT_HOLD_MS, reportOf, seatsTagOf } from '@/domain/combat-on-map';
import type { ReplayView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { useMapMotion } from '@/data/mapMotion';
import { useBoardInsets } from '@/shell/viewport';
import type { MapEngine } from './engine';

/** The stamp stands this far above the combat's point, on the screen. */
const LIFT_PX = 52;
const MARGIN_PX = 8;
/** The seats tag hangs this far above the hull's point, under the stamp. */
const TAG_LIFT_PX = 22;
/** A finger needs at least this much to hit. */
const TOUCH_PX = 44;

/**
 * **Le tampon d'encre du compte-rendu** (#327, storyboard du combat) : l'issue d'un combat que la
 * carte a joué se lit là où l'on regardait — le titre depuis notre camp, nos pertes en pièces
 * dessous. Rouge quand on gagne, noir sinon. Un toucher ouvre le rejeu.
 *
 * Ce n'est pas `shell/Stamp` : celui-là constate un état et ne se touche pas, ni ne compte ; celui-ci
 * se pose sur la carte, porte un compte et mène au rejeu. Il se tient dans la carte libre : sous la
 * réglette et au-dessus du plateau personnel.
 */
export function CombatReports({
  reports,
  tags,
  engine,
  onOpen,
  onLift,
}: {
  reports: ReadonlyArray<ReplayView>;
  /** **The seats tags of the hulls going down** (#514), one per combat: hung before the stamp. */
  tags: ReadonlyArray<{ readonly view: ReplayView; readonly struck: boolean }>;
  engine: MapEngine | null;
  onOpen: (combatId: string) => void;
  onLift: (combatId: string) => void;
}) {
  const insets = useBoardInsets();
  const nodes = useRef(new Map<string, HTMLElement>());
  const tagNodes = useRef(new Map<string, HTMLElement>());
  const layer = useRef<HTMLDivElement>(null);

  // Nodes are born hidden: the next whole frame is the one that places them.
  useEffect(() => engine?.invalidate(), [engine, reports, tags]);

  // The stamps follow the map: placed at every whole frame the engine draws, which a drag, its
  // inertia, a resize and a turn all ask for — and as they are born.
  useLayoutEffect(() => {
    if (engine === null) return;
    const place = () => {
      const parent = layer.current?.getBoundingClientRect();
      if (parent === undefined) return;
      for (const { view } of tags) {
        const node = tagNodes.current.get(view.combatId);
        const at = engine.screenOf([view.point.lon, view.point.lat]);
        if (!node) continue;
        const inside =
          at !== null &&
          at.x >= parent.left &&
          at.x <= parent.right &&
          at.y >= parent.top &&
          at.y <= parent.bottom;
        node.style.visibility = inside ? 'visible' : 'hidden';
        if (inside)
          node.parentElement!.style.transform = `translate(${at.x - parent.left}px, ${at.y - parent.top}px)`;
      }
      for (const view of reports) {
        const node = nodes.current.get(view.combatId);
        const at = engine.screenOf([view.point.lon, view.point.lat]);
        if (!node) continue;
        const inside =
          at !== null &&
          at.x >= parent.left &&
          at.x <= parent.right &&
          at.y >= parent.top &&
          at.y <= parent.bottom;
        node.style.visibility = inside ? 'visible' : 'hidden';
        if (!inside) continue;
        const wrap = node.parentElement!;
        wrap.style.transform = `translate(${at.x - parent.left}px, ${at.y - parent.top}px)`;
        // Kept in the free map: clear of the band at the top, the mat at the foot, the columns.
        const box = node.getBoundingClientRect();
        const { left, right, top, bottom } = insets;
        const free = {
          left: parent.left + left + MARGIN_PX,
          right: parent.right - right - MARGIN_PX,
          top: parent.top + top + MARGIN_PX,
          bottom: parent.bottom - bottom - MARGIN_PX,
        };
        const dx = Math.max(0, free.left - box.left) + Math.min(0, free.right - box.right);
        const dy = Math.max(0, free.top - box.top) + Math.min(0, free.bottom - box.bottom);
        wrap.style.transform = `translate(${at.x - parent.left + dx}px, ${at.y - parent.top + dy}px)`;
      }
    };
    engine.onReportsFrame = place;
    place();
    return () => {
      engine.onReportsFrame = undefined;
    };
  }, [engine, reports, tags, insets]);

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-[var(--z-band)]">
      {tags.map(({ view, struck }) => (
        <SeatsTag
          key={view.combatId}
          tag={seatsTagOf(view)}
          struck={struck}
          register={(node) =>
            node
              ? tagNodes.current.set(view.combatId, node)
              : tagNodes.current.delete(view.combatId)
          }
        />
      ))}
      {reports.map((view) => (
        <ReportStamp
          key={view.combatId}
          view={view}
          sea={engine?.landAt([view.point.lon, view.point.lat]) === false}
          register={(node) =>
            node ? nodes.current.set(view.combatId, node) : nodes.current.delete(view.combatId)
          }
          onOpen={() => onOpen(view.combatId)}
          onLift={() => onLift(view.combatId)}
        />
      ))}
    </div>
  );
}

/**
 * **L'étiquette de places de la coque qui coule** (#514, storyboard « 5. Le naufrage ») : « Crg · 9/12 »
 * au-dessus d'elle, barrée quand elle s'enfonce. Elle ne dit que ce que le camp qui perd ses
 * passagers a reçu (#513) : l'autre n'en a pas.
 */
function SeatsTag({
  tag,
  struck,
  register,
}: {
  tag: { readonly sign: string; readonly whole: string } | null;
  struck: boolean;
  register: (node: HTMLElement | null) => void;
}) {
  return (
    <div className="absolute top-0 left-0">
      <div
        ref={register}
        data-seats-tag
        className="hud pointer-events-none border-[1.5px] border-[var(--ink)] px-[6px] py-[1px] font-(family-name:--font-body) text-[11px] leading-[1.3] font-semibold tracking-[.04em] whitespace-nowrap text-[var(--ink)]"
        style={{
          visibility: 'hidden',
          background: 'color-mix(in srgb, var(--paper) 88%, transparent)',
          transform: `translate(-50%, calc(-100% - ${TAG_LIFT_PX}px / var(--hud-scale)))`,
        }}
      >
        {struck ? <s>{tag?.sign}</s> : tag?.whole}
      </div>
    </div>
  );
}

function ReportStamp({
  view,
  sea,
  register,
  onOpen,
  onLift,
}: {
  view: ReplayView;
  /** At sea (#324), an engagement rather than a position. */
  sea: boolean;
  register: (node: HTMLElement | null) => void;
  onOpen: () => void;
  onLift: () => void;
}) {
  const motion = useMapMotion();
  const ink = useRef<HTMLDivElement>(null);
  const { title, losses, won } = reportOf(view, sea ? 'sea' : 'land');

  useEffect(() => {
    const timer = setTimeout(onLift, REPORT_HOLD_MS);
    return () => clearTimeout(timer);
    // One lift per stamp: a re-render does not give it a longer life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pressed from 1.35 to 1 as the prototype does; flat, with no press, when motion is not full.
  useEffect(() => {
    if (motion !== 'full') return;
    ink.current?.animate(
      [
        { transform: 'scale(1.35)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, [motion]);

  return (
    <div className="absolute top-0 left-0">
      {/* Touchable by the map's own press (`WorldMap`): a drag or the wheel that starts on the
          stamp is the map's, and only a tap or a click opens the replay. The button stays for the
          keyboard and the screen reader. */}
      <button
        ref={register}
        type="button"
        data-report={view.combatId}
        aria-label={`${title}. ${fr.replay.report.open}`}
        onClick={onOpen}
        className="hud pointer-events-none flex flex-col items-center justify-center bg-transparent p-0"
        style={{
          visibility: 'hidden',
          minWidth: `calc(${TOUCH_PX}px / var(--hud-scale))`,
          minHeight: `calc(${TOUCH_PX}px / var(--hud-scale))`,
          transform: `translate(-50%, calc(-100% - ${LIFT_PX}px / var(--hud-scale))) rotate(-4deg)`,
          color: won ? 'var(--critical)' : 'var(--ink)',
        }}
      >
        <div
          ref={ink}
          className="border-[2.5px] border-current px-[10px] pt-[5px] pb-[6px] text-center whitespace-nowrap"
          style={{
            background: 'color-mix(in srgb, var(--paper) 82%, transparent)',
            boxShadow:
              '0 0 0 1.5px color-mix(in srgb, var(--paper) 82%, transparent), inset 0 0 0 1px color-mix(in srgb, currentColor 45%, transparent)',
          }}
        >
          <b className="block font-(family-name:--font-display) text-[15px] leading-[1.05] font-bold tracking-[.06em] uppercase max-[700px]:text-[13px]">
            {title}
          </b>
          <span className="mt-[2px] block font-(family-name:--font-body) text-[10.5px] leading-[1.3] font-semibold tracking-[.04em] text-[var(--ink)] max-[700px]:text-[9.5px]">
            {losses}
          </span>
        </div>
      </button>
    </div>
  );
}
