import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr, roleLabel } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { handleError } from '@/data/errors';
import { ResourceIcon, resourceColor, type ResourceKey } from '@/emblems/ResourceIcon';
import { UnitSprite } from '@/emblems/UnitSprite';
import { equipmentLabel } from '@/emblems/units/equipment';
import type { UnitDomain, UnitTier } from '@/domain/troops';
import { DOMAIN_BY_ROLE, tierLabel } from '@/domain/troops';
import type { UnitRole } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { asHoursMinutes } from '@/domain/duration';
import { FloatingWindow, WindowHandle, type WindowProps } from './Window';

const BATCHES: ReadonlyArray<number> = [1, 5, 10, 20];

export function ProductionWindow({
  nation,
  token,
  onClose,
  ...windowProps
}: WindowProps & {
  nation: string;
  token: string;
}) {
  return (
    <FloatingWindow name="production" onClose={onClose} {...windowProps} alignment="top" width={1100}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <WindowHandle className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--ink)] px-4 py-[10px] text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>{fr.production.header}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </WindowHandle>
        <Workshop nation={nation} token={token} />
      </div>
    </FloatingWindow>
  );
}

function Workshop({ nation, token }: { nation: string; token: string }) {
  const now = useClock();
  const workshop = useQuery(api.units.workshop, { token });
  const recruit = useMutation(api.units.recruit);
  const cancel = useMutation(api.units.cancel);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState(1);
  const [tiers, setTiers] = useState<Partial<Record<UnitRole, UnitTier>>>({});

  if (workshop === undefined) {
    return <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">{fr.production.opening}</p>;
  }

  const onFailure = (failure: unknown) => handleError(failure, setError);

  const enqueue = (role: UnitRole) => {
    setError(null);
    void recruit({ token, role, tier: tiers[role] ?? 1, count: batch }).catch(onFailure);
  };

  const withdraw = (recruitmentId: Id<'recruitments'>) => {
    setError(null);
    void cancel({ token, recruitmentId }).catch(onFailure);
  };

  const byDomain = (domain: UnitDomain) =>
    workshop.grid.filter((entry) => DOMAIN_BY_ROLE[entry.role] === domain);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResourceBar workshop={workshop} />

      {error && (
        <p className="shrink-0 border-b border-[var(--critical)] px-4 py-[9px] text-[12.5px] text-[var(--critical)]">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row @4xl:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
            <span className="eyebrow">{fr.production.batch}</span>
            <div className="flex gap-[3px]">
              {BATCHES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBatch(size)}
                  className={`cursor-pointer border border-[var(--ink)] px-[10px] py-[4px] font-[var(--font-mono)] text-[11px] ${
                    batch === size
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                  }`}
                >
                  ×{size}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[11.5px] text-[var(--ink-soft)]">
              {fr.production.chainSpeed(workshop.speed.toFixed(2), workshop.industryLevel)}
            </span>
          </div>

          <div className="max-h-[520px] min-h-[260px] flex-1 overflow-auto">
            {(['land', 'air', 'sea'] as const).map((domain) => (
              <section key={domain}>
                <div className="sticky top-0 z-10 flex items-center gap-3 border-y border-[rgba(42,33,24,.35)] bg-[var(--paper)] px-4 py-[5px]">
                  <span className="eyebrow">{fr.production.domains[domain]}</span>
                  <span className="h-px flex-1 bg-[rgba(42,33,24,.2)]" />
                </div>
                {byDomain(domain).map((entry) => (
                  <RoleRow
                    key={entry.role}
                    entry={entry}
                    nation={nation}
                    batch={batch}
                    tier={tiers[entry.role] ?? 1}
                    onTier={(chosen) =>
                      setTiers((previous) => ({ ...previous, [entry.role]: chosen }))
                    }
                    owned={workshop.roster.filter((row) => row.role === entry.role)}
                    tier2Unlocked={workshop.tier2Unlocked}
                    requiredLevel={workshop.requiredIndustryLevel}
                    onEnqueue={() => enqueue(entry.role)}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>

        <aside className="flex w-full min-w-0 flex-col border-t border-[rgba(42,33,24,.35)] @4xl:w-[330px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
          <div className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
            <span className="eyebrow">
              {fr.production.queueHeader(workshop.queue.length, workshop.maxQueue)}
            </span>
          </div>
          <div className="max-h-[460px] flex-1 overflow-auto">
            {workshop.queue.length === 0 ? (
              <p className="px-4 py-5 text-[12.5px] text-[var(--ink-soft)]">
                {fr.production.queueEmpty}
              </p>
            ) : (
              workshop.queue.map((queuedBatch) => (
                <QueueRow
                  key={queuedBatch.id}
                  batch={queuedBatch}
                  nation={nation}
                  loadedAt={now}
                  now={now}
                  onCancel={() => withdraw(queuedBatch.id)}
                />
              ))
            )}
            <div className="border-t border-[rgba(42,33,24,.35)] px-4 pt-3 pb-5">
              <span className="eyebrow">{fr.production.atWaking}</span>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
                {fr.production.wakingNote}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

type Workshop = NonNullable<ReturnType<typeof useQuery<typeof api.units.workshop>>>;

function ResourceBar({ workshop }: { workshop: Workshop }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-7 gap-y-2 border-b border-[rgba(42,33,24,.35)] px-4 py-[11px]">
      <StockLine
        resource="steel"
        stock={workshop.steel.stock}
        ratePerHour={workshop.steel.ratePerHour}
        cap={workshop.steel.cap}
      />
      <StockLine
        resource="manpower"
        stock={workshop.manpower.stock}
        ratePerHour={workshop.manpower.ratePerHour}
        cap={workshop.manpower.cap}
      />
      <StockLine
        resource="supply"
        stock={workshop.supply.stock}
        ratePerHour={workshop.supply.ratePerHour}
        cap={workshop.supply.cap}
      />
      <span className="ml-auto max-w-[42ch] text-right text-[11.5px] leading-[1.4] text-[var(--ink-soft)] italic">
        {fr.production.manpowerNote}
      </span>
    </div>
  );
}

function StockLine({
  resource,
  stock,
  ratePerHour,
  cap,
}: {
  resource: ResourceKey;
  stock: number;
  ratePerHour: number;
  cap: number | null;
}) {
  return (
    <span className="flex items-baseline gap-[7px]">
      <span className="flex self-center" style={{ color: resourceColor(resource, true) }}>
        <ResourceIcon resource={resource} size={13} />
      </span>
      <span className="eyebrow">{fr.resources[resource]}</span>
      <span className="font-[var(--font-mono)] text-[15px] text-[var(--ink)]">{stock}</span>
      {cap === null ? (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
          +{ratePerHour}/h
        </span>
      ) : (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
          {fr.production.capOf(cap)}
        </span>
      )}
    </span>
  );
}

type GridEntry = Workshop['grid'][number];

function RoleRow({
  entry,
  nation,
  batch,
  tier,
  onTier,
  owned,
  tier2Unlocked,
  requiredLevel,
  onEnqueue,
}: {
  entry: GridEntry;
  nation: string;
  batch: number;
  tier: UnitTier;
  onTier: (chosen: UnitTier) => void;
  owned: ReadonlyArray<{ tier: number; count: number }>;
  tier2Unlocked: boolean;
  requiredLevel: number;
  onEnqueue: () => void;
}) {
  const { role, tiers } = entry;
  const cost = tier === 2 && entry.unitTier2 ? entry.unitTier2 : entry.unit;
  const sheet = fr.unitSheets[role];
  const equipment = equipmentLabel(nation, role, tier);
  const total = owned.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex items-start gap-4 border-b border-[rgba(42,33,24,.16)] px-4 py-[10px]">
      <div className="relative shrink-0">
        <div className="flex h-[72px] w-[104px] items-end justify-center border border-[rgba(42,33,24,.28)] bg-[rgba(42,33,24,.05)] px-1">
          <UnitSprite nation={nation} role={role} tier={tier} height={66} width={96} />
        </div>
        {tiers === 2 && (
          <div className="absolute top-[3px] left-[3px] flex gap-[2px]">
            {([1, 2] as const).map((level) => {
              const locked = level === 2 && !tier2Unlocked;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={locked}
                  title={
                    locked ? fr.production.tier2Locked(requiredLevel) : fr.production.tierLabel(level)
                  }
                  onClick={() => onTier(level)}
                  className={`cursor-pointer border px-[4px] py-[1px] font-[var(--font-mono)] text-[9px] leading-none disabled:cursor-not-allowed disabled:opacity-35 ${
                    tier === level
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]'
                  }`}
                >
                  {tierLabel(level)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-[var(--font-display)] text-[15px] font-bold text-[var(--ink)]">
            {roleLabel(role, 1)}
          </span>
          {equipment && <span className="text-[12px] text-[var(--ink-soft)]">— {equipment}</span>}
          <span className="ml-auto font-[var(--font-mono)] text-[14px] text-[var(--ink)]">
            {total}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-[var(--ink-soft)]">
          <Expense resource="steel" value={cost.steel} />
          <Expense resource="manpower" value={cost.manpower} />
          <span className="font-[var(--font-mono)] text-[11.5px]">
            {asHoursMinutes(cost.minutes)}
          </span>
          <span className="text-[10px] tracking-[.14em] text-[var(--ink-quiet)] uppercase">
            {fr.production.perUnit}
          </span>
        </div>

        {sheet.kind === 'combat' ? (
          <div className="text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
            <div>
              {fr.production.strongAgainst} <span className="text-[var(--ink)]">{sheet.strongAgainst.join(', ')}</span>
            </div>
            <div>
              {fr.production.weakAgainst}{' '}
              <span className="text-[var(--ink)]">{sheet.weakAgainst.join(', ')}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11.5px] leading-[1.45] text-[var(--ink-soft)] italic">
            {sheet.contribution} {fr.production.supportNote}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onEnqueue}
        title={fr.production.enqueueTitle(batch, roleLabel(role, batch), tierLabel(tier))}
        className="shrink-0 cursor-pointer self-center border border-[var(--ink)] px-[11px] py-[6px] text-[10px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        + ×{batch}
      </button>
    </div>
  );
}

function QueueRow({
  batch,
  nation,
  loadedAt,
  now,
  onCancel,
}: {
  batch: Workshop['queue'][number];
  nation: string;
  loadedAt: number;
  now: number;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-[10px] border-b border-[rgba(42,33,24,.16)] px-4 py-[8px]">
      <UnitSprite
        nation={nation}
        role={batch.role}
        tier={batch.tier === 2 ? 2 : 1}
        height={26}
        width={38}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-[var(--ink)]">
          {batch.count} × {roleLabel(batch.role, batch.count)}{' '}
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
            {tierLabel(batch.tier === 2 ? 2 : 1)}
          </span>
        </div>
        <div className="text-[10px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
          {batch.started ? fr.production.inChain : fr.production.pending}
        </div>
      </div>
      <span className="shrink-0 font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">
        {asHoursMinutes(currentMinutes(batch.minutesLeft, loadedAt, now))}
      </span>
      <button
        type="button"
        disabled={batch.started}
        onClick={onCancel}
        title={batch.started ? fr.production.cancelStarted : fr.production.cancelRefund}
        className="shrink-0 cursor-pointer border border-[var(--ink)] px-[7px] py-[3px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-30"
      >
        {fr.production.cancel}
      </button>
    </div>
  );
}

function Expense({ resource, value }: { resource: ResourceKey; value: number }) {
  return (
    <span className="flex items-center gap-[4px]" title={fr.resources[resource]}>
      <span className="flex" style={{ color: resourceColor(resource, true) }}>
        <ResourceIcon resource={resource} size={11} />
      </span>
      <span className="font-[var(--font-mono)] text-[11.5px]">{value}</span>
    </span>
  );
}
