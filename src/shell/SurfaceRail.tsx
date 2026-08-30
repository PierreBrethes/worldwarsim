import { Link, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { CATEGORIES, type IndicatorCategory } from '@/domain/indicators';
import { toggleIndicator, useIndicatorToggles } from '@/data/indicatorToggles';
import type { BoardWindow, BoardSearch } from '@/routes/plateau';
import { toggleWindow, windowOpen } from '@/routes/plateau';
import { Glyph } from './Glyph';
import { IndicatorGlyph, IndustryGlyph, Pictogram } from './IndicatorGlyph';
import { useClock } from './clock';

export function SurfaceRail({
  season,
  loadedAt,
  playerInk,
  telegraphUnread,
}: {
  season: PlayerView['season'];
  loadedAt: number;
  playerInk: string;
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

  const surfaces: ReadonlyArray<{
    title: string;
    label: string;
    icon: ReactNode;
    target: BoardSearch;
    active: boolean;
    /** Ce qui attend derrière l'entrée, `0` quand rien n'attend. Une seule surface en porte
     *  aujourd'hui — le journal compte au bandeau, où il vit. */
    unread?: number;
  }> = [
    {
      title:
        telegraphUnread > 0
          ? `${fr.rail.telegraph.title} — ${fr.rail.telegraphUnread(telegraphUnread)}`
          : fr.rail.telegraph.title,
      label: fr.rail.telegraph.label,
      icon: <TelegraphIcon />,
      target: toggled('telegraph'),
      active: windowOpen(search, 'telegraph'),
      unread: telegraphUnread,
    },
    {
      title: fr.rail.production.title,
      label: fr.rail.production.label,
      icon: <Pictogram pictogram="production" weight={20} size={19} />,
      target: toggled('production'),
      active: windowOpen(search, 'production'),
    },
    {
      title: fr.rail.economy.title,
      label: fr.rail.economy.label,
      icon: <IndustryGlyph size={19} />,
      target: toggled('economy'),
      active: windowOpen(search, 'economy'),
    },
    {
      title: fr.rail.nation.title,
      label: fr.rail.nation.label,
      icon: <Pictogram pictogram="nation" weight={20} size={19} />,
      target: toggled('nation'),
      active: windowOpen(search, 'nation'),
    },
  ];

  /**
   * **Le rail ne montre que ce qui marche.** Trois entrées grisées y annonçaient le rejeu, la
   * doctrine et l'espionnage : un invité qui les voit compte trois écrans qui n'existent pas, et
   * un « bientôt » est une promesse qu'on ne tient pas à la minute où il la lit. Elles
   * reviendront avec leur fonction, pas avant.
   */

  return (
    <nav className="hud flex w-[52px] shrink-0 flex-col justify-between bg-[var(--desk)] py-2">
      <div>
        <ul>
          {surfaces.map((surface) => (
            <li key={surface.label}>
              <Link
                to="/plateau"
                search={surface.target}
                title={surface.title}
                className={
                  surface.active
                    ? 'relative flex h-[46px] flex-col items-center justify-center gap-[3px] border-l-2 border-[var(--notable)] bg-[var(--paper)] text-[var(--ink)]'
                    : 'relative flex h-[46px] flex-col items-center justify-center gap-[3px] border-l-2 border-transparent text-[var(--paper-dim)] hover:text-[var(--paper)]'
                }
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
            </li>
          ))}
        </ul>
        <EdgeToggles playerInk={playerInk} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <Link
          to="/plateau"
          search={toggled('settings')}
          title={fr.rail.settings}
          className={
            windowOpen(search, 'settings')
              ? 'flex h-[34px] w-full items-center justify-center border-l-2 border-[var(--notable)] bg-[var(--paper)] text-[var(--ink)]'
              : 'flex h-[34px] w-full items-center justify-center border-l-2 border-transparent text-[var(--paper-dim)] hover:text-[var(--paper)]'
          }
        >
          <SettingsIcon />
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
          className="text-center font-(family-name:--font-mono) text-[9px] text-[#6b6252]"
        >
          {fr.rail.seasonShort(season.number)}
        </div>
      </div>
    </nav>
  );
}

/**
 * The screen edge is not a surface: it is not opened, it is lit. Hence the rule separating
 * this group from the three surfaces, and the absence of a label under the pictograms — six
 * more lines of text would make the rail a list, and the rail is not a list.
 */
function EdgeToggles({ playerInk }: { playerInk: string }) {
  const toggles = useIndicatorToggles();
  return (
    <ul className="mt-2 flex flex-col items-center gap-[1px] border-t border-[var(--ink-quiet)] pt-2">
      {CATEGORIES.map((category) => {
        const on = toggles[category];
        return (
          <li key={category}>
            <button
              type="button"
              aria-pressed={on}
              title={
                category === 'buildings'
                  ? fr.rail.toggleBuildingsTitle(on)
                  : category === 'deposits'
                    ? fr.rail.toggleDepositsTitle(on)
                    : fr.rail.toggleTitle(fr.indicatorCategories[category], on)
              }
              onClick={() => toggleIndicator(category)}
              style={on ? { color: LIT_INK[category] ?? playerInk } : undefined}
              className={
                on
                  ? 'flex h-[26px] w-[36px] cursor-pointer items-center justify-center border border-[var(--ink-quiet)] bg-[rgba(228,216,189,.12)]'
                  : 'flex h-[26px] w-[36px] cursor-pointer items-center justify-center border border-transparent text-[var(--paper-dim)] opacity-45 hover:opacity-80'
              }
            >
              <IndicatorGlyph category={category} size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The last three categories carry the timeline's inks — mine, the critical of a heading
 * coming at me, the muted grey of what brews elsewhere. `undefined` falls back to my
 * nation's ink, which is not hard-coded: it travels with the view.
 */
const LIT_INK: Readonly<Record<IndicatorCategory, string | undefined>> = {
  buildings: undefined,
  // The ground's, not a nation's: a deposit is there before anyone claims it.
  deposits: 'var(--paper)',
  outposts: 'var(--paper)',
  constructions: 'var(--paper)',
  forces: 'var(--paper)',
  'my-movements': undefined,
  inbound: 'var(--critical)',
  intel: 'var(--routine)',
};

/**
 * **Un manipulateur morse** : le levier sur son pivot, le bouton à la main, deux étincelles.
 * Dessiné et non massicoté comme les onze pictogrammes — il n'existe pas de planche à cuire
 * pour lui, exactement comme la bascule des bâtiments et l'icône des réglages.
 */
function TelegraphIcon() {
  return (
    <Glyph>
      <path d="M3 15.5h11" />
      <path d="M5 11.5h7" />
      <path d="M9.5 11.5v4" />
      <circle cx="5" cy="11.5" r="1.3" />
      <path d="M14 8.2l1.8-1.7M16.4 9.4l2.3-.7" />
    </Glyph>
  );
}

function SettingsIcon() {
  return (
    <Glyph>
      <path d="M4 6.5h12M4 13.5h12" />
      <path d="M8 4.5v4M13 11.5v4" />
    </Glyph>
  );
}
