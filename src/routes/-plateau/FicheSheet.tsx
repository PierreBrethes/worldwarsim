import { useState, type ReactNode } from 'react';
import { useMapMotion } from '@/data/mapMotion';
import { BottomSheet, type KeepingHeight, type SheetCycle } from '@/shell/BottomSheet';

export type FicheTab = {
  readonly id: string;
  readonly label: string;
  /** Un compte, dit après le nom de l'onglet. */
  readonly count?: string;
};

/**
 * **La fiche commune du téléphone** (#588, précision 6) : un avant-poste, un camp relevé, un
 * objectif et un point stratégique se lisent dans la même feuille, à deux états comme celle d'un
 * site (#587). Courte au cran `peek` — l'en-tête, la ligne de résumé que l'on touche pour
 * dérouler, et ce que `lead` épingle (l'ordre qui part au toucher) —, déroulée à la
 * moitié : les onglets, épinglés, puis le contenu de l'onglet ouvert (`children`). Le contenu
 * change en fondu de 120 ms, sauf réglage « coupées » ; l'onglet ouvert est toujours souligné.
 */
export function FicheSheet({
  title,
  aside,
  kicker = true,
  summary,
  lead,
  tabs,
  tab,
  onTab,
  cycle,
  onClose,
  children,
}: {
  title: string;
  aside?: ReactNode;
  /** Le titre en petites capitales : le nom de l'objet est alors dans le contenu. */
  kicker?: boolean;
  /** La ligne que la fiche courte garde sous son en-tête ; la toucher déroule. */
  summary: ReactNode;
  /** Ce que la fiche courte épingle sous sa ligne de résumé — l'ordre qui part au toucher ; déroulée,
   *  le contenu de l'onglet le porte en entier. */
  lead?: ReactNode;
  tabs: ReadonlyArray<FicheTab>;
  tab: string;
  onTab: (id: string) => void;
  /** ‹ › de l'en-tête : l'objet voisin de sa famille (#593). */
  cycle?: SheetCycle | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  const [height, setHeight] = useState<KeepingHeight>('peek');
  const unrolled = height === 'half' || height === 'full';
  const motion = useMapMotion();
  const fade = motion === 'off' ? undefined : 'tab-fade';
  const pinned = (
    <>
      {unrolled ? (
        <div
          role="tablist"
          className="paper-grain grid h-[44px] border-b border-[var(--ink)]"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((one) => (
            <button
              key={one.id}
              type="button"
              role="tab"
              aria-selected={tab === one.id}
              onClick={() => onTab(one.id)}
              className={`flex cursor-pointer items-center justify-center gap-[6px] border-b-[3px] text-[10.5px] tracking-[.12em] uppercase ${
                tab === one.id
                  ? 'border-[var(--ink)] font-bold text-[var(--ink)]'
                  : 'border-transparent font-semibold text-[var(--ink-soft)]'
              }`}
            >
              {one.label}
              {one.count !== undefined && (
                <span className="font-(family-name:--font-mono) text-[11px] tracking-normal">
                  {one.count}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setHeight('half')}
          className="paper-grain flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 border-b border-[var(--ink)] px-4 py-[6px] text-left"
        >
          <span className="min-w-0 flex-1 text-[12px] leading-[1.3]">{summary}</span>
          <span aria-hidden>▴</span>
        </button>
      )}
      {!unrolled && lead}
    </>
  );
  return (
    <BottomSheet
      title={title}
      aside={aside}
      onClose={onClose}
      initial="peek"
      kicker={kicker}
      hug
      keepsSelection
      unfolds
      cycle={cycle}
      height={height}
      onHeight={setHeight}
      pinned={pinned}
    >
      {unrolled && (
        <div key={tab} role="tabpanel" className={`px-4 py-[10px] text-[var(--ink)] ${fade ?? ''}`}>
          {children}
        </div>
      )}
    </BottomSheet>
  );
}
