import { useState, type ReactNode, type Ref } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { nextActionsOf } from '@/domain/next-actions';
import { CATEGORIES } from '@/domain/indicators';
import { toggleIndicator, useIndicatorToggles } from '@/data/indicatorToggles';
import { toggleWindow, windowOpen, type BoardSearch } from '@/routes/-plateau/board-search';
import { BottomSheet } from './BottomSheet';

type FootSheet = 'todo' | 'layers';

/**
 * **La barre de pied, sous 768 px** (piste A, passe 2, A1 à A5) : elle remplace le rail. Cinq
 * entrées — à faire, journal, télégraphe, presse, plus — et un étage que « plus » ajoute
 * au-dessus d'elle pour ce qu'on cherche à froid : nation, économie, abaque, réglages, calques.
 *
 * **Rien n'y est recalculé** : le compte de « à faire » est la liste de la carte du bureau
 * (`nextActionsOf`), celui du journal le non-lu du bandeau, celui du télégraphe le badge du rail,
 * et le rang celui de la dernière édition — jamais un classement refait ici.
 *
 * Ce qu'elle ouvre est **la seule surface ouverte** : une fenêtre recouverte se ferme d'elle-même
 * (`Window.tsx`), et les deux feuilles qu'elle tient réclament la place en montant
 * (`sole-surface.tsx`).
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
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState<FootSheet | null>(null);
  const waiting = nextActionsOf(view).length;
  const unread = view.journal.filter((dispatch) => dispatch.unread).length;
  const rank = view.press?.mine?.rank ?? null;

  return (
    <nav ref={ref} className="hud board-foot shrink-0 bg-[var(--paper)] text-[var(--ink)]">
      {more && (
        <ul className="grid grid-cols-5 border-t border-[var(--ink)] bg-(--ink)/8">
          {(['nation', 'economy', 'gunnery', 'settings'] as const).map((name) => (
            <li key={name} className="flex border-r border-(color:--ink)/25">
              <Link
                to="/plateau"
                search={toggleWindow(search, name)}
                onClick={() => setMore(false)}
                className={`${CELL} ${windowOpen(search, name) ? ACTIVE : 'border-transparent'}`}
              >
                <span className={LABEL}>{fr.foot[name]}</span>
              </Link>
            </li>
          ))}
          <li className="flex">
            <button
              type="button"
              aria-pressed={sheet === 'layers'}
              onClick={() => setSheet((open) => (open === 'layers' ? null : 'layers'))}
              className={`${CELL} ${sheet === 'layers' ? ACTIVE : 'border-transparent'}`}
            >
              <span className={LABEL}>{fr.foot.layers}</span>
            </button>
          </li>
        </ul>
      )}

      <ul className="grid grid-cols-5 border-t border-[var(--ink)]">
        <li className="flex border-r border-(color:--ink)/25">
          <button
            type="button"
            aria-pressed={sheet === 'todo'}
            onClick={() => {
              setMore(false);
              setSheet((open) => (open === 'todo' ? null : 'todo'));
            }}
            className={`${CELL} ${
              waiting > 0
                ? 'border-transparent bg-[var(--ink)] text-[var(--paper)]'
                : sheet === 'todo'
                  ? ACTIVE
                  : 'border-transparent'
            }`}
          >
            <span className={LABEL}>{fr.foot.todo}</span>
            {waiting > 0 && <Count value={waiting} inverted />}
          </button>
        </li>
        {(['journal', 'telegraph'] as const).map((name) => {
          const count = name === 'journal' ? unread : telegraphUnread;
          return (
            <li key={name} className="flex border-r border-(color:--ink)/25">
              <Link
                to="/plateau"
                search={toggleWindow(search, name)}
                onClick={() => setMore(false)}
                className={`${CELL} ${windowOpen(search, name) ? ACTIVE : 'border-transparent'}`}
              >
                <span className={LABEL}>{fr.foot[name]}</span>
                {count > 0 && <Count value={count} />}
              </Link>
            </li>
          );
        })}
        <li className="flex border-r border-(color:--ink)/25">
          <Link
            to="/plateau"
            search={toggleWindow(search, 'press')}
            onClick={() => setMore(false)}
            className={`${CELL} ${windowOpen(search, 'press') ? ACTIVE : 'border-transparent'}`}
          >
            <span className={LABEL}>{fr.foot.press}</span>
            {rank !== null && (
              <span className="font-(family-name:--font-mono) text-[10px] text-[var(--ink-soft)]">
                {fr.foot.rank(rank)}
              </span>
            )}
          </Link>
        </li>
        <li className="flex">
          <button
            type="button"
            aria-expanded={more}
            onClick={() => {
              setSheet(null);
              setMore((open) => !open);
            }}
            className={`${CELL} ${more ? ACTIVE : 'border-transparent'}`}
          >
            <span className={LABEL}>{fr.foot.more}</span>
          </button>
        </li>
      </ul>

      {sheet === 'todo' && (
        <BottomSheet
          title={fr.nextActions.header}
          aside={
            waiting > 0 && (
              <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
                {waiting}
              </span>
            )
          }
          onClose={() => setSheet(null)}
        >
          {todo}
        </BottomSheet>
      )}
      {sheet === 'layers' && (
        <BottomSheet title={fr.foot.layersTitle} onClose={() => setSheet(null)}>
          <Layers />
        </BottomSheet>
      )}
    </nav>
  );
}

const CELL =
  'flex w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-[3px] border-t-2 px-[2px] py-[5px] text-center';

const ACTIVE = 'border-[var(--ink)] bg-(--ink)/12';

const LABEL = 'text-[8.5px] leading-[1.15] font-semibold tracking-[.1em] uppercase';

/** Un carré d'encre, pas une pastille : le pied est composé, pas notifié. */
function Count({ value, inverted = false }: { value: number; inverted?: boolean }) {
  return (
    <span
      className={`flex h-[13px] min-w-[13px] items-center justify-center px-[3px] font-(family-name:--font-mono) text-[8.5px] leading-none ${
        inverted
          ? 'border border-(color:--paper)/70 text-[var(--paper)]'
          : 'bg-[var(--ink)] text-[var(--paper)]'
      }`}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

/**
 * **Les huit bascules du rail, en cases de 44 px sur deux colonnes** (A4). La même source que le
 * rail du bureau (`useIndicatorToggles`), donc la même mémoire : allumer les chantiers au
 * téléphone les allume aussi au bureau du même navigateur.
 */
function Layers() {
  const toggles = useIndicatorToggles();
  return (
    <ul className="grid grid-cols-2 gap-[8px] p-4">
      {CATEGORIES.map((category) => {
        const on = toggles[category];
        return (
          <li key={category} className="flex">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggleIndicator(category)}
              className={`flex w-full cursor-pointer items-center gap-[10px] border px-[10px] text-left ${
                on ? 'border-[var(--ink)]' : 'border-(color:--ink)/35'
              }`}
            >
              <span
                aria-hidden
                className="flex h-[16px] w-[16px] shrink-0 items-center justify-center border border-[var(--ink)]"
              >
                {on && <span className="h-[8px] w-[8px] bg-[var(--ink)]" />}
              </span>
              <span className="block text-[13px] first-letter:uppercase">
                {fr.indicatorCategories[category]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
