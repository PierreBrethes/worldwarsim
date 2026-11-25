import { fr } from '@/i18n/fr';
import { asDuration } from '@/domain/duration';
import { slotsRefusalOf, underwayLeftMs, type Underway } from '@/domain/underway';
import { Face } from '@/routes/-plateau/UnderwayColumn';
import { useClock } from './clock';

/** @a-mesurer : la largeur du volet et la hauteur de son corps (le plafond de 440 px de carte
 *  couverte, moins son en-tête), en pixels d'écran : le volet est dans `.hud`, rendu à l'échelle
 *  (`--hud-scale`). */
const DRAWER_WIDTH = 'calc(372px / var(--hud-scale))';
const BODY_MAX = 'calc(380px / var(--hud-scale))';

/**
 * **Le volet « En cours » du bureau** (#615), pendu à la réglette sous le compteur de slots : les
 * mêmes lignes que la colonne du téléphone, en deux groupes — les mouvements, qui tiennent les
 * slots, puis chantiers, recrutements et lots —, chacune du plus proche au plus lointain, avec sa
 * jauge. Quand tous les slots sont pris, le refus est dit ici, sous les mouvements (ADR 0015).
 * Un clic sur une ligne recentre la carte et laisse le volet ouvert.
 */
export function UnderwayDrawer({
  id,
  lines,
  nation,
  slots,
  onLocate,
  onClose,
}: {
  id: string;
  lines: ReadonlyArray<Underway>;
  nation: string;
  slots: { readonly total: number; readonly used: number };
  onLocate: (line: Underway) => void;
  onClose: () => void;
}) {
  const now = useClock();
  const movements = lines.filter((line) => line.moving);
  const rest = lines.filter((line) => !line.moving);
  const refusal = slotsRefusalOf(slots, lines);

  return (
    <section
      id={id}
      aria-label={fr.underway.drawer.title}
      style={{ width: DRAWER_WIDTH }}
      className="paper-grain float absolute top-[calc(100%+6px)] left-0 z-[1] border border-[var(--ink)] text-[var(--ink)]"
    >
      <header className="flex items-baseline gap-[10px] border-b-2 border-[var(--ink)] px-[14px] pt-[10px] pb-[8px]">
        <h2 className="font-(family-name:--font-display) text-[19px] leading-none font-bold">
          {fr.underway.drawer.title}
        </h2>
        <span className="text-[11px] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {fr.underway.drawer.count(lines.length)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto min-h-[28px] cursor-pointer self-center border border-[var(--ink)] px-[10px] text-[11px] font-semibold tracking-[.12em] uppercase hover:bg-[var(--ink)]/10"
        >
          {fr.underway.drawer.close}
        </button>
      </header>
      <div className="overflow-y-auto" style={{ maxHeight: BODY_MAX }}>
        {lines.length === 0 && (
          <p className="px-[14px] py-[12px] text-[12.5px] text-[var(--ink-soft)]">
            {fr.underway.drawer.empty}
          </p>
        )}
        {movements.length > 0 && (
          <>
            <Group
              title={fr.underway.drawer.movements}
              note={fr.underway.drawer.slots(slots.used, slots.total)}
            />
            {movements.map((line) => (
              <Row key={line.id} line={line} nation={nation} now={now} onLocate={onLocate} />
            ))}
          </>
        )}
        {refusal !== null && (
          <p
            role="status"
            className="border-t border-[var(--ink)]/32 px-[14px] pt-[8px] pb-[10px] text-[12.5px] leading-[1.3] text-[var(--critical-paper)]"
          >
            {refusal.kind === 'frees' ? (
              <>
                {fr.underway.drawer.freesAt(slots.total, refusal.line.label)}
                <b className="font-(family-name:--font-mono) font-medium">
                  {asDuration((refusal.at - now) / 60_000)}
                </b>
                .
              </>
            ) : (
              `${fr.underway.drawer.allEngaged(slots.total)}.`
            )}
          </p>
        )}
        {rest.length > 0 && (
          <>
            <Group title={fr.underway.drawer.rest} note={String(rest.length)} />
            {rest.map((line) => (
              <Row key={line.id} line={line} nation={nation} now={now} onLocate={onLocate} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function Group({ title, note }: { title: string; note: string }) {
  return (
    <h3 className="flex justify-between px-[14px] pt-[9px] pb-[4px] text-[11px] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
      {title}
      <span className="font-(family-name:--font-mono) text-[12px] tracking-normal text-[var(--ink)]">
        {note}
      </span>
    </h3>
  );
}

function Row({
  line,
  nation,
  now,
  onLocate,
}: {
  line: Underway;
  nation: string;
  now: number;
  onLocate: (line: Underway) => void;
}) {
  const left = underwayLeftMs(line, now);
  const done = line.span === undefined ? null : Math.min(1, Math.max(0, 1 - left / line.span));
  return (
    <button
      type="button"
      title={fr.underway.locate(line.label)}
      onClick={() => onLocate(line)}
      className="grid h-[48px] w-full cursor-pointer grid-cols-[36px_1fr_64px] items-center border-t border-[var(--ink)]/20 pr-[14px] pl-[8px] text-left hover:bg-[var(--paper-clair)]"
    >
      <span className="flex h-[34px] w-[34px] items-center justify-center">
        <Face face={line.face} nation={nation} />
      </span>
      <span className="grid grid-cols-[76px_1fr] items-center gap-x-[8px]">
        <b
          className={`font-(family-name:--font-mono) text-[15px] font-medium ${
            line.moving ? 'text-[var(--notable-paper)]' : ''
          }`}
        >
          {asDuration(left / 60_000)}
        </b>
        <em className="line-clamp-2 text-[12px] tracking-[.04em] uppercase not-italic">
          {line.label}
        </em>
      </span>
      <span className="grid justify-items-end gap-[6px]">
        {line.holdsSlot && (
          <i
            aria-label={fr.underway.drawer.holdsSlot}
            title={fr.underway.drawer.holdsSlot}
            className="inline-block h-[9px] w-[11px] bg-[var(--ink)]"
          />
        )}
        {done !== null && (
          <span className="block h-[3px] w-[64px] bg-[var(--ink)]/16">
            <span
              className={`block h-full ${line.moving ? 'bg-[var(--arc-mine)]' : 'bg-[var(--ink-soft)]'}`}
              style={{ width: `${Math.round(done * 100)}%` }}
            />
          </span>
        )}
      </span>
    </button>
  );
}
