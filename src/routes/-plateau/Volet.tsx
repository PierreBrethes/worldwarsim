import { Fragment, useEffect, useRef, useState } from 'react';
import { cancelWorkRefusalOf } from '@/domain/construction';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { useMapMotion } from '@/data/mapMotion';
import type { Seat } from '@/data/session';
import { countdownLabel, fr } from '@/i18n/fr';
import { ReserveLine } from '@/shell/ReserveCell';
import { enter } from './cascade';
import { HeapBoardNotes } from './HeapReadouts';
import { LotControl } from './LotControl';
import { useCancelWork, worksOf } from './works';

/**
 * **Les quatre colonnes du plateau** : la file des chantiers, les stocks, les tas et la récolte, les
 * lots. Le bureau les pose côte à côte dans le volet (#580) ; le téléphone les range en onglets
 * dans l'étage des tuiles (#590). Une seule liste de chantiers, un seul « annuler » : `narrow` ne
 * change que la mise en page.
 */
export type ColumnsProps = {
  view: PlayerView;
  seat: Seat;
  now: number;
  observing: boolean;
  ledger: string;
  /** Rejouer la récolte : la ligne de la barre n'est pas toujours sous la main. */
  onReplay: (() => void) | null;
  onSpent: () => void;
};

/** Au-delà de quatre chantiers, la file du volet passe sur deux colonnes (#580). */
const QUEUE_ONE_COLUMN = 4;

/** La part déjà bâtie du chantier en tête. */
function WorkBar({ total, left, className }: { total: number; left: number; className: string }) {
  return (
    <span aria-hidden className={`block h-[3px] bg-(--ink)/14 ${className}`}>
      <i
        className="block h-full bg-[var(--arc-mine)]"
        style={{ width: `${total > 0 ? Math.min(100, ((total - left) / total) * 100) : 0}%` }}
      />
    </span>
  );
}

function HarvestLines({ ledger, onReplay }: { ledger: string; onReplay: (() => void) | null }) {
  return (
    <>
      <span className="mt-[4px] flex items-baseline gap-2">
        <span className="eyebrow">{fr.personalBoard.harvestHeader}</span>
        {onReplay !== null && (
          <button
            type="button"
            onClick={onReplay}
            className="ml-auto cursor-pointer text-[9.5px] tracking-[.14em] uppercase underline underline-offset-2"
          >
            {fr.personalBoard.harvestReplay}
          </button>
        )}
      </span>
      <p className="text-[11px] leading-[1.35] text-[var(--ink-soft)]">{ledger}</p>
    </>
  );
}

/** Les lots que le joueur commande, un par chaîne commandée (`LotControl`). */
const commandedChains = (view: PlayerView) =>
  view.me.chains.filter((chain) => chain.commanded && chain.level > 0);

function Lots({
  view,
  seat,
  now,
  observing,
}: Pick<ColumnsProps, 'view' | 'seat' | 'now' | 'observing'>) {
  return commandedChains(view).map((chain) => (
    <LotControl
      key={chain.by}
      chain={chain}
      seat={seat}
      loadedAt={view.loadedAt}
      now={now}
      observing={observing}
    />
  ));
}

/** Au bureau chaque colonne défile seule ; au téléphone l'onglet défile, la colonne se pose. */
const DESK_COLUMN =
  'grid min-h-0 min-w-0 content-start gap-[4px] overflow-y-auto overscroll-contain border-l border-(color:--ink)/40 px-[12px] py-[6px] first:border-l-0';
/** Quarante-quatre pixels d'écran : la feuille est dans `.hud`, qui zoome, et son plancher de 44 px
 *  zoomerait avec elle. */
const FINGER = 'min-h-[calc(44px/var(--hud-scale))]!';
const TAB_COLUMN = 'grid content-start gap-[4px] px-4 py-[4px]';

function WorksColumn({
  view,
  seat,
  now,
  observing,
  onSpent,
  narrow,
}: Pick<ColumnsProps, 'view' | 'seat' | 'now' | 'observing' | 'onSpent'> & { narrow: boolean }) {
  const { cancel, error } = useCancelWork(seat, onSpent);
  const works = worksOf(view, now);
  /** Au bureau la note défile avec la file : sous un volet bas, elle ne prend pas la place des chantiers. */
  const note = (
    <p
      title={fr.personalBoard.refundNote}
      className="text-[11px] leading-[1.3] text-[var(--ink-soft)]"
    >
      {fr.personalBoard.refundNote}
    </p>
  );
  return (
    <section
      data-volet-column="works"
      className={
        narrow ? TAB_COLUMN : `${DESK_COLUMN} grid-rows-[auto_minmax(0,1fr)] overflow-hidden`
      }
    >
      {/* Au téléphone l'onglet porte le titre : la file monte d'une ligne, et la vitesse du QG
          descend sous elle, avec le remboursement. */}
      {!narrow && (
        <span className="flex items-baseline gap-[8px]">
          <span className="eyebrow">{fr.personalBoard.worksHeader}</span>
          {view.me.hqLevel > 0 && (
            <small className="truncate text-[11px] text-[var(--ink-soft)]">
              {fr.personalBoard.hqSpeed(fr.common.levelSpeed(view.me.hqLevel))}
            </small>
          )}
        </span>
      )}
      <div
        className={
          narrow
            ? 'grid content-start gap-[4px]'
            : 'grid min-h-0 content-start gap-[4px] overflow-y-auto overscroll-contain'
        }
      >
        {works.length === 0 ? (
          <p className="text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
            {fr.economy.constructionNone}
          </p>
        ) : (
          <ol
            aria-label={fr.personalBoard.worksHeader}
            className="grid gap-x-[14px]"
            style={
              !narrow && works.length > QUEUE_ONE_COLUMN
                ? { gridTemplateColumns: '1fr 1fr' }
                : undefined
            }
          >
            {works.map(({ work, running, frozen, total, left, name }, index) => (
              <li
                key={work.id}
                className="mat-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[8px] border-b border-(color:--ink)/14 py-[1px]"
              >
                <span
                  className="grid min-w-0 leading-[1.15]"
                  title={`${fr.personalBoard.workRank(index + 1, name)} · ${work.regionName}`}
                >
                  <b className="text-[12px] font-semibold">
                    {fr.personalBoard.workRank(index + 1, name)}
                  </b>
                  <small className="min-w-0 font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
                    {work.regionName}
                    {(running
                      ? (frozen ? fr.personalBoard.frozenTail : fr.personalBoard.runningTail)(
                          countdownLabel(left * 60_000),
                        )
                      : fr.personalBoard.queuedTail(countdownLabel(total * 60_000))
                    )
                      .split(' · ')
                      .slice(1)
                      .map((part) => (
                        <Fragment key={part}>
                          {' '}
                          <span className="whitespace-nowrap">· {part}</span>
                        </Fragment>
                      ))}
                  </small>
                </span>
                {cancelWorkRefusalOf({ started: running }) !== null ? (
                  <WorkBar total={total} left={left} className="w-[52px]" />
                ) : (
                  !observing && (
                    <button
                      type="button"
                      title={fr.economy.queueCancelTitle}
                      aria-label={fr.personalBoard.cancelWork(name)}
                      onClick={() => cancel(work.id)}
                      className={`cursor-pointer border border-[var(--ink)] px-[6px] py-[2px] text-[10px] font-semibold tracking-[.06em] uppercase hover:border-[var(--critical)] hover:text-[var(--critical)] ${narrow ? FINGER : ''}`}
                    >
                      {fr.economy.queueCancel}
                    </button>
                  )
                )}
              </li>
            ))}
          </ol>
        )}
        {error !== null && <p className="text-[11px] text-[var(--critical)]">{error}</p>}
        {!narrow && note}
      </div>
      {narrow && view.me.hqLevel > 0 && (
        <small className="text-[11px] text-[var(--ink-soft)]">
          {fr.personalBoard.hqSpeed(fr.common.levelSpeed(view.me.hqLevel))}
        </small>
      )}
      {narrow && note}
    </section>
  );
}

function ReservesColumn({
  view,
  now,
  narrow,
}: Pick<ColumnsProps, 'view' | 'now'> & { narrow: boolean }) {
  return (
    <section
      data-volet-column="reserves"
      className={narrow ? 'grid content-start px-4 py-[4px]' : `${DESK_COLUMN} gap-0`}
    >
      {RESOURCES.map((resource) => (
        <ReserveLine key={resource} resource={resource} view={view} now={now} />
      ))}
    </section>
  );
}

function HeapsColumn({
  view,
  now,
  ledger,
  onReplay,
  narrow,
}: Pick<ColumnsProps, 'view' | 'now' | 'ledger' | 'onReplay'> & { narrow: boolean }) {
  return (
    <section data-volet-column="heaps" className={`mat-line ${narrow ? TAB_COLUMN : DESK_COLUMN}`}>
      <HeapBoardNotes view={view} now={now} />
      <HarvestLines ledger={ledger} onReplay={onReplay} />
    </section>
  );
}

function LotsColumn({
  view,
  seat,
  now,
  observing,
  narrow,
}: Pick<ColumnsProps, 'view' | 'seat' | 'now' | 'observing'> & { narrow: boolean }) {
  return (
    <section
      data-volet-column="lots"
      className={`mat-line ${narrow ? TAB_COLUMN : DESK_COLUMN} [&>div]:px-0`}
    >
      <span className="eyebrow">{fr.personalBoard.lotsHeader}</span>
      {commandedChains(view).length === 0 ? (
        <p className="text-[11.5px] text-[var(--ink-soft)]">{fr.personalBoard.noLots}</p>
      ) : (
        <Lots view={view} seat={seat} now={now} observing={observing} />
      )}
    </section>
  );
}

/**
 * **Le volet du bureau** (#580, finaliste) : au-dessus de la barre, quatre colonnes — la file
 * entière des chantiers, chaque « annuler » visible ; les stocks en lignes, plafond compris ; ce qui
 * arrive, ce qui déborde et la récolte ; les lots. Chaque colonne défile seule.
 */
export function Volet(props: ColumnsProps) {
  return (
    <div className="grid min-h-0 grid-cols-[372fr_310fr_190fr_240fr] border-l border-[var(--ink)]">
      <WorksColumn {...props} narrow={false} />
      <ReservesColumn {...props} narrow={false} />
      <HeapsColumn {...props} narrow={false} />
      <LotsColumn {...props} narrow={false} />
    </div>
  );
}

export type StageTab = 'works' | 'reserves' | 'heaps' | 'lots';
const TABS: readonly StageTab[] = ['works', 'reserves', 'heaps', 'lots'];

/**
 * **Les onglets de l'étage des tuiles** (#590), sous les tuiles, à la moitié et au plein : les
 * mêmes colonnes que le volet du bureau, une à la fois. Le cran fixe la hauteur ; le corps de
 * l'onglet défile. Monté à l'ouverture de la feuille, il y fait entrer les huit premières lignes de
 * l'onglet visible ; changer d'onglet est un fondu de 120 ms, sans cascade.
 */
export function StageTabs({
  tab,
  onTab,
  ...props
}: ColumnsProps & { tab: StageTab; onTab: (tab: StageTab) => void }) {
  const motion = useMapMotion();
  const panel = useRef<HTMLDivElement>(null);
  const [switched, setSwitched] = useState(false);
  useEffect(() => {
    if (motion === 'full' && panel.current !== null)
      enter([...panel.current.querySelectorAll('.mat-line')]);
    // Once, when the sheet opens: the motion setting is read as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = (next: StageTab) => {
    if (next === tab) return;
    setSwitched(true);
    onTab(next);
  };
  const fade = switched && motion !== 'off' ? 'tab-fade' : '';
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--ink)]">
      <div role="tablist" className="grid h-[calc(44px/var(--hud-scale))] shrink-0 grid-cols-4">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`stage-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="stage-tabpanel"
            onClick={() => pick(id)}
            className={`flex ${FINGER} cursor-pointer items-center justify-center border-b-[3px] text-[10.5px] tracking-[.14em] uppercase ${
              tab === id
                ? 'border-[var(--ink)] font-bold text-[var(--ink)]'
                : 'border-transparent font-semibold text-[var(--ink-soft)]'
            }`}
          >
            {fr.personalBoard.tabs[id]}
          </button>
        ))}
      </div>
      <div
        key={tab}
        ref={panel}
        role="tabpanel"
        id="stage-tabpanel"
        aria-labelledby={`stage-tab-${tab}`}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${fade}`}
      >
        {tab === 'works' && <WorksColumn {...props} narrow />}
        {tab === 'reserves' && <ReservesColumn {...props} narrow />}
        {tab === 'heaps' && <HeapsColumn {...props} narrow />}
        {tab === 'lots' && <LotsColumn {...props} narrow />}
      </div>
    </div>
  );
}
