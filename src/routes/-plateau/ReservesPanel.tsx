import { useState } from 'react';
import { fr, noBuilding } from '@/i18n/fr';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import { PRODUCER_OF } from '@/domain/economy';
import type { ChainView, PlayerView } from '@/domain/player-view';
import { currentStock } from '@/domain/player-view';
import { resourceStrip, type Run } from '@/domain/resource-strip';
import { ResourceIcon } from '@/emblems/ResourceIcon';
import { ResourcePlate } from '@/emblems/Plate';
import { Gauge } from '@/shell/Gauge';
import { useClock } from '@/shell/clock';

/** The plates hold from 20 px down to nothing else: below that an illustration turns to mush
 *  and `ResourceIcon` takes over — which is what the folded alerts use. */
const PLATE_HEIGHT = 20;

/**
 * **The eight reserves, vertical, in the board's top right.** They left the banner because a
 * horizontal strip could not group them: the chains read downwards here, so the arrow between
 * two ranks has a line of its own and carries the diagnosis rather than a tooltip.
 *
 * The panel keeps the banner's licence — *this* is now the one place a figure repeats, since
 * it watches permanently. Everywhere else a number has to be the subject of the decision taken
 * there, which is what emptied the nation sheet of its stock column.
 *
 * **The body is glass, the header is not.** What sits over the map gives the map back as much
 * as it can: only the header holds the desk's opaque ink, because the title and the fold
 * control have to stay findable when the panel is over a bright sea.
 *
 * **Folded, it is the alert that survives, never the stocks.** A panel that hid a halted
 * foundry to give the map twelve pixels back would be worse than no panel.
 */
export function ReservesPanel({ view }: { view: PlayerView }) {
  const now = useClock();
  const [collapsed, setCollapsed] = useState(false);
  const runs = resourceStrip(view.me.chains);
  const alerts = alertsOf(view, now);

  return (
    <section className="hud absolute top-4 right-4 z-10 w-[200px] border border-[var(--ink-quiet)] font-[var(--font-body)]">
      <header className="flex items-center gap-2 border-b border-[var(--ink-quiet)] bg-[var(--desk)] px-[9px] py-[7px]">
        <span className="eyebrow-dark flex-1 tracking-[.2em]">{fr.reserves.header}</span>
        <Marker view={view} collapsed={collapsed} alerts={alerts.length} />
        <button
          type="button"
          aria-expanded={!collapsed}
          title={collapsed ? fr.reserves.expand : fr.reserves.collapse}
          onClick={() => setCollapsed((previous) => !previous)}
          className="h-[13px] w-[13px] shrink-0 cursor-pointer border border-[var(--ink-quiet)] text-[10px] leading-[11px] text-[var(--paper-dim)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {collapsed ? '+' : '–'}
        </button>
      </header>

      <div style={{ background: 'rgba(0,0,0,.55)' }}>
        {collapsed ? (
          <Folded alerts={alerts} />
        ) : (
          runs.map((run, index) => (
            <div key={index} className={index > 0 ? 'border-t border-[var(--ink-quiet)]' : ''}>
              <RunBlock run={run} view={view} now={now} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * The ceiling is written **once, in the header, and only while the eight share it** — which is
 * the whole state of the game without a warehouse. The day one reserve is raised alone, the
 * header falls silent and the gauges keep carrying the ratio.
 */
function Marker({
  view,
  collapsed,
  alerts,
}: {
  view: PlayerView;
  collapsed: boolean;
  alerts: number;
}) {
  if (collapsed) {
    return (
      <span
        className="font-[var(--font-mono)] text-[9px]"
        style={{ color: alerts > 0 ? 'var(--critical)' : 'var(--paper-dim-2)' }}
      >
        {alerts > 0 ? fr.reserves.alerts(alerts) : fr.reserves.collapsed}
      </span>
    );
  }

  const caps = RESOURCES.map((resource) => view.me.resources[resource].cap);
  const first = caps[0] ?? 0;
  const shared = caps.every((cap) => cap === first) ? first : 0;
  if (shared === 0) return null;
  return (
    <span className="font-[var(--font-mono)] text-[9px] text-[var(--paper-dim-2)]">
      {fr.reserves.cap(shared)}
    </span>
  );
}

function Folded({ alerts }: { alerts: ReadonlyArray<Alert> }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-[7px] px-[9px] py-[7px]">
        <span className="h-[4px] w-[4px] shrink-0 bg-[var(--paper-dim-2)]" />
        <span className="text-[10.5px] text-[var(--paper-dim)]">{fr.reserves.quiet}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[6px] px-[9px] py-[7px]">
      {alerts.map((alert) => (
        <div key={alert.key} className="flex items-center gap-[7px] text-[var(--critical)]">
          <span className="h-[4px] w-[4px] shrink-0 bg-[var(--critical)]" />
          <span className="shrink-0">
            <ResourceIcon resource={alert.plate} size={12} />
          </span>
          <span className="text-[10.5px] leading-[1.25] text-[var(--paper)]">{alert.text}</span>
        </div>
      ))}
    </div>
  );
}

/** One chain, top to bottom: `minerais · charbon ↓ alliage ↓ munitions`. */
function RunBlock({ run, view, now }: { run: Run; view: PlayerView; now: number }) {
  return (
    <div className="flex flex-col px-[9px] py-[6px]">
      {run.map((rank, index) => (
        <div key={index} className="flex flex-col">
          {rank.resources.map((resource) => (
            <Reserve key={resource} resource={resource} view={view} now={now} />
          ))}
          {rank.through !== null && <ChainArrow chain={rank.through} view={view} />}
        </div>
      ))}
    </div>
  );
}

function Reserve({
  resource,
  view,
  now,
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
}) {
  const reserve = view.me.resources[resource];
  const value = currentStock(reserve, view.loadedAt, now);
  const depleted = value === 0 && reserve.ratePerHour === 0;
  const saturated = reserve.cap > 0 && value >= reserve.cap;

  return (
    <div
      className={`flex items-center gap-[7px] py-[3px] ${depleted ? 'resource-depleted' : ''}`}
      title={fr.banner.counter(fr.resources[resource], value, reserve.cap, reserve.ratePerHour)}
    >
      <span className="resource-reserve flex shrink-0">
        <ResourcePlate resource={resource} height={PLATE_HEIGHT} onDark />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className="min-w-0 truncate text-[8.5px] tracking-[.1em] uppercase"
            style={{ color: saturated ? 'var(--critical)' : 'var(--paper-dim-2)' }}
          >
            {fr.resources[resource]}
          </span>
          {/* The rate belongs beside the stock and nowhere else: a reserve is read as a level
              *and* a slope, and the slope was only in a tooltip. Saturated, it is dropped —
              the line below already says the same figure, as a loss, which is the true one. */}
          {!(saturated && reserve.ratePerHour > 0) && (
            <span
              className="ml-auto font-[var(--font-mono)] text-[8.5px] whitespace-nowrap"
              style={{
                color:
                  reserve.ratePerHour < 0
                    ? 'var(--critical)'
                    : reserve.ratePerHour === 0
                      ? 'var(--paper-dim-2)'
                      : 'var(--paper-dim)',
              }}
            >
              {fr.reserves.rate(reserve.ratePerHour)}
            </span>
          )}
          <span
            className="shrink-0 text-[12px] leading-none font-semibold"
            style={{ color: saturated ? 'var(--critical)' : 'var(--paper)' }}
          >
            {value.toLocaleString('fr-FR')}
          </span>
        </span>
        <span className="mt-[3px] flex">
          <Gauge filled={reserve.cap === 0 ? 0 : value / reserve.cap} height={4} onDark />
        </span>
        {/* Saturation is production being lost every hour — the one place the panel spends a
            line on a rate, because that rate is a loss. */}
        {saturated && reserve.ratePerHour > 0 && (
          <span className="mt-[2px] text-[8px] tracking-[.06em] text-[var(--critical)]">
            {fr.reserves.saturated(reserve.ratePerHour)}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The link between two ranks, and its verdict. The state it reads is the settlement's own
 * (`ChainView.state`) — arbitrating again here would be a second chance to disagree with the
 * industry window this line summarises.
 */
function ChainArrow({ chain, view }: { chain: ChainView; view: PlayerView }) {
  const starved = chain.state === 'starved';
  return (
    <div
      className="my-[2px] ml-[9px] flex items-center gap-[6px]"
      style={{ color: starved ? 'var(--critical)' : 'var(--paper-dim-2)' }}
    >
      <span className="text-[10px] leading-none">↓</span>
      <span className="text-[8px] tracking-[.14em] uppercase">{verdictOf(chain, view)}</span>
    </div>
  );
}

function verdictOf(chain: ChainView, view: PlayerView): string {
  if (chain.state === 'starved' && chain.missing !== null) {
    const resource = fr.resources[chain.missing];
    const source = PRODUCER_OF[chain.missing];
    const standing = view.me.buildings.some((building) => building.key === source);
    return standing
      ? fr.industry.starvedOn(resource)
      : fr.reserves.starvedNoSource(noBuilding(source), resource);
  }
  if (chain.state === 'running') return fr.reserves.flow(fr.buildings[chain.by], chain.perHour);
  return fr.industry.chainStates[chain.state];
}

type Alert = { readonly key: string; readonly plate: ResourceKey; readonly text: string };

/**
 * What survives the fold. Two natures only, and neither of them ever repeats a stock figure:
 * a chain stopped for want of matter, and a reserve at its ceiling losing what still arrives.
 */
function alertsOf(view: PlayerView, now: number): ReadonlyArray<Alert> {
  const halted = view.me.chains.flatMap((chain) =>
    chain.state === 'starved' && chain.missing !== null
      ? [
          {
            key: `chain-${chain.by}`,
            plate: chain.output,
            text: fr.reserves.haltedAlert(fr.buildings[chain.by], fr.resources[chain.missing]),
          },
        ]
      : [],
  );

  const capped = RESOURCES.flatMap((resource) => {
    const reserve = view.me.resources[resource];
    const value = currentStock(reserve, view.loadedAt, now);
    return reserve.cap > 0 && value >= reserve.cap && reserve.ratePerHour > 0
      ? [
          {
            key: `cap-${resource}`,
            plate: resource,
            text: fr.reserves.cappedAlert(fr.resources[resource], reserve.ratePerHour),
          },
        ]
      : [];
  });

  return [...halted, ...capped];
}
