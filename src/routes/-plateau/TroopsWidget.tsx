import { useEffect, useMemo, useState } from 'react';
import { UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { cardinalLabel, fr, roleLabel } from '@/i18n/fr';
import { asDuration, asLocalTime } from '@/domain/duration';
import type { MovementType } from '@/domain/ids';
import {
  currentMinutes,
  type ArcView,
  type PlayerView,
  type TroopStation,
} from '@/domain/player-view';
import {
  marchingTroopIds,
  representativeRole,
  stationGroups,
  type StationGroup,
} from '@/domain/troops';
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
 * The third section is **renseignement**, and it holds the one detection the game has: what a
 * posted troop saw pass within `SCOUT_RADIUS_KM` (ADR 0019 §5). It reads like the second — rules
 * only, no handler — because a sighting is even less orderable than a column of one's own. It
 * carries neither type nor composition, since the server sends none (design sheet 04), and it
 * states the rule that would otherwise be read as a fault: **the survey is computed at the
 * departure of the movement, so a troop posted afterwards never sees it.**
 */
export function TroopsWidget({
  view,
  hoveredMovement,
  selectedStation,
  onHover,
  onOpenGarrison,
  onFollow,
}: {
  view: PlayerView;
  hoveredMovement: string | null;
  /** The address key the garrison panel is open on, or that a column is armed out of —
   *  `null` when nothing is selected at all. A card reads as pressed while it matches. */
  selectedStation: string | null;
  onHover: (id: string | null) => void;
  /** The widget's door into the garrison — the same one the building's mast opens. */
  onOpenGarrison: (station: TroopStation, preselect: ReadonlyArray<string>) => void;
  onFollow: (arcId: string) => void;
}) {
  const now = useClock();
  const [collapsed, setCollapsed] = useState(readTroopsCollapsed);

  useEffect(() => {
    keepTroopsCollapsed(collapsed);
  }, [collapsed]);

  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const standing = useMemo(() => stationGroups(view.me, marching), [view.me, marching]);
  const flying = view.arcs.filter(
    (arc): arc is Extract<ArcView, { state: 'mine' }> => arc.state === 'mine',
  );
  /** **Un leurre n'est pas une colonne, donc il n'est pas dans la liste des colonnes** : une
   *  ligne sans troupe glissée entre des piles se lirait comme des troupes en route, et c'est
   *  précisément le mensonge que le leurre est censé servir à l'adversaire, jamais à soi. */
  const columns = flying.filter((arc) => arc.type !== 'decoy');
  const decoys = flying.filter((arc) => arc.type === 'decoy');
  /** Detected and stale are one list on the card: the player watched the same thread, and
   *  splitting them would ask him to hold two sections for one piece of intelligence. */
  const surveyed = view.arcs.filter(
    (arc): arc is Extract<ArcView, { state: 'enemyDetected' | 'lastKnown' }> =>
      arc.state === 'enemyDetected' || arc.state === 'lastKnown',
  );
  const stationName = useMemo(() => stationNamer(view), [view]);

  return (
    <Draggable
      remember="troops"
      className="hud absolute bottom-4 left-4 z-10 w-[340px] border border-[var(--ink-quiet)] font-(family-name:--font-body)"
    >
      <DragHandle className="flex items-baseline gap-2 border-b border-[var(--ink-quiet)] bg-[var(--desk)] px-[11px] py-[7px]">
        <span className="eyebrow-dark min-w-0 flex-1 truncate tracking-[.22em]">
          {fr.troops.header}
        </span>
        <span className="shrink-0 font-(family-name:--font-mono) text-[9.5px] text-[var(--paper-dim-2)]">
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
                    name={stationName(group.station)}
                    selected={group.stationKey === selectedStation}
                    onOpen={() => onOpenGarrison(group.station, group.troopIds)}
                  />
                ))}
              </div>
            )}

            <SectionHead title={fr.troops.moving} power={fr.troops.movingPower} lit={false} />
            <div className="flex flex-col px-[11px] pb-3">
              {columns.map((arc) => (
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
              {columns.length === 0 && (
                <p className="text-[11.5px] text-[var(--paper-dim)]">{fr.troops.foldedQuiet}</p>
              )}
            </div>

            {decoys.length > 0 && (
              <>
                <SectionHead title={fr.troops.decoys} power={fr.troops.decoysPower} lit={false} />
                <div className="flex flex-col px-[11px] pb-3">
                  {decoys.map((arc) => (
                    <DecoyCard
                      key={arc.id}
                      arc={arc}
                      loadedAt={view.loadedAt}
                      now={now}
                      designated={arc.id === hoveredMovement}
                      onHover={onHover}
                      onFollow={onFollow}
                    />
                  ))}
                  <p className="mt-[7px] text-[10.5px] text-[var(--paper-dim-2)] italic">
                    {fr.troops.decoyMark}
                  </p>
                </div>
              </>
            )}

            <SectionHead title={fr.troops.intel} power={fr.troops.intelPower} lit={false} />
            <div className="flex flex-col px-[11px] pb-3">
              {surveyed.map((arc) => (
                <SurveyedCard key={arc.id} arc={arc} loadedAt={view.loadedAt} now={now} />
              ))}
              {surveyed.length === 0 && (
                <p className="text-[11.5px] text-[var(--paper-dim)]">{fr.troops.intelNone}</p>
              )}
              <p className="mt-[7px] text-[10.5px] text-[var(--paper-dim-2)] italic">
                {fr.troops.intelRule}
              </p>
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
                asDuration(currentMinutes(next, loadedAt, now)),
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
      <span className="font-(family-name:--font-mono) text-[10px] text-[var(--paper-dim-2)]">
        {power}
      </span>
    </div>
  );
}

/** A frame, a ground, a chevron: everything about this card says it is pressed. `selected`
 *  reads the same accent as hover, but held rather than transient — the garrison panel or the
 *  aim it opened is still on the board for this address. */
function StandingCard({
  group,
  nation,
  name,
  selected,
  onOpen,
}: {
  group: StationGroup;
  nation: string;
  name: string;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={fr.troops.open(name)}
      aria-pressed={selected}
      className={`flex cursor-pointer items-center gap-[10px] border px-[9px] py-[7px] text-left hover:border-[var(--notable)] hover:bg-[rgba(228,216,189,.1)] ${
        selected
          ? 'border-[var(--notable)] bg-[rgba(228,216,189,.1)]'
          : 'border-[var(--ink-quiet)] bg-[rgba(228,216,189,.045)]'
      }`}
    >
      <UnitSprite nation={nation} role={group.role} height={26} width={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--paper)]">
          {roleLabel(group.role, group.count)} · {group.count}
        </span>
        <span className="block truncate font-(family-name:--font-mono) text-[10.5px] text-[var(--paper-dim)]">
          {name} · {fr.troops.strength(group.strength, group.nominalStrength)}
        </span>
        {group.supplied ? null : (
          <span className="block truncate font-(family-name:--font-mono) text-[10px] text-[var(--critical)]">
            {fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
          </span>
        )}
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
      <div className="mt-[4px] flex justify-between font-(family-name:--font-mono) text-[10.5px] text-[var(--paper-dim)]">
        <span>{fr.troops.remaining(asDuration(remaining))}</span>
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
    </div>
  );
}

/**
 * **Une ligne, et rien de ce qu'une colonne montre.** Pas de sprite — il n'y a personne à
 * dessiner — pas d'effectif, pas de barre de progression : ce que le joueur suit d'un leurre,
 * c'est où il va et quand il s'y dissipe. Comme la carte des colonnes, elle n'a **aucun
 * gestionnaire qui commande** : un leurre parti est parti (décision 13a).
 */
function DecoyCard({
  arc,
  loadedAt,
  now,
  designated,
  onHover,
  onFollow,
}: {
  arc: Extract<ArcView, { state: 'mine' }>;
  loadedAt: number;
  now: number;
  designated: boolean;
  onHover: (id: string | null) => void;
  onFollow: (arcId: string) => void;
}) {
  const remaining = currentMinutes(arc.minutesLeft, loadedAt, now);

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
      title={fr.troops.observe(fr.troops.decoyRoute(arc.destinationLabel))}
      className="cursor-pointer border-b border-[var(--ink-quiet)] py-[7px] first:border-t"
      style={{ opacity: designated ? 1 : 0.8 }}
    >
      <div className="flex items-baseline gap-[8px]">
        <span className="flex shrink-0 self-center text-[var(--paper-dim-2)]">
          <TypeMark type="decoy" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--paper-dim)]">
          {fr.troops.decoyRoute(arc.destinationLabel)}
        </span>
        <span className="shrink-0 font-(family-name:--font-mono) text-[10.5px] text-[var(--paper-dim-2)]">
          {fr.troops.remaining(asDuration(remaining))}
        </span>
      </div>
    </div>
  );
}

/**
 * The type pictograms of the mockup, at the trait. Local to this widget: the compass rose draws
 * the same three at its own scale and neither of them gains from a shared file of six paths.
 */
const MARKS: Readonly<Record<MovementType, string>> = {
  /** The same hut the rose gives the march: the column goes somewhere and camps there. */
  march: 'M10 1.75 L18.5 8.5 H16.7 V18 H3.3 V8.5 H1.5 Z',
  attack: 'M8.7 1.4 H11.3 V10.8 H8.7 Z M8.2 10.4 H12.8 L13.9 18.6 H9.5 Z',
  raid: 'M2.5 2.6 H4.6 V17.6 H2.5 Z M5.6 3 H16.4 L13.6 7.2 L16.4 11.4 H5.6 Z',
  outpost: 'M10 1.75 L18.5 8.5 H16.7 V18 H3.3 V8.5 H1.5 Z',
  // The garrison's own mark: an arrow walking down into the same ground the barracks stands
  // on — the mirror of `return`'s arrow up, since a recall is ordered rather than suffered.
  recall: 'M10 17.6 L3 10.6 H6.6 V2.4 H13.4 V10.6 H17 Z',
  agent:
    'M4.5 11.9 C4.5 8 6.9 5.2 10 5.2 C13.1 5.2 15.5 8 15.5 11.9 Z M1.3 11.3 C1.3 14.9 5.2 16.1 10 16.1 C14.8 16.1 18.7 14.9 18.7 11.3 Z',
  /** La hutte de la marche, évidée : c'est le dessin que la rose des vents donne au leurre, et
   *  les deux doivent se reconnaître d'un écran à l'autre. */
  decoy: 'M10 1.75 L18.5 8.5 H16.7 V18 H3.3 V8.5 H1.5 Z M10 4.3 L14.9 8.5 V16.3 H5.1 V8.5 Z',
  return: 'M10 2.4 L3 9.4 H6.6 V17.6 H13.4 V9.4 H17 Z',
};

export function TypeMark({ type, size = 15 }: { type: MovementType; size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      className="block"
    >
      {type === 'attack' ? (
        <>
          <path d={MARKS.attack} transform="rotate(-28 10 10)" />
          <path d={MARKS.attack} transform="rotate(28 10 10)" />
        </>
      ) : (
        /** `evenodd` est ce qui fait du sous-tracé intérieur du leurre un trou plutôt qu'un
         *  second toit ; il ne change rien aux dessins pleins. */
        <path d={MARKS[type]} fillRule="evenodd" />
      )}
    </svg>
  );
}

/**
 * **A sighting, and nothing a sighting does not hold.** No handler, no sprite, no name of a
 * place: what the server sent is a thread, a bearing, a medium and two dates, and this card is
 * the shape of exactly that (design sheet 04). The absence of a type mark is the fog checked by
 * what is missing rather than by a hidden field.
 *
 * `lastKnown` freezes: the countdown gives way to how long ago the thread was lost, because a
 * memory does not tick (ADR 0005).
 */
function SurveyedCard({
  arc,
  loadedAt,
  now,
}: {
  arc: Extract<ArcView, { state: 'enemyDetected' | 'lastKnown' }>;
  loadedAt: number;
  now: number;
}) {
  const stale = arc.state === 'lastKnown';
  const critical = arc.state === 'enemyDetected' && arc.headingAtMe;
  /** A memory does not tick: the stale card counts up from the moment the thread was lost, the
   *  watched one counts down to an arrival it can only estimate. */
  const schedule =
    arc.state === 'lastKnown'
      ? fr.troops.intelLost(asDuration(arc.seenMinutesAgo + (now - loadedAt) / 60_000))
      : arc.estimatedMinutesLeft === null
        ? fr.labels.estimated
        : fr.troops.intelEstimate(
            asDuration(currentMinutes(arc.estimatedMinutesLeft, loadedAt, now)),
          );

  return (
    <div
      className="border-b border-[var(--ink-quiet)] py-[7px] first:border-t"
      style={{ opacity: stale ? 0.7 : 1 }}
    >
      <div className="flex items-baseline gap-[8px]">
        <span
          className="h-[5px] w-[5px] shrink-0 self-center"
          style={{ background: critical ? 'var(--critical)' : 'var(--paper-dim-2)' }}
        />
        <span
          className="truncate text-[12.5px] font-semibold"
          style={{ color: critical ? 'var(--critical)' : 'var(--paper)' }}
        >
          {critical
            ? fr.troops.intelAtMe
            : fr.troops.intelBearing(cardinalLabel(arc.headingDegrees))}
        </span>
        <span className="flex-1" />
        <span className="shrink-0 font-(family-name:--font-mono) text-[10.5px] text-[var(--paper-dim)]">
          {schedule}
        </span>
      </div>
    </div>
  );
}

/**
 * What an address is called. A building answers with its name and its region — "Caserne ·
 * Bouches-du-Rhône" — an outpost with the country it stands in, a point with the country it was
 * left in, and `home` with nothing but that. A station the view no longer carries falls back to
 * home rather than printing an id.
 */
export function stationNamer(view: PlayerView): (station: TroopStation) => string {
  const buildings = new Map(view.me.buildings.map((building) => [building.id, building]));
  const regions = new Map(view.me.regions.map((region) => [region.id, region.name]));
  const outposts = new Map(view.me.outposts.map((outpost) => [outpost.id, outpost]));

  return (station) => {
    if (station.kind === 'home') return fr.troops.atHome;
    if (station.kind === 'point') {
      return station.country === '' ? fr.troops.postedAtSea : fr.troops.postedAt(station.country);
    }
    if (station.kind === 'outpost') {
      const outpost = outposts.get(station.outpostId);
      return outpost ? fr.troops.garrisonAt(outpost.hostCountry) : fr.troops.atHome;
    }
    const building = buildings.get(station.buildingId);
    if (!building) return fr.troops.atHome;
    const region = regions.get(building.regionId);
    return region === undefined ? building.name : `${building.name} · ${region}`;
  };
}
