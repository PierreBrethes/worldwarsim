import { Link } from '@tanstack/react-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { frameOf, handSpansOf, verdictTimingOf } from '@/domain/final-edition-read';
import { Flag } from '@/emblems/Flag';
import { countdownLabel, fr, nationLabel } from '@/i18n/fr';
import { Stamp } from '@/shell/Stamp';
import { useNarrowScreen } from '@/shell/viewport';
import '@/styles/final-edition.css';
import { IRREGULAR_INK, NEUTRAL_INK, SEA_INK, inkOf, useEndMap, type EndMap } from './end-map';
import { UneSheet } from './UneSheet';
import {
  featWords,
  finestWords,
  pointsHeldBy,
  stampOf,
  type FinalEdition,
  type NationPage,
} from './words';

const said = fr.finalEdition;
const HOUR = 3_600_000;

/**
 * **L'édition finale d'une Mondiale, en une seule page** (#455, maquette « La grande une ») :
 * deux oreilles autour du titre, la saison en moments, la carte de la fin sans brouillard et le
 * classement, la bande des Sept, puis le carnet des nations sous le pli. L'oreille du lecteur
 * ouvre son feuillet, et le suit en bande collée quand il descend. Tout vient de l'archive
 * (`convex/finalEdition.ts`) : la page ne lit ni `PlayerView` ni le plateau.
 */
export function FinalEditionPage({
  edition,
  onClose,
}: {
  edition: FinalEdition;
  onClose?: () => void;
}) {
  const narrow = useNarrowScreen();
  const pointRegions = useMemo(
    () => edition.points.map((point) => point.regionId),
    [edition.points],
  );
  const map = useEndMap(edition.regions, pointRegions);
  const [feuillet, setFeuillet] = useState<string | null>(null);
  const [une, setUne] = useState(false);
  const [pinned, setPinned] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const mine = edition.nations.find((page) => page.mine) ?? edition.nations[0]!;

  const open = (nation: string) => {
    setFeuillet(nation);
    body.current?.scrollTo?.({ top: 0 });
  };

  return (
    <div className={`fe paper-grain ${narrow ? 'phone' : ''}`}>
      <div className="fe-bar">
        <Stamp label={said.stamp} tone="critical" size="small" />
        <span className="kicker hide-phone">
          {said.meta(edition.code)} · {said.concludedOn(edition.concludedAt)}
        </span>
        <span className="grow" />
        <button type="button" className="fe-btn solid" onClick={() => setUne(true)}>
          {narrow ? said.une.openShort : said.une.open}
        </button>
        <Link to="/accueil" className="fe-btn hide-phone">
          {said.home}
        </Link>
        {onClose !== undefined && (
          <button type="button" className="fe-btn" aria-label={said.close} onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div
        className="fe-body"
        ref={body}
        onScroll={() => {
          const scroller = body.current;
          const fold = scroller?.querySelector('.fe-fold');
          if (scroller == null || fold == null) return;
          setPinned(fold.getBoundingClientRect().top < scroller.getBoundingClientRect().top + 60);
        }}
      >
        {feuillet === null ? (
          <Une
            edition={edition}
            map={map}
            mine={mine}
            narrow={narrow}
            pinned={pinned}
            onOpen={open}
          />
        ) : (
          <Feuillet
            edition={edition}
            map={map}
            page={edition.nations.find((page) => page.nation === feuillet) ?? mine}
            onOpen={open}
            onBack={() => setFeuillet(null)}
          />
        )}
      </div>
      {une && <UneSheet edition={edition} map={map} onClose={() => setUne(false)} />}
    </div>
  );
}

const sup = (rank: number) => (
  <>
    {rank}
    <sup>{fr.press.ordinalSuffix(rank)}</sup>
  </>
);

/** Ce qu'une oreille dit d'une nation : vainqueur, tombée, ou son rang. */
function mineSays(page: NationPage, edition: FinalEdition): string {
  if (page.exit !== null) return said.mine.fell(page.exit.kind, page.exit.at);
  if (page.nation === edition.verdict.winnerNation) return said.mine.won;
  return said.mine.rank(page.rank, edition.nations.length);
}

/* ------------------------------------ la une ------------------------------------ */

function Une({
  edition,
  map,
  mine,
  narrow,
  pinned,
  onOpen,
}: {
  edition: FinalEdition;
  map: EndMap;
  mine: NationPage;
  narrow: boolean;
  /** Le pli est passé sous le haut de la feuille : l'oreille suit en bande collée. */
  pinned: boolean;
  onOpen: (nation: string) => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const { verdict } = edition;
  const timing = verdictTimingOf({ ...edition, reason: verdict.reason });
  const clockAt =
    edition.durationHours === null ? null : edition.launchedAt + edition.durationHours * HOUR;
  const winner = edition.nations.find((page) => page.nation === verdict.winnerNation);
  const finest = finestWords(mine, edition, map);
  const mineStamp = stampOf(mine, edition);
  const mineLine = `${said.mine.share(mine.figures.territory)} ${
    finest === null ? said.finest.none : `${finest.title}. ${finest.text}`
  }`;

  return (
    <div>
      {(narrow || pinned) && (
        <div
          className={`fe-pin ${narrow ? (pinOpen ? '' : 'closed') : 'floating'}`}
          role={narrow ? 'button' : undefined}
          aria-expanded={narrow ? pinOpen : undefined}
          onClick={narrow ? () => setPinOpen(!pinOpen) : undefined}
        >
          <span className="rk">{sup(mine.rank)}</span>
          <Flag nation={mine.nation} width={22} onPaper />
          <span className="nm">{nationLabel(mine.nation)}</span>
          {mineStamp !== null && (
            <Stamp label={mineStamp.label} tone={mineStamp.tone} size="small" />
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="fe-link"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(mine.nation);
            }}
          >
            {said.mine.open}
          </button>
          <p>
            {mineSays(mine, edition)} {mineLine}
          </p>
        </div>
      )}
      <div className="fe-broad">
        <div className="fe-top">
          <div className="fe-ear verdict">
            <span className="kicker">{said.verdictKicker}</span>
            {winner !== undefined && (
              <span className="who">
                <Stamp label={said.outcome.winner} size="small" />
                <Flag nation={winner.nation} width={22} onPaper />
                {nationLabel(winner.nation)}
              </span>
            )}
            <b className="big">
              {timing.kind === 'ahead'
                ? said.ahead(timing.hours)
                : timing.kind === 'clock'
                  ? said.atClock
                  : said.when(edition.concludedAt)}
            </b>
            <p>
              {timing.kind === 'ahead' && `${said.aheadNote} : `}
              {said.verdictLine({
                reason: verdict.reason,
                winner: verdict.winnerNation,
                closedBy: verdict.closedBy ?? null,
                at: edition.concludedAt,
                clockAt: timing.kind === 'ahead' ? clockAt : null,
              })}
            </p>
          </div>
          <div className="fe-mast">
            <div className="meta">
              <span>{said.meta(edition.code)}</span>
              <span className="red">{said.stamp}</span>
              <span>{said.span(edition.launchedAt, edition.concludedAt)}</span>
            </div>
            <div className="title">
              <i>{fr.masthead.article}</i>
              {fr.masthead.word}
            </div>
          </div>
          <div className="fe-ear mine">
            {mineStamp !== null && <Stamp label={mineStamp.label} tone={mineStamp.tone} />}
            <div className="row">
              <span className="rk">{sup(mine.rank)}</span>
              <Flag nation={mine.nation} width={28} onPaper />
              <b style={{ font: '800 20px/1 var(--font-display)' }}>{nationLabel(mine.nation)}</b>
            </div>
            <p>
              <b>{mineSays(mine, edition)}</b> {mineLine}
            </p>
            <button type="button" className="fe-link" onClick={() => onOpen(mine.nation)}>
              {said.mine.open}
            </button>
          </div>
        </div>
        <h1 className="fe-headline">{said.headline(verdict.reason, verdict.winnerNation)}</h1>
        <p className="fe-deck">
          {said.deck({
            reason: verdict.reason,
            points: pointsHeldBy(edition, verdict.winnerNation),
            at: edition.concludedAt,
          })}
        </p>
        <div className="fe-cols">
          <section>
            <h2 className="rubric">{said.momentsTitle(edition.moments.length)}</h2>
            <ol className="fe-chron">
              {edition.moments.map((moment) => {
                const words = featWords(moment, edition, map);
                return (
                  <li
                    key={`${moment.kind}-${moment.at}`}
                    className={moment.nations.includes(mine.nation) ? 'me' : ''}
                  >
                    <span className="when">
                      <span className="flags">
                        {moment.nations.map((nation) => (
                          <Flag key={nation} nation={nation} width={14} onPaper />
                        ))}
                      </span>
                      {said.when(moment.at)}
                    </span>
                    <h3>{words.title}</h3>
                    <p>{words.text}</p>
                  </li>
                );
              })}
            </ol>
          </section>
          <section className="center">
            <h2 className="rubric">{said.map.title}</h2>
            <div className="fe-map">
              <EndMapSvg edition={edition} map={map} mine={mine.nation} />
            </div>
            <Legend edition={edition} />
            <p className="caption">{said.map.caption}</p>
            <h2 className="rubric">{said.palmares}</h2>
            <Palmares edition={edition} />
            <h2 className="rubric">{said.band}</h2>
            <Band edition={edition} mine={mine.nation} narrow={narrow} />
          </section>
          <section>
            <h2 className="rubric">{said.ranking}</h2>
            <ol className="fe-ranking">
              {edition.nations.map((page) => (
                <li
                  key={page.nation}
                  className={`${page.mine ? 'me' : ''} ${page.exit === null ? '' : 'out'}`}
                >
                  <span
                    className="r"
                    style={page.rank === 1 ? { color: 'var(--critical)' } : undefined}
                  >
                    {page.rank}
                  </span>
                  <Flag nation={page.nation} width={20} onPaper />
                  <span className="nm">
                    {nationLabel(page.nation)}
                    <small>
                      {page.nickname}
                      {page.mine && ` · ${said.you}`}
                      {page.exit !== null && ` · ${said.outcome[page.exit.kind]}`}
                    </small>
                  </span>
                  <span className="v">
                    {said.percent(page.figures.territory)}
                    <small>{said.points(page.figures.general)}</small>
                  </span>
                </li>
              ))}
            </ol>
            <p className="caption">{said.rankingCaption}</p>
          </section>
        </div>
        <div className="fe-fold">
          <div className="fe-fold-title">
            <h2>{said.carnet(edition.nations.length)}</h2>
            <span className="kicker">{said.carnetKicker}</span>
          </div>
          <div className="fe-carnet">
            {edition.nations.map((page) => (
              <article
                key={page.nation}
                className={`${page.mine ? 'me' : ''} ${page.exit === null ? '' : 'out'}`}
              >
                <NationHead page={page} edition={edition} />
                <Figures page={page} edition={edition} />
                {page.exit !== null && (
                  <p className="fe-out">{said.exit(page.exit.kind, page.exit.at)}</p>
                )}
                <LineBlock page={page} edition={edition} map={map} compact />
              </article>
            ))}
          </div>
          <p className="caption">{said.carnetCaption}</p>
        </div>
      </div>
    </div>
  );
}

function NationHead({ page, edition }: { page: NationPage; edition: FinalEdition }) {
  const stamp = stampOf(page, edition);
  return (
    <header>
      <span className="r">{page.rank}</span>
      <Flag nation={page.nation} width={26} onPaper />
      <h3>
        {nationLabel(page.nation)}
        <small>
          {page.nickname}
          {page.mine && ` · ${said.you}`}
        </small>
      </h3>
      {stamp !== null && <Stamp label={stamp.label} tone={stamp.tone} size="small" />}
    </header>
  );
}

type FigureKey = keyof typeof said.columns;
const FIGURES: ReadonlyArray<FigureKey> = [
  'territory',
  'general',
  'industry',
  'military',
  'deeds',
  'destroyed',
  'lost',
  'pointHeld',
  'dispatches',
];
const figureOf = (page: NationPage, key: FigureKey) =>
  key === 'pointHeld' ? page.figures.pointHeldMs : page.figures[key];
const shown = (key: FigureKey, value: number) =>
  key === 'territory'
    ? said.percent(value)
    : key === 'pointHeld'
      ? said.hours(value)
      : fr.press.score(value);

/** Les chiffres d'une nation ; en rouge le meilleur de la colonne, le moins perdu pour « Perdu ». */
function Figures({ page, edition }: { page: NationPage; edition: FinalEdition }) {
  return (
    <dl className="fe-figs">
      {FIGURES.map((key) => {
        const values = edition.nations.map((other) => figureOf(other, key));
        const best = key === 'lost' ? Math.min(...values) : Math.max(...values);
        const value = figureOf(page, key);
        return (
          <div key={key}>
            <dt>{said.columns[key]}</dt>
            <dd className={value === best && (key === 'lost' || value > 0) ? 'best' : ''}>
              {shown(key, value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Sa ligne : prises, pertes, plus beau coup. */
function LineBlock({
  page,
  edition,
  map,
  compact = false,
}: {
  page: NationPage;
  edition: FinalEdition;
  map: EndMap;
  compact?: boolean;
}) {
  const { gains, losses, figures } = page;
  const gained = [
    ...gains.hqs.map((hq) => said.line.hqGained(hq.nation)),
    ...gains.points.map((point) => said.line.pointGained(point.key, point.from, point.at)),
    ...(gains.outposts > 0 ? [said.line.outpostsCaptured(gains.outposts)] : []),
    ...(figures.destroyed > 0 ? [said.line.destroyed(figures.destroyed)] : []),
  ];
  const worst = losses.worstPass;
  const lost = [
    ...(losses.hq === null ? [] : [said.line.hqLost(losses.hq.at)]),
    ...losses.points.map((point) => said.line.pointLost(point.key, point.to, point.at)),
    ...(losses.outposts > 0 ? [said.line.outpostsLost(losses.outposts)] : []),
    ...(figures.lost > 0 ? [said.line.lost(figures.lost)] : []),
    ...(worst === null
      ? []
      : [
          said.line.worstPass(
            worst.attacker === page.nation ? worst.attackerLost : worst.defenderLost,
            map.regionName(worst.regionId),
            worst.at,
          ),
        ]),
  ];
  const finest = finestWords(page, edition, map);
  const list = (items: string[]) => (
    <ul>
      {(items.length === 0 ? [said.line.nothing] : items).map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <div className={`fe-line ${compact ? 'compact' : ''}`}>
      <div>
        <h4>{said.line.gains}</h4>
        {list(gained)}
      </div>
      <div className="losses">
        <h4>{said.line.losses}</h4>
        {list(lost)}
      </div>
      <div className="coup">
        <h4>{said.line.finest}</h4>
        <p>
          {finest === null ? (
            <i>{said.finest.none}</i>
          ) : (
            <>
              <b>{finest.title}.</b> {finest.text}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- la carte et les Sept --------------------------------- */

/** La carte de la fin, au cadre de la région de jeu ; les Sept carrés à l'encre du teneur. */
function EndMapSvg({ edition, map, mine }: { edition: FinalEdition; map: EndMap; mine: string }) {
  const [west, north, east, south] = frameOf(edition.playableRegion);
  const unit = (east - west) / 1000;
  return (
    <svg
      viewBox={`${west} ${north} ${east - west} ${south - north}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={said.map.title}
    >
      <rect x={west} y={north} width={east - west} height={south - north} fill={SEA_INK} />
      {map.lands.map((land) => (
        <path
          key={land.nation ?? ''}
          d={land.d}
          fillRule="evenodd"
          fill={inkOf(land.nation)}
          fillOpacity={land.nation === null ? 1 : 0.72}
          stroke="var(--ink)"
          strokeWidth={(land.nation === mine ? 2.4 : 0.7) * unit}
        />
      ))}
      {edition.points.map((point) => {
        const anchor = map.anchors.get(point.regionId);
        if (anchor === undefined) return null;
        const side = 10 * unit;
        return (
          <g key={point.key} transform={`translate(${anchor[0]} ${anchor[1]})`}>
            <rect
              x={-side / 2}
              y={-side / 2}
              width={side}
              height={side}
              fill={inkOf(point.hands.at(-1)?.nation ?? null)}
              stroke="var(--ink)"
              strokeWidth={1.6 * unit}
            />
            <text
              x={8 * unit}
              y={4 * unit}
              fontSize={12 * unit}
              className="fe-map-label"
              strokeWidth={3 * unit}
            >
              {fr.points.names[point.key]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ edition }: { edition: FinalEdition }) {
  const swatch = (ink: string, label: string) => (
    <span key={label}>
      <i className="dot" style={{ background: ink }} />
      {label}
    </span>
  );
  return (
    <div className="fe-legend">
      {edition.nations.map((page) => swatch(inkOf(page.nation), nationLabel(page.nation)))}
      {swatch(IRREGULAR_INK, said.map.irregular)}
      {swatch(NEUTRAL_INK, said.map.neutral)}
      {swatch('#fff', said.map.sept)}
    </div>
  );
}

const longestOf = (point: FinalEdition['points'][number]) =>
  point.heldMs.reduce<{ nation: string; ms: number } | null>(
    (best, held) => (best === null || held.ms > best.ms ? held : best),
    null,
  );

function Palmares({ edition }: { edition: FinalEdition }) {
  return (
    <div className="fe-sept">
      {edition.points.map((point) => {
        const longest = longestOf(point);
        return (
          <div key={point.key}>
            <i
              className="sq"
              style={{ background: inkOf(point.hands.at(-1)?.nation ?? null), display: 'block' }}
            />
            <b>{fr.points.names[point.key]}</b>
            {longest === null ? (
              <small>{said.neverHeld}</small>
            ) : (
              <>
                <span className="held">{countdownLabel(longest.ms)}</span>
                <small>{nationLabel(longest.nation)}</small>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** **Les Sept de main en main** (bande de la variante C) : qui a tenu chaque point, et quand. */
function Band({ edition, mine, narrow }: { edition: FinalEdition; mine: string; narrow: boolean }) {
  /** Au téléphone la bande se dessine à sa largeur : réduite, son texte ne se lisait plus. */
  const W = narrow ? 358 : 760;
  const LEFT = narrow ? 72 : 86;
  const RIGHT = narrow ? 58 : 70;
  const ROW = 21;
  const span = Math.max(1, edition.concludedAt - edition.launchedAt);
  const x = (at: number) => LEFT + ((at - edition.launchedAt) / span) * (W - LEFT - RIGHT);
  return (
    <div className="fe-band">
      <svg
        viewBox={`0 0 ${W} ${edition.points.length * ROW + 6}`}
        role="img"
        aria-label={said.band}
      >
        {edition.points.map((point, row) => {
          const longest = longestOf(point);
          return (
            <g key={point.key} transform={`translate(0 ${row * ROW})`}>
              <text
                x={LEFT - 6}
                y={15}
                textAnchor="end"
                style={{ font: "700 11.5px 'Bodoni Moda'", fill: 'var(--ink)' }}
              >
                {fr.points.names[point.key]}
              </text>
              <rect
                x={LEFT}
                y={3}
                width={W - LEFT - RIGHT}
                height={ROW - 6}
                fill="none"
                stroke="var(--ink)"
                strokeOpacity={0.25}
                strokeDasharray="2 2"
              />
              {handSpansOf(point.hands, edition.concludedAt)
                .filter((hand) => hand.nation !== null)
                .map((hand) => (
                  <rect
                    key={hand.from}
                    x={x(hand.from)}
                    y={3}
                    width={Math.max(0.5, x(hand.to) - x(hand.from))}
                    height={ROW - 6}
                    fill={inkOf(hand.nation)}
                    fillOpacity={hand.nation === mine ? 1 : 0.78}
                    stroke="var(--ink)"
                    strokeWidth={hand.nation === mine ? 1.6 : 0.6}
                  >
                    <title>{nationLabel(hand.nation)}</title>
                  </rect>
                ))}
              <text
                x={W - RIGHT + 8}
                y={15}
                style={{ font: "500 11px 'IBM Plex Mono'", fill: 'var(--ink-soft)' }}
              >
                {longest === null ? '—' : countdownLabel(longest.ms)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------ le feuillet ------------------------------------ */

/** **Le feuillet d'une nation** (variante A) : son rang, ses chiffres, sa ligne et sa courbe. */
function Feuillet({
  edition,
  map,
  page,
  onOpen,
  onBack,
}: {
  edition: FinalEdition;
  map: EndMap;
  page: NationPage;
  onOpen: (nation: string) => void;
  onBack: () => void;
}) {
  const stamp = stampOf(page, edition);
  const totals: Array<[string, ReactNode]> = [
    [fr.press.registers.territory, said.percent(page.figures.territory)],
    [fr.press.registers.general, fr.press.score(page.figures.general)],
    [fr.press.registers.industry, fr.press.score(page.figures.industry)],
    [fr.press.registers.military, fr.press.score(page.figures.military)],
    [fr.press.registers.deeds, fr.press.score(page.figures.deeds)],
  ];
  return (
    <div className="fe-broad">
      <div className="fe-fold-title">
        <h2>{page.mine ? said.feuillet.own : said.feuillet.of(page.nation)}</h2>
        <button type="button" className="fe-link" onClick={onBack}>
          {said.feuillet.back}
        </button>
      </div>
      <div className="fe-feuillet">
        <div className="id">
          <span className="rk">{sup(page.rank)}</span>
          <h2>
            <Flag nation={page.nation} width={34} onPaper />
            {nationLabel(page.nation)}
          </h2>
          <span className="caption">
            {page.nickname}
            {page.mine && ` · ${said.you}`}
          </span>
          {stamp !== null && <Stamp label={stamp.label} tone={stamp.tone} />}
          <div className="totals">
            {totals.map(([label, value]) => (
              <span key={label} style={{ display: 'contents' }}>
                <span>{label}</span>
                <span>{value}</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {page.exit !== null && (
            <p className="fe-out">{said.exit(page.exit.kind, page.exit.at)}</p>
          )}
          <h2 className="rubric">{said.feuillet.season}</h2>
          <LineBlock page={page} edition={edition} map={map} />
          <h2 className="rubric">{said.feuillet.curve}</h2>
          <Curve edition={edition} nation={page.nation} />
          <div className="kicker" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{said.when(edition.launchedAt)}</span>
            <span>{said.when(edition.concludedAt)}</span>
          </div>
          <h2 className="rubric">{said.feuillet.others}</h2>
          <div className="fe-others">
            {edition.nations.map((other) => (
              <button
                key={other.nation}
                type="button"
                aria-pressed={other.nation === page.nation}
                onClick={() => onOpen(other.nation)}
              >
                <Flag nation={other.nation} width={16} onPaper />
                {nationLabel(other.nation)}
                {other.mine && ` · ${said.you}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sa courbe de territoire parmi celles des autres, édition par édition. */
function Curve({ edition, nation }: { edition: FinalEdition; nation: string }) {
  const W = 600;
  const H = 120;
  const span = Math.max(1, edition.concludedAt - edition.launchedAt);
  const top = Math.max(
    1,
    ...edition.nations.flatMap((page) => page.series.map((p) => p.territory)),
  );
  const line = (page: NationPage) =>
    page.series
      .map(
        (point) =>
          `${(((point.at - edition.launchedAt) / span) * W).toFixed(1)},${(H - (point.territory / top) * (H - 10)).toFixed(1)}`,
      )
      .join(' ');
  const ordered = [...edition.nations].sort(
    (left, right) => Number(left.nation === nation) - Number(right.nation === nation),
  );
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
      {ordered.map((page) => (
        <polyline
          key={page.nation}
          fill="none"
          stroke={inkOf(page.nation)}
          strokeOpacity={page.nation === nation ? 1 : 0.28}
          strokeWidth={page.nation === nation ? 3 : 1.2}
          points={line(page)}
        >
          <title>{nationLabel(page.nation)}</title>
        </polyline>
      ))}
    </svg>
  );
}
