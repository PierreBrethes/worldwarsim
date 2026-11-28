import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { fr } from '@/i18n/fr';
import { asClockTime, asDatedClock, asSpan } from '@/domain/duration';
import {
  MARCH_FIRST_HOUR_MS,
  MARCH_HORIZON_MS,
  hourLabelsOf,
  marchIdleOf,
  positionOf,
  type MarchSchedule,
} from '@/domain/march-schedule';
import { halifaxNoteOf } from '@/domain/movement-orders';
import type { PlayerView } from '@/domain/player-view';
import { slotCardsOf } from '@/domain/research';
import { slotsRefusalOf, type Underway, type UnderwayPlace } from '@/domain/underway';

/**
 * **Le tableau de marche** (#733) : l'onglet de la réglette, qui dit la prochaine échéance, et la
 * feuille qui s'en détache sous la barre, une règle du temps sur douze heures (`positionOf`) et une
 * famille par ligne : mouvements (barre ambre), chantiers (encre, la file en hachures), stocks (un
 * coin rouge au bout de la pente), autres (contour et losange). La forme dit la famille autant que
 * la couleur. Le pli ne change que par l'onglet ; la feuille est persistante, et les fenêtres se
 * posent dessous (`--board-top`).
 *
 * Les longueurs sont celles de la maquette, en pixels d'écran : la feuille est dans `.hud`, rendue
 * à l'échelle, donc chacune se divise par `--hud-scale`, avec pour plancher sa valeur à l'échelle de
 * départ (1,2) : à 200 % le texte grossit, et les lignes ne doivent pas rester à la taille d'écran
 * qui le coupe.
 */
const u = (px: number): string => `max(calc(${px}px / var(--hud-scale)), ${px / 1.2}px)`;

/** Maquette : gouttière de 148, règle de 26, barres de 18 sur un pas de 22. */
const GUTTER = 148;
const RIGHT_AIR = 16;
const RULER = 26;
const BAR = 18;
const PITCH = 22;

const HAIR = 'color-mix(in srgb, var(--ink) 18%, transparent)';
const MID = 'color-mix(in srgb, var(--ink) 32%, transparent)';
const EYEBROW = 'text-[9.2px] font-semibold tracking-[.14em] uppercase';
const MONO = 'font-(family-name:--font-mono) text-[10px] font-medium tabular-nums';
const TEXT = 'text-[10.8px] font-semibold';

const percent = (fraction: number): string => `${fraction * 100}%`;
const hudScale = (): number => {
  try {
    return Number(getComputedStyle(document.documentElement).getPropertyValue('--hud-scale')) || 1;
  } catch {
    return 1;
  }
};

/** L'heure de l'échéance en minutes entières, ou « maintenant » : la durée a pour plancher
 *  l'instant présent. */
const spanTo = (at: number, now: number): string =>
  at <= now ? fr.march.now : asSpan(Math.max(1, Math.round((at - now) / 60_000)));

/** **Ce que l'onglet replié dit** : la prochaine échéance et le nombre des autres, ou pourquoi il n'y
 *  en a pas. Rien en cours seulement quand aucune ligne n'existe, placée ou au-delà. */
export function MarchTab({
  schedule,
  over,
  folded,
  sheetId,
  onToggle,
  onEscape,
}: {
  schedule: MarchSchedule;
  /** Joueur vaincu ou saison conclue. */
  over: boolean;
  folded: boolean;
  sheetId: string;
  onToggle: () => void;
  onEscape: () => void;
}) {
  const { next, others, now } = schedule;
  const placed = next === null ? 0 : 1 + others;
  const idle = marchIdleOf(schedule);
  const nothing = over ? fr.march.over : idle ? fr.march.none : fr.march.nothingSoon;
  return (
    <button
      type="button"
      aria-expanded={!folded}
      aria-controls={folded ? undefined : sheetId}
      onClick={onToggle}
      onKeyDown={(event) => event.key === 'Escape' && !folded && onEscape()}
      // Déplié, l'onglet se raccorde à la feuille : papier clair, filet d'encre en tête, et il
      // recouvre d'un pixel le filet de la barre.
      className={`relative -mb-px flex min-w-0 shrink cursor-pointer overflow-hidden items-center gap-[9px] border-r border-l px-[14px] whitespace-nowrap ${
        folded
          ? 'border-(color:--ink)/20 hover:bg-[var(--paper-hi)]'
          : 'border-[var(--ink)] bg-[var(--paper-hi)] shadow-[inset_0_3px_0_var(--ink)]'
      }`}
    >
      <span className={`${EYEBROW} text-[var(--ink)]`}>
        <span className="@max-[900px]/bar:hidden">{fr.march.tab}</span>
        <span className="hidden @max-[900px]/bar:inline">{fr.march.tabShort}</span>
      </span>
      {!folded ? (
        <span className={`${MONO} text-[13px] text-[var(--notable-paper)]`}>
          {over ? fr.march.over : placed === 0 ? nothing : fr.march.count(placed)}
        </span>
      ) : over || next === null ? (
        <span className="text-[12px] text-[var(--ink-soft)]">{nothing}</span>
      ) : (
        <>
          <span className="max-w-[220px] truncate text-[12px] font-semibold @max-[1000px]/bar:hidden">
            {next.label}
          </span>
          <span className={`${MONO} text-[13px] text-[var(--notable-paper)]`}>
            {spanTo(next.at, now)}
          </span>
          {others > 0 && (
            <span className={`${MONO} text-[13px] text-[var(--ink-soft)]`}>
              {fr.march.more(others)}
            </span>
          )}
        </>
      )}
      <span aria-hidden className="text-[10px] leading-none">
        {folded ? '▾' : '▴'}
      </span>
    </button>
  );
}

/** La largeur de la piste en pixels d'écran, relue quand elle change : la règle éclaircit ses
 *  étiquettes et les barres décident si leur nom tient dedans. `0` tant qu'elle n'est pas mesurée. */
function useTrackWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function MarchSheet({
  id,
  schedule,
  view,
  lines,
  over,
  onLocate,
  onEscape,
}: {
  id: string;
  schedule: MarchSchedule;
  view: PlayerView;
  /** Les lignes de `underwayOf`, que lit le refus des slots (ADR 0015). */
  lines: ReadonlyArray<Underway>;
  over: boolean;
  /** Un clic sur une barre recentre la carte, sans replier. */
  onLocate: (place: UnderwayPlace) => void;
  onEscape: () => void;
}) {
  const [trackRef, trackWidth] = useTrackWidth();
  const { now } = schedule;
  const at = (instant: number) => positionOf(instant - now);
  const idle = marchIdleOf(schedule);
  const refusal = slotsRefusalOf(view.me.slots, lines);

  const hours = Array.from({ length: 12 }, (_, rank) => rank + 1);
  const hourStep = (trackWidth * (1 - positionOf(MARCH_FIRST_HOUR_MS))) / 11;
  const labelledHours = hourLabelsOf(hourStep);

  const editionAt = schedule.edition;
  const editionFraction = editionAt === null ? null : at(editionAt);

  /** Une étiquette de la règle sous l'étiquette d'édition se tait : celle-ci porte son heure. */
  const CHIP_PX = 120;
  const LABEL_PX = 36;
  const underChip = (fraction: number) =>
    editionFraction !== null &&
    trackWidth > 0 &&
    fraction * trackWidth + LABEL_PX * hudScale() > editionFraction * trackWidth &&
    fraction * trackWidth < editionFraction * trackWidth + CHIP_PX * hudScale();

  const keyed = (event: KeyboardEvent) => event.key === 'Escape' && onEscape();

  return (
    <section
      id={id}
      aria-label={fr.march.sheet}
      onKeyDown={keyed}
      className="relative flex flex-col overflow-hidden border-b-2 border-[var(--ink)] bg-[var(--paper-hi)] text-[var(--ink)]"
      style={{ maxHeight: 'calc(40dvh / var(--hud-scale))', boxShadow: `0 ${u(3)} 0 ${MID}` }}
    >
      {/* La règle : l'heure d'ici, puis dix minutes sur la première heure, puis l'heure. */}
      <div
        className="relative grid shrink-0 border-b border-[var(--ink)]"
        style={{ gridTemplateColumns: `${u(GUTTER)} 1fr`, height: u(RULER) }}
      >
        <span
          className={`${EYEBROW} flex items-center border-r border-[var(--ink)]`}
          style={{ paddingLeft: u(16) }}
        >
          {fr.march.ruler}
        </span>
        <div ref={trackRef} className="relative" style={{ marginRight: u(RIGHT_AIR) }}>
          <span className={`${MONO} absolute top-1/2 -translate-y-1/2`} style={{ left: u(6) }}>
            {asClockTime(now)}
          </span>
          {[30]
            .filter((minute) => !underChip(positionOf(minute * 60_000)))
            .map((minute) => (
              <span
                key={minute}
                className={`${MONO} absolute top-1/2 -translate-y-1/2 text-[var(--ink-soft)]`}
                style={{ left: `calc(${percent(positionOf(minute * 60_000))} + ${u(5)})` }}
              >
                {fr.march.minutes(minute)}
              </span>
            ))}
          {hours.map(
            (hour) =>
              labelledHours.includes(hour) &&
              (hour === 12 || !underChip(positionOf(hour * 3_600_000))) && (
                <span
                  key={hour}
                  className={`${MONO} absolute top-1/2 -translate-y-1/2 text-[var(--ink-soft)]`}
                  style={
                    hour === 12
                      ? { right: u(5) }
                      : { left: `calc(${percent(positionOf(hour * 3_600_000))} + ${u(5)})` }
                  }
                >
                  {fr.march.hours(hour)}
                </span>
              ),
          )}
          {editionFraction !== null && editionAt !== null && (
            <span
              className={`${EYEBROW} absolute top-[3px] border border-[var(--ink)] bg-[var(--ink)] px-[6px] pt-[3px] pb-[2px] whitespace-nowrap text-[var(--paper)]`}
              style={
                editionFraction > 0.9
                  ? { right: 0 }
                  : { left: percent(editionFraction), marginLeft: `calc(${u(1)} * -1)` }
              }
            >
              {fr.march.edition(asClockTime(editionAt))}
            </span>
          )}
        </div>
      </div>

      <div className="relative min-h-0 overflow-y-auto">
        {/* Les graduations traversent toutes les lignes : la zone de la première heure est teintée. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0"
          style={{ left: u(GUTTER), right: u(RIGHT_AIR) }}
        >
          <i
            className="absolute inset-y-0 left-0"
            style={{
              width: percent(positionOf(MARCH_FIRST_HOUR_MS)),
              background: 'color-mix(in srgb, var(--arc-mine) 9%, transparent)',
            }}
          />
          {[10, 20, 30, 40, 50].map((minute) => (
            <i
              key={minute}
              className="absolute inset-y-0 w-px"
              style={{ left: percent(positionOf(minute * 60_000)), background: HAIR }}
            />
          ))}
          <i
            className="absolute inset-y-0"
            style={{
              left: percent(positionOf(MARCH_FIRST_HOUR_MS)),
              borderLeft: `3px double ${MID}`,
            }}
          />
          {hours.slice(1).map((hour) => (
            <i
              key={hour}
              className="absolute inset-y-0 w-px"
              style={{ left: percent(positionOf(hour * 3_600_000)), background: HAIR }}
            />
          ))}
          {editionFraction !== null && (
            <i
              className="absolute inset-y-0"
              style={{
                left: percent(editionFraction),
                borderLeft: '1.5px dashed var(--ink)',
              }}
            />
          )}
        </div>

        <div className="relative">
          {idle && (
            <p
              className="flex items-center text-[12px] text-[var(--ink-soft)]"
              style={{ height: u(46), paddingLeft: u(16) }}
            >
              {over ? fr.march.over : fr.march.none}
            </p>
          )}

          {schedule.movements.length > 0 && (
            <Family name={fr.march.movements} beyond={schedule.beyond.movement} first>
              {schedule.movements
                .filter((one) => one.placed)
                .map((one) => (
                  <Bar
                    key={one.id}
                    variant="movement"
                    fraction={at(one.arrivesAt)}
                    label={one.label}
                    span={spanTo(one.arrivesAt, now)}
                    trackWidth={trackWidth}
                    onClick={() => onLocate(one.place)}
                  />
                ))}
              <p
                className="text-[10px] leading-[1.3] text-[var(--ink-note)]"
                style={{ paddingBottom: u(2), paddingTop: u(2) }}
              >
                <span
                  className="bg-[var(--paper-hi)]"
                  style={{ boxDecorationBreak: 'clone', padding: `0 ${u(4)}` }}
                >
                  {fr.banner.slotsTitle(
                    view.me.slots.used,
                    view.me.slots.total,
                    slotCardsOf(view.me.research.researched),
                    halifaxNoteOf(view.me.slots),
                  )}
                </span>
              </p>
              {refusal !== null && (
                <p
                  role="status"
                  className="text-[10.8px] leading-[1.3] text-[var(--critical-paper)]"
                  style={{ paddingBottom: u(4), paddingLeft: u(4) }}
                >
                  {refusal.kind === 'frees' ? (
                    <>
                      {fr.underway.slotsRefusal.freesAt(view.me.slots.total, refusal.line.label)}
                      <b className="font-(family-name:--font-mono) font-medium">
                        {spanTo(refusal.at, now)}
                      </b>
                      .
                    </>
                  ) : (
                    `${fr.underway.slotsRefusal.allEngaged(view.me.slots.total)}.`
                  )}
                </p>
              )}
            </Family>
          )}

          {schedule.works.length > 0 && (
            <Family name={fr.march.works} beyond={schedule.beyond.works}>
              <Works schedule={schedule} trackWidth={trackWidth} onLocate={onLocate} />
            </Family>
          )}

          {schedule.stocks.length > 0 && (
            <Family name={fr.march.stocks} beyond={0} bare>
              {schedule.stocks.map((stock) => (
                <Stock key={stock.resource} stock={stock} now={now} />
              ))}
            </Family>
          )}

          {schedule.other.length > 0 && (
            <Family name={fr.march.other} beyond={schedule.beyond.other}>
              {schedule.other
                .filter((one) => one.placed)
                .map((one) => (
                  <Bar
                    key={one.id}
                    variant="other"
                    fraction={at(one.endsAt)}
                    label={one.label}
                    span={spanTo(one.endsAt, now)}
                    trackWidth={trackWidth}
                    onClick={() => onLocate(one.place)}
                  />
                ))}
            </Family>
          )}
        </div>
      </div>
    </section>
  );
}

/** Une famille : son nom dans la gouttière (et, dessous, ce qui tombe après l'horizon), ses lignes
 *  sur la piste. */
function Family({
  name,
  beyond,
  first = false,
  bare = false,
  children,
}: {
  name: string;
  beyond: number;
  first?: boolean;
  /** Sans marge : les lignes portent la leur (les stocks). */
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="relative grid"
      style={{
        gridTemplateColumns: `${u(GUTTER)} 1fr`,
        borderTop: first ? undefined : `1px solid ${MID}`,
        minHeight: u(PITCH + 12),
      }}
    >
      <div
        className="flex flex-col justify-center border-r border-[var(--ink)]"
        style={{ paddingLeft: u(16) }}
      >
        <span className={`${EYEBROW} text-[var(--ink)]`}>{name}</span>
        {beyond > 0 && (
          <span className={`${MONO} text-[var(--ink-note)]`}>{fr.march.beyond(beyond)}</span>
        )}
      </div>
      <div
        className="relative flex flex-col justify-center"
        style={{
          marginRight: u(RIGHT_AIR),
          paddingTop: bare ? 0 : u(6),
          paddingBottom: bare ? 0 : u(6),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * **Une barre de mouvement ou d'échéance**, de maintenant à son arrivée. Son nom est dedans quand
 * elle est assez large, après elle sinon ; sa durée est après. Une arrivée passée garde une barre
 * minimale, lisible. Le nom tient par une estimation de sa largeur (la police est connue) ; le
 * trop-plein est rogné plutôt que de déborder.
 */
function Bar({
  variant,
  fraction,
  label,
  span,
  trackWidth,
  onClick,
}: {
  variant: 'movement' | 'other';
  fraction: number;
  label: string;
  span: string;
  trackWidth: number;
  onClick: () => void;
}) {
  const scale = hudScale();
  const fits = trackWidth === 0 || fraction * trackWidth >= (label.length * 5.6 + 18) * scale;
  const nearEnd = fraction > 0.88;
  return (
    <div className="relative" style={{ height: u(PITCH) }}>
      <button
        type="button"
        title={fr.underway.locate(label)}
        onClick={onClick}
        className="absolute top-1/2 left-0 flex cursor-pointer items-center overflow-visible text-left"
        style={{
          width: percent(fraction),
          minWidth: u(12),
          height: u(BAR),
          marginTop: `calc(${u(BAR)} / -2)`,
        }}
      >
        <span
          aria-hidden
          className={`absolute inset-0 border border-l-0 border-[var(--ink)] ${
            variant === 'movement' ? 'bg-[var(--arc-mine)]' : 'bg-transparent'
          }`}
        />
        {variant === 'other' && (
          <i
            aria-hidden
            className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 rotate-45 bg-[var(--ink)]"
            style={{ width: u(9), height: u(9) }}
          />
        )}
        {fits ? (
          <>
            <span
              className={`${TEXT} relative min-w-0 truncate leading-none`}
              style={{ paddingLeft: u(8), paddingRight: nearEnd ? u(64) : u(6) }}
            >
              {label}
            </span>
            <span
              className={`${MONO} absolute top-1/2 -translate-y-1/2 leading-none whitespace-nowrap`}
              style={
                nearEnd
                  ? { right: u(6) }
                  : {
                      left: `calc(100% + ${u(4)})`,
                      padding: `${u(3)} ${u(6)}`,
                      background: 'var(--paper-hi)',
                    }
              }
            >
              {span}
            </span>
          </>
        ) : (
          <span
            className="absolute top-1/2 flex -translate-y-1/2 items-baseline leading-none whitespace-nowrap"
            style={{
              left: `calc(100% + ${u(4)})`,
              gap: u(10),
              padding: `${u(3)} ${u(6)}`,
              background: 'var(--paper-hi)',
            }}
          >
            <span className={TEXT}>{label}</span>
            <span className={MONO}>{span}</span>
          </span>
        )}
      </button>
    </div>
  );
}

/** Le chantier en cours en encre pleine, la file en hachures, bout à bout, puis la file qui se vide. */
function Works({
  schedule,
  trackWidth,
  onLocate,
}: {
  schedule: MarchSchedule;
  trackWidth: number;
  onLocate: (place: UnderwayPlace) => void;
}) {
  const { now, works, queueEmptiesAt } = schedule;
  const placed = works.filter((work) => work.placed);
  const last = placed.at(-1);
  const lastEnd = last === undefined ? 0 : positionOf(last.endsAt - now);
  const hatch: CSSProperties = {
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0 ${u(5)}, ${HAIR} ${u(5)} ${u(6)})`,
  };
  return (
    <div className="relative" style={{ height: u(PITCH) }}>
      {placed.map((work) => {
        const from = positionOf(work.startsAt - now);
        const to = positionOf(work.endsAt - now);
        const solid = work.running && !work.frozen;
        const label = work.frozen ? fr.underway.frozen(work.label) : work.label;
        return (
          <button
            key={work.id}
            type="button"
            title={fr.underway.locate(work.label)}
            onClick={() => onLocate(work.place)}
            className={`absolute top-1/2 flex cursor-pointer items-center justify-between overflow-hidden border text-left ${
              solid
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                : 'border-l-0 border-[var(--ink)]'
            }`}
            style={{
              left: percent(from),
              width: `calc(${percent(Math.max(to - from, 0))} + 0px)`,
              height: u(BAR),
              marginTop: `calc(${u(BAR)} / -2)`,
              paddingLeft: u(7),
              paddingRight: u(solid ? 8 : 0),
              ...(solid ? {} : hatch),
            }}
          >
            {trackWidth === 0 || trackWidth * (to - from) >= 48 * hudScale() ? (
              <span
                className={`${TEXT} min-w-0 truncate leading-none ${solid ? '' : 'font-medium'}`}
                style={{ fontSize: solid ? undefined : u(12) }}
              >
                {label}
              </span>
            ) : null}
            {solid && trackWidth * (to - from) > 120 && (
              <span className={`${MONO} shrink-0 pl-[8px] text-[var(--arc-mine)]`}>
                {spanTo(work.endsAt, now)}
              </span>
            )}
          </button>
        );
      })}
      {queueEmptiesAt !== null && (
        <span
          className={`${MONO} absolute top-1/2 -translate-y-1/2 leading-none whitespace-nowrap text-[var(--ink-note)]`}
          style={
            lastEnd < 0.7
              ? { left: `calc(${percent(lastEnd)} + ${u(10)})` }
              : { right: 0, background: 'var(--paper-hi)', padding: `${u(3)} ${u(6)}` }
          }
        >
          {fr.march.queueEmpty(asDatedClock(queueEmptiesAt, now))}
        </span>
      )}
    </div>
  );
}

type StockLine = MarchSchedule['stocks'][number];

/** Un stock en baisse : sa pente jusqu'à l'à-sec, un coin rouge au bout, son niveau et son débit. */
function Stock({ stock, now }: { stock: StockLine; now: number }) {
  const dryIn = stock.dryAt - now;
  const end = stock.placed ? positionOf(dryIn) : 1;
  const top = stock.cap > 0 ? Math.min(1, stock.level / stock.cap) : 0;
  /** Au bord de la feuille le niveau n'est plus nul : la pente s'arrête où l'horizon la coupe. */
  const edge = stock.placed
    ? 0
    : Math.max(0, (stock.level + stock.ratePerHour * (MARCH_HORIZON_MS / 3_600_000)) / stock.cap);
  const H = 38;
  /** Le texte tient en haut de la ligne, la pente dans ce qui reste dessous. */
  const y = (level: number) => H - 2 - level * 14;
  const said = fr.march.dryIn(asSpan(Math.round(dryIn / 60_000)));
  return (
    <div className="relative" style={{ height: u(H) }}>
      <svg
        aria-hidden
        className="absolute inset-0 size-full"
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
      >
        <polygon
          points={`0,${y(top)} ${end * 100},${y(edge)} ${end * 100},${H} 0,${H}`}
          fill="var(--critical-paper)"
          opacity=".2"
        />
        <line
          x1="0"
          y1={y(top)}
          x2={end * 100}
          y2={y(edge)}
          stroke="var(--critical-paper)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {stock.placed && (
        <i
          aria-hidden
          className="absolute bottom-0 bg-[var(--critical-paper)]"
          style={{
            left: percent(end),
            width: u(16),
            height: u(17),
            transform: 'translateX(-50%)',
            clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
          }}
        />
      )}
      <span className="absolute leading-none whitespace-nowrap" style={{ left: u(8), top: u(4) }}>
        <span className={`${TEXT} first-letter:uppercase`}>{fr.resources[stock.resource]}</span>{' '}
        <span className={MONO}>
          {Math.floor(stock.level)} / {stock.cap}
        </span>{' '}
        <span className="text-[10.8px] font-normal">
          · {fr.march.perHour(`−${Math.round(-stock.ratePerHour)}`)}
        </span>
      </span>
      <span
        className={`${TEXT} absolute leading-none whitespace-nowrap text-[var(--critical-paper)]`}
        style={
          end < 0.5
            ? { left: `calc(${percent(end)} + ${u(14)})`, top: u(4) }
            : { right: `calc(${percent(1 - end)} + ${u(12)})`, top: u(4) }
        }
      >
        {said}
      </span>
    </div>
  );
}
