import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr, doctrineLabel, nationLabel, stackLabel } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { handleError } from '@/data/errors';
import type { Building, Cost, PlayerView } from '@/domain/player-view';
import { currentMinutes, currentStock } from '@/domain/player-view';
import { RESOURCES } from '@/domain/ids';
import { Flag } from '@/emblems/Flag';
import { ResourceIcon, resourceColor } from '@/emblems/ResourceIcon';
import { asHoursMinutes } from '@/domain/duration';
import { FloatingWindow, WindowHandle, type WindowProps } from './Window';

export function NationWindow({
  view,
  token,
  onClose,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  token: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const now = useClock();

  return (
    <FloatingWindow name="nation" onClose={onClose} {...windowProps} alignment="top" width={880}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] px-[26px] pt-[18px] pb-6">
        <WindowHandle className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>{fr.nationSheet.kicker}</span>
          <span>{fr.nationSheet.season(view.season.number)}</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </WindowHandle>

        <div className="mt-2 flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-t-2 border-b border-[var(--ink)] py-3">
          <span className="self-center">
            <Flag nation={view.me.nation} width={36} onPaper />
          </span>
          <h1 className="font-[var(--font-display)] text-[clamp(22px,4cqi,34px)] leading-none font-extrabold tracking-[.02em] text-[var(--ink)] uppercase">
            {nationLabel(view.me.nation)}
          </h1>
          <span className="text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.nationSheet.doctrineLine(doctrineLabel(view.me.doctrine) ?? view.me.doctrine)}
          </span>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-auto @2xl:flex-row @2xl:items-start @2xl:gap-[26px]">
          <section className="min-w-0 flex-1">
            <h2 className="eyebrow border-b border-[var(--ink)] pb-[6px]">
              {fr.nationSheet.buildingsHeader}
            </h2>
            {view.me.buildings.length === 0 ? (
              <p className="mt-3 text-[12.5px] leading-[1.5] text-[var(--ink-soft)]">
                {fr.nationSheet.nothingBuilt}
              </p>
            ) : (
              view.me.buildings.map((building) => (
                <BuildingRow
                  key={`${building.key}-${building.regionId}`}
                  building={building}
                  regionName={regionName(view, building.regionId)}
                  construction={view.me.construction}
                  token={token}
                  onError={setError}
                />
              ))
            )}
            {view.me.construction && (
              <p className="mt-3 border border-[var(--ink)] px-3 py-2 text-[12.5px] text-[var(--ink)]">
                {fr.nationSheet.constructionRunning}
                <strong>{view.me.construction.name}</strong>{' '}
                {fr.nationSheet.inRegion(view.me.construction.regionName)}{fr.nationSheet.remains}
                <span className="font-[var(--font-mono)]">
                  {asHoursMinutes(currentMinutes(view.me.construction.minutesLeft, view.loadedAt, now))}
                </span>
              </p>
            )}
            {error && (
              <p className="mt-3 border border-[var(--critical)] px-3 py-2 text-[12.5px] text-[var(--ink)]">
                {error}
              </p>
            )}
          </section>

          <aside className="w-full @2xl:w-[280px] @2xl:shrink-0">
            <h2 className="eyebrow border-b border-[var(--ink)] pb-[6px]">{fr.nationSheet.powerHeader}</h2>
            <p className="mt-2 text-[13px] leading-[1.5] text-[var(--ink)]">{view.me.power}</p>

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">{fr.nationSheet.armyHeader}</h2>
            <div className="mt-2 flex flex-col gap-[5px] text-[12.5px]">
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.present}</span>
                <span className="text-right text-[var(--ink)]">{stackLabel(view.me.armyPresent)}</span>
              </span>
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.inTransit}</span>
                <span className="text-right text-[var(--ink)]">{stackLabel(view.me.armyInTransit)}</span>
              </span>
            </div>

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">
              {fr.nationSheet.stocksHeader}
            </h2>
            <div className="mt-2 flex flex-col gap-[5px] text-[12.5px]">
              {RESOURCES.map((key) => (
                <span key={key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-[6px]">
                    <span className="flex" style={{ color: resourceColor(key, true) }}>
                      <ResourceIcon resource={key} />
                    </span>
                    <span className="text-[var(--ink-soft)]">{fr.resources[key]}</span>
                  </span>
                  <span className="font-[var(--font-mono)] text-[var(--ink)]">
                    {currentStock(view.me.resources[key], view.loadedAt, now)}
                    {fr.nationSheet.capSuffix(view.me.resources[key].cap)}
                  </span>
                </span>
              ))}
            </div>

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">{fr.nationSheet.restHeader}</h2>
            <p className="mt-2 text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.nationSheet.restNote}
            </p>
            <p className="mt-2 font-[var(--font-mono)] text-[14px] text-[var(--ink)]">
              {view.me.restWindow}
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--ink-quiet)] italic">
              {fr.nationSheet.restFrozen}
            </p>
          </aside>
        </div>
      </div>
    </FloatingWindow>
  );
}

/**
 * Where a building stands. **One verb per surface** (ADR 0015 and the construction brief): the
 * map puts buildings down — that is where a place is chosen — and this window raises them and
 * keeps track of them. The minimal construction screen that used to live here, listing every
 * usable region with its "build" buttons, was an admitted stopgap and is gone.
 */
const regionName = (view: PlayerView, regionId: string): string =>
  view.me.regions.find((region) => region.id === regionId)?.name ?? regionId;

function CostLine({ cost }: { cost: Cost }) {
  return (
    <div className="flex items-center justify-end gap-[10px] font-[var(--font-mono)] text-[13px] font-medium text-[var(--ink)]">
      {RESOURCES.filter((key) => (cost[key] ?? 0) > 0).map((key) => (
        <span key={key} className="flex items-center gap-[4px]">
          <span className="flex" style={{ color: resourceColor(key, true) }}>
            <ResourceIcon resource={key} size={13} />
          </span>
          {cost[key]}
        </span>
      ))}
    </div>
  );
}

function BuildingRow({
  building,
  regionName,
  construction,
  token,
  onError,
}: {
  building: Building;
  regionName: string;
  construction: PlayerView['me']['construction'];
  token: string;
  onError: (message: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[rgba(42,33,24,.16)] py-[7px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-semibold text-[var(--ink)]">{building.name}</span>
          <span className="text-[11.5px] text-[var(--ink-soft)]">
            {fr.nationSheet.inRegion(regionName)}
          </span>
          <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink-soft)]">{fr.nationSheet.level(building.level)}</span>
          {building.cappedByHq && (
            <span className="text-[10px] tracking-[.12em] text-[var(--critical)] uppercase">{fr.nationSheet.cappedByHq}</span>
          )}
        </div>
        <p className="text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">{fr.buildingEffects[building.key]}</p>
      </div>
      <div className="shrink-0 text-right text-[11.5px] text-[var(--ink-soft)]">
        <CostLine cost={building.nextLevelCost} />
        <div className="font-[var(--font-mono)]">{asHoursMinutes(building.nextLevelMinutes)}</div>
      </div>
      <ConstructionButton building={building} construction={construction} token={token} onError={onError} />
    </div>
  );
}

function ConstructionButton({
  building,
  construction,
  token,
  onError,
}: {
  building: Building;
  construction: PlayerView['me']['construction'];
  token: string;
  onError: (message: string | null) => void;
}) {
  const start = useMutation(api.constructions.start);
  const blocked = construction !== null || building.cappedByHq;
  return (
    <button
      type="button"
      disabled={blocked}
      title={
        construction
          ? fr.nationSheet.constructionInProgressTitle
          : building.cappedByHq
            ? fr.nationSheet.raiseHqFirst
            : fr.nationSheet.upgradeTitle(building.name, building.level + 1)
      }
      onClick={() => {
        onError(null);
        start({ token, building: building.key, regionId: building.regionId }).catch((problem: unknown) =>
          handleError(problem, onError),
        );
      }}
      className="shrink-0 cursor-pointer border border-[var(--ink)] px-3 py-[7px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {fr.nationSheet.construction}
    </button>
  );
}
