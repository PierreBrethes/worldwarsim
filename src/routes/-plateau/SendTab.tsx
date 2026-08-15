import { useEffect, useMemo, useState } from 'react';
import { fr, roleLabel } from '@/i18n/fr';
import { travelMinutes } from '@/domain/geo';
import type { LonLat } from '@/domain/geo';
import { NATION_BY_COUNTRY } from '@/domain/nations';
import { KM_PER_UNIT, buildGrid, computeRoute, type RouteGrid } from '@/domain/routing';
import type { World } from '@/domain/world';
import { insideWindow, parseWindow } from '@/domain/rest-window';
import { UnitSprite } from '@/emblems/UnitSprite';
import type { MovementType, PlayerView, Stack, UnitRole } from '@/domain/player-view';
import { asHoursMinutes } from '@/domain/duration';

type Heading = 'N' | 'E' | 'S' | 'O';

const HEADINGS: ReadonlyArray<Heading> = ['N', 'E', 'S', 'O'];

const TYPES: ReadonlyArray<MovementType> = ['attack', 'raid', 'outpost', 'agent', 'decoy'];

export function SendTab({
  view,
  world,
  country,
  presetType,
  onClose,
}: {
  view: PlayerView;
  world: World;
  country: string | null;
  /** The type the compass rose chose at opening; `null` when entering through the tab. */
  presetType: MovementType | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<MovementType>(presetType ?? 'attack');
  const [heading, setHeading] = useState<Heading>('N');
  const [stack, setStack] = useState<Stack>({});

  useEffect(() => {
    if (presetType !== null) setType(presetType);
  }, [presetType]);

  const home = (Object.entries(view.me.armyPresent) as ReadonlyArray<[UnitRole, number]>).filter(
    ([, count]) => count > 0,
  );
  const engaged = Object.values(stack).reduce((sum, count) => sum + count, 0);

  const adjust = (role: UnitRole, available: number, delta: number) =>
    setStack((previous) => ({
      ...previous,
      [role]: Math.max(0, Math.min(available, (previous[role] ?? 0) + delta)),
    }));

  const chooseType = (chosen: MovementType) => {
    setType(chosen);
    if (chosen === 'decoy') setStack({});
  };

  const destination = country ? (world.countries.find((candidate) => candidate.name === country) ?? null) : null;
  // Dijkstra over the world grid is not free, and the stack steppers re-render on every
  // click: the estimate is keyed on what actually changes it.
  const route = useMemo(
    () => (destination === null ? null : estimateRoute(view, world, destination.lonLat)),
    [view, world, destination],
  );
  // The map speaks country names, opponents speak nation ids: go through the seam, the two
  // raw strings never coincide.
  const targetNation = country ? NATION_BY_COUNTRY.get(country) : undefined;
  const targetOpponent =
    targetNation === undefined
      ? undefined
      : view.opponents.find((opponent) => opponent.nation === targetNation);
  const restWarning =
    route?.reachable && targetOpponent
      ? arrivalInRestWindow(targetOpponent.restWindow, route.arrivalMinutesSinceMidnight)
      : null;

  const freeSlots = view.me.slots.total - view.me.slots.used;
  const canSend =
    destination !== null &&
    route?.reachable === true &&
    freeSlots > 0 &&
    (engaged > 0 || type === 'decoy' || type === 'agent');

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-[14px] gap-y-1 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
        <span className="eyebrow">{fr.send.header}</span>
        <span className="text-[11.5px] text-[var(--ink-soft)]">
          {freeSlots > 0 ? fr.send.slotCost(freeSlots - 1) : fr.send.noSlot}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto @3xl:flex-row @3xl:items-stretch">
        <div className="w-full border-b border-[rgba(42,33,24,.35)] p-[14px] @3xl:w-[224px] @3xl:shrink-0 @3xl:border-r @3xl:border-b-0">
          <div className="eyebrow mb-[9px]">{fr.send.typeLabel}</div>
          <div className="flex flex-wrap gap-[5px] @3xl:flex-col">
            {TYPES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => chooseType(candidate)}
                className={`cursor-pointer border border-[var(--ink)] px-[6px] py-2 text-left text-[11px] tracking-[.1em] uppercase ${
                  type === candidate
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                }`}
              >
                {fr.movementTypes[candidate]}
              </button>
            ))}
          </div>
          <p className="mt-[14px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
            {fr.send.decoyNote}
          </p>
        </div>

        <div className="min-w-0 flex-1 border-b border-[rgba(42,33,24,.35)] px-4 py-[14px] @3xl:border-r @3xl:border-b-0">
          <div className="mb-[9px] flex items-baseline justify-between">
            <span className="eyebrow">{fr.send.stackLabel}</span>
            <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.send.stackRight}</span>
          </div>
          <div className="flex flex-col gap-1">
            {home.map(([role, available]) => {
              const committed = stack[role] ?? 0;
              return (
                <div key={role} className="flex items-center gap-[10px] border-b border-[rgba(42,33,24,.14)] py-[4px]">
                  <UnitSprite nation={view.me.nation} role={role} height={26} width={38} />
                  <span className="flex-1 text-[13.5px] text-[var(--ink)]">{roleLabel(role, 2)}</span>
                  <Step sign="–" disabled={type === 'decoy'} onClick={() => adjust(role, available, -1)} />
                  <span className="w-[30px] text-center font-[var(--font-mono)] text-[14px] text-[var(--ink)]">
                    {committed}
                  </span>
                  <Step sign="+" disabled={type === 'decoy'} onClick={() => adjust(role, available, 1)} />
                  <span className="w-[112px] text-right text-[12px] text-[var(--ink-soft)]">
                    {fr.send.atHomeOf(available - committed, available)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-[10px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
            {fr.send.transitNote}
          </p>

          <div className="eyebrow mt-4 mb-2">{fr.send.headingLabel}</div>
          <div className="flex gap-[5px]">
            {HEADINGS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setHeading(candidate)}
                className={`flex-1 cursor-pointer border border-[var(--ink)] px-1 py-[9px] text-[12px] ${
                  heading === candidate
                    ? 'bg-[var(--interaction)] text-[var(--paper)]'
                    : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                }`}
              >
                {fr.send.headingButton(candidate)}
              </button>
            ))}
          </div>
          <p className="mt-[7px] text-[11.5px] text-[var(--ink-soft)]">{fr.send.headingNotes[heading]}</p>
        </div>

        <div className="flex w-full flex-col px-4 py-[14px] @3xl:w-[292px] @3xl:shrink-0">
          <div className="eyebrow mb-[9px]">{fr.send.destinationLabel}</div>
          {destination ? (
            <>
              <h3 className="font-[var(--font-display)] text-[21px] font-extrabold text-[var(--ink)] uppercase">
                {destination.name}
              </h3>
              {targetOpponent && (
                <p className="mt-[2px] text-[12px] text-[var(--ink-soft)]">{fr.send.enemyNation(targetOpponent.power)}</p>
              )}
            </>
          ) : (
            <p className="text-[13px] leading-[1.5] text-[var(--ink-soft)]">
              {fr.send.pickDestination}
            </p>
          )}

          {route?.reachable === false && (
            <p className="mt-[14px] border-t border-[rgba(42,33,24,.3)] pt-3 text-[13px] leading-[1.5] text-[var(--critical)]">
              {fr.send.noRoute}
            </p>
          )}

          {route?.reachable && (
            <div className="mt-[14px] flex flex-col gap-[7px] border-t border-[rgba(42,33,24,.3)] pt-3 text-[13px]">
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">{fr.send.estimatedDuration}</span>
                <span className="font-[var(--font-mono)] text-[var(--ink)]">{asHoursMinutes(route.durationMinutes)}</span>
              </span>
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">{fr.send.arrival}</span>
                <span className="font-[var(--font-mono)] text-[var(--ink)]">{route.arrivalDisplayed}</span>
              </span>
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">{fr.send.antimeridian}</span>
                <span className="text-[var(--ink)]">{route.crosses ? fr.send.crossed : fr.send.notCrossed}</span>
              </span>
              <span className="flex justify-between">
                <span className="text-[var(--ink-soft)]">{fr.send.cost}</span>
                <span className="text-[var(--ink)]">{fr.common.slot}</span>
              </span>
            </div>
          )}

          {restWarning && (
            <div className="mt-[14px] border border-[var(--critical)] px-[11px] py-[10px]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2" style={{ background: 'var(--critical)' }} />
                <span className="text-[10px] font-bold tracking-[.16em] text-[var(--ink)] uppercase">
                  {fr.send.restWarningKicker}
                </span>
              </div>
              <p className="mt-[5px] text-[12.5px] leading-[1.45] text-[var(--ink)]">
                {fr.send.restWarning(targetOpponent?.restWindow ?? '')}
              </p>
            </div>
          )}

          <div className="flex-1" />
          <div className="mt-[14px] flex gap-[7px]">
            <button
              type="button"
              onClick={onClose}
              className="w-24 shrink-0 cursor-pointer border border-[var(--ink)] py-[11px] text-[10px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.send.cancel}
            </button>
            <button
              type="button"
              disabled={!canSend}
              onClick={onClose}
              className="flex-1 cursor-pointer bg-[var(--ink)] py-[11px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fr.send.submit}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Step({ sign, disabled, onClick }: { sign: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 cursor-pointer border border-[var(--ink)] text-[14px] leading-none text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {sign}
    </button>
  );
}

/**
 * The send preview runs the route calculation the server will run (ADR 0012), not a
 * great-circle line: the grid knows the coasts, the straits and the cost of embarking, and a
 * preview that ignored them would promise a Paris–Algiers as short as a Paris–Berlin. The
 * cost comes back in sea-equivalent units, which the season's pace turns into minutes.
 *
 * It stays an estimate: the server dates the movement, and it alone.
 */
type RouteEstimate =
  | { readonly reachable: false }
  | {
      readonly reachable: true;
      readonly durationMinutes: number;
      readonly crosses: boolean;
      readonly arrivalDisplayed: string;
      readonly arrivalMinutesSinceMidnight: number;
    };

function estimateRoute(view: PlayerView, world: World, toLonLat: LonLat): RouteEstimate {
  const route = computeRoute(gridOf(world), view.me.homePosition, toLonLat, 'combined');
  if (route === null) return { reachable: false };

  const logisticsLevel = view.me.buildings.find((building) => building.key === 'logistics')?.level ?? 1;
  const durationMinutes = travelMinutes(route.costUnits * KM_PER_UNIT, {
    minutesPer1000km: view.season.travelMinutesPer1000km,
    logisticsLevel,
  });
  const arrival = new Date(Date.now() + durationMinutes * 60_000);
  return {
    reachable: true,
    durationMinutes,
    // The route wraps when one of its own segments jumps the antimeridian, which the two
    // declared endpoints cannot tell on their own: a westward detour crosses it, a short
    // eastward hop between the same two countries does not.
    crosses: route.points.some(
      (point, index) => index > 0 && Math.abs(point[0] - route.points[index - 1]![0]) > 180,
    ),
    arrivalDisplayed: arrival.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    arrivalMinutesSinceMidnight: arrival.getHours() * 60 + arrival.getMinutes(),
  };
}

/**
 * The grid is baked once per world and kept: it costs tens of milliseconds, the world never
 * changes within a season, and the send tab is opened and closed over and over.
 */
let cachedGrid: { world: World; grid: RouteGrid } | null = null;

function gridOf(world: World): RouteGrid {
  if (cachedGrid?.world !== world) cachedGrid = { world, grid: buildGrid(world) };
  return cachedGrid.grid;
}

function arrivalInRestWindow(declaredWindow: string, arrivalMinutesSinceMidnight: number): boolean | null {
  const window = parseWindow(declaredWindow);
  if (!window) return null;
  return insideWindow(arrivalMinutesSinceMidnight, window) ? true : null;
}
