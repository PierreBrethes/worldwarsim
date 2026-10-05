import { useState, type ReactNode, type Ref } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import { asShortDuration } from '@/domain/duration';
import { currentMinutes, type PlayerView } from '@/domain/player-view';
import { nextActionsOf } from '@/domain/next-actions';
import {
  toggleWindow,
  windowOpen,
  type BoardSearch,
  type BoardWindow,
} from '@/routes/-plateau/board-search';
import { BottomSheet } from './BottomSheet';
import { PressGlyph, TelegraphGlyph } from './Glyph';
import { IndustryGlyph, Pictogram } from './IndicatorGlyph';
import { useClock } from './clock';

/**
 * **La barre de pied, sous 768 px** (refonte mobile du 04/10, 1a) : elle remplace le rail. Cinq
 * entrées — chantiers, journal, « à faire » au centre et en relief, presse, télégraphe. « Plus »
 * est parti : ce qu'on cherche à froid s'ouvre au drapeau du bandeau, et les chantiers, qu'on
 * ouvre souvent, sont sortis de son étage.
 *
 * **Rien n'y est recalculé** : le compte de « à faire » est celui des lignes de la carte du bureau
 * (`nextActionsOf`, une par sorte d'attente), celui du journal le non-lu du bandeau, celui du télégraphe le badge du rail,
 * le rang celui de la dernière édition et l'heure du chantier celle de la vue.
 *
 * Ce qu'elle ouvre est **la seule surface ouverte** : une fenêtre recouverte se ferme d'elle-même
 * (`Window.tsx`), et la feuille « à faire » réclame la place en montant (`sole-surface.tsx`).
 */
export function FootBar({
  view,
  telegraphUnread,
  todo,
  ref,
}: {
  view: PlayerView;
  telegraphUnread: number;
  todo: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  const search = useSearch({ strict: false }) as BoardSearch;
  const now = useClock();
  const [todoOpen, setTodoOpen] = useState(false);
  const waiting = nextActionsOf(view).length;
  const unread = view.journal.filter((dispatch) => dispatch.unread).length;
  const rank = view.press?.mine?.rank ?? null;
  const work = view.me.construction;

  const entry = (name: BoardWindow, icon: ReactNode, label: string, corner: ReactNode) => (
    <li className="flex">
      <Link
        to="/plateau"
        search={toggleWindow(search, name)}
        className={`${CELL} ${windowOpen(search, name) ? ACTIVE : 'border-transparent'}`}
      >
        {icon}
        <span className={LABEL}>{label}</span>
        {corner}
      </Link>
    </li>
  );

  return (
    <nav
      ref={ref}
      className="hud board-foot paper-grain relative z-[var(--z-band)] shrink-0 border-t-2 border-[var(--ink)] text-[var(--ink)]"
    >
      <ul className="grid grid-cols-[1fr_1fr_1.08fr_1fr_1fr]">
        {entry(
          'economy',
          <IndustryGlyph size={22} />,
          fr.foot.works,
          work !== null && (
            <Corner>{asShortDuration(currentMinutes(work.minutesLeft, view.loadedAt, now))}</Corner>
          ),
        )}
        {entry(
          'journal',
          <Pictogram pictogram="journal" weight={40} size={22} />,
          fr.foot.journal,
          unread > 0 && <Count value={unread} tone="critical" />,
        )}
        <li className="flex">
          <button
            type="button"
            aria-pressed={todoOpen}
            onClick={() => setTodoOpen((open) => !open)}
            className={`-mt-[12px] flex w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 border-2 border-b-0 border-[var(--ink)] text-[var(--paper)] ${
              todoOpen ? 'bg-[var(--interaction)]' : 'bg-[var(--ink)]'
            }`}
          >
            {waiting > 0 && (
              <span className="font-(family-name:--font-mono) text-[21px] leading-none font-medium">
                {waiting}
              </span>
            )}
            <span className="text-[10px] leading-none font-bold tracking-[.12em] uppercase">
              {fr.foot.todo}
            </span>
          </button>
        </li>
        {entry(
          'press',
          <PressGlyph size={22} />,
          fr.foot.press,
          rank !== null && <Corner>{fr.press.ordinal(rank)}</Corner>,
        )}
        {entry(
          'telegraph',
          <TelegraphGlyph size={22} />,
          fr.foot.telegraph,
          telegraphUnread > 0 && <Count value={telegraphUnread} tone="ink" />,
        )}
      </ul>

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

const CELL =
  'relative -mt-[2px] flex w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 border-t-[3px] px-[2px] text-center';

const ACTIVE = 'border-[var(--ink)] bg-(--ink)/12';

const LABEL = 'text-[10px] leading-none font-semibold tracking-[.08em] uppercase';

/** Ce qui se lit dans le coin d'une entrée sans être un compte : l'heure du chantier, le rang. */
function Corner({ children }: { children: ReactNode }) {
  return (
    <span className="absolute top-[6px] left-1/2 ml-[12px] font-(family-name:--font-mono) text-[9.5px] leading-none text-[var(--ink-soft)]">
      {children}
    </span>
  );
}

/** **Un carré, pas une pastille** : le pied est composé, pas notifié. Le journal le porte à
 *  l'encre critique — une dépêche peut dire une attaque — et le télégraphe à l'encre. */
function Count({ value, tone }: { value: number; tone: 'critical' | 'ink' }) {
  return (
    <span
      className={`absolute top-[5px] left-1/2 ml-[9px] h-[16px] min-w-[16px] px-[3px] text-center font-(family-name:--font-mono) text-[10px] leading-[16px] font-medium text-[var(--paper)] ${
        tone === 'critical' ? 'bg-[var(--critical)]' : 'bg-[var(--ink)]'
      }`}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
