import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { RESEARCH_SPEC } from '../../../convex/constants';
import { cardName, fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';
import { RESEARCH_CARDS, RESOURCES, type ResearchCard, type ResourceKey } from '@/domain/ids';
import { currentStock, type PlayerView } from '@/domain/player-view';
import {
  RESEARCH_TREE,
  counterOf,
  countersOf,
  researchMs,
  researchProgressOf,
  researchRefusalOf,
  searcherLevel,
} from '@/domain/research';
import { useClock } from '@/shell/clock';
import { notify } from '@/shell/notifications';
import { Price } from '@/shell/Price';
import { Stamp } from '@/shell/Stamp';
import { useNarrowScreen } from '@/shell/viewport';
import { FloatingWindow, type WindowProps, WindowHead } from './Window';

/**
 * **Où chaque carte tient dans l'arbre** (maquette A, « l'éventail ») : sa colonne et sa
 * génération. Une mise en page, pas une règle : les « après » vivent dans `RESEARCH_TREE`, et les
 * traits se tirent d'eux. Les cartes de slot et de file ont leur colonne, à part de l'industrie.
 */
const PLACE: Readonly<Record<ResearchCard, readonly [column: number, row: number]>> = {
  infantryMk2: [0, 0],
  artillery: [1, 0],
  armor: [0, 1],
  armorMk2: [0, 2],
  escort: [2, 0],
  carrier: [2, 1],
  aviation: [3, 0],
  bomber: [3, 1],
  airlift: [4, 1],
  syntheticOil: [5, 0],
  listening: [5, 1],
  transmissions1: [6, 0],
  transmissions2: [6, 1],
  transmissions3: [6, 2],
  doubleWorks: [7, 2],
  // Sous l'industrie, sa branche : le trait qui la relie passe entre les rangées, pas à travers.
  doubleTraining: [5, 2],
};

const HEADS: ReadonlyArray<{
  readonly label: string;
  readonly from: number;
  readonly span: number;
}> = [
  { label: fr.research.branches.land, from: 0, span: 2 },
  { label: fr.research.branches.sea, from: 2, span: 1 },
  { label: fr.research.branches.air, from: 3, span: 2 },
  { label: fr.research.branches.industry, from: 5, span: 1 },
  { label: fr.research.transmissions, from: 6, span: 2 },
];

const headOf = (card: ResearchCard) =>
  HEADS.find((head) => PLACE[card][0] >= head.from && PLACE[card][0] < head.from + head.span)!;

const HOUR = 3_600_000;

/** « 8 h » au barème, « 6 h 48 » une fois le Centre élevé. */
const durationOf = (ms: number) =>
  ms % HOUR === 0 ? fr.research.hours(ms / HOUR) : fr.research.time(ms);

const stocksOf = (view: PlayerView, now: number) =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;

/**
 * **La fenêtre de l'arbre** (#123, maquette A « l'éventail », vue arbre) : le Centre de recherche
 * en tête, son poste et ce que donne son niveau en marge, l'arbre de haut en bas, une carte reliée
 * à celles qui viennent après elle. Chaque carte dit son état — acquise, en cours, à chercher, ou
 * ce qui lui manque — et se pose par son bouton ; le refus se dit avant le geste
 * (`researchRefusalOf`, celui du serveur). Au téléphone, une feuille où les branches s'empilent.
 */
export function ResearchWindow({
  view,
  seat,
  onClose,
  ...windowProps
}: WindowProps & { view: PlayerView; seat: Seat }) {
  const narrow = useNarrowScreen();
  const now = useClock(30_000);
  const start = useMutation(api.research.start);
  const level = searcherLevel(view.me.buildings);
  const center = view.me.buildings
    .filter((building) => building.key === 'researchCenter' && building.captured !== true)
    .sort((a, b) => b.level - a.level)[0];
  const place = view.me.regions.find((region) => region.id === center?.regionId)?.name;
  const situation = {
    researched: view.me.research.researched,
    running: view.me.research.running?.card ?? null,
    centerLevel: level,
    stocks: stocksOf(view, now),
  };
  const pose =
    view.me.defeated === true
      ? null
      : (card: ResearchCard) =>
          start({ ...seat, card }).then(
            () => notify(fr.research.started(cardName(card)), 'info'),
            (problem: unknown) => handleError(problem, (said) => notify(said)),
          );

  const subtitle =
    center === undefined
      ? view.me.buildings.some((building) => building.key === 'researchCenter')
        ? fr.research.captured
        : fr.research.noCenter
      : fr.research.subtitle(place ?? center.regionId, center.level);

  return (
    <FloatingWindow
      name="research"
      onClose={onClose}
      {...windowProps}
      {...(narrow ? {} : { alignment: 'top' as const })}
      width={1270}
    >
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] text-[var(--ink)]">
        <WindowHead
          title={
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {fr.research.title}
              {!narrow && (
                <span className="font-(family-name:--font-text) text-[13px] font-normal text-[var(--ink-soft)] italic">
                  {subtitle}
                </span>
              )}
            </span>
          }
          onClose={onClose}
        />
        <div
          className={`grid min-h-0 flex-1 ${narrow ? 'grid-rows-[auto_1fr]' : 'grid-cols-[170px_1fr]'}`}
        >
          <Margin view={view} level={level} now={now} narrow={narrow} />
          <main className="min-h-0 overflow-auto px-[14px] pt-[14px] pb-[18px]">
            {narrow && (
              <p className="mb-2 font-(family-name:--font-text) text-[13px] text-[var(--ink-soft)] italic">
                {subtitle}
              </p>
            )}
            <Tree
              view={view}
              now={now}
              level={level}
              narrow={narrow}
              refusalOf={(card) => researchRefusalOf(card, situation)}
              pose={pose}
            />
            <div className="flex flex-wrap gap-x-[14px] gap-y-[6px] pt-[10px] text-[11px] text-[var(--ink-soft)]">
              <span>{fr.research.legendDone}</span>
              <span>{fr.research.legendAhead}</span>
              <span>{fr.research.legendHow}</span>
            </div>
          </main>
        </div>
      </div>
    </FloatingWindow>
  );
}

/** **Le poste du Centre**, et ce que donne son niveau : la marge de la maquette. */
function Margin({
  view,
  level,
  now,
  narrow,
}: {
  view: PlayerView;
  level: number | null;
  now: number;
  narrow: boolean;
}) {
  const running = view.me.research.running;
  const progress = running === null ? null : researchProgressOf(running, now);
  const levels = Array.from({ length: Math.max(3, (level ?? 1) + 2) }, (_, rank) => rank + 1);
  return (
    <aside
      className={`grid content-start gap-2 overflow-auto bg-[color-mix(in_srgb,var(--paper-pile)_45%,var(--paper))] p-[10px] ${
        narrow ? 'border-b border-[var(--ink)]' : 'border-r border-[var(--ink)]'
      }`}
    >
      {!narrow && <span className="eyebrow">{fr.research.benchesHeader}</span>}
      <div className="grid content-start gap-1 border-[1.5px] border-dashed border-(color:--ink)/45 p-[6px]">
        <span className="text-[9px] leading-[1.2] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {fr.research.bench}
        </span>
        {running !== null && progress !== null ? (
          <>
            <b className="font-(family-name:--font-display) text-[13px] leading-[1.1] font-bold">
              {fr.research.names[running.card]}
            </b>
            <Bar share={progress.share} />
            <span
              className="text-[11px] leading-[1.25]"
              style={{
                color: progress.finishesAt === null ? 'var(--critical)' : 'var(--ink-soft)',
              }}
            >
              {progressText(progress, now)}
            </span>
          </>
        ) : (
          <span className="text-[11px] leading-[1.25] text-[var(--ink-soft)]">
            {level === null ? fr.research.benchNone : fr.research.benchFree}
          </span>
        )}
      </div>
      {!narrow && (
        <>
          <span className="text-[11px] leading-[1.3] text-[var(--ink-soft)]">
            {fr.research.benchMore}
          </span>
          <span className="eyebrow mt-1">{fr.research.levelHeader}</span>
          <ul className="m-0 grid gap-[2px] pl-[14px] text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
            {levels.map((rank) => (
              <li
                key={rank}
                className={rank === level ? 'font-semibold text-[var(--ink)]' : undefined}
              >
                {fr.common.levelSpeed(rank)}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

const progressText = (
  progress: { readonly share: number; readonly finishesAt: number | null },
  now: number,
) => {
  const percent = Math.round(progress.share * 100);
  return progress.finishesAt === null
    ? `${percent} % · ${fr.research.waiting}`
    : fr.research.running(percent, fr.research.time(progress.finishesAt - now));
};

function Bar({ share }: { share: number }) {
  return (
    <span
      className="block h-[5px] bg-(--ink)/14 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_30%,transparent)]"
      data-testid="research-gauge"
    >
      <i className="block h-full bg-[var(--arc-mine)]" style={{ width: `${share * 100}%` }} />
    </span>
  );
}

type Refusal = ReturnType<typeof researchRefusalOf>;

/**
 * **L'arbre, de haut en bas** : une grille où chaque carte tient sa place (`PLACE`), et par-dessus
 * les traits tirés de ses « après » — plein après une carte acquise, pointillé sinon. Au téléphone
 * les branches s'empilent, et un trait qui passerait d'une branche à l'autre se tait : la carte dit
 * ce qui lui manque en toutes lettres.
 */
function Tree({
  view,
  now,
  level,
  narrow,
  refusalOf,
  pose,
}: {
  view: PlayerView;
  now: number;
  level: number | null;
  narrow: boolean;
  refusalOf: (card: ResearchCard) => Refusal;
  pose: ((card: ResearchCard) => Promise<void>) | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<
    ReadonlyArray<{ d: string; x: number; y: number; done: boolean }>
  >([]);
  const researched = view.me.research.researched;

  useLayoutEffect(() => {
    const box = wrap.current;
    if (box === null) return;
    const draw = () => {
      const origin = box.getBoundingClientRect();
      // The HUD is scaled: the rectangles are in screen pixels, the drawing in its own.
      const scale = box.offsetWidth > 0 ? origin.width / box.offsetWidth : 1;
      const rect = (card: ResearchCard) =>
        box.querySelector(`[data-research-card="${card}"]`)?.getBoundingClientRect();
      setLinks(
        RESEARCH_CARDS.flatMap((card) =>
          RESEARCH_TREE[card].after.flatMap((first) => {
            if (narrow && headOf(first) !== headOf(card)) return [];
            const from = rect(first);
            const to = rect(card);
            if (from === undefined || to === undefined) return [];
            const x1 = (from.left + from.width / 2 - origin.left) / scale;
            const y1 = (from.bottom - origin.top) / scale;
            const x2 = (to.left + to.width / 2 - origin.left) / scale;
            const y2 = (to.top - origin.top) / scale;
            const ym = y1 + Math.min(18, (y2 - y1) / 2);
            return [
              {
                d: `M${x1} ${y1}V${ym}H${x2}V${y2}`,
                x: x2,
                y: y2,
                done: researched.includes(first),
              },
            ];
          }),
        ),
      );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [narrow, researched]);

  const card = (one: ResearchCard, style: React.CSSProperties) => (
    <ResearchCardView
      key={one}
      card={one}
      view={view}
      now={now}
      level={level}
      refusal={refusalOf(one)}
      pose={pose}
      style={style}
    />
  );

  return (
    <div ref={wrap} className="relative">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        {links.map((link) => (
          <g key={link.d}>
            <path
              d={link.d}
              fill="none"
              stroke={link.done ? 'var(--ink)' : 'var(--ink-soft)'}
              strokeWidth={link.done ? 2 : 1.4}
              strokeDasharray={link.done ? undefined : '4 3'}
            />
            <circle cx={link.x} cy={link.y} r={2.5} fill="var(--ink)" />
          </g>
        ))}
      </svg>
      {narrow ? (
        <div className="grid gap-y-[18px]">
          {HEADS.map((head) => {
            const cards = RESEARCH_CARDS.filter((one) => headOf(one) === head);
            return (
              <section
                key={head.label}
                className="grid justify-center gap-x-[10px] gap-y-[26px]"
                style={{ gridTemplateColumns: `repeat(${head.span}, 138px)` }}
              >
                <BranchHead label={head.label} span={head.span} />
                {cards.map((one) =>
                  card(one, {
                    gridColumn: PLACE[one][0] - head.from + 1,
                    gridRow: PLACE[one][1] + 2,
                  }),
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div
          className="grid justify-start gap-x-[10px] gap-y-[22px]"
          style={{ gridTemplateColumns: 'repeat(8, minmax(100px, 1fr))' }}
        >
          {HEADS.map((head) => (
            <BranchHead key={head.label} label={head.label} span={head.span} from={head.from} />
          ))}
          {RESEARCH_CARDS.map((one) =>
            card(one, { gridColumn: PLACE[one][0] + 1, gridRow: PLACE[one][1] + 2 }),
          )}
        </div>
      )}
    </div>
  );
}

function BranchHead({ label, span, from }: { label: string; span: number; from?: number }) {
  return (
    <div
      className="border-b-2 border-[var(--ink)] pb-[5px] text-center text-[12px] leading-none font-bold tracking-[.2em] uppercase"
      style={{
        gridColumn: from === undefined ? `1 / span ${span}` : `${from + 1} / span ${span}`,
        gridRow: 1,
      }}
    >
      {label}
    </div>
  );
}

/** **Une carte de l'arbre**, dans l'un de ses quatre états. */
function ResearchCardView({
  card,
  view,
  now,
  level,
  refusal,
  pose,
  style,
}: {
  card: ResearchCard;
  view: PlayerView;
  now: number;
  level: number | null;
  refusal: Refusal;
  pose: ((card: ResearchCard) => Promise<void>) | null;
  style: React.CSSProperties;
}) {
  const researched = view.me.research.researched;
  const done = researched.includes(card);
  const running = view.me.research.running?.card === card ? view.me.research.running : null;
  const progress = running === null ? null : researchProgressOf(running, now);
  const missing = RESEARCH_TREE[card].after.filter((first) => !researched.includes(first));
  const locked = !done && running === null && missing.length > 0;
  const name = fr.research.names[card];
  const counter = counterOf(card);
  const counters = countersOf(card);
  const title = [
    counters.length > 0 && fr.research.counters(counters.map(cardName).join(fr.research.and)),
    counter !== null &&
      fr.research.counteredBy(
        'card' in counter ? cardName(counter.card) : fr.research.atStart(counter.start),
      ),
  ]
    .filter(Boolean)
    .join(' · ');
  const refusalText =
    refusal === null || refusal.code === 'RESEARCH_AFTER' || refusal.code === 'RESEARCH_DONE'
      ? null
      : (({ code, ...details }) => fr.errors[code](details))(refusal);

  return (
    <article
      data-research-card={card}
      title={title || undefined}
      className={`relative z-[1] grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-[3px] border border-[var(--ink)] px-[7px] pt-[7px] pb-2 ${
        done
          ? 'bg-[var(--paper)] pb-6 shadow-[0_2px_0_var(--ink)]'
          : running !== null
            ? 'bg-[var(--paper-hi)] shadow-[0_2px_0_var(--ink),0_0_0_2px_var(--arc-mine)]'
            : locked
              ? 'border-dashed bg-[color-mix(in_srgb,var(--paper-hi)_70%,var(--paper))]'
              : 'bg-[var(--paper-hi)] shadow-[0_2px_0_var(--ink)]'
      }`}
      style={style}
    >
      <span className="flex items-baseline justify-between gap-1">
        <span className="min-w-0 truncate text-[8.5px] leading-none font-semibold tracking-[.08em] text-[var(--ink-soft)] uppercase">
          {headOf(card).label}
        </span>
        <span className="shrink-0 font-(family-name:--font-mono) text-[9.5px] leading-none whitespace-nowrap text-[var(--ink-soft)]">
          {durationOf(running?.totalMs ?? researchMs(card, level ?? 1))}
        </span>
      </span>
      <h4 className="m-0 font-(family-name:--font-display) text-[13px] leading-[1.05] font-bold">
        {name}
      </h4>
      <span className="min-h-[2.4em] font-(family-name:--font-text) text-[11.5px] leading-[1.2] text-[var(--ink-soft)] italic">
        {fr.research.unlocks[card]}
      </span>
      <span className="grid gap-[3px] text-[10px] leading-[1.2] font-semibold tracking-[.04em]">
        {done ? (
          <span className="absolute right-[6px] bottom-[6px] [--stamp-ink:var(--valid)]">
            <Stamp label={fr.research.done} size="small" />
          </span>
        ) : progress !== null ? (
          <>
            <Bar share={progress.share} />
            <span style={progress.finishesAt === null ? { color: 'var(--critical)' } : undefined}>
              {progressText(progress, now)}
            </span>
          </>
        ) : locked ? (
          <span className="text-[var(--critical)]">
            {fr.research.missing(
              missing
                .map(
                  (first) =>
                    cardName(first) +
                    (view.me.research.running?.card === first ? fr.research.inProgress : ''),
                )
                .join(fr.research.and),
            )}
          </span>
        ) : (
          <>
            <Price
              costs={RESEARCH_SPEC[card].cost}
              size={10}
              lacking={refusal?.code === 'INSUFFICIENT_RESOURCE' ? refusal.resource : null}
            />
            {refusalText !== null ? (
              <span className="text-[var(--critical)]">{refusalText}</span>
            ) : (
              pose !== null && (
                <button
                  type="button"
                  title={fr.research.searchTitle(
                    cardName(card),
                    durationOf(researchMs(card, level ?? 1)),
                  )}
                  onClick={() => void pose(card)}
                  className="mt-[2px] cursor-pointer justify-self-start border border-[var(--ink)] bg-[var(--ink)] px-[9px] py-[4px] text-[10px] font-semibold tracking-[.14em] text-[var(--paper)] uppercase hover:bg-[var(--ink-soft)]"
                >
                  {fr.research.search}
                </button>
              )
            )}
          </>
        )}
      </span>
    </article>
  );
}
