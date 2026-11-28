import { useMemo, type CSSProperties, type Ref } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { HalifaxMark } from './HalifaxMark';
import { currentStock, type PlayerView } from '@/domain/player-view';
import { displayedStock } from '@/domain/reserve-counter';
import { useMapMotion } from '@/data/mapMotion';
import { asClockTime, asDuration } from '@/domain/duration';
import { Flag, FlagWatermark } from '@/emblems/Flag';
import { withWindow, type BoardSearch } from '@/routes/-plateau/board-search';
import { Odometer, ReserveTag, useAnnouncedStock } from './ReserveCell';
import { Stamp } from './Stamp';
import type { Underway } from '@/domain/underway';
import { SurfaceTabs } from './SurfaceColumn';
import { useClock } from './clock';
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
  ref,
}: {
  view: PlayerView;
  telegraphUnread: number;
  /** Les lignes « en cours » et la fiche ouverte n'y sont plus lues : voir `MarchSheet`. */
  underway?: ReadonlyArray<Underway>;
  onLocate?: (line: Underway) => void;
  covered?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  const { me } = view;
  const search = useSearch({ strict: false }) as BoardSearch;
  const now = useClock();

  return (
    <header
      ref={ref}
      // Collée au haut, à gauche et à droite : un filet d'encre en bas, ni marge de table ni ombre.
      className="hud absolute inset-x-0 top-0 z-[var(--z-band)] text-[var(--ink)]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <div
        className="paper-grain relative flex items-stretch border-b border-[var(--ink)]"
        style={{ height: RULE_HEIGHT }}
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

        {view.mode === 'blitz' && (
          <div className={`${CELL} whitespace-nowrap`}>
            <BlitzClock view={view} now={now} openEnding={search} />
          </div>
        )}

        {/* Pas de slots en Blitz (B5) : la cadence est le rechargement. Une lecture : la feuille du
          tableau de marche dit les mouvements un à un et le refus quand tous les slots sont pris. */}
        {view.mode !== 'blitz' && (
          <div className={`${CELL} gap-[9px] whitespace-nowrap`}>
            <span className={LABEL}>{fr.resourceBand.slots}</span>
            <SlotBoxes used={me.slots.used} total={me.slots.total} tinted />
            <span className="font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums">
              {fr.banner.slotsCount(me.slots.used, me.slots.total)}
            </span>
            <HalifaxMark slots={me.slots} />
          </div>
        )}

        <RaceCell reading={raceMarkOf(view, now)} search={search} />

        {/* Sans fonds ni édition, la marge vide ne vole pas ses 32 px aux onglets. */}
        {me.funds !== null || view.press?.next != null ? (
          <div className="ml-auto flex min-w-0 items-center gap-[18px] px-[16px]">
            {me.funds !== null && <FundsCell funds={me.funds} loadedAt={view.loadedAt} now={now} />}
            <EditionMark view={view} />
          </div>
        ) : (
          <span className="ml-auto" />
        )}
        <SurfaceTabs view={view} telegraphUnread={telegraphUnread} />
      </div>
    </header>
  );
}

const CELL =
  'flex shrink-0 items-center border-r border-(color:--ink)/20 px-[13px] max-[1500px]:px-[9px] max-[1350px]:px-[6px]';

/** Le nom d'une cellule : 9,2 px, soit 11 px à l'écran à l'échelle de départ (1,2). Il ne disparaît
 *  plus avec la largeur : c'est la cellule qui se serre. */
const LABEL =
  'text-[9.2px] leading-none font-semibold tracking-[.14em] text-[var(--ink-soft)] uppercase';

const RULE_HEIGHT = 48;
/** The watermark's box is the flag's own 3:2 at the rule's height: never a distorted flag. */
const WATERMARK_WIDTH = RULE_HEIGHT * 1.5;
/** The fade's tail runs a little past its computed end; a letter on it would read over two
 *  grounds. Counted in pixels: it makes up for the mask's falloff, not a proportion. */
const AIR_AFTER_WATERMARK = 6;

/**
 * **La course aux Sept** (#670) : sept marques à l'encre de leur teneur, le compte du joueur
 * (« 2 / 4 ») et, quand la course court, son compte à rebours — la cellule passe alors en alerte
 * (en ocre quand c'est le joueur qui mène). Un clic ouvre la Presse, où la course se lit repliée.
 *
 * **Elle prend la place libre entre les slots et les onglets et choisit son niveau par sa propre
 * largeur** (requête de conteneur, comme `JournalWindow`) : elle retire, dans cet ordre, la nation,
 * « LES SEPT », puis « victoire dans ». Les marques, le compte et le compte à rebours ne se coupent
 * jamais ; le drapeau du meneur tient la place de sa nation (rien pour un meneur sans nation).
 * @a-mesurer : les seuils (385, 435, 555 px) sont les largeurs du pire texte de chaque niveau,
 * mesurées au navigateur (sept marques ; px du conteneur, la réglette étant zoomée de 1,2) : le compte
 * à rebours seul 256 (275 avec le drapeau), + « victoire dans » 107 (363, 382), + « LES SEPT » 52
 * (415, 434), + la nation à la place du drapeau (≈ 132 pour la plus longue : 554).
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
  const flagged = phrase?.nation != null;
  return (
    <Link
      to="/plateau"
      search={withWindow(search, 'press')}
      title={fr.points.race.cellTitle(mine, said)}
      style={floorStyle(RACE_CELL_FLOOR(phrase !== null, flagged))}
      className="@container flex min-w-[var(--floor-compact)] flex-1 min-[1350px]:min-w-[var(--floor)] cursor-pointer items-stretch overflow-hidden border-r border-(color:--ink)/20 hover:bg-[var(--paper-clair)]"
    >
      <span
        className={`flex shrink-0 items-center gap-[5px] px-[4px] whitespace-nowrap min-[1350px]:gap-[9px] min-[1350px]:px-[13px] ${tint}`}
      >
        <span className={`hidden ${LABEL} @[435px]:inline`}>{fr.points.race.cell}</span>
        <span className="[--mark:9px] min-[1350px]:[--mark:11px]">
          <RaceMarks marks={reading.marks} size="var(--mark)" />
        </span>
        <span
          className={`font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums ${alert}`}
        >
          {mine}
        </span>
        {phrase !== null && (
          <span
            className={`flex items-center gap-[7px] font-(family-name:--font-mono) text-[13px] leading-none font-semibold tabular-nums ${alert}`}
          >
            {flagged && (
              <span className="@[555px]:hidden">
                <Flag nation={phrase.nation!} width={16} onPaper />
              </span>
            )}
            <span className="hidden @[555px]:inline">{phrase.who} · </span>
            <span className="hidden @[385px]:inline">{fr.points.race.within('')}</span>
            {phrase.left}
          </span>
        )}
      </span>
    </Link>
  );
}

/** Le plancher de la cellule, en deux largeurs : sous 1350 px les marques, les marges et les écarts
 *  sont resserrés (32 px de moins). */
const floorStyle = (floor: number) =>
  ({ '--floor': `${floor}px`, '--floor-compact': `${floor - 32}px` }) as CSSProperties;

/** Ce que la cellule ne rend jamais plus étroit : les marques et le compte, puis le compte à
 *  rebours, et le drapeau d'un autre meneur. @a-mesurer */
const RACE_CELL_FLOOR = (running: boolean, flagged: boolean): number =>
  160 + (running ? 96 : 0) + (flagged ? 19 : 0);

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
export function SlotBoxes({
  used,
  total,
  tinted = false,
}: {
  used: number;
  total: number;
  /** Le bureau : un slot pris porte l'ambre de ses fils (`--arc-mine`) ; le téléphone reste à l'encre. */
  tinted?: boolean;
}) {
  if (total > 8) return null;
  return (
    <span aria-hidden className="flex gap-[3px]">
      {Array.from({ length: total }, (_, rank) => (
        <i
          key={rank}
          className={`block h-[11px] w-[11px] border border-[var(--ink)] ${rank < used ? (tinted ? 'bg-[var(--arc-mine)]' : 'bg-[var(--ink)]') : ''}`}
        />
      ))}
    </span>
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
      <span className={LABEL}>{fr.blitz.clock}</span>
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
      <span className={LABEL}>{fr.blitz.funds}</span>
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
