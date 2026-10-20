import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { countdownLabel, fr, nationLabel } from '@/i18n/fr';
import { asClockTime, asLocalTime } from '@/domain/duration';
import { outcomeOf, type EndingFacts } from '@/domain/ending';
import { nationInk } from '@/domain/nations';
import { PRESS_SORT_KEYS, sortPressRows, type PressSortKey } from '@/domain/press-sort';
import type {
  PressEdition,
  PressLine,
  PressOwnLine,
  RaceCountdown,
  SeasonVerdict,
  StrategicPointView,
} from '@/domain/player-view';
import { Flag } from '@/emblems/Flag';
import { Stamp } from '@/shell/Stamp';
import { useClock } from '@/shell/clock';
import { useNarrowScreen } from '@/shell/viewport';
import { FloatingWindow, type WindowProps, WindowHead } from './Window';

/**
 * **La page de presse : où en est chacun *à l'heure du dernier relevé*** — jamais « où en est
 * chacun maintenant » (contrat de vue 07, maquette « Presse — planches » validée le 06/09).
 * L'écran ne bouge pas entre deux éditions, et c'est la seule chose qu'il ait à faire
 * comprendre : la manchette imprime l'heure du relevé, pas celle qu'il est.
 *
 * **Elle ne calcule rien.** Chaque nombre vient d'une ligne de `editions` écrite par le serveur
 * (`convex/press.ts`) ; recruter entre deux éditions ne change pas un chiffre de cette page, et
 * c'est le point de tout le dispositif. Le tri des colonnes est la seule chose qui bouge, et
 * c'est une lecture — l'ordre servi reste celui du territoire, qui est le but de la saison.
 *
 * **Ce qui n'existe pas ici est aussi structurel que ce qui y est** : ni l'industrie ni le
 * militaire d'un autre joueur — le serveur ne les construit pas (`PressLine` n'a pas les
 * champs) — ni courbe, ni historique, ni compte de régions, ni vainqueur, hors le verdict d'une Blitz
 * à son édition finale. Aucun ordre ne part
 * d'ici : on ferme, et c'est tout.
 */
export function PressWindow({
  press,
  verdict,
  ending,
  blitz,
  points,
  race,
  onClose,
  ...windowProps
}: WindowProps & {
  press: PressEdition | null;
  verdict: SeasonVerdict | null;
  ending: EndingFacts;
  blitz: boolean;
  /** Les Sept, tels que tout le monde les lit : la course se suit en direct, pas à l'édition. */
  points: ReadonlyArray<StrategicPointView>;
  race: RaceCountdown | null;
}) {
  const narrow = useNarrowScreen();
  const [sort, setSort] = useState<PressSortKey>('territory');

  if (blitz)
    return (
      <FloatingWindow
        name="press"
        onClose={onClose}
        {...windowProps}
        {...(narrow ? {} : { alignment: 'top' as const })}
        width={1040}
      >
        <BlitzEnding press={press} verdict={verdict} ending={ending} onClose={onClose} />
      </FloatingWindow>
    );

  return (
    <FloatingWindow
      name="press"
      onClose={onClose}
      {...windowProps}
      {...(narrow ? {} : { alignment: 'top' as const })}
      width={narrow ? 1040 : 640}
    >
      <PressColumn
        press={press}
        verdict={verdict}
        ending={ending}
        points={points}
        race={race}
        sort={sort}
        onSort={setSort}
        onClose={onClose}
      />
    </FloatingWindow>
  );
}

/**
 * **La presse d'une Blitz n'a pas de classement** : territoire, industrie et puissance militaire
 * n'y veulent rien dire, et un rang contredirait l'égalité. La manchette dit le verdict, la liste
 * dit l'issue de chacun — et rien d'autre. Éliminé en cours de partie, aucune édition n'existe :
 * la page ne dit que l'heure de la chute.
 */
function BlitzEnding({
  press,
  verdict,
  ending,
  onClose,
}: {
  press: PressEdition | null;
  verdict: SeasonVerdict | null;
  ending: EndingFacts;
  onClose: () => void;
}) {
  const final = press?.final === true ? press : null;
  return (
    <div className="paper-grain flex min-h-0 w-full flex-1 flex-col overflow-y-auto border border-[var(--ink)] text-[var(--ink)]">
      <WindowHead
        eyebrow={final === null ? fr.press.kicker : fr.press.capturedAt(asLocalTime(final.at))}
        onClose={onClose}
      />
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-4 border-b border-[var(--ink)] px-4 py-[14px]">
        {final !== null && <Stamp label={fr.press.final} />}
        <h1 className="font-(family-name:--font-display) text-[34px] leading-none font-extrabold tracking-[.12em] uppercase">
          {fr.press.title}
        </h1>
      </div>
      <Ending verdict={final === null ? null : verdict} ending={ending} onClose={onClose} />
      {final !== null && verdict !== null && (
        <ul className="px-4 py-2">
          {rowsOf(final).map((line) => (
            <li
              key={line.playerId}
              className="flex items-center gap-3 border-b border-[var(--ink)] py-[10px] last:border-b-0"
            >
              <Flag nation={line.nation} width={28} onPaper />
              <span className="font-(family-name:--font-display) text-[20px] font-extrabold">
                {nationLabel(line.nation)}
              </span>
              <span className="flex-1 truncate text-[12.5px] text-[var(--ink-soft)]">
                {line.nickname}
              </span>
              <Stamp label={fr.blitz.ending.outcome[outcomeOf(line, verdict)]} size="small" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * **L'édition finale d'une Blitz dit le vainqueur et pourquoi** (B10, B11) : c'est l'écran de
 * fin, avec ses deux issues. Éliminé en cours de partie, la même page me dit l'heure de la chute
 * et me laisse observer. Une Mondiale n'a ni l'un ni l'autre : la manchette reste la sienne.
 */
function Ending({
  verdict,
  ending,
  onClose,
}: {
  verdict: SeasonVerdict | null;
  ending: EndingFacts;
  onClose: () => void;
}) {
  if (verdict === null && ending.eliminatedAt === null) return null;
  const outcome =
    verdict === null
      ? null
      : verdict.winnerNation === null
        ? fr.blitz.ending.draw
        : verdict.winnerNation === ending.nation
          ? fr.blitz.ending.won
          : fr.blitz.ending.lost;
  return (
    <div className="shrink-0 border-b border-[var(--ink)] px-4 py-[12px] text-center">
      {outcome !== null && (
        <p className="font-(family-name:--font-display) text-[13px] leading-none font-extrabold tracking-[.3em] text-[var(--critical)]">
          {outcome}
        </p>
      )}
      <p className="mt-[6px] font-(family-name:--font-display) text-[19px] leading-[1.3] font-bold text-[var(--ink)]">
        {verdict !== null
          ? fr.victory.verdictConcluded(
              verdict.reason,
              verdict.winnerNation === null ? null : nationLabel(verdict.winnerNation),
              verdict.perMinute,
            )
          : fr.blitz.ending.eliminated(ending.eliminatedAt ?? '')}
      </p>
      <div className="mt-[10px] flex justify-center gap-3">
        <Link
          to="/accueil"
          className="border border-[var(--ink)] px-3 py-[6px] text-[10px] font-semibold tracking-[.18em] uppercase"
        >
          {fr.blitz.ending.home}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-3 py-[6px] text-[10px] font-semibold tracking-[.18em] text-[var(--paper)] uppercase"
        >
          {verdict === null ? fr.blitz.ending.observe : fr.blitz.ending.watch}
        </button>
      </div>
    </div>
  );
}

/** Ma ligne et celles des autres sont **la même ligne** : c'est ce que le contrat demande — je
 *  figure à mon rang, comme tout le monde, et ce qui me distingue est l'en-tête collé, qui se
 *  déplie sur « nos registres ». Le serveur les sert séparément parce que le cloisonnement est
 *  là ; la table les recoud parce que la lecture est là. */
type Row = PressLine & { readonly own: PressOwnLine | null };

/** Les lignes de l'édition, la mienne recousue parmi les autres à son rang. */
const rowsOf = (press: PressEdition): ReadonlyArray<Row> => [
  ...press.others.map((line) => ({ ...line, own: null })),
  ...(press.mine === null ? [] : [{ ...press.mine, playerId: 'me', own: press.mine }]),
];

const MINUTE = 60_000;

/**
 * **La presse, une seule colonne pour toutes les largeurs** (refonte mobile, #180) : son rang et
 * ses trois chiffres dans un en-tête collé, la course aux Sept sur une ligne de sept pastilles,
 * puis le tableau, qu'on trie en touchant le titre d'une colonne. Au bureau la même colonne
 * s'élargit — le pseudo reprend sa colonne — au lieu de changer de forme.
 */
function PressColumn({
  press,
  verdict,
  ending,
  points,
  race,
  sort,
  onSort,
  onClose,
}: {
  press: PressEdition | null;
  verdict: SeasonVerdict | null;
  ending: EndingFacts;
  points: ReadonlyArray<StrategicPointView>;
  race: RaceCountdown | null;
  sort: PressSortKey;
  onSort: (key: PressSortKey) => void;
  onClose: () => void;
}) {
  const narrow = useNarrowScreen();
  const now = useClock(MINUTE);
  const [registersOpen, setRegistersOpen] = useState(!narrow);
  const mine = press?.mine ?? null;
  const wait = press?.next == null ? null : Math.max(0, Math.round((press.next - now) / MINUTE));

  return (
    <div className="paper-grain @container flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] text-[var(--ink)]">
      <WindowHead
        eyebrow={
          press === null ? (
            fr.press.kicker
          ) : (
            <>
              {fr.press.capturedAt(asClockTime(press.at))}
              {!press.final && press.next !== null && wait !== null && (
                <span className="block text-[var(--notable-paper)]">
                  {fr.press.nextIn(asClockTime(press.next), Math.floor(wait / 60), wait % 60)}
                </span>
              )}
            </>
          )
        }
        title={fr.press.title}
        dense
        onClose={onClose}
      >
        {press?.final === true && <Stamp label={fr.press.final} size="small" />}
      </WindowHead>

      {mine !== null && (
        <button
          type="button"
          aria-expanded={registersOpen}
          onClick={() => setRegistersOpen(!registersOpen)}
          className="grid shrink-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-[10px] border-b border-[var(--ink)] bg-(--paper-pile)/60 py-2 pr-[10px] pl-3 text-left"
        >
          <span className="row-span-2 font-(family-name:--font-display) text-[36px] leading-[.8] font-extrabold text-[var(--critical)]">
            {mine.rank}
            <span className="align-top text-[15px]">{fr.press.ordinalSuffix(mine.rank)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-[6px]">
            <Flag nation={mine.nation} width={22} onPaper />
            <span className="truncate font-(family-name:--font-display) text-[15px] leading-[1.1] font-bold">
              {nationLabel(mine.nation)}
            </span>
            <span className="truncate text-[11.5px] text-[var(--ink-soft)]">
              {mine.nickname} · {fr.press.you}
            </span>
          </span>
          <span
            aria-hidden
            className={`row-span-2 text-[16px] text-[var(--ink-soft)] transition-transform ${registersOpen ? 'rotate-90' : ''}`}
          >
            ›
          </span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-3 font-(family-name:--font-mono) text-[12px] whitespace-nowrap">
            <span>
              <span className="font-(family-name:--font-display) text-[14px] font-extrabold">
                {fr.press.percent(mine.territory)}
              </span>{' '}
              {mine.delta && <Delta value={mine.delta.territory} decimals={1} />}
            </span>
            <span>
              {fr.press.points(mine.general)} {mine.delta && <Delta value={mine.delta.general} />}
            </span>
            <span>
              {fr.press.deedsCount(mine.deeds)} {mine.delta && <Delta value={mine.delta.deeds} />}
            </span>
          </span>
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Ending
          verdict={press?.final === true ? verdict : null}
          ending={ending}
          onClose={onClose}
        />
        {mine !== null && registersOpen && <Registers own={mine} />}
        <Race points={points} race={race} />
        {press === null ? (
          <p className="mx-auto max-w-[62ch] px-6 py-12 text-center font-(family-name:--font-display) text-[18px] leading-[1.45] text-[var(--ink-quiet)] italic">
            {fr.press.none}
          </p>
        ) : (
          <Table press={press} sort={sort} onSort={onSort} />
        )}
      </div>
    </div>
  );
}

const GRID =
  'grid-cols-[18px_16px_minmax(0,1fr)_50px_40px_32px] @xl:grid-cols-[28px_24px_minmax(90px,1fr)_minmax(80px,1fr)_72px_100px_92px]';

function Table({
  press,
  sort,
  onSort,
}: {
  press: PressEdition;
  sort: PressSortKey;
  onSort: (key: PressSortKey) => void;
}) {
  const rows = rowsOf(press);
  const best = Object.fromEntries(
    PRESS_SORT_KEYS.map((key) => [key, Math.max(...rows.map((row) => row[key]))]),
  ) as Record<PressSortKey, number>;
  const figure = (row: Row, key: PressSortKey) => {
    const lead = row[key] === best[key];
    return (
      <span
        className={`flex items-center justify-end gap-1 whitespace-nowrap ${
          key === sort
            ? 'font-(family-name:--font-display) text-[13px] font-bold'
            : 'font-(family-name:--font-mono) text-[12.5px]'
        }`}
        style={lead ? { color: 'var(--critical)' } : undefined}
      >
        {lead && (
          <span
            aria-hidden
            title={fr.press.leadColumn}
            className="h-[6px] w-[6px] bg-[var(--critical)]"
          />
        )}
        {key === 'territory' ? fr.press.percent(row[key]) : fr.press.score(row[key])}
      </span>
    );
  };

  return (
    <>
      {/* **Le tri se fait au titre de la colonne** : une lecture, jamais un ordre — la page
          n'envoie rien, et l'ordre servi reste celui du territoire. */}
      <div
        className={`sticky top-0 z-[2] grid ${GRID} h-[30px] items-stretch gap-x-[5px] border-b border-[var(--ink)] bg-[var(--paper)] px-3 text-[9px] font-semibold tracking-[.12em] text-[var(--ink-soft)] uppercase @xl:gap-x-3 @xl:px-4`}
      >
        <span className="col-span-3 self-center @xl:col-span-3">
          {fr.press.columns.rank} · {fr.press.columns.nation}
        </span>
        <span className="hidden self-center @xl:block">{fr.press.columns.pseudo}</span>
        {PRESS_SORT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={sort === key}
            title={fr.press.sortBy(fr.press.columns[key])}
            onClick={() => onSort(key)}
            className={`flex cursor-pointer items-center justify-end gap-[3px] border-0 border-b-2 bg-transparent p-0 tracking-[.12em] whitespace-nowrap uppercase ${
              sort === key ? 'border-[var(--ink)] text-[var(--ink)]' : 'border-transparent'
            }`}
          >
            <span className="@xl:hidden">{fr.press.columnsShort[key]}</span>
            <span className="hidden @xl:inline">{fr.press.columns[key]}</span>
            <span className="text-[7px]">▼</span>
          </button>
        ))}
      </div>

      {sortPressRows(rows, sort).map((row) => (
        <div
          key={row.playerId}
          className={`grid ${GRID} min-h-[42px] items-center gap-x-[5px] border-b border-(color:--ink)/16 px-3 @xl:min-h-[38px] @xl:gap-x-3 @xl:px-4 ${
            row.own === null
              ? ''
              : 'bg-(--ink)/8 outline outline-offset-[-1px] outline-[var(--ink)]'
          }`}
          /* **Le défait reste à son rang, estompé** : il a cessé d'ordonner, pas d'exister —
           ses positions tiennent et son encre est encore sur la carte. */
          style={row.defeated ? { opacity: 0.5 } : undefined}
        >
          <span className="font-(family-name:--font-display) text-[17px] leading-none font-extrabold">
            {row.rank}
          </span>
          <Flag nation={row.nation} width={16} onPaper />
          <span className="min-w-0">
            <span className="block truncate font-(family-name:--font-display) text-[12.5px] leading-[1.15] font-bold">
              {nationLabel(row.nation)}
            </span>
            <span className="flex items-center gap-[6px] text-[11px] text-[var(--ink-soft)] @xl:hidden">
              <span className="truncate">{row.nickname}</span>
              {row.own !== null && (
                <span className="shrink-0 text-[9px] font-bold tracking-[.14em] text-[var(--ink)] uppercase">
                  · {fr.press.you}
                </span>
              )}
              {row.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
            </span>
          </span>
          <span className="hidden min-w-0 items-center gap-3 @xl:flex">
            <span className={`truncate text-[13px] ${row.own === null ? '' : 'font-bold'}`}>
              {row.nickname}
            </span>
            {row.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
          </span>
          {figure(row, 'territory')}
          {figure(row, 'general')}
          {figure(row, 'deeds')}
        </div>
      ))}
      <p className="px-3 pt-[10px] pb-[22px] font-(family-name:--font-text) text-[12.5px] text-[var(--ink-note)] italic">
        {fr.press.frozen}
      </p>
    </>
  );
}

/**
 * **« Nos registres » — le seul endroit du jeu où le détail existe.** Cinq chiffres exacts et
 * leur variation depuis l'édition précédente. Les autres n'en ont aucun équivalent, et ce n'est
 * pas une omission d'affichage : le serveur ne sert pas leur industrie.
 */
function Registers({ own }: { own: PressOwnLine }) {
  const said = fr.press.registers;
  const lines: ReadonlyArray<{
    label: string;
    value: string;
    delta: number | null;
    decimals?: number;
  }> = [
    { label: said.general, value: fr.press.score(own.general), delta: own.delta?.general ?? null },
    {
      label: said.territory,
      value: fr.press.percent(own.territory),
      delta: own.delta?.territory ?? null,
      decimals: 1,
    },
    {
      label: said.industry,
      value: fr.press.score(own.industry),
      delta: own.delta?.industry ?? null,
    },
    {
      label: said.military,
      value: fr.press.score(own.military),
      delta: own.delta?.military ?? null,
    },
    { label: said.deeds, value: fr.press.score(own.deeds), delta: own.delta?.deeds ?? null },
  ];
  return (
    <section className="border-b border-[var(--ink)] bg-(--paper-pile)/35 px-3 pt-[6px] pb-[10px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-(color:--ink)/30 pb-1">
        <span className="text-[9.5px] font-bold tracking-[.16em] uppercase">{said.title}</span>
        <span className="text-[11.5px] text-[var(--ink-note)] italic">
          {own.since === null ? said.noPrevious : said.since(asClockTime(own.since))}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_52px] items-baseline gap-x-[10px] gap-y-1 pt-[6px] text-[13px]">
        {lines.map((line, rank) => (
          <div key={line.label} className="contents">
            <span className={rank === 0 ? 'font-bold' : ''}>{line.label}</span>
            <span className="text-right font-(family-name:--font-mono)">{line.value}</span>
            <span className="text-right">
              {line.delta !== null && <Delta value={line.delta} decimals={line.decimals ?? 0} />}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 font-(family-name:--font-display) text-[11.5px] text-[var(--ink-soft)] italic">
        {fr.press.ownRegisters}
      </p>
    </section>
  );
}

/** Une variation lue d'un coup d'œil : le gain au vert, la perte au rouge, l'immobilité à l'encre. */
function Delta({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const said = fr.press.delta(value, decimals);
  return (
    <span
      className="font-(family-name:--font-mono) text-[10.5px]"
      style={{
        color: said === '=' ? 'var(--ink-soft)' : value > 0 ? 'var(--valid)' : 'var(--critical)',
      }}
    >
      {said}
    </span>
  );
}

/**
 * **La course aux Sept** (P1-P12) : qui tient quoi, en direct — une ligne de sept pastilles à
 * l'encre du teneur, hachurée quand le point est contesté, qui se déplie sur le détail. Le teneur,
 * jamais le contestant : un point contesté le dit, sans nom. Le compte à rebours reste visible
 * replié. La saison conclue, le palmarès par lieu, que le serveur ne sert qu'alors.
 */
function Race({
  points,
  race,
}: {
  points: ReadonlyArray<StrategicPointView>;
  race: RaceCountdown | null;
}) {
  const now = useClock(MINUTE);
  const [open, setOpen] = useState(() => points.some((point) => point.longest !== null));
  if (points.length === 0) return null;
  const byNation = new Map<string, Array<StrategicPointView>>();
  for (const point of points) {
    if (point.holder === null) continue;
    byNation.set(point.holder.nation, [...(byNation.get(point.holder.nation) ?? []), point]);
  }
  const standings = [...byNation].sort((left, right) => right[1].length - left[1].length);
  const leader = standings[0];
  return (
    <section className="border-b border-[var(--ink)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 py-2 pr-8 pl-3 text-left"
      >
        <span className="font-(family-name:--font-display) text-[13.5px] font-bold whitespace-nowrap">
          {fr.points.race.title}
        </span>
        <span className="flex gap-[3px]">
          {points.map((point) => (
            <i
              key={point.id}
              title={`${fr.points.names[point.key]}${point.contested ? ` (${fr.points.race.contested})` : ''}`}
              className="h-[9px] w-[9px] border border-[var(--ink)]"
              style={{
                background: point.holder === null ? 'transparent' : nationInk(point.holder.nation),
                ...(point.contested
                  ? {
                      backgroundImage:
                        'repeating-linear-gradient(45deg, transparent 0 2px, var(--paper) 2px 3px)',
                    }
                  : {}),
              }}
            />
          ))}
        </span>
        <span className="min-w-[5.5rem] flex-1 text-[11.5px] text-[var(--ink-soft)]">
          {leader === undefined
            ? fr.points.race.nobody
            : `${nationLabel(leader[0])} ${fr.points.race.count(leader[1].length)}`}
        </span>
        <span
          aria-hidden
          className={`absolute top-2 right-[10px] text-[16px] text-[var(--ink-soft)] transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
      </button>
      {race !== null && (
        <p
          role="timer"
          className="px-3 pb-2 font-(family-name:--font-display) text-[13.5px] font-bold text-[var(--critical)]"
        >
          {fr.points.race.countdown(
            nationLabel(race.leaderNation),
            countdownLabel(Math.max(0, race.endsAt - now)),
          )}
        </p>
      )}
      {open && (
        <div className="flex flex-col gap-1 px-3 pb-[10px] text-[12.5px]">
          <p className="text-[11.5px] text-[var(--ink-soft)] italic">{fr.points.race.chapo}</p>
          {standings.length === 0 ? (
            <p className="text-[var(--ink-quiet)]">{fr.points.race.waiting}</p>
          ) : (
            standings.map(([nation, held]) => (
              <p key={nation} className="flex items-baseline gap-2">
                <span className="font-bold">{nationLabel(nation)}</span>
                <span className="font-(family-name:--font-mono) text-[var(--critical)]">
                  {fr.points.race.count(held.length)}
                </span>
                <span className="text-[var(--ink-soft)]">
                  {held.map((point) => fr.points.names[point.key]).join(', ')}
                </span>
              </p>
            ))
          )}
          {points.some((point) => point.longest !== null) && (
            <>
              <h3 className="mt-[6px] text-[10px] font-bold tracking-[.16em] uppercase">
                {fr.points.race.palmares}
              </h3>
              {points.map((point) => (
                <p key={point.id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="font-bold">{fr.points.names[point.key]}</span>
                  {point.longest === null ? (
                    <span className="text-[var(--ink-quiet)]">{fr.points.race.neverHeld}</span>
                  ) : (
                    <>
                      <span>{nationLabel(point.longest.nation)}</span>
                      <span className="font-(family-name:--font-mono) text-[var(--critical)]">
                        {countdownLabel(point.longest.heldMs)}
                      </span>
                    </>
                  )}
                </p>
              ))}
            </>
          )}
          <p className="text-[11px] text-[var(--ink-soft)]">
            {points
              .map(
                (point) =>
                  `${fr.points.names[point.key]}${point.contested ? ` (${fr.points.race.contested})` : ''}`,
              )
              .join(' · ')}
          </p>
        </div>
      )}
    </section>
  );
}
