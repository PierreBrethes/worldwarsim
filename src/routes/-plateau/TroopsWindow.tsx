import { useEffect, useMemo, useState } from 'react';
import { fr, roleLabel, stackLabel } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { UnitSprite } from '@/emblems/UnitSprite';
import type { World } from '@/domain/world';
import type {
  UnitDomain,
  TroopFilter,
  TroopLine,
  TroopSort,
} from '@/domain/troops';
import { countTroops, inventoryTroops, organizeTroops } from '@/domain/troops';
import type { ArcView, MovementType, PlayerView, Stack, UnitRole } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { asHoursMinutes } from '@/domain/duration';
import { FloatingWindow, WindowHandle, type WindowProps } from './Window';
import { SendTab } from './SendTab';

type Tab = 'inventory' | 'send';

const SITUATIONS: ReadonlyArray<{ key: TroopFilter['situation']; label: string }> = [
  { key: 'all', label: fr.troops.situations.all },
  { key: 'home', label: fr.troops.situations.home },
  { key: 'movement', label: fr.troops.situations.movement },
  { key: 'garrison', label: fr.troops.situations.garrison },
];

const DOMAINS: ReadonlyArray<{ key: UnitDomain | 'all'; label: string }> = [
  { key: 'all', label: fr.troops.domains.all },
  { key: 'land', label: fr.troops.domains.land },
  { key: 'air', label: fr.troops.domains.air },
  { key: 'sea', label: fr.troops.domains.sea },
];

const SORTS: ReadonlyArray<{ key: TroopSort; label: string }> = [
  { key: 'role', label: fr.troops.sorts.role },
  { key: 'count', label: fr.troops.sorts.count },
  { key: 'due', label: fr.troops.sorts.due },
];

export function TroopsWindow({
  view,
  world,
  country,
  send,
  onClose,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  world: World;
  country: string | null;
  /** The type preset by the compass rose; its presence opens the window on the send tab. */
  send: MovementType | null;
}) {
  const [tab, setTab] = useState<Tab>(send === null ? 'inventory' : 'send');

  // The rose can preset the send on a window already on the desk: the tab follows.
  useEffect(() => {
    if (send !== null) setTab('send');
  }, [send]);

  return (
    <FloatingWindow name="troops" onClose={onClose} {...windowProps} alignment="top" width={1040}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <Header tab={tab} onTab={setTab} view={view} onClose={onClose} />
        {tab === 'inventory' ? (
          <Inventory view={view} />
        ) : (
          <SendTab view={view} world={world} country={country} presetType={send} onClose={onClose} />
        )}
      </div>
    </FloatingWindow>
  );
}

function Header({
  tab,
  onTab,
  view,
  onClose,
}: {
  tab: Tab;
  onTab: (chosen: Tab) => void;
  view: PlayerView;
  onClose: () => void;
}) {
  const { slots } = view.me;

  return (
    <WindowHandle className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--ink)] px-4 py-[10px] text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
      <span>{fr.troops.header}</span>
      <div className="flex gap-[5px]">
        <TabButton label={fr.troops.inventory} active={tab === 'inventory'} onClick={() => onTab('inventory')} />
        <TabButton label={fr.troops.send} active={tab === 'send'} onClick={() => onTab('send')} />
      </div>
      <span className="flex-1" />
      <span className="text-[11px] tracking-normal normal-case text-[var(--ink-soft)]">
        {fr.troops.slotsLine(slots.used, slots.total - slots.used)}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        {fr.common.close}
      </button>
    </WindowHandle>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer border border-[var(--ink)] px-[13px] py-[6px] text-[10px] tracking-[.16em] uppercase ${
        active
          ? 'bg-[var(--ink)] text-[var(--paper)]'
          : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
      }`}
    >
      {label}
    </button>
  );
}

function Inventory({ view }: { view: PlayerView }) {
  const now = useClock();
  const [filter, setFilter] = useState<TroopFilter>({ situation: 'all', unitDomain: 'all' });
  const [sort, setSort] = useState<TroopSort>('role');

  const inventory = useMemo(() => inventoryTroops(view.me, view.arcs), [view.me, view.arcs]);
  const lines = organizeTroops(inventory, filter, sort);

  return (
    <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row @4xl:items-stretch">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
          <Choice
            title={fr.troops.situation}
            options={SITUATIONS}
            chosen={filter.situation}
            onChoice={(situation) => setFilter((previous) => ({ ...previous, situation }))}
          />
          <Choice
            title={fr.troops.domain}
            options={DOMAINS}
            chosen={filter.unitDomain}
            onChoice={(unitDomain) => setFilter((previous) => ({ ...previous, unitDomain }))}
          />
          <Choice title={fr.troops.sort} options={SORTS} chosen={sort} onChoice={setSort} />
          <span className="ml-auto text-[11.5px] text-[var(--ink-soft)]">
            {fr.troops.countOf(countTroops(lines), countTroops(inventory))}
          </span>
        </div>

        <div className="max-h-[420px] min-h-[220px] flex-1 overflow-auto @4xl:max-h-none">
          {lines.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">
              {fr.troops.emptyFilter}
            </p>
          ) : (
            lines.map((line) => (
              <InventoryLine
                key={line.key}
                line={line}
                nation={view.me.nation}
                loadedAt={view.loadedAt}
                now={now}
              />
            ))
          )}
        </div>
      </div>

      <aside className="flex w-full min-w-0 flex-col border-t border-[rgba(42,33,24,.35)] @4xl:w-[366px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
        <div className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
          <span className="eyebrow">{fr.troops.movementsHeader}</span>
        </div>
        <div className="max-h-[420px] flex-1 overflow-auto @4xl:max-h-none">
          {view.arcs.map((arc) => (
            <MovementLine
              key={arc.id}
              arc={arc}
              nation={view.me.nation}
              loadedAt={view.loadedAt}
              now={now}
            />
          ))}
          <p className="px-4 pt-3 pb-5 text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
            {fr.troops.intelNote}
          </p>
        </div>
      </aside>
    </div>
  );
}

function Choice<Key extends string>({
  title,
  options,
  chosen,
  onChoice,
}: {
  title: string;
  options: ReadonlyArray<{ key: Key; label: string }>;
  chosen: Key;
  onChoice: (key: Key) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow">{title}</span>
      <div className="flex gap-[3px]">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChoice(option.key)}
            className={`cursor-pointer border border-[var(--ink)] px-[7px] py-[4px] text-[10px] tracking-[.1em] uppercase ${
              chosen === option.key
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InventoryLine({
  line,
  nation,
  loadedAt,
  now,
}: {
  line: TroopLine;
  nation: string;
  loadedAt: number;
  now: number;
}) {
  const situation = line.situation;
  return (
    <div className="flex items-center gap-3 border-b border-[rgba(42,33,24,.16)] px-4 py-[7px]">
      <UnitSprite nation={nation} role={line.role} height={32} width={46} />
      <span className="w-[42px] shrink-0 text-right font-[var(--font-mono)] text-[15px] text-[var(--ink)]">
        {line.count}
      </span>
      <span className="w-[150px] shrink-0 text-[13.5px] text-[var(--ink)]">
        {roleLabel(line.role, line.count)}
      </span>
      <span className="w-[42px] shrink-0 text-[10px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
        {fr.troops.domains[line.unitDomain]}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-soft)]">
        {situation.kind === 'home' && fr.troops.atHome}
        {situation.kind === 'garrison' && fr.troops.garrisonAt(situation.hostCountry)}
        {situation.kind === 'movement' &&
          `${fr.movementTypes[situation.movementType]} → ${situation.destination}`}
      </span>
      <span className="w-[58px] shrink-0 text-right font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">
        {situation.kind === 'movement'
          ? asHoursMinutes(currentMinutes(situation.minutesLeft, loadedAt, now))
          : '—'}
      </span>
    </div>
  );
}

function MovementLine({
  arc,
  nation,
  loadedAt,
  now,
}: {
  arc: ArcView;
  nation: string;
  loadedAt: number;
  now: number;
}) {
  const line = toLine(arc, loadedAt, now);
  return (
    <div className="border-b border-[rgba(42,33,24,.22)] px-4 py-[10px]">
      <div className="flex items-center gap-[9px]">
        <span className="h-[9px] w-[9px]" style={{ background: line.ink, opacity: line.inkOpacity }} />
        <span className="text-[10px] tracking-[.18em] text-[var(--ink-soft)] uppercase">{line.state}</span>
        <span className="h-px flex-1 bg-[rgba(42,33,24,.16)]" />
        <span className="font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">{line.eta}</span>
      </div>
      <div className="mt-[5px] text-[13px] text-[var(--ink-soft)]">{line.route}</div>
      {arc.state === 'mine' ? (
        <StackAsSprites stack={arc.stack} nation={nation} />
      ) : (
        <div className="mt-[2px] text-[12px] text-[var(--ink-soft)]">{line.composition}</div>
      )}
    </div>
  );
}

/**
 * Reserved for `mine` arcs: the discriminated union is what guarantees this view cannot be
 * called on an enemy arc, which structurally has no stack to show.
 */
function StackAsSprites({ stack, nation }: { stack: Stack; nation: string }) {
  const lines = (Object.entries(stack) as ReadonlyArray<[UnitRole, number]>).filter(
    ([, count]) => count > 0,
  );
  if (lines.length === 0) {
    return <div className="mt-[2px] text-[12px] text-[var(--ink-soft)]">—</div>;
  }
  return (
    <div className="mt-[3px] flex flex-wrap items-center gap-x-[10px] gap-y-[2px]">
      {lines.map(([role, count]) => (
        <span key={role} className="flex items-center gap-[4px]" title={roleLabel(role, count)}>
          <UnitSprite nation={nation} role={role} height={22} width={30} />
          <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink)]">{count}</span>
        </span>
      ))}
    </div>
  );
}

type ArcLine = {
  state: string;
  ink: string;
  inkOpacity: number;
  route: string;
  composition: string;
  eta: string;
};

function toLine(arc: ArcView, loadedAt: number, now: number): ArcLine {
  switch (arc.state) {
    case 'mine':
      return {
        state: fr.troops.arcMine(fr.movementTypes[arc.type]),
        ink: 'var(--interaction)',
        inkOpacity: 1,
        route: `${arc.originLabel} → ${arc.destinationLabel}`,
        composition: stackLabel(arc.stack),
        eta: asHoursMinutes(currentMinutes(arc.minutesLeft, loadedAt, now)),
      };
    case 'enemyDetected':
      return {
        state: fr.troops.arcDetected,
        ink: 'var(--critical)',
        inkOpacity: 0.85,
        route: fr.troops.arcHeading(Math.round(arc.headingDegrees)),
        composition: fr.troops.arcUnknownComposition,
        eta: arc.estimatedMinutesLeft === null ? '—' : `~${asHoursMinutes(arc.estimatedMinutesLeft)}`,
      };
    case 'lastKnown':
      return {
        state: fr.troops.arcLastKnown,
        ink: 'var(--routine)',
        inkOpacity: 0.45,
        route: fr.troops.arcFrozen(Math.round(arc.headingDegrees)),
        composition: fr.troops.arcSeenAgo(arc.seenMinutesAgo),
        eta: '—',
      };
    case 'seaControl':
      return {
        state: fr.troops.arcSeaControl,
        ink: '#4a4f7a',
        inkOpacity: 0.7,
        route: fr.troops.arcEndsErased,
        composition: fr.troops.arcNoEnds,
        eta: '—',
      };
  }
}
