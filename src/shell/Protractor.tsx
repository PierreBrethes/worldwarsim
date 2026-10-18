import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import { asShortDuration } from '@/domain/duration';
import { currentMinutes, type PlayerView } from '@/domain/player-view';
import { nextActionsOf } from '@/domain/next-actions';
import { useMapMotion } from '@/data/mapMotion';
import {
  toggleWindow,
  windowOpen,
  type BoardSearch,
  type BoardWindow,
} from '@/routes/-plateau/board-search';
import { BottomSheet } from './BottomSheet';
import { PressGlyph, SettingsGlyph, TelegraphGlyph } from './Glyph';
import { IndustryGlyph, Pictogram } from './IndicatorGlyph';
import { useClock } from './clock';

/**
 * **Le rapporteur** (téléphone, table plein écran, décision de Pierre du 13/10) : il remplace la
 * barre de pied. Fermé, un quart de cercle d'encre dans le coin bas droit, sous le pouce, qui
 * compte ce qui attend. Ouvert, des ronds de papier posés sur l'arc — « à faire », les chantiers,
 * le journal, la presse, le télégraphe, les réglages — et **pas de fond** : la carte reste visible
 * derrière, un arc d'encre fin et sa graduation suffisent à dire l'instrument.
 *
 * **Rien n'y est recalculé** : le compte de « à faire » est celui de la carte du bureau
 * (`nextActionsOf`), celui du journal le non-lu de la colonne, celui du télégraphe son badge, le
 * rang celui de la dernière édition et l'heure du chantier celle de la vue.
 *
 * Un toucher hors des ronds, le coin, ou Échap le referment, et le focus revient au coin.
 */
export function Protractor({
  view,
  telegraphUnread,
  todo,
}: {
  view: PlayerView;
  telegraphUnread: number;
  todo: ReactNode;
}) {
  const search = useSearch({ strict: false }) as BoardSearch;
  const now = useClock();
  const motion = useMapMotion();
  const [open, setOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const hub = useRef<HTMLButtonElement>(null);
  const blitz = view.mode === 'blitz';
  const playing = view.season.outcome.concludedAt === null;
  const waiting = nextActionsOf(view).length;
  const unread = view.journal.filter((dispatch) => dispatch.unread).length;
  const rank = blitz ? null : (view.press?.mine?.rank ?? null);
  const work = view.me.construction;

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) hub.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const elsewhere = (event: PointerEvent) => {
      if (frame.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    // Caught before the windows' own Escape: one key folds the protractor, not the window under it.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      hub.current?.focus();
    };
    document.addEventListener('pointerdown', elsewhere);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', elsewhere);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const all: ReadonlyArray<{ key: string; round: (style: CSSProperties) => ReactNode }> = [
    {
      key: 'todo',
      round: (style) => (
        <button
          type="button"
          title={fr.nextActions.header}
          aria-label={fr.nextActions.header}
          onClick={() => {
            close(false);
            setTodoOpen(true);
          }}
          className={`${ROUND} bg-[var(--ink)] text-[var(--paper)]`}
          style={style}
        >
          <span className="font-(family-name:--font-display) text-[18px] leading-none font-bold">
            {waiting}
          </span>
          <span className={LABEL}>{fr.foot.todo}</span>
        </button>
      ),
    },
    windowRound(
      'personalBoard',
      fr.foot.works,
      fr.protractor.works,
      <IndustryGlyph size={18} />,
      work !== null && (
        <Corner>{asShortDuration(currentMinutes(work.minutesLeft, view.loadedAt, now))}</Corner>
      ),
    ),
    windowRound(
      'journal',
      fr.foot.journal,
      fr.foot.journal,
      <Pictogram pictogram="journal" weight={40} size={18} />,
      unread > 0 && <Count value={unread} />,
    ),
    windowRound(
      'press',
      fr.foot.press,
      fr.foot.press,
      <PressGlyph size={18} />,
      rank !== null && <Corner>{fr.press.ordinal(rank)}</Corner>,
    ),
    windowRound(
      'telegraph',
      fr.foot.telegraph,
      fr.rail.telegraph.label,
      <TelegraphGlyph size={18} />,
      telegraphUnread > 0 && <Count value={telegraphUnread} />,
    ),
    windowRound('settings', fr.rail.settings, fr.rail.settingsShort, <SettingsGlyph size={18} />),
  ];
  /** La Blitz n'a ni réserve ni chantier ni presse : son économie se lit sur la réglette, en fonds. */
  const rounds = all.filter(
    (round) =>
      view.mode !== 'blitz' || (round.key !== 'personalBoard' && (round.key !== 'press' || !playing)),
  );

  function windowRound(
    name: BoardWindow,
    title: string,
    label: string,
    icon: ReactNode,
    corner?: ReactNode,
  ) {
    return {
      key: name,
      round: (style: CSSProperties) => (
        <Link
          to="/plateau"
          search={toggleWindow(search, name)}
          title={title}
          aria-label={title}
          aria-current={windowOpen(search, name) ? 'true' : undefined}
          onClick={() => close(false)}
          className={`${ROUND} paper-grain text-[var(--ink)]`}
          style={style}
        >
          {icon}
          <span className={LABEL}>{label}</span>
          {corner}
        </Link>
      ),
    };
  }

  return (
    <nav
      ref={frame}
      aria-label={fr.protractor.label}
      data-open={open ? '' : undefined}
      data-motion={motion}
      className="hud protractor z-[var(--z-band)] text-[var(--ink)]"
    >
      <span
        aria-hidden
        className="protractor-arc border border-(color:--ink)/70"
        style={ARC(ARC_OUTER)}
      />
      <span
        aria-hidden
        className="protractor-arc border border-dashed border-(color:--ink)/45"
        style={ARC(ARC_INNER)}
      />
      <ul id={ROUNDS_ID} inert={!open} aria-hidden={!open}>
        {rounds.map(({ key, round }, rank) => {
          return <li key={key}>{round(roundAt(rank, rounds.length))}</li>;
        })}
      </ul>
      <button
        ref={hub}
        type="button"
        aria-expanded={open}
        aria-controls={ROUNDS_ID}
        aria-label={open ? fr.protractor.close : fr.protractor.open(waiting, blitz)}
        title={open ? fr.protractor.close : fr.protractor.open(waiting, blitz)}
        onClick={() => setOpen((shown) => !shown)}
        className="protractor-hub press float flex cursor-pointer flex-col items-center justify-center gap-[3px] bg-[var(--ink)] text-[var(--paper)]"
      >
        {/* Ouvert, « à faire » est un rond de l'arc : le coin ne dit plus que « fermer », jamais
            deux fois la même entrée à l'écran. */}
        <span aria-hidden className="flex flex-col items-center gap-[3px]">
          {open ? (
            <span className="font-(family-name:--font-display) text-[24px] leading-none">×</span>
          ) : (
            waiting > 0 && (
              <span className="font-(family-name:--font-display) text-[24px] leading-none font-bold">
                {waiting}
              </span>
            )
          )}
          <span className={LABEL}>{open ? fr.protractor.closeShort : fr.foot.todo}</span>
        </span>
      </button>

      {todoOpen && (
        <BottomSheet
          title={fr.nextActions.header}
          aside={
            waiting > 0 && (
              <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
                {waiting}
              </span>
            )
          }
          onClose={() => setTodoOpen(false)}
        >
          {todo}
        </BottomSheet>
      )}
    </nav>
  );
}

/** L'arc où les ronds se posent, du ras du sol (à gauche) au ras du bord (en haut). Le premier et
 *  le dernier rond restent à un demi-rond du bord, sans quoi le pouce ne les attrape qu'à moitié. */
const ROUNDS_ID = 'protractor-rounds';

const RADIUS = 205;
const FIRST_DEG = 11;
const STEP_DEG = 68 / 5;

/** Où le rond de rang `rank` se pose sur l'arc, et dans quel ordre il sort puis rentre. */
export function roundAt(rank: number, count: number): CSSProperties {
  const angle = ((FIRST_DEG + rank * STEP_DEG) * Math.PI) / 180;
  return {
    '--x': `${Math.round(RADIUS * Math.cos(angle))}px`,
    '--y': `${Math.round(RADIUS * Math.sin(angle))}px`,
    '--rank': rank,
    '--back': count - 1 - rank,
  } as CSSProperties;
}

export const ARC_OUTER = RADIUS + 34;
export const ARC_INNER = RADIUS - 34;

export const ARC = (radius: number): CSSProperties => ({
  right: -radius,
  bottom: -radius,
  width: radius * 2,
  height: radius * 2,
});

export const ROUND =
  'protractor-round press float flex h-[48px] w-[48px] cursor-pointer flex-col items-center justify-center gap-[2px] rounded-full border border-[var(--ink)]';

export const LABEL = 'text-[7px] leading-none font-semibold tracking-[.08em] uppercase';

/** Ce qui se lit dans le coin d'un rond sans être un compte : l'heure du chantier, le rang. */
function Corner({ children }: { children: ReactNode }) {
  return (
    <span className="absolute top-[3px] right-[7px] font-(family-name:--font-mono) text-[7.5px] leading-none text-[var(--ink-soft)]">
      {children}
    </span>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="absolute -top-[4px] -left-[4px] grid h-[16px] min-w-[16px] place-items-center rounded-full border border-[var(--paper)] bg-[var(--ink)] px-[3px] font-(family-name:--font-mono) text-[9px] leading-none text-[var(--paper)]">
      {value > 99 ? '99+' : value}
    </span>
  );
}
