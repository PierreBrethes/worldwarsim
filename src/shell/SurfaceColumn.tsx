import { Link, useSearch } from '@tanstack/react-router';
import type { ReactNode, Ref } from 'react';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import {
  toggleWindow,
  windowOpen,
  type BoardSearch,
  type BoardWindow,
} from '@/routes/-plateau/board-search';
import { AbacusMark } from '@/routes/-plateau/GunneryButton';
import { PressGlyph, TelegraphGlyph } from './Glyph';
import { IndustryGlyph, Pictogram } from './IndicatorGlyph';

/**
 * **La colonne des surfaces** (table plein écran, 13/10) : des carrés de papier posés au bord
 * gauche de la carte, à la place du rail sombre. En tête, « à faire » — la carte qu'il déplie est
 * celle du plateau, qui la sert (`todo`) ; dessous, une entrée par fenêtre, le journal compris, qui
 * a quitté le bandeau pour y porter son compte. Les réglages sont descendus au coin de la carte.
 *
 * Ce sont des bascules, pas une navigation : un carré dont la fenêtre est ouverte la referme.
 */
export function SurfaceColumn({
  view,
  telegraphUnread,
  todo,
  economyCued = false,
  ref,
}: {
  view: PlayerView;
  telegraphUnread: number;
  todo: ReactNode;
  /** L'anneau des premiers pas sur « Écon. » : le geste du pas allumé se prend là. */
  economyCued?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  const search = useSearch({ strict: false }) as BoardSearch;
  const unread = view.journal.filter((dispatch) => dispatch.unread).length;
  const blitz = view.mode === 'blitz';
  const playing = view.season.outcome.concludedAt === null;
  const rank = blitz ? null : (view.press?.mine?.rank ?? null);

  const square = (
    name: BoardWindow,
    surface: { title: string; label: string },
    icon: ReactNode,
    corner?: ReactNode,
    count = 0,
    cued = false,
  ) => {
    const active = windowOpen(search, name);
    return (
      <Link
        to="/plateau"
        search={toggleWindow(search, name)}
        title={surface.title}
        aria-label={surface.title}
        aria-current={active ? 'true' : undefined}
        className={cued ? `${SQUARE} first-step-ring` : SQUARE}
      >
        {icon}
        <span className="text-[7.5px] leading-none font-semibold tracking-[.1em] uppercase">
          {surface.label}
        </span>
        {corner}
        {count > 0 && (
          <span className="absolute -top-[6px] -right-[6px] grid h-[15px] min-w-[15px] place-items-center rounded-full border border-[var(--paper)] bg-[var(--ink)] px-[3px] font-(family-name:--font-mono) text-[8.5px] leading-none text-[var(--paper)]">
            {count > 99 ? '99+' : count}
          </span>
        )}
        {active && (
          <span
            aria-hidden
            className="absolute inset-x-[6px] bottom-[3px] h-[2px] bg-[var(--ink)]"
          />
        )}
      </Link>
    );
  };

  return (
    <nav
      ref={ref}
      className="hud absolute bottom-[calc(var(--table-margin)/var(--hud-scale))] left-[calc(var(--table-margin)/var(--hud-scale))] z-[var(--z-band)] flex flex-col gap-[calc(var(--table-gap)/var(--hud-scale))] text-[var(--ink)]"
    >
      {todo}
      {/* La Blitz n'a ni nation à lire, ni réserve, ni chantier, ni presse : l'économie s'y lit
          sur la réglette, en fonds, et l'édition finale s'ouvre à l'horloge. */}
      {!blitz &&
        square('nation', fr.rail.nation, <Pictogram pictogram="nation" weight={20} size={18} />)}
      {!blitz &&
        square(
          'personalBoard',
          fr.rail.economy,
          <IndustryGlyph size={18} />,
          undefined,
          0,
          economyCued,
        )}
      {square('gunnery', fr.rail.gunnery, <AbacusMark size={17} />)}
      {square(
        'journal',
        {
          title:
            unread > 0
              ? `${fr.rail.journal.title} — ${fr.banner.unread(unread)}`
              : fr.rail.journal.title,
          label: fr.rail.journal.label,
        },
        <Pictogram pictogram="journal" weight={20} size={18} />,
        undefined,
        unread,
      )}
      {!(blitz && playing) &&
        square(
          'press',
          fr.rail.press,
          <PressGlyph size={18} />,
          rank !== null && (
            <span className="absolute top-[4px] right-[4px] font-(family-name:--font-mono) text-[7.5px] leading-none text-[var(--ink-soft)]">
              {fr.press.ordinal(rank)}
            </span>
          ),
        )}
      {square(
        'telegraph',
        {
          title:
            telegraphUnread > 0
              ? `${fr.rail.telegraph.title} — ${fr.rail.telegraphUnread(telegraphUnread)}`
              : fr.rail.telegraph.title,
          label: fr.rail.telegraph.label,
        },
        <TelegraphGlyph size={18} />,
        undefined,
        telegraphUnread,
      )}
    </nav>
  );
}

/** Le carré de papier de la table : celui des boutons de carte, avec un mot sous l'icône. */
export const SQUARE_FRAME =
  'press float relative flex h-[46px] w-[46px] cursor-pointer flex-col items-center justify-center gap-[4px] border border-[var(--ink)]';

export const SQUARE = `paper-grain paper-hover ${SQUARE_FRAME} text-[var(--ink)]`;
