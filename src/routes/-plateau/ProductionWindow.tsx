import { useMutation, useQuery } from 'convex/react';
import { useState, type ReactNode } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr, noBuilding, roleLabel } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { handleError } from '@/data/errors';
import { ResourceIcon, resourceColor, type ResourceKey } from '@/emblems/ResourceIcon';
import { BuildingPlate } from '@/emblems/Plate';
import { UnitSprite } from '@/emblems/UnitSprite';
import { equipmentLabel } from '@/emblems/units/equipment';
import type { UnitDomain, UnitTier } from '@/domain/troops';
import { DOMAIN_BY_ROLE, PROJECTION_BY_DOMAIN, tierLabel } from '@/domain/troops';
import type { PlayerView, UnitRole } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { asHoursMinutes } from '@/domain/duration';
import { FOCUS_MARK, useFocusRow } from './focus';
import { UpgradeControl } from './UpgradeControl';
import { FloatingWindow, WindowHandle, type WindowProps } from './Window';

const DOMAINS: ReadonlyArray<UnitDomain> = ['land', 'air', 'sea'];

export function ProductionWindow({
  view,
  token,
  focused,
  onClose,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  token: string;
  /** The building whose line the window was opened on, `null` when it was opened bare. */
  focused: string | null;
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
        <Workshop view={view} token={token} focused={focused} />
      </div>
    </FloatingWindow>
  );
}

function Workshop({
  view,
  token,
  focused,
}: {
  view: PlayerView;
  token: string;
  focused: string | null;
}) {
  const now = useClock();
  const nation = view.me.nation;
  const workshop = useQuery(api.troops.workshop, { token });
  const recruit = useMutation(api.troops.recruit);
  const cancel = useMutation(api.troops.cancel);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Partial<Record<UnitDomain, Id<'buildings'>>>>({});
  const [tiers, setTiers] = useState<Partial<Record<UnitRole, UnitTier>>>({});

  if (workshop === undefined) {
    return <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">{fr.production.opening}</p>;
  }

  const onFailure = (failure: unknown) => handleError(failure, setError);

  const sitesOf = (domain: UnitDomain) =>
    workshop.facilities.filter((facility) => facility.domain === domain);

  /**
   * The picked site is derived, never duplicated in state: a razed barracks would leave a
   * stale id selected, and the first site of the domain is the honest fallback — the same
   * fallback a deep link on a building that no longer stands lands on.
   *
   * The player's own pick comes first: the focus is what the window opened on, and it must not
   * keep overriding a selector he has since used himself.
   */
  const siteOf = (domain: UnitDomain) => {
    const sites = sitesOf(domain);
    const picked = sites.find((site) => site.id === chosen[domain]);
    const designated = sites.find((site) => site.id === focused);
    return picked ?? designated ?? sites[0] ?? null;
  };

  const enqueue = (role: UnitRole, buildingId: Id<'buildings'>) => {
    setError(null);
    void recruit({ token, buildingId, role, tier: tiers[role] ?? 1 }).catch(onFailure);
  };

  const withdraw = (recruitmentId: Id<'recruitments'>) => {
    setError(null);
    void cancel({ token, recruitmentId }).catch(onFailure);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No stock header. Alloy and ammunition were the banner's figures printed a fourth
          time, and the decision taken here is priced on each role's own line — where the
          shortfall is actually actionable. */}
      {error && (
        <p className="shrink-0 border-b border-[var(--critical)] px-4 py-[9px] text-[12.5px] text-[var(--critical)]">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row @4xl:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
            <span className="eyebrow">
              {fr.production.troopCapLine(
                workshop.troopsInService,
                workshop.troopsQueued,
                workshop.troopCap,
              )}
            </span>
            {/* "chaîne ×1.00 — quartier général niveau 1" lived here and on the nation sheet;
                it belongs to the headquarters, which is where it is now read alone. */}
            <span className="ml-auto max-w-[46ch] text-right text-[11.5px] leading-[1.4] text-[var(--ink-soft)] italic">
              {fr.production.troopCapNote}
            </span>
          </div>

          {/* The ceiling is carried by the billets, so the line that states it is where they
              are raised — the same rule as the site line above. */}
          {view.me.buildings
            .filter((building) => building.key === 'billets')
            .map((billets) => (
              <BilletsRow
                key={billets.regionId}
                billets={billets}
                view={view}
                token={token}
                now={now}
                focused={focused === billets.id}
              />
            ))}

          <div className="max-h-[520px] min-h-[260px] flex-1 overflow-auto">
            {DOMAINS.map((domain) => {
              const site = siteOf(domain);
              return (
                <DomainSection key={domain} focused={site !== null && site.id === focused}>
                  <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-[rgba(42,33,24,.35)] bg-[var(--paper)] px-4 py-[5px]">
                    <BuildingPlate building={PROJECTION_BY_DOMAIN[domain]} height={26} />
                    <span className="eyebrow">{fr.production.domains[domain]}</span>
                    {site === null ? (
                      /* The single limiting factor, named — not the list of what is missing.
                         "bloqué : aucune caserne" tells the player what to build; a greyed
                         section tells him he did something wrong. */
                      <span className="text-[12px] text-[var(--critical)]">
                        {fr.production.blockedBy(noBuilding(PROJECTION_BY_DOMAIN[domain]))}
                      </span>
                    ) : (
                      <>
                        <span className="text-[10px] tracking-[.14em] text-[var(--ink-quiet)] uppercase">
                          {fr.production.site}
                        </span>
                        <select
                          value={site.id}
                          onChange={(event) =>
                            setChosen((previous) => ({
                              ...previous,
                              [domain]: event.target.value as Id<'buildings'>,
                            }))
                          }
                          className="cursor-pointer border border-[var(--ink)] bg-[var(--paper)] px-[7px] py-[2px] text-[11.5px] text-[var(--ink)]"
                        >
                          {sitesOf(domain).map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {fr.production.siteOption(candidate.regionName, candidate.level)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <span className="h-px flex-1 bg-[rgba(42,33,24,.2)]" />
                    {site !== null && <SiteUpgrade regionId={site.regionId} view={view} token={token} now={now} />}
                  </div>
                  {workshop.grid
                    .filter((entry) => DOMAIN_BY_ROLE[entry.role] === domain)
                    .map((entry) => (
                      <RoleRow
                        key={entry.role}
                        entry={entry}
                        nation={nation}
                        tier={tiers[entry.role] ?? 1}
                        onTier={(picked) =>
                          setTiers((previous) => ({ ...previous, [entry.role]: picked }))
                        }
                        owned={workshop.roster.filter((row) => row.role === entry.role)}
                        tier2Unlocked={workshop.tier2Unlocked}
                        requiredLevel={workshop.requiredHqLevel}
                        site={site}
                        onEnqueue={() => site && enqueue(entry.role, site.id)}
                      />
                    ))}
                </DomainSection>
              );
            })}
          </div>
        </div>

        <aside className="flex w-full min-w-0 flex-col border-t border-[rgba(42,33,24,.35)] @4xl:w-[330px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
          <div className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
            <span className="eyebrow">{fr.production.queueHeader}</span>
          </div>
          <div className="max-h-[460px] flex-1 overflow-auto">
            {workshop.troopsQueued === 0 ? (
              <p className="px-4 py-5 text-[12.5px] text-[var(--ink-soft)]">
                {fr.production.queueEmpty}
              </p>
            ) : (
              workshop.facilities
                .filter((facility) => facility.queue.length > 0)
                .map((facility) => (
                  <section key={facility.id}>
                    <div className="border-b border-[rgba(42,33,24,.35)] bg-[rgba(42,33,24,.05)] px-4 py-[5px]">
                      <span className="eyebrow">
                        {fr.production.queueOf(
                          facility.regionName,
                          facility.queue.length,
                          workshop.maxQueue,
                        )}
                      </span>
                    </div>
                    {facility.queue.map((batch) => (
                      <QueueRow
                        key={batch.id}
                        batch={batch}
                        nation={nation}
                        loadedAt={workshop.loadedAt}
                        now={now}
                        onCancel={() => withdraw(batch.id)}
                      />
                    ))}
                  </section>
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

/** The window has no tabs — three stacked sections, each with its site selector. Opening "on
 *  the right tab" therefore means bringing the right section into sight, never building a tab
 *  bar for it. */
function DomainSection({ focused, children }: { focused: boolean; children: ReactNode }) {
  const section = useFocusRow<HTMLElement>(focused);
  return <section ref={section}>{children}</section>;
}

function BilletsRow({
  billets,
  view,
  token,
  now,
  focused,
}: {
  billets: PlayerView['me']['buildings'][number];
  view: PlayerView;
  token: string;
  now: number;
  focused: boolean;
}) {
  const row = useFocusRow<HTMLDivElement>(focused);
  return (
    <div
      ref={row}
      className={`flex shrink-0 items-center gap-3 border-b border-[rgba(42,33,24,.16)] px-4 py-[7px] ${
        focused ? FOCUS_MARK : ''
      }`}
    >
      <BuildingPlate building={billets.key} height={26} />
      <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-soft)]">
        {billets.name} · {fr.nationSheet.inRegion(regionNameOf(view, billets.regionId))} ·{' '}
        {fr.nationSheet.level(billets.level)}
      </span>
      <UpgradeControl building={billets} view={view} token={token} now={now} />
    </div>
  );
}

type WorkshopView = NonNullable<ReturnType<typeof useQuery<typeof api.troops.workshop>>>;
type Facility = WorkshopView['facilities'][number];

const regionNameOf = (view: PlayerView, regionId: string): string =>
  view.me.regions.find((region) => region.id === regionId)?.name ?? regionId;

/**
 * The raise of the selected site, on the site line itself. It reads the building out of the
 * view rather than out of the workshop query: the workshop prices troops, `PlayerView` prices
 * buildings, and neither has a reason to learn the other's grid.
 *
 * One building per region (ADR 0015), so the region id designates the instance.
 */
function SiteUpgrade({
  regionId,
  view,
  token,
  now,
}: {
  regionId: string;
  view: PlayerView;
  token: string;
  now: number;
}) {
  const standing = view.me.buildings.find((building) => building.regionId === regionId);
  if (standing === undefined) return null;
  return <UpgradeControl building={standing} view={view} token={token} now={now} />;
}

type GridEntry = WorkshopView['grid'][number];

function RoleRow({
  entry,
  nation,
  tier,
  onTier,
  owned,
  tier2Unlocked,
  requiredLevel,
  site,
  onEnqueue,
}: {
  entry: GridEntry;
  nation: string;
  tier: UnitTier;
  onTier: (chosen: UnitTier) => void;
  owned: ReadonlyArray<{ tier: number; count: number }>;
  tier2Unlocked: boolean;
  requiredLevel: number;
  site: Facility | null;
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
          <Expense resource="alloy" value={cost.alloy} />
          <Expense resource="ammunition" value={cost.ammunition} />
          <span className="font-[var(--font-mono)] text-[11.5px]">
            {asHoursMinutes(cost.minutes)}
          </span>
          <span className="font-[var(--font-mono)] text-[11.5px] text-[var(--ink)]">
            {cost.strength} {fr.strengthUnits[role]}
          </span>
          <span className="text-[10px] tracking-[.14em] text-[var(--ink-quiet)] uppercase">
            {fr.production.perTroop}
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
        disabled={site === null}
        onClick={onEnqueue}
        title={
          site === null
            ? fr.production.noSite(fr.buildings[entry.producedBy])
            : fr.production.enqueueTitle(roleLabel(role, 1), tierLabel(tier), site.regionName)
        }
        className="shrink-0 cursor-pointer self-center border border-[var(--ink)] px-[11px] py-[6px] text-[10px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-30"
      >
        {fr.production.enqueue}
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
  batch: Facility['queue'][number];
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
          {roleLabel(batch.role, 1)}{' '}
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
            {tierLabel(batch.tier === 2 ? 2 : 1)} — {batch.strength} {fr.strengthUnits[batch.role]}
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
