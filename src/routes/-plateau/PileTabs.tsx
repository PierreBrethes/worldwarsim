import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useMapMotion } from '@/data/mapMotion';
import { fr } from '@/i18n/fr';
import type { PlayerView, TroopStation, TroopView } from '@/domain/player-view';
import { pileStatsOf } from '@/domain/stat-sheet';
import { rubricOf, StatLines } from '@/shell/StatLines';
import { unitsOf } from '@/domain/troops';
import { GarrisonStack, PrepareBar } from './GarrisonStack';

const TABS = ['troops', 'move', 'fight', 'carry'] as const;
export type PileTab = (typeof TABS)[number];
type Tab = PileTab;

const label = (tab: Tab): string => (tab === 'troops' ? fr.hand.troopsTab : fr.stats.rubrics[tab]);

/**
 * **La pile sous ses onglets** (#585) : « troupes » coche et scinde la pile (`GarrisonStack`),
 * « mouvement », « combat » et « transport » lisent les statistiques des troupes cochées, rangées
 * sous la rubrique de `fr.stats`. Seul le téléphone la monte : au bureau les statistiques restent
 * sous la pile, dans la même fiche.
 *
 * Le réglage de l'app fait foi (`useMapMotion`) : le contenu qui change fond en 120 ms, sauf
 * « coupées », où le signe fixe de l'onglet actif est son soulignement — présent aux trois.
 */
export function PileTabs({
  view,
  station,
  held,
  preselect,
  canPrepare,
  observing,
  onPrepare,
  onPickedChange,
  onDisembark,
  onTabChange,
}: {
  view: PlayerView;
  station: TroopStation;
  held: ReadonlyArray<TroopView>;
  preselect: ReadonlyArray<string>;
  canPrepare: boolean;
  observing: boolean;
  onPrepare?: ((station: TroopStation, troopIds: ReadonlyArray<string>) => void) | undefined;
  onPickedChange?: ((troopIds: ReadonlyArray<string>) => void) | undefined;
  onDisembark?: ((troopIds: ReadonlyArray<string>) => void) | undefined;
  /** L'onglet ouvert, pour ce que la fiche garde au-dessus (la confirmation de dissoudre). */
  onTabChange?: ((tab: PileTab) => void) | undefined;
}) {
  const motion = useMapMotion();
  const id = useId();
  const [tab, setTabState] = useState<Tab>('troops');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const setTab = (next: Tab) => {
    setTabState(next);
    onTabChange?.(next);
  };
  /** Flèches, Début et Fin déplacent l'onglet et le focus ; seul l'onglet ouvert se tabule. */
  const onKey = (event: KeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    const to =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (to === null) return;
    event.preventDefault();
    setTab(TABS[to]!);
    tabs.current[to]?.focus();
  };
  const [picked, setPicked] = useState<ReadonlyArray<string>>(preselect);
  const ticked = useMemo(() => held.filter((troop) => picked.includes(troop.id)), [held, picked]);
  const rows = useMemo(
    () => (ticked.length === 0 ? [] : pileStatsOf(view, ticked)),
    [view, ticked],
  );
  /** Même contenu, même tableau : la pile rappelle sa coche à chaque rendu, sans boucler. */
  const pick = useCallback(
    (ids: ReadonlyArray<string>) => {
      setPicked((was) => (was.join() === ids.join() ? was : ids));
      onPickedChange?.(ids);
    },
    [onPickedChange],
  );
  const nothing = ticked.length === 0;
  const someLeft = !nothing && ticked.length < held.length;
  /** Seule la pile des troupes porte « préparer » : ailleurs la barre est la sienne, sans refaire
   *  ce que `GarrisonStack` sait (une unité seule part entière). */
  const prepares = canPrepare && !observing && onPrepare !== undefined;
  const alone = unitsOf(held).length === 1;

  return (
    <>
      <div
        role="tablist"
        className="mb-[10px] grid h-[44px] grid-cols-4 border-b border-(color:--ink)/35"
      >
        {TABS.map((name, index) => (
          <button
            key={name}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            id={`${id}-tab-${name}`}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={`${id}-panel`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => onKey(event, index)}
            className={`flex cursor-pointer items-center justify-center border-b-[3px] text-[10.5px] tracking-[.12em] uppercase ${
              tab === name
                ? 'border-[var(--ink)] font-bold text-[var(--ink)]'
                : 'border-transparent font-semibold text-[var(--ink-soft)]'
            }`}
          >
            {label(name)}
          </button>
        ))}
      </div>
      <div
        key={tab}
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
        className={motion === 'off' ? undefined : 'tab-fade'}
      >
        {tab === 'troops' ? (
          <>
            {nothing && (
              <p className="mb-[8px] text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
                {fr.hand.nothingToSend}
              </p>
            )}
            {/* Remontée à chaque retour d'onglet, avec la coche qu'elle avait. */}
            <GarrisonStack
              view={view}
              station={station}
              held={held}
              preselect={picked}
              canPrepare={canPrepare}
              observing={observing}
              onPrepare={onPrepare}
              onPickedChange={pick}
              onDisembark={onDisembark}
              statsBelow
            />
            {someLeft && (
              <p className="mt-[8px] text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
                {fr.hand.othersStay}
              </p>
            )}
            {/* Le butin se lit aussi sous les troupes cochées : c'est ce qui décide du départ. */}
            {!nothing && (
              <div data-testid="pile-loot" className="mt-[8px]">
                <StatLines rows={rows.filter((row) => row.key === 'loot')} grouped={false} />
              </div>
            )}
          </>
        ) : nothing ? (
          <p className="text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
            {fr.hand.nothingToSend}
          </p>
        ) : (
          <StatLines rows={rows.filter((row) => rubricOf(row.key) === tab)} grouped={false} />
        )}
      </div>
      {tab !== 'troops' && prepares && (
        <PrepareBar
          station={station}
          picked={alone ? null : picked.length}
          pickedIds={picked}
          onPrepare={onPrepare}
        />
      )}
    </>
  );
}
