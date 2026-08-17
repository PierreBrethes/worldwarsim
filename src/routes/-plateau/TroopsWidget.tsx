import { useEffect, useMemo, useState } from 'react';
import { fr, roleLabel } from '@/i18n/fr';
import { asHoursMinutes, asLocalTime } from '@/domain/duration';
import type { MovementType } from '@/domain/ids';
import { currentMinutes, type ArcView, type PlayerView } from '@/domain/player-view';
import { marchingTroopIds, representativeRole, stationGroups, type StationGroup } from '@/domain/troops';
import { UnitSprite } from '@/emblems/UnitSprite';
import { keepTroopsCollapsed, readTroopsCollapsed } from '@/data/settings';
import { useClock } from '@/shell/clock';
import { DragHandle, Draggable } from './Draggable';

/**
 * **The widget of troops — the only home of the list** since the Troops window died (decision
 * 13a). Same visual family as the reserves: a folding card laid on the board, never a surface
 * of its own.
 *
 * Two sections, and the screen has to make their difference obvious **without a sentence**:
 *
 * - *stationnaires* wear a full frame, a ground and a chevron — they are buttons, they open the
 *   garrison and arm a column;
 * - *en mouvement* are rules only, in the manner of a departures board. **No handler at all**:
 *   not a disabled button, not a greyed-out menu — nothing to press. A movement is irreversible
 *   once sent, and that is the thesis of the game rather than a limitation of this widget.
 *
 * The intelligence block the mockup draws is deliberately **not implemented**: no detection
 * system exists — the listening station has no radius and no enemy arc is surveyed anywhere — so
 * it would be an interface wired onto nothing. Its place is here, between the two sections and
 * the fold, and the open question is number 14 of the 18/08 session (see
 * `WWS/docs/design/propositions/flux-mouvement-en-carte.md`, § Renseignement).
 */
export function TroopsWidget({
  view,
  hoveredMovement,
  onHover,
  onOpenGarrison,
  onFollow,
}: {
  view: PlayerView;
  hoveredMovement: string | null;
  onHover: (id: string | null) => void;
  /** The widget's door into the garrison — the same one the building's mast opens. */
  onOpenGarrison: (stationId: string | null, preselect: ReadonlyArray<string>) => void;
  onFollow: (arcId: string) => void;
}) {
  const now = useClock();
  const [collapsed, setCollapsed] = useState(readTroopsCollapsed);

  useEffect(() => {
    keepTroopsCollapsed(collapsed);
  }, [collapsed]);

  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const standing = useMemo(() => stationGroups(view.me, marching), [view.me, marching]);
  const flying = view.arcs.filter((arc): arc is Extract<ArcView, { state: 'mine' }> =>
    arc.state === 'mine',
  );
  const stationName = useMemo(() => namer(view), [view]);

  return (
    <Draggable
      remember="troops"
      className="hud absolute bottom-4 left-4 z-10 w-[340px] border border-[var(--ink-quiet)] font-[var(--font-body)]"
    >
      <DragHandle className="flex items-baseline gap-2 border-b border-[var(--ink-quiet)] bg-[var(--desk)] px-[11px] py-[7px]">
        <span className="eyebrow-dark flex-1 tracking-[.22em]">{fr.troops.header}</span>
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--paper-dim-2)]">
          {collapsed
            ? fr.troops.collapsed
            : `${fr.troops.cap(view.me.troops.length, view.me.troopCap)} · ${fr.troops.slots(
                view.me.slots.used,
                view.me.slots.total,
              )}`}
        </span>
        <button
          type="button"
          aria-expanded={!collapsed}
          title={collapsed ? fr.troops.expand : fr.troops.collapse}
          onClick={() => setCollapsed((previous) => !previous)}
          className="h-[13px] w-[13px] shrink-0 cursor-pointer border border-[var(--ink-quiet)] text-[10px] leading-[11px] text-[var(--paper-dim)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {collapsed ? '+' : '–'}
        </button>
      </DragHandle>

      <div style={{ background: 'rgba(0,0,0,.55)' }}>
        {collapsed ? (
          <Folded flying={flying} standing={standing} loadedAt={view.loadedAt} now={now} />
        ) : (
          <>
            <SectionHead title={fr.troops.stationary} power={fr.troops.stationaryPower} lit />
            {standing.length === 0 ? (
              <p className="px-[11px] pb-3 text-[11.5px] text-[var(--paper-dim)]">
                {fr.troops.none}
              </p>
            ) : (
              <div className="flex flex-col gap-[6px] px-[11px] pb-3">
                {standing.map((group) => (
                  <StandingCard
                    key={group.key}
                    group={group}
                    nation={view.me.nation}
                    name={stationName(group)}
                    onOpen={() => onOpenGarrison(group.stationId, group.troopIds)}
                  />
                ))}
              </div>
            )}

            <SectionHead title={fr.troops.moving} power={fr.troops.movingPower} lit={false} />
            <div className="flex flex-col px-[11px] pb-3">
              {flying.map((arc) => (
                <MovingCard
                  key={arc.id}
                  arc={arc}
                  nation={view.me.nation}
                  loadedAt={view.loadedAt}
                  now={now}
                  designated={arc.id === hoveredMovement}
                  onHover={onHover}
                  onFollow={onFollow}
                />
              ))}
              {flying.length === 0 && (
                <p className="text-[11.5px] text-[var(--paper-dim)]">{fr.troops.foldedQuiet}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Draggable>
  );
}

/** Folded, **two lines and never more**: the deadline and the head count (brief 13a). */
function Folded({
  flying,
  standing,
  loadedAt,
  now,
}: {
  flying: ReadonlyArray<Extract<ArcView, { state: 'mine' }>>;
  standing: ReadonlyArray<StationGroup>;
  loadedAt: number;
  now: number;
}) {
  const next = flying.reduce<number | null>(
    (soonest, arc) => (soonest === null ? arc.minutesLeft : Math.min(soonest, arc.minutesLeft)),
    null,
  );
  const held = standing.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="flex flex-col gap-[5px] px-[11px] py-[9px]">
      <span className="flex items-center gap-[9px]">
        <span
          className="h-[5px] w-[5px] shrink-0"
          style={{ background: next === null ? 'var(--paper-dim-2)' : 'var(--notable)' }}
        />
        <span className="text-[12.5px] text-[var(--paper-dim)]">
          {next === null
            ? fr.troops.foldedQuiet
            : fr.troops.foldedFlight(
                flying.length,
                asHoursMinutes(currentMinutes(next, loadedAt, now)),
              )}
        </span>
      </span>
      <span className="flex items-center gap-[9px]">
        <span className="h-[5px] w-[5px] shrink-0 border border-[var(--ink-quiet)]" />
        <span className="text-[12.5px] text-[var(--paper-dim)]">
          {fr.troops.foldedStanding(held)}
        </span>
      </span>
    </div>
  );
}

function SectionHead({ title, power, lit }: { title: string; power: string; lit: boolean }) {
  return (
    <div className="flex items-center justify-between px-[11px] pt-[9px] pb-[6px]">
      <span
        className="text-[10px] tracking-[.2em] uppercase"
        style={{ color: lit ? 'var(--notable)' : 'var(--paper-dim)' }}
      >
        {title}
      </span>
      <span className="font-[var(--font-mono)] text-[10px] text-[var(--paper-dim-2)]">{power}</span>
    </div>
  );
}

/** A frame, a ground, a chevron: everything about this card says it is pressed. */
function StandingCard({
  group,
  nation,
  name,
  onOpen,
}: {
  group: StationGroup;
  nation: string;
  name: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={fr.troops.open(name)}
      className="flex cursor-pointer items-center gap-[10px] border border-[var(--ink-quiet)] bg-[rgba(228,216,189,.045)] px-[9px] py-[7px] text-left hover:border-[var(--notable)] hover:bg-[rgba(228,216,189,.1)]"
    >
      <UnitSprite nation={nation} role={group.role} height={26} width={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--paper)]">
          {roleLabel(group.role, group.count)} · {group.count}
        </span>
        <span className="block truncate font-[var(--font-mono)] text-[10.5px] text-[var(--paper-dim)]">
          {name} · {fr.troops.strength(group.strength, group.nominalStrength)}
        </span>
      </span>
      <span className="shrink-0 text-[13px] text-[var(--notable)]">›</span>
    </button>
  );
}

/**
 * The departures-board card. It hovers and it can be followed with the camera, and that is the
 * whole of it — **there is no click handler that commands anything**, which is how the rule
 * "observable, never orderable" is checked: by the absence of a handler, not by a disabled
 * control (brief criteria).
 */
function MovingCard({
  arc,
  nation,
  loadedAt,
  now,
  designated,
  onHover,
  onFollow,
}: {
  arc: Extract<ArcView, { state: 'mine' }>;
  nation: string;
  loadedAt: number;
  now: number;
  designated: boolean;
  onHover: (id: string | null) => void;
  onFollow: (arcId: string) => void;
}) {
  const remaining = currentMinutes(arc.minutesLeft, loadedAt, now);
  const total = arc.progress >= 1 ? arc.minutesLeft : arc.minutesLeft / (1 - arc.progress);
  const share = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1;
  const role = representativeRole(arc.stack);

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => onHover(arc.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(arc.id)}
      onBlur={() => onHover(null)}
      onClick={() => onFollow(arc.id)}
      onKeyDown={(key) => key.key === 'Enter' && onFollow(arc.id)}
      title={fr.troops.observe(`${arc.originLabel} → ${arc.destinationLabel}`)}
      className="cursor-pointer border-b border-[var(--ink-quiet)] py-[8px] first:border-t"
      style={{ opacity: designated ? 1 : 0.86 }}
    >
      <div className="flex items-center gap-[8px]">
        <span className="flex shrink-0 text-[var(--paper-dim)]">
          <TypeMark type={arc.type} />
        </span>
        <span className="truncate text-[12.5px] font-semibold text-[var(--paper)]">
          {arc.originLabel}
        </span>
        <span
          className="relative h-[7px] min-w-[40px] flex-1"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(228,216,189,.22) 0 1px, transparent 1px 5px)',
          }}
        >
          <span
            className="absolute inset-y-0 left-0"
            style={{ width: `${share * 100}%`, background: 'var(--notable)' }}
          />
        </span>
        <span className="truncate text-[12.5px] font-semibold text-[var(--paper)]">
          {arc.destinationLabel}
        </span>
        {role && (
          <span className="shrink-0">
            <UnitSprite nation={nation} role={role} height={18} width={26} />
          </span>
        )}
      </div>
      <div className="mt-[4px] flex justify-between font-[var(--font-mono)] text-[10.5px] text-[var(--paper-dim)]">
        <span>{fr.troops.remaining(asHoursMinutes(remaining))}</span>
        <span>{fr.troops.arrivalAt(asLocalTime(loadedAt + arc.minutesLeft * 60_000))}</span>
      </div>
      {arc.borderWait && (
        <div className="mt-[4px] flex items-center gap-[7px]">
          <span className="h-[5px] w-[5px] shrink-0" style={{ background: 'var(--notable)' }} />
          <span className="text-[10.5px] tracking-[.1em] text-[var(--notable)] uppercase">
            {fr.troops.restMark(
              asLocalTime(loadedAt + arc.borderWait.resolutionInMinutes * 60_000),
            )}
          </span>
        </div>
      )}
      {/* The decoy's mark belongs to its owner alone — an adversary reads an ordinary arc
          (fiche 04). It cannot appear yet: nothing sends a decoy. */}
      {arc.type === 'decoy' && (
        <div className="mt-[4px] flex items-center gap-[7px]">
          <span className="h-[5px] w-[5px] shrink-0 border border-[var(--ink-quiet)]" />
          <span className="text-[10.5px] tracking-[.1em] text-[var(--paper-dim-2)] uppercase">
            {fr.troops.decoyMark}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The type pictograms of the mockup, at the trait. Local to this widget: the compass rose draws
 * the same three at its own scale and neither of them gains from a shared file of six paths.
 */
const MARKS: Readonly<Record<MovementType, string>> = {
  attack: 'M8.7 1.4 H11.3 V10.8 H8.7 Z M8.2 10.4 H12.8 L13.9 18.6 H9.5 Z',
  raid: 'M2.5 2.6 H4.6 V17.6 H2.5 Z M5.6 3 H16.4 L13.6 7.2 L16.4 11.4 H5.6 Z',
  outpost: 'M10 1.75 L18.5 8.5 H16.7 V18 H3.3 V8.5 H1.5 Z',
  agent: 'M4.5 11.9 C4.5 8 6.9 5.2 10 5.2 C13.1 5.2 15.5 8 15.5 11.9 Z M1.3 11.3 C1.3 14.9 5.2 16.1 10 16.1 C14.8 16.1 18.7 14.9 18.7 11.3 Z',
  decoy: 'M10 1 C12.8 2.9 13.7 5.9 12.8 9.2 H7.2 C6.3 5.9 7.2 2.9 10 1 Z',
  return: 'M10 2.4 L3 9.4 H6.6 V17.6 H13.4 V9.4 H17 Z',
};

export function TypeMark({ type, size = 15 }: { type: MovementType; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden className="block">
      {type === 'attack' ? (
        <>
          <path d={MARKS.attack} transform="rotate(-28 10 10)" />
          <path d={MARKS.attack} transform="rotate(28 10 10)" />
        </>
      ) : (
        <path d={MARKS[type]} />
      )}
    </svg>
  );
}

/**
 * What an address is called. A building answers with its name and its region — "Caserne ·
 * Bouches-du-Rhône" — an outpost with the country it stands in, and `null` is home. A station
 * the view no longer carries falls back to home rather than printing an id.
 */
function namer(view: PlayerView): (group: StationGroup) => string {
  const buildings = new Map(view.me.buildings.map((building) => [building.id, building]));
  const regions = new Map(view.me.regions.map((region) => [region.id, region.name]));
  const outposts = new Map(view.me.outposts.map((outpost) => [outpost.id, outpost]));

  return (group) => {
    if (group.stationId === null) return fr.troops.atHome;
    const outpost = outposts.get(group.stationId);
    if (outpost) return fr.troops.garrisonAt(outpost.hostCountry);
    const building = buildings.get(group.stationId);
    if (!building) return fr.troops.atHome;
    const region = regions.get(building.regionId);
    return region === undefined ? building.name : `${building.name} · ${region}`;
  };
}
