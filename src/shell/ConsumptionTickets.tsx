import type { CSSProperties, ReactNode } from 'react';
import { aBuilding, fr, noBuilding } from '@/i18n/fr';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import {
  horizonOf,
  ledgerNotesOf,
  ledgerOf,
  type LedgerNote,
  type LedgerRow,
  type LedgerSection,
} from '@/domain/ledger';
import { currentStock, type PlayerView } from '@/domain/player-view';
import { PRODUCER_OF } from '@/domain/economy';
import { marksOf } from '@/domain/resource-band';
import { upkeepStep } from '@/domain/upkeep';
import { ResourcePlate } from '@/emblems/Plate';
import { BottomSheet } from './BottomSheet';
import { useClock } from './clock';
import { MAT_LIFT } from './viewport';

/** Trois tickets côte à côte au plus : un quatrième décroche le plus ancien (`Shell`). */
export const MAX_TICKETS = 3;

/** Épingler ou décrocher : au-delà de `max`, le plus ancien part. */
export const pinToggled = (
  held: ReadonlyArray<ResourceKey>,
  resource: ResourceKey,
  max: number,
): ReadonlyArray<ResourceKey> =>
  held.includes(resource)
    ? held.filter((candidate) => candidate !== resource)
    : [...held, resource].slice(-max);

/**
 * **Les tickets de consommation** (issue #121, maquette B « le sous-main ») : un clic sur une
 * réserve du bandeau en épingle le registre sous la réglette, jusqu'à ce qu'on le décroche. Au
 * téléphone, c'est une feuille — une seule, la dernière touchée.
 */
export function ConsumptionTickets({
  view,
  pinned,
  narrow,
  onUnpin,
}: {
  view: PlayerView;
  pinned: ReadonlyArray<ResourceKey>;
  narrow: boolean;
  onUnpin: (resource: ResourceKey) => void;
}) {
  const open = RESOURCES.filter((resource) => pinned.includes(resource));
  if (open.length === 0) return null;

  if (narrow) {
    const resource = pinned[pinned.length - 1]!;
    return (
      <BottomSheet
        title={fr.ledger.title(fr.resources[resource])}
        onClose={() => onUnpin(resource)}
      >
        <Ledger view={view} resource={resource} />
      </BottomSheet>
    );
  }

  return (
    <div className="hud pointer-events-none fixed top-[calc((var(--board-top)+6px)/var(--hud-scale))] right-[calc(var(--table-margin)/var(--hud-scale))] z-[var(--z-band)] flex items-start gap-[10px]">
      {open.map((resource) => (
        <Ticket key={resource} view={view} resource={resource} onUnpin={() => onUnpin(resource)} />
      ))}
    </div>
  );
}

/** Le bord supérieur perforé, comme un ticket arraché à son carnet. */
const PERFORATION =
  'radial-gradient(circle 4px at 7px 0, transparent 98%, #000) -7px 0 / 14px 100% repeat-x';

function Ticket({
  view,
  resource,
  onUnpin,
}: {
  view: PlayerView;
  resource: ResourceKey;
  onUnpin: () => void;
}) {
  const now = useClock();
  const reserve = view.me.resources[resource];
  const stock = currentStock(reserve, view.loadedAt, now);
  return (
    <section
      aria-label={fr.ledger.title(fr.resources[resource])}
      className="paper-grain float paper-unfold pointer-events-auto grid w-[300px] grid-rows-[auto_1fr] border border-[var(--ink)] pt-[7px] text-[var(--ink)]"
      style={
        {
          maxHeight: `calc((100dvh - var(--board-top) - 6px - var(--table-margin) - ${MAT_LIFT}) / var(--hud-scale))`,
          WebkitMask: PERFORATION,
          mask: PERFORATION,
          fontFamily: 'var(--font-body)',
        } as CSSProperties
      }
    >
      <header className="flex items-center gap-[8px] border-b border-dashed border-[var(--ink)] px-[10px] py-[6px]">
        <ResourcePlate resource={resource} height={22} boxed={false} />
        <h3 className="m-0 font-(family-name:--font-display) text-[18px] leading-none font-bold first-letter:uppercase">
          {fr.resources[resource]}
        </h3>
        <span className="font-(family-name:--font-mono) text-[11px] leading-none whitespace-nowrap text-[var(--ink-soft)]">
          {stock} / {reserve.cap}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onUnpin}
          className="cursor-pointer border border-[var(--ink)] px-[7px] py-[3px] text-[10px] font-semibold tracking-[.14em] uppercase"
        >
          {fr.ledger.unpin}
        </button>
      </header>
      <div className="overflow-y-auto overscroll-contain">
        <Ledger view={view} resource={resource} />
      </div>
    </section>
  );
}

/** Le registre : trois chiffres, l'horizon, puis une catégorie par dépliant. */
function Ledger({ view, resource }: { view: PlayerView; resource: ResourceKey }) {
  const now = useClock();
  const ledger = ledgerOf(view, resource);
  const reserve = view.me.resources[resource];
  const horizon = horizonOf(
    currentStock(reserve, view.loadedAt, now),
    reserve.cap,
    reserve.ratePerHour,
  );
  const full = marksOf(view, now)[resource];
  return (
    <div className="px-[10px] pb-[10px]">
      <div className="grid grid-cols-3 border-y border-[var(--ink)]">
        <Figure label={fr.ledger.production} value={ledger.production} />
        <Figure label={fr.ledger.consumption} value={ledger.consumption} divided />
        <Figure label={fr.ledger.balance} value={ledger.balance} divided />
      </div>
      <p className="m-0 px-[2px] pt-[6px] pb-[4px] font-(family-name:--font-text) text-[12.5px] leading-[1.35] text-[var(--ink-soft)] italic">
        {full !== null
          ? full.diagnosis
          : horizon.kind === 'dry'
            ? horizon.hours === 0
              ? fr.ledger.dry
              : fr.ledger.dryIn(horizon.hours)
            : horizon.kind === 'full'
              ? fr.ledger.fullIn(horizon.hours)
              : fr.ledger.steady}
      </p>
      {ledgerNotesOf(view, resource).map((note) => (
        <p
          key={noteKey(note)}
          className="m-0 px-[2px] pb-[4px] text-[12px] leading-[1.35] font-semibold text-[var(--critical)]"
        >
          {noteText(note)}
        </p>
      ))}
      {ledger.sections.map((section) => (
        <Section key={section.id} section={section} view={view} />
      ))}
    </div>
  );
}

const tone = (value: number): string =>
  value > 0
    ? 'text-[var(--valid)]'
    : value < 0
      ? 'text-[var(--critical)]'
      : 'text-[var(--ink-soft)]';

function Figure({
  label,
  value,
  divided = false,
}: {
  label: string;
  value: number;
  divided?: boolean;
}) {
  return (
    <div
      className={`grid gap-[3px] px-[8px] pt-[7px] pb-[6px] ${divided ? 'border-l border-(color:--ink)/18' : ''}`}
    >
      <span className="text-[9px] leading-[1.2] font-semibold tracking-[.18em] text-[var(--ink-soft)] uppercase">
        {label}
      </span>
      <b
        className={`font-(family-name:--font-mono) text-[15px] leading-none font-semibold ${tone(value)}`}
      >
        {fr.ledger.perHour(value)}
      </b>
    </div>
  );
}

function Section({ section, view }: { section: LedgerSection; view: PlayerView }) {
  const empty = section.rows.length === 0;
  return (
    <details open={section.id === 'troops'} className="group border-b border-(color:--ink)/18">
      <summary className="grid cursor-pointer list-none grid-cols-[14px_1fr_auto] items-center gap-[6px] px-[2px] py-[8px] text-[13px] leading-none font-semibold [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-[10px] text-[var(--ink-soft)] transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        <span>{fr.ledger.sections[section.id]}</span>
        <span className={`font-(family-name:--font-mono) text-[13px] ${tone(section.perHour)}`}>
          {empty && section.perHour === 0 ? '—' : fr.ledger.perHour(section.perHour)}
        </span>
      </summary>
      <div className="grid gap-[4px] pr-[2px] pb-[8px] pl-[20px]">
        {section.id === 'troops' && !empty && <Tally section={section} view={view} />}
        {section.rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-[1fr_auto] items-baseline gap-[8px] text-[12px] leading-[1.25]"
          >
            <span>{rowLabel(row)}</span>
            <span className={`font-(family-name:--font-mono) text-[11.5px] ${tone(row.perHour)}`}>
              {fr.ledger.perHour(row.perHour)}
            </span>
          </div>
        ))}
        {empty && (
          <p className="m-0 text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
            {fr.ledger.empty[section.id]}
          </p>
        )}
        {section.id === 'troops' && !empty && view.me.upkeep.unsupplied === 0 && (
          <p className="m-0 text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
            {fr.ledger.allSupplied}
          </p>
        )}
      </div>
    </details>
  );
}

const noteKey = (note: LedgerNote): string =>
  note.kind === 'starvedChain' ? `${note.kind}-${note.building}` : note.kind;

function noteText(note: LedgerNote): string {
  switch (note.kind) {
    case 'starving':
      return fr.ledger.starving;
    case 'starvedChain':
      return fr.ledger.starvedChain(
        fr.buildings[note.building],
        fr.resources[note.missing],
        aBuilding(PRODUCER_OF[note.missing]),
      );
    case 'listeningSilent':
      return fr.ledger.listeningSilent;
    case 'noProducer':
      return fr.ledger.noProducer(noBuilding(note.producer));
  }
}

function rowLabel({ what }: LedgerRow): ReactNode {
  switch (what.kind) {
    case 'site':
      return fr.ledger.site(fr.buildings[what.building], what.region, what.level, what.linked);
    case 'chain':
      return fr.ledger.chain(fr.buildings[what.building], what.level);
    case 'ranks':
      return fr.ledger.ranks(what.from, what.to, what.rate, what.outside);
    case 'outpost':
      return fr.ledger.outpost(what.region, what.level);
    case 'station':
      return fr.ledger.station(what.region, what.outpost);
  }
}

/** **L'armée en marques** : un trait par troupe, plus épais à chaque palier, hachuré hors
 *  ancrage, et le pointillé de la prochaine, avec ce qu'elle coûtera. */
function Tally({ section, view }: { section: LedgerSection; view: PlayerView }) {
  const marks = section.rows.flatMap((row) =>
    row.what.kind === 'ranks'
      ? Array.from(
          { length: row.what.to - row.what.from + 1 },
          () => row.what as Extract<typeof row.what, { kind: 'ranks' }>,
        )
      : [],
  );
  const next = upkeepStep(view.me.upkeep.troops);
  return (
    <>
      <div aria-hidden className="flex flex-wrap items-end gap-[3px] pt-[4px] pb-[2px]">
        {marks.map((mark, index) => (
          <i
            key={index}
            className="block w-[7px] bg-[var(--ink)]"
            style={{
              height: 14 + (mark.rate - 1) * 4,
              ...(mark.outside
                ? {
                    background:
                      'repeating-linear-gradient(45deg, var(--critical) 0 2px, transparent 2px 4px)',
                    boxShadow: 'inset 0 0 0 1px var(--critical)',
                  }
                : mark.rate > 1
                  ? { background: 'var(--ink-soft)', boxShadow: 'inset 0 0 0 1px var(--ink)' }
                  : {}),
            }}
          />
        ))}
        <i
          className="block w-[7px] border border-dashed border-[var(--ink-soft)] opacity-70"
          style={{ height: 14 + (next.rate - 1) * 4 }}
        />
      </div>
      <p className="m-0 text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
        {fr.ledger.tallyNote(next.rate, next.nextAt, next.nextRate)}
      </p>
    </>
  );
}
