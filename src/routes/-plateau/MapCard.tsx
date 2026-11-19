import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { BottomSheet, type SheetHeight } from '@/shell/BottomSheet';
import { useNarrowScreen } from '@/shell/viewport';
import { Draggable, DragHandle } from './Draggable';
import { FicheSheet, type FicheTab } from './FicheSheet';

/** **La fiche commune du téléphone** (#588) : courte puis déroulée, onglets épinglés. Sans elle, la
 *  feuille garde son aperçu seul. Au bureau, rien de ceci ne se lit. */
type CardSheet = {
  readonly summary: ReactNode;
  readonly lead?: ReactNode;
  readonly tabs: ReadonlyArray<FicheTab>;
  readonly tab: string;
  readonly onTab: (id: string) => void;
};

/**
 * **La fiche de ce que le doigt a touché** — une troupe, un camp relevé, un objectif, une caisse.
 * Au bureau, le cartouche posé à côté du point ; sous le seuil, la feuille basse à l'aperçu, qu'on
 * tire pour l'agrandir (lot mobile-3, A6). Un cartouche à côté d'un sprite, sur un téléphone,
 * tombait sous le pouce ou hors de l'écran, et passait sous la rose qu'il venait d'ouvrir.
 *
 * La rose reste au-dessus de la feuille : elle est sur le plan des menus de la carte, la feuille
 * sur celui du bandeau.
 */
export function MapCard({
  kicker,
  aside,
  at,
  gap,
  width,
  hug = true,
  initial = 'peek',
  pinned,
  sheet,
  onClose,
  children,
}: {
  kicker: string;
  /** Ce que l'en-tête porte après le surtitre — un renvoi, un état. */
  aside?: ReactNode;
  at: { x: number; y: number };
  /** L'écart horizontal au point, et le vertical qui en découle : la place de la rose. */
  gap: { readonly x: number; readonly y: number };
  width: number;
  /** Au doigt, l'aperçu épouse la fiche (`BottomSheet.hug`) ; sans, il garde son tiers. */
  hug?: boolean;
  /** Le cran où la feuille s'ouvre au doigt. */
  initial?: SheetHeight;
  /** Sous le seuil, ce qui reste épinglé sous l'en-tête de la feuille (`BottomSheet.pinned`). */
  pinned?: ReactNode;
  /** Sous le seuil, la fiche à deux états et à onglets (#588) : `children` est le contenu de
   *  l'onglet ouvert. */
  sheet?: CardSheet;
  onClose: () => void;
  children: ReactNode;
}) {
  const narrow = useNarrowScreen();
  if (narrow && sheet !== undefined) {
    return (
      <FicheSheet title={kicker} aside={aside} {...sheet} onClose={onClose}>
        {children}
      </FicheSheet>
    );
  }
  if (narrow) {
    return (
      <BottomSheet
        title={kicker}
        aside={aside}
        onClose={onClose}
        initial={initial}
        kicker
        hug={hug}
        keepsSelection
        pinned={pinned}
      >
        <div className="px-4 py-[10px]">{children}</div>
      </BottomSheet>
    );
  }

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;
  return (
    /* Poussé à la main, et sans rien retenir : il est visé sur un point, et restituer la poussée
       d'hier l'arracherait à ce qu'il décrit (`Draggable`). */
    <Draggable
      className="absolute z-[var(--z-popin)]"
      style={{
        left: fromRight ? undefined : at.x + gap.x,
        right: fromRight ? `calc(100% - ${at.x - gap.x}px)` : undefined,
        top: fromBottom ? undefined : at.y + gap.y,
        bottom: fromBottom ? `calc(100% - ${at.y - gap.y}px)` : undefined,
      }}
    >
      <section
        className="hud paper-grain surface-in border border-[var(--ink)] bg-[var(--paper)] px-[10px] py-[8px]"
        style={{ width }}
      >
        <DragHandle className="flex items-baseline gap-2">
          <span className="text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
            {kicker}
          </span>
          {aside}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer border border-[var(--ink)] px-[6px] py-[1px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>
        {children}
      </section>
    </Draggable>
  );
}
