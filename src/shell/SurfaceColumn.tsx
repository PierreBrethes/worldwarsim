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
import { Pictogram } from './IndicatorGlyph';

/**
 * **La colonne des surfaces** (table plein écran, 13/10) : des carrés de papier posés au bord
 * gauche de la carte. Depuis le 20/10 elle ne garde que l'essentiel : « à faire » — la carte qu'il
 * déplie est celle du plateau, qui la sert (`todo`) — et l'abaque. Journal, presse et télégraphe
 * sont dans l'en-tête (`SurfaceTabs`) ; nation, économie et recherche ont leur entrée ailleurs
 * (le drapeau de l'en-tête, le plateau personnel).
 *
 * Ce sont des bascules, pas une navigation : un carré dont la fenêtre est ouverte la referme.
 */
export function SurfaceColumn({ todo, ref }: { todo: ReactNode; ref?: Ref<HTMLElement> }) {
  return (
    <nav
      ref={ref}
      className="hud absolute bottom-[calc(var(--table-margin)/var(--hud-scale))] left-[calc(var(--table-margin)/var(--hud-scale))] z-[var(--z-band)] flex flex-col gap-[calc(var(--table-gap)/var(--hud-scale))] text-[var(--ink)]"
    >
      {todo}
      <SurfaceTab name="gunnery" surface={fr.rail.gunnery} icon={<AbacusMark size={17} />} />
    </nav>
  );
}

/**
 * **Un bouton de surface**, une bascule de fenêtre : le même composant sert le carré de la colonne
 * et la languette de l'en-tête (`strip`), pour que compteur, souligné « ouverte » et lien restent
 * à une seule place.
 */
function SurfaceTab({
  name,
  surface,
  icon,
  corner,
  count = 0,
  strip = false,
}: {
  name: BoardWindow;
  surface: { title: string; label: string };
  icon: ReactNode;
  corner?: ReactNode;
  count?: number;
  strip?: boolean;
}) {
  const search = useSearch({ strict: false }) as BoardSearch;
  const active = windowOpen(search, name);
  return (
    <Link
      to="/plateau"
      search={toggleWindow(search, name)}
      title={surface.title}
      aria-label={surface.title}
      aria-current={active ? 'true' : undefined}
      className={strip ? STRIP : SQUARE}
    >
      {icon}
      <span className="text-[7.5px] leading-none font-semibold tracking-[.1em] uppercase">
        {surface.label}
      </span>
      {corner}
      {count > 0 && (
        <span
          className={`absolute grid h-[15px] min-w-[15px] place-items-center rounded-full border border-[var(--paper)] bg-[var(--ink)] px-[3px] font-(family-name:--font-mono) text-[8.5px] leading-none text-[var(--paper)] ${
            strip ? 'top-[3px] right-[3px]' : '-top-[6px] -right-[6px]'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
      {active && (
        <span aria-hidden className="absolute inset-x-[6px] bottom-[3px] h-[2px] bg-[var(--ink)]" />
      )}
    </Link>
  );
}

/**
 * **Journal, presse et télégraphe, à droite de l'en-tête** : leurs compteurs (non lues du journal,
 * rang à l'édition, télégrammes non lus) y sont restés. La Blitz n'a pas de presse tant qu'elle se
 * joue : l'édition finale s'ouvre à l'horloge.
 */
export function SurfaceTabs({
  view,
  telegraphUnread,
}: {
  view: PlayerView;
  telegraphUnread: number;
}) {
  const unread = view.journal.filter((dispatch) => dispatch.unread).length;
  const hidePress = view.mode === 'blitz' && view.season.outcome.concludedAt === null;
  const rank = view.mode === 'blitz' ? null : (view.press?.mine?.rank ?? null);
  return (
    <>
      <SurfaceTab
        strip
        name="journal"
        surface={{
          title:
            unread > 0
              ? `${fr.rail.journal.title} — ${fr.banner.unread(unread)}`
              : fr.rail.journal.title,
          label: fr.rail.journal.label,
        }}
        icon={<Pictogram pictogram="journal" weight={20} size={18} />}
        count={unread}
      />
      {!hidePress && (
        <SurfaceTab
          strip
          name="press"
          surface={fr.rail.press}
          icon={<PressGlyph size={18} />}
          corner={
            rank !== null && (
              <span className="absolute top-[4px] right-[4px] font-(family-name:--font-mono) text-[7.5px] leading-none text-[var(--ink-soft)]">
                {fr.press.ordinal(rank)}
              </span>
            )
          }
        />
      )}
      <SurfaceTab
        strip
        name="telegraph"
        surface={{
          title:
            telegraphUnread > 0
              ? `${fr.rail.telegraph.title} — ${fr.rail.telegraphUnread(telegraphUnread)}`
              : fr.rail.telegraph.title,
          label: fr.rail.telegraph.label,
        }}
        icon={<TelegraphGlyph size={18} />}
        count={telegraphUnread}
      />
    </>
  );
}

/** Le carré de papier de la table : celui des boutons de carte, avec un mot sous l'icône. */
export const SQUARE_FRAME =
  'press float relative flex h-[46px] w-[46px] cursor-pointer flex-col items-center justify-center gap-[4px] border border-[var(--ink)]';

export const SQUARE = `paper-grain paper-hover ${SQUARE_FRAME} text-[var(--ink)]`;

/** La languette de l'en-tête : la hauteur de la bande, un filet à sa gauche, le papier de la bande. */
const STRIP =
  'paper-hover relative flex h-full w-[50px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[4px] border-l border-(color:--ink)/20 text-[var(--ink)]';
