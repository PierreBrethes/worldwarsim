import { useMutation } from 'convex/react';
import { useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr, roleLabel } from '@/i18n/fr';
import { marchingTroopIds, stationKeyOf, troopsAt } from '@/domain/troops';
import type { Specialization } from '@/domain/ids';
import type { PlayerView, TroopStation } from '@/domain/player-view';
import { handleError } from '@/data/errors';
import { UnitSprite } from '@/emblems/UnitSprite';
import { Draggable } from './Draggable';
import { Panel } from './Panel';

/**
 * **The garrison, and the column one composes out of it.** It opens on the mast of a projection
 * building or on a *stationnaire* card of the widget — two doors, **one** selection state and
 * one flow, never two (brief « flux de mouvement en carte »).
 *
 * One checks discrete troops; there is no +/− stepper anywhere, because there is nothing to
 * count: the ceiling is 24 and a troop is a row (ADR 0014).
 *
 * Only a **projection building** launches a column (ADR 0013): a garrison holding an outpost is
 * shown, and said to be where it stands. Saying it here beats a refusal landing after the click.
 */
export function GarrisonPanel({
  view,
  token,
  station,
  at,
  preselect,
  onClose,
  onPrepare,
}: {
  view: PlayerView;
  token: string;
  /** `home` is the address of a troop whose building is gone: the game cannot place it, so
   *  nothing can march it (ADR 0019 §1). */
  station: TroopStation;
  at: { x: number; y: number };
  preselect: ReadonlyArray<string>;
  onClose: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
}) {
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const stationKey = stationKeyOf(station);
  const held = useMemo(
    () => troopsAt(view.me, stationKey, marching),
    [view.me, stationKey, marching],
  );
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(preselect));
  const [specialization, setSpecialization] = useState<Specialization>('relay');
  const [error, setError] = useState<string | null>(null);
  const foundHere = useMutation(api.movements.foundOutpostHere);

  const building =
    station.kind === 'building'
      ? (view.me.buildings.find((candidate) => candidate.id === station.buildingId) ?? null)
      : null;
  const outpost =
    station.kind === 'outpost'
      ? (view.me.outposts.find((candidate) => candidate.id === station.outpostId) ?? null)
      : null;
  // The server marches from a barracks and from nothing else today — naval and air projection
  // wait for their own passes, and the panel must not promise what would be refused.
  const projection = building !== null && building.key === 'barracks';
  /** A garrison composes a column too, and so does a column left standing on the map: the ground
   *  under it decides nothing any more (ADR 0019 §1), only where the domain gates are read. */
  const canPrepare = projection || outpost !== null || station.kind === 'point';
  const region = building
    ? (view.me.regions.find((candidate) => candidate.id === building.regionId)?.name ?? null)
    : null;

  const title = building
    ? building.name
    : outpost
      ? fr.troops.garrisonAt(outpost.hostCountry)
      : station.kind === 'point'
        ? station.country === ''
          ? fr.troops.postedAtSea
          : fr.troops.postedAt(station.country)
        : fr.garrison.home;

  const toggle = (troopId: string) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(troopId)) next.delete(troopId);
      else next.add(troopId);
      return next;
    });

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    /* Aimed at a point and therefore remembering none: the push the player gives it lasts as
       long as the panel does. See `Draggable`. */
    <Draggable
      className="absolute z-20"
      style={{
        left: fromRight ? undefined : at.x,
        right: fromRight ? `calc(100% - ${at.x}px)` : undefined,
        top: fromBottom ? undefined : at.y,
        bottom: fromBottom ? `calc(100% - ${at.y}px)` : undefined,
      }}
    >
      <Panel title={title} marker={fr.garrison.kicker} position="static" width={340}>
        <div className="flex shrink-0 items-baseline gap-2 text-[11.5px] text-[var(--ink-soft)]">
          <span>{projection ? fr.garrison.projection : (region ?? '')}</span>
          <span className="ml-auto font-[var(--font-mono)]">
            {fr.garrison.troopCount(held.length)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[7px] py-[2px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </div>

        {held.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-[var(--ink-soft)]">{fr.garrison.empty}</p>
        ) : (
          <div className="mt-[10px] flex max-h-[46vh] flex-col gap-[6px] overflow-auto">
            {held.map((troop) => {
              const on = picked.has(troop.id);
              return (
                <button
                  key={troop.id}
                  type="button"
                  disabled={!canPrepare}
                  onClick={() => toggle(troop.id)}
                  className={`flex items-center gap-[9px] border px-[8px] py-[6px] text-left enabled:cursor-pointer disabled:opacity-70 ${
                    on
                      ? 'border-[var(--ink)] bg-[rgba(42,33,24,.07)]'
                      : 'border-[rgba(42,33,24,.32)]'
                  }`}
                >
                  <span
                    className="flex h-[13px] w-[13px] shrink-0 items-center justify-center border border-[var(--ink)] text-[9px] leading-none"
                    style={{
                      background: on ? 'var(--ink)' : undefined,
                      color: on ? 'var(--paper)' : 'transparent',
                    }}
                  >
                    ×
                  </span>
                  <UnitSprite nation={view.me.nation} role={troop.role} height={28} width={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-[var(--ink)]">
                      {roleLabel(troop.role, 1)}
                    </span>
                    <span className="block font-[var(--font-mono)] text-[10.5px] text-[var(--ink-soft)]">
                      {fr.troops.strength(troop.strength, troop.nominalStrength)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/**
         * **One founds where one stands** (ADR 0019 §1): a column left on the map plants its
         * point without walking anywhere, and the specialisation is chosen here — with the
         * terrain in view — rather than at a departure hours away from it. Moving that choice
         * back to a departure would be a regression dressed as a simplification.
         */}
        {station.kind === 'point' && (
          <div className="mt-[11px] border-t border-[rgba(42,33,24,.32)] pt-[9px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
                {fr.garrison.foundSpecialization}
              </span>
              {(['relay', 'listening'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={specialization === key}
                  onClick={() => setSpecialization(key)}
                  className={`cursor-pointer border px-[7px] py-[3px] text-[10px] ${
                    specialization === key
                      ? 'border-[var(--ink)] bg-[rgba(42,33,24,.07)] text-[var(--ink)]'
                      : 'border-[rgba(42,33,24,.32)] text-[var(--ink-soft)]'
                  }`}
                >
                  {fr.specializations[key]}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => {
                setError(null);
                foundHere({
                  token,
                  point: { lon: station.lonLat[0], lat: station.lonLat[1] },
                  specialization,
                  troopIds: [...picked].map((troopId) => troopId as Id<'troops'>),
                }).then(onClose, (problem: unknown) => handleError(problem, setError));
              }}
              className="mt-[7px] w-full cursor-pointer border border-[var(--ink)] px-[10px] py-[6px] text-[10px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {fr.garrison.found}
            </button>
            {error !== null && (
              <p className="mt-[6px] text-[11px] text-[var(--critical)]">{error}</p>
            )}
          </div>
        )}

        {canPrepare ? (
          <div className="mt-[11px] flex items-center justify-between gap-3">
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
              {picked.size === 0 ? fr.garrison.noColumn : fr.garrison.column(picked.size)}
            </span>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onPrepare(station, [...picked])}
              className="cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-[12px] py-[7px] text-[10px] tracking-[.18em] text-[var(--paper)] uppercase hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {fr.garrison.prepare}
            </button>
          </div>
        ) : (
          held.length > 0 && (
            <p className="mt-[11px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.garrison.notProjection}
            </p>
          )
        )}
      </Panel>
    </Draggable>
  );
}
