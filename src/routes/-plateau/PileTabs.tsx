import { useCallback, useMemo, useState } from 'react';
import { useMapMotion } from '@/data/mapMotion';
import { fr } from '@/i18n/fr';
import type { PlayerView, TroopStation, TroopView } from '@/domain/player-view';
import { pileStatsOf } from '@/domain/stat-sheet';
import { rubricOf, StatLines } from '@/shell/StatLines';
import { GarrisonStack } from './GarrisonStack';

const TABS = ['troops', 'move', 'fight', 'carry'] as const;
type Tab = (typeof TABS)[number];

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
}) {
  const motion = useMapMotion();
  const [tab, setTab] = useState<Tab>('troops');
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

  return (
    <>
      <div
        role="tablist"
        className="mb-[10px] grid h-[40px] grid-cols-4 border-b border-(color:--ink)/35"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex cursor-pointer items-center justify-center border-b-[3px] text-[10.5px] tracking-[.12em] uppercase ${
              tab === id
                ? 'border-[var(--ink)] font-bold text-[var(--ink)]'
                : 'border-transparent font-semibold text-[var(--ink-soft)]'
            }`}
          >
            {label(id)}
          </button>
        ))}
      </div>
      <div key={tab} data-motion={motion} className={motion === 'off' ? undefined : 'tab-fade'}>
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
    </>
  );
}
