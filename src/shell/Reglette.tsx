import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { isOutpostWork } from '@/domain/ids';
import { slotCardsOf } from '@/domain/research';
import { halifaxNoteOf } from '@/domain/movement-orders';
import { HalifaxMark } from './HalifaxMark';
import { currentStock, workMinutesLeft, type PlayerView } from '@/domain/player-view';
import { displayedStock } from '@/domain/reserve-counter';
import { useMapMotion } from '@/data/mapMotion';
import { asClockTime, asDuration } from '@/domain/duration';
import { FlagWatermark } from '@/emblems/Flag';
import { BuildingPlate } from '@/emblems/Plate';
import { withWindow, type BoardSearch } from '@/routes/-plateau/board-search';
import { Odometer, ReserveTag, useAnnouncedStock } from './ReserveCell';
import { Stamp } from './Stamp';
import { UnderwayDrawer } from './UnderwayDrawer';
import { underwayLeftMs, type Underway } from '@/domain/underway';
import { SurfaceTabs } from './SurfaceColumn';
import { useClock } from './clock';
import { FaceIcon } from './UnderwayFace';
import { RaceMarks } from './RaceMarks';
import { raceMarkOf, type RaceMarkReading } from '@/domain/race-mark';

/**
 * **La réglette** (table plein écran, décision de Pierre du 13/10) : une bande de papier posée en
 * haut de la carte, avec sa marge et son ombre, à la place du bandeau sombre et de la ligne des
 * ressources. Qui je suis, ce qui se bâtit, les mouvements libres, la prochaine édition, et à droite
 * le journal, la presse et le télégraphe (`SurfaceTabs`, 20/10). **Les réserves en sont parties aussi** (#179) :
 * elles vivent dans la ligne repliée du plateau personnel (`ReserveCell`), qui porte l'alerte
 * « à sec » ; la réglette garde les fonds de la Blitz.
 */
export function Reglette({
  view,
  telegraphUnread,
  underway = [],
  onLocate = () => {},
  covered = false,
  ref,
}: {
  view: PlayerView;
  telegraphUnread: number;
  /** **Les échéances en cours**, que le compteur de slots ouvre en volet (#615). */
  underway?: ReadonlyArray<Underway>;
  onLocate?: (line: Underway) => void;
  /** Une fiche, une fenêtre ou une pile en main est ouverte : le volet cède la place. */
  covered?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  const { me } = view;
  const search = useSearch({ strict: false }) as BoardSearch;
  const now = useClock();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const slotsCell = useRef<HTMLDivElement>(null);
  const showDrawer = drawerOpen && !covered && view.mode !== 'blitz';
  useEffect(() => {
    if (covered) setDrawerOpen(false);
  }, [covered]);
  useEffect(() => {
    if (!showDrawer) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false);
    const onPointer = (event: PointerEvent) => {
      if (!slotsCell.current?.contains(event.target as Node)) setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [showDrawer]);
  const next = underway[0];

  return (
    <header
      ref={ref}
      // Le volet ouvert passe au-dessus de « À faire maintenant », de la même bande et posé après.
      className={`hud paper-grain float absolute top-[calc(var(--table-margin)/var(--hud-scale))] right-[calc(var(--table-margin)/var(--hud-scale))] left-[calc(var(--table-margin)/var(--hud-scale))] ${showDrawer ? 'z-[var(--z-menu)]' : 'z-[var(--z-band)]'} flex items-stretch border border-[var(--ink)] text-[var(--ink)]`}
      style={{ fontFamily: 'var(--font-body)', height: RULE_HEIGHT }}
    >
      {/* Le drapeau en fondu, comme au bandeau sombre (Pierre, 13/10) : il touche le bord de la
          réglette et le nom commence là où il s'éteint. */}
      <div
        className={`${CELL} relative gap-[10px] overflow-hidden`}
        style={{ paddingLeft: WATERMARK_WIDTH * 0.9 + AIR_AFTER_WATERMARK }}
      >
        <Link
          to="/plateau"
          search={withWindow(search, 'nation')}
          title={fr.banner.nationSheet(nationLabel(me.nation))}
          aria-label={fr.banner.nationSheet(nationLabel(me.nation))}
          className="absolute inset-y-0 left-0"
          style={{ width: WATERMARK_WIDTH }}
        >
          <FlagWatermark nation={me.nation} opacity={0.85} onPaper />
        </Link>
        <div className="relative grid gap-[2px]">
          {/* L'enseigne ramène à l'accueil (05/10) : sans elle, le plateau ne se quittait que par
              la déconnexion. */}
          <span className="flex items-baseline gap-[8px]">
            <Link
              to="/accueil"
              title={fr.banner.home}
              aria-label={fr.banner.home}
              className="font-(family-name:--font-display) text-[10px] leading-none text-[var(--ink-soft)] italic hover:underline"
            >
              {fr.masthead.article} {fr.masthead.word}
            </Link>
            <SeasonMark season={view.season} loadedAt={view.loadedAt} />
          </span>
          <Link
            to="/plateau"
            search={withWindow(search, 'nation')}
            title={fr.banner.nationSheet(nationLabel(me.nation))}
            className="font-(family-name:--font-display) text-[22px] leading-none font-bold tracking-[.01em] whitespace-nowrap uppercase"
          >
            {nationLabel(me.nation)}
          </Link>
        </div>
        {me.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
      </div>

      {me.construction !== null && <SiteCell view={view} now={now} />}

      {view.mode === 'blitz' && (
        <div className={`${CELL} whitespace-nowrap`}>
          <BlitzClock view={view} now={now} openEnding={search} />
        </div>
      )}

      {/* Pas de slots en Blitz (B5) : la cadence est le rechargement. */}
      {view.mode !== 'blitz' && (
        <div ref={slotsCell} className="relative flex shrink-0">
          <button
            type="button"
            aria-expanded={showDrawer}
            aria-controls={showDrawer ? drawerId : undefined}
            title={fr.banner.slotsTitle(
              me.slots.used,
              me.slots.total,
              slotCardsOf(me.research.researched),
              halifaxNoteOf(me.slots),
            )}
            onClick={() => setDrawerOpen(!showDrawer)}
            className={`${CELL} cursor-pointer gap-[9px] whitespace-nowrap hover:bg-[var(--paper-clair)] ${showDrawer ? 'bg-[var(--paper-pile)]' : ''}`}
          >
            <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase max-[1500px]:hidden">
              {fr.resourceBand.slots}
            </span>
            <span className="max-[1350px]:hidden">
              <SlotBoxes used={me.slots.used} total={me.slots.total} />
            </span>
            <span className="font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums">
              {fr.banner.slotsCount(me.slots.used, me.slots.total)}
            </span>
            <HalifaxMark slots={me.slots} />
            {next !== undefined && (
              <span
                title={next.label}
                className="flex items-center gap-[6px] border-l border-(color:--ink)/32 pl-[10px] font-(family-name:--font-mono) text-[13px] leading-none font-medium text-[var(--notable-paper)] tabular-nums"
              >
                <span aria-hidden className="flex w-[26px] justify-center">
                  <FaceIcon face={next.face} nation={me.nation} />
                </span>
                {asDuration(underwayLeftMs(next, now) / 60_000)}
              </span>
            )}
          </button>
          {showDrawer && (
            <UnderwayDrawer
              id={drawerId}
              lines={underway}
              nation={me.nation}
              slots={me.slots}
              onLocate={onLocate}
              onClose={() => setDrawerOpen(false)}
            />
          )}
        </div>
      )}

      <RaceCell reading={raceMarkOf(view, now)} search={search} />

      <div className="ml-auto flex min-w-0 items-center gap-[18px] px-[16px]">
        {me.funds !== null && <FundsCell funds={me.funds} loadedAt={view.loadedAt} now={now} />}
        <EditionMark view={view} />
      </div>
      <SurfaceTabs view={view} telegraphUnread={telegraphUnread} />
    </header>
  );
}

const CELL =
  'flex shrink-0 items-center border-r border-(color:--ink)/20 px-[13px] max-[1500px]:px-[9px] max-[1350px]:px-[6px]';

const RULE_HEIGHT = 48;
/** The watermark's box is the flag's own 3:2 at the rule's height: never a distorted flag. */
const WATERMARK_WIDTH = RULE_HEIGHT * 1.5;
/** The fade's tail runs a little past its computed end; a letter on it would read over two
 *  grounds. Counted in pixels: it makes up for the mask's falloff, not a proportion. */
const AIR_AFTER_WATERMARK = 6;

/**
 * **La course aux Sept** (#670) : sept marques à l'encre de leur teneur, le compte du joueur
 * (« 2 / 4 ») et, quand la course court, sa phrase — la cellule passe alors en alerte (en ocre
 * quand c'est le joueur qui mène). Un clic ouvre la Presse, où la course se lit repliée. Trois
 * replis : le compte seul sous 1350 px ; « victoire dans X » dès 1350 ; « LES SEPT » dès 1440 ;
 * la nation dès 1500 (elle reste au `title`). Elle rétrécit avant de pousser les onglets.
 */
function RaceCell({ reading, search }: { reading: RaceMarkReading | null; search: BoardSearch }) {
  if (reading === null) return null;
  const { phrase } = reading;
  const mine = fr.points.race.mine(reading.mine);
  const said = phrase === null ? null : fr.points.race.phrase(phrase.who, phrase.left);
  const alert =
    phrase === null ? '' : phrase.you ? 'text-[var(--notable-paper)]' : 'text-[var(--critical)]';
  const tint =
    phrase === null
      ? ''
      : `bg-[color-mix(in_srgb,var(${phrase.you ? '--notable' : '--critical'})_9%,transparent)]`;
  return (
    <Link
      to="/plateau"
      search={withWindow(search, 'press')}
      title={fr.points.race.cellTitle(mine, said)}
      className={`${CELL.replace('shrink-0', 'min-w-0 overflow-hidden')} cursor-pointer gap-[9px] whitespace-nowrap hover:bg-[var(--paper-clair)] ${tint}`}
    >
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase max-[1439px]:hidden">
        {fr.points.race.cell}
      </span>
      <span className="shrink-0">
        <RaceMarks marks={reading.marks} size={11} />
      </span>
      <span
        className={`shrink-0 font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums ${alert}`}
      >
        {mine}
      </span>
      {phrase !== null && (
        <span
          className={`truncate font-(family-name:--font-mono) text-[13px] leading-none font-semibold tabular-nums max-[1349px]:hidden ${alert}`}
        >
          <span className="max-[1499px]:hidden">{phrase.who} · </span>
          {fr.points.race.within(phrase.left)}
        </span>
      )}
    </Link>
  );
}

/** **La prochaine édition de la presse**, en heure ronde : ce qui bat la saison, d'un coup d'œil.
 *  Rien sur une édition finale ou avant la première. */
export function EditionMark({ view }: { view: PlayerView }) {
  const next = view.press?.next ?? null;
  if (next === null) return null;
  return (
    <span
      title={fr.press.next(asClockTime(next))}
      className="flex shrink-0 items-baseline gap-[5px] border-l border-(color:--ink)/25 pl-[10px] whitespace-nowrap"
    >
      <em className="font-(family-name:--font-display) text-[12px] text-[var(--ink-soft)]">
        {fr.banner.edition}
      </em>
      <b className="font-(family-name:--font-mono) text-[12px] font-semibold tabular-nums">
        {asClockTime(next)}
      </b>
    </span>
  );
}

/** Une case par slot, pleine quand il est engagé — au-delà de huit, le compte seul : une rangée
 *  de cases qu'on dénombre ne se lit plus d'un coup d'œil. */
export function SlotBoxes({ used, total }: { used: number; total: number }) {
  if (total > 8) return null;
  return (
    <span aria-hidden className="flex gap-[3px]">
      {Array.from({ length: total }, (_, rank) => (
        <i
          key={rank}
          className={`block h-[11px] w-[11px] border border-[var(--ink)] ${rank < used ? 'bg-[var(--ink)]' : ''}`}
        />
      ))}
    </span>
  );
}

/** Le chantier et son compte à rebours, jamais une barre : la vue ne sert que les minutes
 *  restantes, une fraction remplie serait inventée. */
function SiteCell({ view, now }: { view: PlayerView; now: number }) {
  const site = view.me.construction;
  if (site === null) return null;
  return (
    <div
      className={`${CELL} gap-[9px] whitespace-nowrap`}
      title={fr.banner.siteTitle(site.name, site.regionName)}
    >
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase max-[1500px]:hidden">
        {fr.banner.site}
      </span>
      {!isOutpostWork(site.key) && <BuildingPlate building={site.key} height={20} />}
      <span className="max-w-[80px] truncate text-[12px] font-semibold max-[1350px]:hidden">
        {site.name}
      </span>
      <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
        {asDuration(workMinutesLeft(site, view.loadedAt, now))}
      </span>
    </div>
  );
}

/**
 * **Le compte à rebours de la Blitz** (B11) : à zéro, le plus gros revenu gagne. Il se lit à la
 * seconde parce que la soirée se joue à la minute ; conclue, la case le dit en un mot.
 */
export function BlitzClock({
  view,
  now,
  openEnding,
}: {
  view: PlayerView;
  now: number;
  /** La recherche courante du plateau : donnée, la case ouvre l'édition finale au clic. */
  openEnding?: BoardSearch;
}) {
  const { season } = view;
  const ended = season.outcome.concludedAt !== null;
  const out = !ended && view.me.eliminatedAt !== null;
  const minutesLeft = Math.max(
    0,
    ((season.durationHours ?? 0) - season.elapsedHours) * 60 - (now - view.loadedAt) / 60_000,
  );
  const clock = (
    <span
      role="timer"
      aria-label={ended ? fr.blitz.clockEnded : fr.blitz.clockLabel(asDuration(minutesLeft))}
      className="flex items-baseline gap-[8px]"
    >
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.blitz.clock}
      </span>
      <span className="font-(family-name:--font-mono) text-[15px] leading-none font-medium tabular-nums">
        {ended ? fr.blitz.clockEnded : out ? fr.blitz.clockOut : asDuration(minutesLeft)}
      </span>
    </span>
  );
  return openEnding !== undefined && (ended || out) ? (
    <Link to="/plateau" search={withWindow(openEnding, 'press')} className="hover:underline">
      {clock}
    </Link>
  ) : (
    clock
  );
}

/**
 * **Les fonds de la Blitz, seuls sur la réglette** (lot 4) : aucune des huit réserves n'y paraît.
 * Le chiffre s'annonce comme celui d'une réserve (`useAnnouncedStock`) — un fonds est une réserve
 * sans plafond —, et le débit par minute se lit à côté : c'est lui que la capture d'une ville
 * fait monter.
 */
export function FundsCell({
  funds,
  loadedAt,
  now,
  stacked = false,
}: {
  funds: { readonly stock: number; readonly perMinute: number };
  loadedAt: number;
  now: number;
  stacked?: boolean;
}) {
  const reserve = useMemo(
    () => ({ stock: funds.stock, ratePerHour: funds.perMinute * 60, cap: Infinity }),
    [funds.stock, funds.perMinute],
  );
  const stock = currentStock(reserve, loadedAt, now);
  const motion = useMapMotion();
  const still = motion === 'off';
  const { shown, tag, clearTag } = useAnnouncedStock(reserve, loadedAt, still);
  return (
    <span
      role="status"
      aria-label={fr.blitz.fundsLabel(stock, funds.perMinute)}
      className={`flex items-baseline whitespace-nowrap ${stacked ? 'gap-[8px]' : 'gap-[10px]'}`}
    >
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.blitz.funds}
      </span>
      <span
        aria-hidden
        className="relative inline-flex font-(family-name:--font-mono) text-[17px] leading-none font-medium tabular-nums"
      >
        <Odometer
          value={still ? stock : displayedStock(shown, stock)}
          roll={motion === 'full' && !still}
        />
        {tag !== null && (
          <ReserveTag
            gain={tag.gain}
            alarm={false}
            quiet={motion === 'reduced'}
            spot={{ left: '50%', bottom: 'calc(100% + 7px)', transform: 'translateX(-50%)' }}
            onDone={clearTag}
            key={tag.id}
          />
        )}
      </span>
      <span
        aria-hidden
        className="font-(family-name:--font-mono) text-[11.5px] leading-none text-[var(--ink-soft)]"
      >
        {fr.blitz.perMinute(funds.perMinute)}
      </span>
    </span>
  );
}

/** La saison et sa fin, contre l'enseigne, comme elle l'était au pied du rail : un repère, pas une entrée. */
function SeasonMark({ season, loadedAt }: { season: PlayerView['season']; loadedAt: number }) {
  const now = useClock(60_000);
  /** `null` = sans horloge : rien à décompter, et la réglette le dit en un mot plutôt que
   *  d'afficher un « 0 h 00 » qui se lirait comme une fin imminente (ADR 0017). */
  const minutesLeft =
    season.durationHours === null
      ? null
      : Math.max(0, (season.durationHours - season.elapsedHours) * 60 - (now - loadedAt) / 60_000);
  return (
    <span
      title={
        minutesLeft === null
          ? fr.rail.seasonNoClock(season.number)
          : fr.rail.seasonEnd(
              season.number,
              Math.floor(minutesLeft / 60),
              String(Math.floor(minutesLeft % 60)).padStart(2, '0'),
            )
      }
      className="font-(family-name:--font-mono) text-[8.5px] leading-none text-[var(--ink-soft)]"
    >
      {fr.rail.seasonShort(season.number)}
    </span>
  );
}
