import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import { todoCountOf } from '@/domain/next-actions';
import type { PlayerView } from '@/domain/player-view';
import {
  withoutWindow,
  withWindow,
  windowOpen,
  type BoardSearch,
  type BoardWindow,
} from '@/routes/-plateau/board-search';
import { AbacusMark } from '@/routes/-plateau/GunneryButton';
import { BottomSheet } from './BottomSheet';
import { MapGlyph, PressGlyph, ResearchGlyph, TelegraphGlyph, TodoGlyph } from './Glyph';
import { Pictogram } from './IndicatorGlyph';
import { useCloseSoleSurface, useSoleSurface } from './sole-surface';

/** Les surfaces de la colonne du bureau, que le menu du téléphone ouvre et que « carte » referme.
 *  Le plateau personnel n'y est pas : c'est la barre elle-même. */
const SURFACES: ReadonlyArray<BoardWindow> = [
  'nation',
  'research',
  'gunnery',
  'journal',
  'press',
  'telegraph',
  'settings',
];

/** La largeur de la clé, en pixels d'écran — la dernière case de la barre. */
const KEY_WIDTH = 'calc(66px / var(--hud-scale))';

/**
 * **La clé des surfaces** (#179), la dernière case de la barre basse. Posée sur la carte elle porte
 * le compte de « à faire » et ouvre le menu des surfaces ; dès qu'un menu, une feuille ou une
 * fenêtre est ouvert elle devient « carte » et les referme toutes. Elle remplace le rapporteur et son coin d'encre :
 * rien n'y est recalculé — le compte est celui de la carte du bureau (`todoCountOf`), le non-lu du
 * journal et du télégraphe ceux de la colonne.
 *
 * **Le menu est une surface comme les autres** (`useSoleSurface`) : il ferme ce qui était ouvert en
 * s'ouvrant et se ferme quand une autre feuille réclame la place ; Échap et le toucher hors du
 * menu le referment. L'ouvrir replie le plateau, que le menu aurait sinon recouvert.
 */
export function SurfaceKey({
  view,
  telegraphUnread,
  todo,
}: {
  view: PlayerView;
  telegraphUnread: number;
  /** « À faire maintenant », que le plateau seul sait mener : les lignes de la feuille. */
  todo: ReactNode;
}) {
  const search = useSearch({ strict: false }) as BoardSearch;
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const blitz = view.mode === 'blitz';
  const playing = view.season.outcome.concludedAt === null;
  const waiting = todoCountOf(view);
  const unread = view.journal.filter((dispatch) => dispatch.unread).length;
  const rank = blitz ? null : (view.press?.mine?.rank ?? null);
  const onMap = !menu && !todoOpen && !SURFACES.some((name) => windowOpen(search, name));

  useSoleSurface(() => setMenu(false), menu);
  useEffect(() => {
    if (!menu) return;
    // Caught before the windows' own Escape: one key folds the menu, not the window under it.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setMenu(false);
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [menu]);

  const closeSurface = useCloseSoleSurface();
  const go = (to: BoardSearch) => void navigate({ to: '/plateau', search: to });
  const press = () => {
    if (onMap) {
      setMenu(true);
      if (windowOpen(search, 'personalBoard')) go(withoutWindow(search, 'personalBoard'));
      return;
    }
    setMenu(false);
    setTodoOpen(false);
    // A window leaves by its own close (the journal dates its reading, the telegraph leaves its
    // channel); the address only steps in when none holds the place.
    if (!closeSurface() && SURFACES.some((name) => windowOpen(search, name)))
      go(SURFACES.reduce(withoutWindow, search));
  };

  const entry = (
    name: Exclude<BoardWindow, 'site' | 'personalBoard' | 'settings'>,
    label: string,
    title: string,
    icon: ReactNode,
    count: ReactNode = null,
  ) => (
    <li key={name}>
      <Link
        to="/plateau"
        search={withWindow(search, name)}
        title={title}
        onClick={() => setMenu(false)}
        className={`${ENTRY} paper-grain`}
      >
        {icon}
        <span className="flex-1">{label}</span>
        {count}
      </Link>
    </li>
  );
  const names = fr.footBar.menu;
  const entries = [
    <li key="todo">
      <button
        type="button"
        onClick={() => {
          setMenu(false);
          setTodoOpen(true);
        }}
        className={`${ENTRY} bg-[var(--ink)] text-[var(--paper)]`}
      >
        <TodoGlyph size={18} />
        <span className="flex-1">{names.todo}</span>
        {waiting > 0 && <Count value={waiting} />}
      </button>
    </li>,
    !blitz &&
      entry(
        'nation',
        names.nation,
        fr.rail.nation.title,
        <Pictogram pictogram="nation" weight={20} size={18} />,
      ),
    !blitz &&
      entry('research', names.research, fr.rail.research.title, <ResearchGlyph size={18} />),
    entry('gunnery', names.gunnery, fr.rail.gunnery.title, <AbacusMark size={17} />),
    entry(
      'journal',
      names.journal,
      fr.rail.journal.title,
      <Pictogram pictogram="journal" weight={20} size={18} />,
      unread > 0 && <Count value={unread} />,
    ),
    !(blitz && playing) &&
      entry(
        'press',
        names.press,
        fr.rail.press.title,
        <PressGlyph size={18} />,
        rank !== null && (
          <span className="font-(family-name:--font-mono) text-[10px] text-[var(--ink-soft)]">
            {fr.press.ordinal(rank)}
          </span>
        ),
      ),
    entry(
      'telegraph',
      names.telegraph,
      fr.rail.telegraph.title,
      <TelegraphGlyph size={18} />,
      telegraphUnread > 0 && <Count value={telegraphUnread} />,
    ),
  ];

  return (
    <>
      <button
        type="button"
        data-foot-key
        aria-expanded={menu}
        aria-label={onMap ? fr.footBar.openMenu(waiting) : fr.footBar.backToMap}
        title={onMap ? fr.footBar.openMenu(waiting) : fr.footBar.backToMap}
        onClick={press}
        className={`press relative flex shrink-0 cursor-pointer flex-col items-center justify-center gap-[3px] border-l border-[var(--ink)] ${
          onMap ? 'bg-[var(--ink)] text-[var(--paper)]' : 'paper-grain text-[var(--ink)]'
        }`}
        style={{ width: KEY_WIDTH }}
      >
        <span aria-hidden className="flex flex-col items-center gap-[3px]">
          {onMap ? (
            waiting > 0 ? (
              <>
                <TodoGlyph size={14} />
                <span className="font-(family-name:--font-display) text-[20px] leading-none font-bold">
                  {waiting}
                </span>
              </>
            ) : (
              <TodoGlyph size={20} />
            )
          ) : (
            <MapGlyph size={20} />
          )}
          <span className="text-[8px] leading-none font-semibold tracking-[.12em] uppercase">
            {onMap ? fr.foot.todo : fr.footBar.map}
          </span>
        </span>
      </button>
      {menu &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={fr.common.close}
              onClick={() => setMenu(false)}
              className="hud board-veil z-[var(--z-band)] cursor-default bg-[rgba(15,10,4,.35)]"
            />
            <nav
              aria-label={fr.footBar.menuLabel}
              className="hud fixed z-[calc(var(--z-band)+1)] flex w-[170px] flex-col text-[var(--ink)]"
              style={{
                right: 'calc((6px + var(--safe-right)) / var(--hud-scale))',
                bottom: 'calc((var(--board-bottom) + 8px) / var(--hud-scale))',
              }}
            >
              <ul className="flex flex-col-reverse">{entries}</ul>
            </nav>
          </>,
          document.body,
        )}
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
    </>
  );
}

const ENTRY =
  'press float -mt-px flex min-h-[40px] w-full cursor-pointer items-center gap-[10px] border border-[var(--ink)] px-[12px] text-left text-[12px] font-semibold tracking-[.1em] uppercase';

function Count({ value }: { value: number }) {
  return (
    <span className="grid h-[16px] min-w-[16px] place-items-center bg-[var(--critical)] px-[4px] font-(family-name:--font-mono) text-[10px] leading-none text-[var(--paper)]">
      {value > 99 ? '99+' : value}
    </span>
  );
}
