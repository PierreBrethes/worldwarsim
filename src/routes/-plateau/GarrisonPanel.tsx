import { useMemo, useState } from 'react';
import { fr, roleLabel } from '@/i18n/fr';
import { marchingTroopIds, troopsAt } from '@/domain/troops';
import type { PlayerView } from '@/domain/player-view';
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
  stationId,
  at,
  preselect,
  onClose,
  onPrepare,
}: {
  view: PlayerView;
  /** `null` is home — troops whose building was razed, which nothing can march. */
  stationId: string | null;
  at: { x: number; y: number };
  preselect: ReadonlyArray<string>;
  onClose: () => void;
  onPrepare: (buildingId: string, troopIds: ReadonlyArray<string>) => void;
}) {
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const held = useMemo(
    () => troopsAt(view.me, stationId, marching),
    [view.me, stationId, marching],
  );
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(preselect));

  const building = view.me.buildings.find((candidate) => candidate.id === stationId) ?? null;
  const outpost = view.me.outposts.find((candidate) => candidate.id === stationId) ?? null;
  // The server marches from a barracks and from nothing else today — naval and air projection
  // wait for their own passes, and the panel must not promise what would be refused.
  const projection = building !== null && building.key === 'barracks';
  /** A garrison composes a column too — its only order is the recall (question 21, 18/08), but
   *  arming it is the same gesture as arming one at a barracks: check troops, then aim on the map. */
  const canPrepare = projection || outpost !== null;
  const region = building
    ? (view.me.regions.find((candidate) => candidate.id === building.regionId)?.name ?? null)
    : null;

  const title = building
    ? building.name
    : outpost
      ? fr.troops.garrisonAt(outpost.hostCountry)
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
          <span className="ml-auto font-[var(--font-mono)]">{fr.garrison.troopCount(held.length)}</span>
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

        {canPrepare ? (
          <div className="mt-[11px] flex items-center justify-between gap-3">
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
              {picked.size === 0 ? fr.garrison.noColumn : fr.garrison.column(picked.size)}
            </span>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onPrepare((building ?? outpost)!.id, [...picked])}
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
