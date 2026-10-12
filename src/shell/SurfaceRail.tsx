import { Link, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import {
  toggleWindow,
  windowOpen,
  type BoardSearch,
  type BoardWindow,
} from '@/routes/-plateau/board-search';
import { AbacusMark } from '@/routes/-plateau/GunneryButton';
import { PressGlyph, SettingsGlyph, TelegraphGlyph } from './Glyph';
import { IndustryGlyph, Pictogram } from './IndicatorGlyph';
import { useClock } from './clock';

export function SurfaceRail({
  season,
  loadedAt,
  telegraphUnread,
}: {
  season: PlayerView['season'];
  loadedAt: number;
  telegraphUnread: number;
}) {
  const search = useSearch({ strict: false }) as BoardSearch;
  // The season's end counts in days: the minute is enough, and the rail has no reason to
  // repaint every second for a tooltip.
  const now = useClock(60_000);
  /** `null` = sans horloge : rien à décompter, et le rail le dit en un mot plutôt que d'afficher
   *  un « 0 h 00 » qui se lirait comme une fin imminente (révision du 27/08 de l'ADR 0017). */
  const minutesLeft =
    season.durationHours === null
      ? null
      : Math.max(0, (season.durationHours - season.elapsedHours) * 60 - (now - loadedAt) / 60_000);

  // The rail is a set of toggles, not a navigation: clicking an open surface removes it from
  // the stack, and the bare state (map alone) needs no "board" entry.
  const toggled = (name: BoardWindow): BoardSearch => toggleWindow(search, name);

  const telegraph: Surface = {
    title:
      telegraphUnread > 0
        ? `${fr.rail.telegraph.title} — ${fr.rail.telegraphUnread(telegraphUnread)}`
        : fr.rail.telegraph.title,
    label: fr.rail.telegraph.label,
    icon: <TelegraphGlyph />,
    target: toggled('telegraph'),
    active: windowOpen(search, 'telegraph'),
    unread: telegraphUnread,
  };

  const surfaces: ReadonlyArray<Surface> = [
    {
      title: fr.rail.nation.title,
      label: fr.rail.nation.label,
      icon: <Pictogram pictogram="nation" weight={20} size={19} />,
      target: toggled('nation'),
      active: windowOpen(search, 'nation'),
    },
    {
      title: fr.rail.economy.title,
      label: fr.rail.economy.label,
      icon: <IndustryGlyph size={19} />,
      target: toggled('economy'),
      active: windowOpen(search, 'economy'),
    },
    {
      title: fr.rail.gunnery.title,
      label: fr.rail.gunnery.label,
      icon: <AbacusMark size={19} />,
      target: toggled('gunnery'),
      active: windowOpen(search, 'gunnery'),
    },
    {
      title: fr.rail.press.title,
      label: fr.rail.press.label,
      icon: <PressGlyph />,
      target: toggled('press'),
      active: windowOpen(search, 'press'),
    },
  ];

  /**
   * **Le rail ne montre que ce qui marche.** Trois entrées grisées y annonçaient le rejeu, la
   * progression et l'espionnage : un invité qui les voit compte trois écrans qui n'existent pas, et
   * un « bientôt » est une promesse qu'on ne tient pas à la minute où il la lit. Elles
   * reviendront avec leur fonction, pas avant.
   */

  /** Sous le seuil, le rail cède la place à la barre de pied (`FootBar.tsx`, piste A). */
  return (
    <nav className="hud flex w-[var(--rail-w)] shrink-0 flex-col justify-between bg-[var(--desk)] py-2">
      <div>
        <ul>
          {surfaces.map((surface) => (
            <li key={surface.label}>
              <SurfaceLink surface={surface} />
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-center gap-2">
        {/* Le télégraphe descend au pied du rail, contre les réglages — mais il reste une
            surface : même gabarit, même compte de non-lus que ceux d'en haut. */}
        <SurfaceLink surface={telegraph} />
        <Link
          to="/plateau"
          search={toggled('settings')}
          title={fr.rail.settings}
          className={`flex h-[34px] w-full items-center justify-center border-l-2 ${
            windowOpen(search, 'settings')
              ? 'border-[var(--notable)] bg-[var(--paper)] text-[var(--ink)]'
              : 'border-transparent text-[var(--paper-dim)] hover:text-[var(--paper)]'
          }`}
        >
          <SettingsGlyph />
        </Link>
        <div
          title={
            minutesLeft === null
              ? fr.rail.seasonNoClock(season.number)
              : fr.rail.seasonEnd(
                  season.number,
                  Math.floor(minutesLeft / 60),
                  String(Math.floor(minutesLeft % 60)).padStart(2, '0'),
                )
          }
          className="flex items-center justify-center text-center font-(family-name:--font-mono) text-[9px] text-[#6b6252]"
        >
          {fr.rail.seasonShort(season.number)}
        </div>
      </div>
    </nav>
  );
}

type Surface = {
  title: string;
  label: string;
  icon: ReactNode;
  target: BoardSearch;
  active: boolean;
  /** Ce qui attend derrière l'entrée, `0` quand rien n'attend. Une seule surface en porte
   *  aujourd'hui — le journal compte au bandeau, où il vit. */
  unread?: number;
};

function SurfaceLink({ surface }: { surface: Surface }) {
  return (
    <Link
      to="/plateau"
      search={surface.target}
      title={surface.title}
      className={`relative flex h-[46px] w-full flex-col items-center justify-center gap-[3px] border-l-2 ${
        surface.active
          ? 'border-[var(--notable)] bg-[var(--paper)] text-[var(--ink)]'
          : 'border-transparent text-[var(--paper-dim)] hover:text-[var(--paper)]'
      }`}
    >
      {surface.icon}
      <span className="text-[7px] tracking-[.14em] uppercase">{surface.label}</span>
      {/* Un carré à l'encre critique, pas une pastille : le rail est composé, pas
          notifié. Il compte depuis la dernière fermeture de la fenêtre. */}
      {surface.unread ? (
        <span className="absolute top-[5px] right-[5px] flex h-[13px] min-w-[13px] items-center justify-center bg-[var(--critical)] px-[3px] font-(family-name:--font-mono) text-[8px] leading-none text-[var(--paper)]">
          {surface.unread > 99 ? '99+' : surface.unread}
        </span>
      ) : null}
    </Link>
  );
}
