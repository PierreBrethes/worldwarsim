import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { asClockTime, asLocalTime } from '@/domain/duration';
import type { PressEdition, PressLine, PressOwnLine, SeasonVerdict } from '@/domain/player-view';
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
  onClose,
  ...windowProps
}: WindowProps & {
  press: PressEdition | null;
  verdict: SeasonVerdict | null;
  ending: EndingFacts;
}) {
  const narrow = useNarrowScreen();
  const [sort, setSort] = useState<SortKey>('territory');

  if (narrow)
    return (
      <FloatingWindow name="press" onClose={onClose} {...windowProps} width={1040}>
        <NarrowPress
          press={press}
          verdict={verdict}
          ending={ending}
          sort={sort}
          onSort={setSort}
          onClose={onClose}
        />
      </FloatingWindow>
    );

  return (
    <FloatingWindow name="press" onClose={onClose} {...windowProps} alignment="top" width={1040}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <WindowHead
          eyebrow={
            <>
              {press === null ? fr.press.kicker : fr.press.capturedAt(asLocalTime(press.at))}
              {press?.next != null && <> · {fr.press.next(asLocalTime(press.next))}</>}
            </>
          }
          onClose={onClose}
        />

        {/* La manchette : le titre au centre, le tampon d'édition finale à gauche, et LE chiffre
            à droite — mon rang, le seul nombre qui change ce que je fais dans la minute. */}
        <div className="flex shrink-0 items-center gap-5 border-b border-[var(--ink)] px-4 py-[14px]">
          <div className="flex flex-1 justify-start">
            {press?.final === true && <Stamp label={fr.press.final} />}
          </div>
          <h1 className="font-(family-name:--font-display) text-[38px] leading-none font-extrabold tracking-[.12em] text-[var(--ink)] uppercase">
            {fr.press.title}
          </h1>
          <div className="flex flex-1 items-end justify-end gap-2">
            {press?.mine != null && (
              <>
                <span className="font-(family-name:--font-display) text-[34px] leading-[.8] font-bold text-[var(--critical)]">
                  {press.mine.rank}
                </span>
                <span className="pb-[3px] text-[9px] leading-[1.25] tracking-[.18em] text-[var(--critical)] uppercase">
                  {fr.press.columns.rank}
                </span>
              </>
            )}
          </div>
        </div>

        <Ending
          verdict={press?.final === true ? verdict : null}
          ending={ending}
          onClose={onClose}
        />
        {press === null ? (
          <p className="mx-auto max-w-[62ch] px-6 py-[56px] text-center font-(family-name:--font-display) text-[20px] leading-[1.45] text-[var(--ink-quiet)] italic">
            {fr.press.none}
          </p>
        ) : (
          <Table press={press} sort={sort} onSort={setSort} />
        )}
      </div>
    </FloatingWindow>
  );
}

/** Ce que la fin d'une Blitz doit savoir de moi : qui je suis, si je suis tombé et à quelle heure. */
export type EndingFacts = {
  readonly nation: string;
  readonly eliminatedAt: string | null;
};

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
          ? fr.victory.blitzConcluded(
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

/** Les trois colonnes chiffrées, et rien d'autre ne se trie : le rang, le drapeau et le pseudo
 *  ne sont pas des mesures. */
type SortKey = 'territory' | 'general' | 'deeds';

/** Ma ligne et celles des autres sont **la même ligne** : c'est ce que le contrat demande — je
 *  figure à mon rang, comme tout le monde, et ce qui me distingue est le bloc qui se déplie
 *  dessous. Le serveur les sert séparément parce que le cloisonnement est là ; la table les
 *  recoud parce que la lecture est là. */
type Row = PressLine & { readonly own: PressOwnLine | null };

const GRID = 'grid-cols-[36px_32px_minmax(0,150px)_minmax(150px,1fr)_96px_120px_116px]';

/** Les lignes de l'édition, la mienne recousue parmi les autres à son rang. */
const rowsOf = (press: PressEdition): ReadonlyArray<Row> => [
  ...press.others.map((line) => ({ ...line, own: null })),
  ...(press.mine === null ? [] : [{ ...press.mine, playerId: 'me', own: press.mine }]),
];

/** Le tri du territoire est l'ordre servi, et le but de la saison. Il est stable sur le rang,
 *  sinon deux parts égales échangeraient de place au moindre repeint. */
const sortedBy = (rows: ReadonlyArray<Row>, sort: SortKey): ReadonlyArray<Row> =>
  [...rows].sort((left, right) =>
    sort === 'territory'
      ? left.rank - right.rank
      : right[sort] - left[sort] || left.rank - right.rank,
  );

function Table({
  press,
  sort,
  onSort,
}: {
  press: PressEdition;
  sort: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const rows = rowsOf(press);
  const ordered = sortedBy(rows, sort);
  const best = Object.fromEntries(
    (['territory', 'general', 'deeds'] as const).map((key) => [
      key,
      Math.max(...rows.map((row) => row[key])),
    ]),
  ) as Record<SortKey, number>;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* **Le classement défile d'un bloc, il ne se comprime pas.** Les sept colonnes tiennent
          784 px et la fenêtre en a mille : sur un téléphone, sans cette largeur plancher, chaque
          ligne se serrait pour elle-même — sept grilles qui défilaient chacune de son côté, une
          part de territoire coupée en deux, et « nos registres » à cinq colonnes superposées. */}
      <div className="min-w-[784px]">
        <div
          className={`grid ${GRID} items-end gap-x-[14px] border-b border-[var(--ink)] px-3 pb-[6px] text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase`}
        >
          <span>{fr.press.columns.rank}</span>
          <span />
          <span />
          <span>{fr.press.columns.pseudo}</span>
          <SortHeader column="territory" sort={sort} onSort={onSort} />
          <SortHeader column="general" sort={sort} onSort={onSort} />
          <SortHeader column="deeds" sort={sort} onSort={onSort} />
        </div>

        {ordered.map((row) => (
          <div key={row.playerId}>
            <div
              className={`grid ${GRID} items-center gap-x-[14px] border-b border-(color:--ink)/16 px-3 py-[11px] ${
                row.own === null ? '' : 'bg-(--ink)/6 outline outline-[var(--ink)]'
              }`}
              /* **Le défait reste à son rang, estompé** : il a cessé d'ordonner, pas d'exister —
               ses positions tiennent et son encre est encore sur la carte. */
              style={row.defeated ? { opacity: 0.45 } : undefined}
            >
              <span className="font-(family-name:--font-display) text-[24px] leading-none font-bold text-[var(--ink)]">
                {row.rank}
              </span>
              <Flag nation={row.nation} width={30} onPaper />
              <span className="truncate font-(family-name:--font-display) text-[19px] leading-[1.1] font-extrabold text-[var(--ink)]">
                {nationLabel(row.nation)}
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={`truncate text-[14px] text-[var(--ink)] ${row.own === null ? '' : 'font-bold'}`}
                >
                  {row.nickname}
                </span>
                {row.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
              </span>
              <Figure
                value={fr.press.percent(row.territory)}
                lead={row.territory === best.territory}
              />
              <Figure value={fr.press.score(row.general)} lead={row.general === best.general} />
              <Figure value={fr.press.score(row.deeds)} lead={row.deeds === best.deeds} mono />
            </div>
            {row.own !== null && <Registers own={row.own} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: SortKey;
  sort: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const label = fr.press.columns[column];
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      title={fr.press.sortBy(label)}
      className={`flex cursor-pointer items-baseline justify-end gap-[5px] border-0 border-b bg-transparent p-0 text-[10px] tracking-[.2em] whitespace-nowrap uppercase ${
        column === sort
          ? 'border-[var(--ink)] text-[var(--ink)]'
          : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
      }`}
    >
      <span>{label}</span>
      <span className="text-[8px]">▼</span>
    </button>
  );
}

/** Un carré à l'encre critique marque le premier de la colonne — trois marques par table au
 *  plus, et jamais un tampon : un score n'a pas d'état (contrat 07). */
function Figure({ value, lead, mono = false }: { value: string; lead: boolean; mono?: boolean }) {
  return (
    <span className="flex items-center justify-end gap-[7px] whitespace-nowrap">
      {lead && (
        <span
          aria-hidden
          title={fr.press.leadColumn}
          className="h-[7px] w-[7px] bg-[var(--critical)]"
        />
      )}
      <span
        className={
          mono
            ? 'font-(family-name:--font-mono) text-[14px]'
            : 'font-(family-name:--font-display) text-[24px] leading-none font-bold'
        }
        style={{ color: lead ? 'var(--critical)' : 'var(--ink)' }}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * **« Nos registres » — le seul endroit du jeu où le détail existe.** Cinq chiffres exacts et
 * leur variation depuis l'édition précédente. Les autres n'en ont aucun équivalent, et ce n'est
 * pas une omission d'affichage : le serveur ne sert pas leur industrie.
 */
function Registers({ own }: { own: PressOwnLine }) {
  const said = fr.press.registers;
  const cells: ReadonlyArray<{ label: string; value: string; delta: string }> = [
    {
      label: said.territory,
      value: fr.press.percent(own.territory),
      delta: own.delta === null ? '' : fr.press.delta(own.delta.territory, 1),
    },
    {
      label: said.industry,
      value: fr.press.score(own.industry),
      delta: own.delta === null ? '' : fr.press.delta(own.delta.industry),
    },
    {
      label: said.military,
      value: fr.press.score(own.military),
      delta: own.delta === null ? '' : fr.press.delta(own.delta.military),
    },
    {
      label: said.deeds,
      value: fr.press.score(own.deeds),
      delta: own.delta === null ? '' : fr.press.delta(own.delta.deeds),
    },
    {
      label: said.general,
      value: fr.press.score(own.general),
      delta: own.delta === null ? '' : fr.press.delta(own.delta.general),
    },
  ];

  return (
    <section className="mx-3 mt-[2px] mb-[6px] ml-[54px] border border-[var(--ink)] bg-(--ink)/4 px-[18px] pt-3 pb-[14px]">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--ink)] pb-[6px]">
        <span className="text-[10px] font-bold tracking-[.22em] text-[var(--ink)] uppercase">
          {said.title}
        </span>
        <span className="text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {own.since === null ? said.noPrevious : said.since(asLocalTime(own.since))}
        </span>
        <span className="flex-1" />
        <span className="font-(family-name:--font-display) text-[12px] text-[var(--ink-soft)] italic">
          {fr.press.ownRegisters}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-x-[18px]">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="flex flex-col gap-[6px] border-l border-(color:--ink)/30 pl-3"
          >
            <span className="text-[10px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
              {cell.label}
            </span>
            <span className="flex items-baseline gap-[9px]">
              <span className="font-(family-name:--font-display) text-[26px] leading-[.9] font-bold whitespace-nowrap text-[var(--ink)]">
                {cell.value}
              </span>
              <span className="font-(family-name:--font-mono) text-[12px] text-[var(--ink-soft)]">
                {cell.delta}
              </span>
            </span>
          </div>
        ))}
      </div>
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

const MINUTE = 60_000;

/**
 * **La presse du téléphone : son rang d'abord, puis la table** (refonte mobile, 1j). On l'ouvre
 * pour savoir où l'on en est : le rang passe en tête, le score général le premier, avec ce qui a
 * bougé depuis l'édition précédente. La table se classe au score — territoire et faits d'armes
 * restent lisibles en second — et ma ligne reste collée au pied tant qu'elle n'est pas à
 * l'écran. La prochaine édition se compte à rebours. Un seul défilement, l'en-tête collé.
 */
function NarrowPress({
  press,
  verdict,
  ending,
  sort,
  onSort,
  onClose,
}: {
  press: PressEdition | null;
  verdict: SeasonVerdict | null;
  ending: EndingFacts;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  onClose: () => void;
}) {
  const now = useClock(MINUTE);
  const mine = press?.mine ?? null;
  const wait = press?.next == null ? null : Math.max(0, Math.round((press.next - now) / MINUTE));

  return (
    <div className="paper-grain min-h-0 w-full flex-1 overflow-y-auto overscroll-contain text-[var(--ink)]">
      <div className="paper-grain sticky top-0 z-[2] border-b border-[var(--ink)]">
        <div className="flex h-[50px] items-center gap-[10px] pr-3 pl-4">
          <span className="font-(family-name:--font-display) text-[21px] leading-none font-extrabold tracking-[.08em] uppercase">
            {fr.press.title}
          </span>
          <span className="flex-1 text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.press.kicker}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[10px] font-semibold tracking-[.18em] uppercase"
          >
            {fr.common.close}
          </button>
        </div>
        {press !== null && (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-[3px] px-4 pb-[9px] font-(family-name:--font-mono) text-[10.5px]">
            <span className="whitespace-nowrap text-[var(--ink-soft)]">
              {fr.press.capturedAt(asClockTime(press.at))}
            </span>
            {press.final ? (
              <Stamp label={fr.press.final} size="small" />
            ) : (
              press.next !== null &&
              wait !== null && (
                <span className="text-right whitespace-nowrap text-[var(--notable-paper)]">
                  {fr.press.nextIn(asClockTime(press.next), Math.floor(wait / 60), wait % 60)}
                </span>
              )
            )}
          </div>
        )}
      </div>

      <Ending verdict={press?.final === true ? verdict : null} ending={ending} onClose={onClose} />
      {press === null ? (
        <p className="px-6 py-12 text-center font-(family-name:--font-display) text-[18px] leading-[1.45] text-[var(--ink-quiet)] italic">
          {fr.press.none}
        </p>
      ) : (
        <>
          {mine !== null && (
            <div className="flex items-center gap-4 border-b border-[var(--ink)] px-4 pt-4 pb-[14px]">
              <span className="font-(family-name:--font-display) text-[64px] leading-[.8] font-extrabold text-[var(--critical)]">
                {mine.rank}
                <span className="align-top text-[24px]">{fr.press.ordinalSuffix(mine.rank)}</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Flag nation={mine.nation} width={26} onPaper />
                  <span className="truncate font-(family-name:--font-display) text-[22px] font-extrabold">
                    {nationLabel(mine.nation)}
                  </span>
                  <span className="truncate text-[12.5px] text-[var(--ink-soft)]">
                    {mine.nickname}
                  </span>
                </div>
                <div className="mt-[10px] grid grid-cols-[repeat(3,auto)] items-end justify-between gap-[10px]">
                  {/* Le rang en vedette est celui du territoire (ADR 0020 §2) : sa mesure se
                      lit la première, sans quoi « 2ᵉ » se posait à côté d'un score général qui
                      n'est pas le sien. */}
                  <Headline label={fr.press.columns.territory} lead>
                    <span className="font-(family-name:--font-display) text-[26px] leading-none font-extrabold">
                      {fr.press.percent(mine.territory)}
                    </span>
                    {mine.delta && <Delta value={mine.delta.territory} decimals={1} />}
                  </Headline>
                  <Headline label={fr.press.columns.general}>
                    <span className="font-(family-name:--font-mono) text-[15px] font-medium">
                      {fr.press.score(mine.general)}
                    </span>
                    {mine.delta && <Delta value={mine.delta.general} />}
                  </Headline>
                  <Headline label={fr.press.columns.deeds}>
                    <span className="font-(family-name:--font-mono) text-[15px] font-medium">
                      {fr.press.score(mine.deeds)}
                    </span>
                    {mine.delta && <Delta value={mine.delta.deeds} />}
                  </Headline>
                </div>
              </div>
            </div>
          )}

          <div
            role="radiogroup"
            className="mx-4 mt-3 mb-[6px] grid grid-cols-3 border border-[var(--ink)]"
          >
            {(['territory', 'general', 'deeds'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={sort === key}
                onClick={() => onSort(key)}
                className={`min-h-[40px] cursor-pointer border-l border-[var(--ink)] text-[10.5px] font-semibold tracking-[.1em] uppercase first:border-l-0 ${
                  sort === key ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
                }`}
              >
                {fr.press.columns[key]}
              </button>
            ))}
          </div>
          <div className="flex border-b border-[var(--ink)] px-4 pt-2 pb-[6px] text-[9.5px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            <span className="w-[34px]">{fr.press.columns.rank}</span>
            <span className="flex-1">{fr.press.columns.nation}</span>
            <span>{fr.press.columns[sort]}</span>
          </div>
          {sortedBy(rowsOf(press), sort).map((row) => (
            <RankLine key={row.playerId} row={row} sort={sort} />
          ))}

          {mine !== null && <NarrowRegisters own={mine} />}
          <p className="px-4 pt-[10px] pb-[26px] font-(family-name:--font-text) text-[13px] text-[var(--ink-note)] italic">
            {fr.press.frozen}
          </p>
        </>
      )}
    </div>
  );
}

function Headline({
  label,
  lead = false,
  children,
}: {
  label: string;
  lead?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="flex flex-col gap-[2px]">
      <span
        className={`text-[9.5px] tracking-[.14em] uppercase ${lead ? 'font-bold' : 'text-[var(--ink-soft)]'}`}
      >
        {label}
      </span>
      {children}
    </span>
  );
}

/** **Ma ligne reste au pied tant qu'elle n'est pas à l'écran** : on cherche d'abord où l'on est,
 *  et la table défile par-dessus sans la perdre. */
function RankLine({ row, sort }: { row: Row; sort: SortKey }) {
  const main =
    sort === 'territory'
      ? fr.press.percent(row.territory)
      : sort === 'general'
        ? fr.press.score(row.general)
        : fr.press.score(row.deeds);
  const side =
    sort === 'territory'
      ? [fr.press.points(row.general), fr.press.deedsCount(row.deeds)]
      : sort === 'general'
        ? [fr.press.percent(row.territory), fr.press.deedsCount(row.deeds)]
        : [fr.press.percent(row.territory), fr.press.points(row.general)];
  return (
    <div
      className={`flex min-h-[60px] items-center gap-[10px] border-b border-(color:--ink)/20 px-4 py-[6px] ${
        row.own === null
          ? ''
          : 'sticky bottom-0 z-[1] bg-[color-mix(in_srgb,var(--paper),var(--ink)_8%)]'
      }`}
      style={row.defeated ? { opacity: 0.55 } : undefined}
    >
      <span className="w-[24px] font-(family-name:--font-display) text-[22px] font-extrabold">
        {row.rank}
      </span>
      <Flag nation={row.nation} width={26} onPaper />
      <div className="min-w-0 flex-1">
        <div className="truncate font-(family-name:--font-display) text-[17px] leading-[1.1] font-bold">
          {nationLabel(row.nation)}
        </div>
        <div className="mt-[2px] flex items-center gap-[6px] text-[12px] text-[var(--ink-soft)]">
          <span className="truncate">{row.nickname}</span>
          {row.own !== null && (
            <span className="shrink-0 text-[9.5px] font-bold tracking-[.16em] whitespace-nowrap text-[var(--ink)] uppercase">
              · {fr.press.you}
            </span>
          )}
          {row.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
        </div>
      </div>
      <div className="text-right">
        <div className="font-(family-name:--font-display) text-[19px] leading-[1.1] font-extrabold">
          {main}
        </div>
        <div className="mt-[2px] font-(family-name:--font-mono) text-[10.5px] whitespace-nowrap text-[var(--ink-soft)]">
          {side.join(' · ')}
        </div>
      </div>
    </div>
  );
}

/** « Nos registres », en lignes : le seul endroit du jeu où le détail existe, et sa variation. */
function NarrowRegisters({ own }: { own: PressOwnLine }) {
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
    <section className="px-4 pt-[18px] pb-2">
      <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[6px]">
        <span className="font-(family-name:--font-display) text-[18px] font-extrabold first-letter:uppercase">
          {said.title}
        </span>
        <span className="text-[11.5px] text-[var(--ink-note)]">
          {own.since === null ? said.noPrevious : said.since(asClockTime(own.since))}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_56px] items-baseline gap-x-3 gap-y-[7px] pt-2 text-[14px]">
        {lines.map((line, rank) => (
          <div key={line.label} className="contents">
            <span className={rank === 0 ? 'font-bold' : ''}>{line.label}</span>
            <span className={`font-(family-name:--font-mono) ${rank === 0 ? 'font-semibold' : ''}`}>
              {line.value}
            </span>
            <span className="text-right">
              {line.delta !== null && <Delta value={line.delta} decimals={line.decimals ?? 0} />}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
