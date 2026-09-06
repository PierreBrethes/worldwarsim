import { useState } from 'react';
import { fr, nationLabel } from '@/i18n/fr';
import { asLocalTime } from '@/domain/duration';
import type { PressEdition, PressLine, PressOwnLine } from '@/domain/player-view';
import { Flag } from '@/emblems/Flag';
import { Stamp } from '@/shell/Stamp';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

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
 * champs) — ni courbe, ni historique, ni compte de régions, ni vainqueur. Aucun ordre ne part
 * d'ici : on ferme, et c'est tout.
 */
export function PressWindow({
  press,
  onClose,
  ...windowProps
}: WindowProps & { press: PressEdition | null }) {
  const [sort, setSort] = useState<SortKey>('territory');

  return (
    <FloatingWindow name="press" onClose={onClose} {...windowProps} alignment="top" width={1040}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--ink)] px-4 py-[10px] text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>
            {press === null ? fr.press.kicker : fr.press.capturedAt(asLocalTime(press.at))}
          </span>
          {press?.next != null && <span>{fr.press.next(asLocalTime(press.next))}</span>}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

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

/** Les trois colonnes chiffrées, et rien d'autre ne se trie : le rang, le drapeau et le pseudo
 *  ne sont pas des mesures. */
type SortKey = 'territory' | 'general' | 'deeds';

/** Ma ligne et celles des autres sont **la même ligne** : c'est ce que le contrat demande — je
 *  figure à mon rang, comme tout le monde, et ce qui me distingue est le bloc qui se déplie
 *  dessous. Le serveur les sert séparément parce que le cloisonnement est là ; la table les
 *  recoud parce que la lecture est là. */
type Row = PressLine & { readonly own: PressOwnLine | null };

const GRID = 'grid-cols-[36px_32px_minmax(0,150px)_minmax(150px,1fr)_96px_120px_116px]';

function Table({
  press,
  sort,
  onSort,
}: {
  press: PressEdition;
  sort: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const rows: ReadonlyArray<Row> = [
    ...press.others.map((line) => ({ ...line, own: null })),
    ...(press.mine === null
      ? []
      : [{ ...press.mine, playerId: 'me', general: press.mine.general, own: press.mine }]),
  ];
  /** Le tri par défaut est celui du territoire — l'ordre servi, et le but de la saison. Il est
   *  stable sur le rang, sinon deux parts égales échangeraient de place au moindre repeint. */
  const ordered = [...rows].sort((left, right) =>
    sort === 'territory' ? left.rank - right.rank : right[sort] - left[sort],
  );
  const best = Object.fromEntries(
    (['territory', 'general', 'deeds'] as const).map((key) => [
      key,
      Math.max(...rows.map((row) => row[key])),
    ]),
  ) as Record<SortKey, number>;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
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
            className={`grid ${GRID} items-center gap-x-[14px] border-b border-[rgba(42,33,24,.16)] px-3 py-[11px] ${
              row.own === null ? '' : 'bg-[rgba(42,33,24,.06)] outline outline-[var(--ink)]'
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
    <section className="mx-3 mt-[2px] mb-[6px] ml-[54px] border border-[var(--ink)] bg-[rgba(42,33,24,.04)] px-[18px] pt-3 pb-[14px]">
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
            className="flex flex-col gap-[6px] border-l border-[rgba(42,33,24,.3)] pl-3"
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
