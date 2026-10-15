import { useState, type ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { BottomSheet } from '@/shell/BottomSheet';
import { useNarrowScreen } from '@/shell/viewport';
import { DragHandle, HandleContext } from './Draggable';

/** `static`: the panel lets a parent container stack it instead of anchoring itself. */
type Position = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'static';

const ANCHORING: Record<Position, string> = {
  topLeft: 'absolute top-4 left-4',
  topRight: 'absolute top-4 right-4',
  bottomLeft: 'absolute bottom-[26px] left-4',
  bottomRight: 'absolute bottom-[26px] right-4',
  static: 'relative',
};

export function Panel({
  title,
  detail,
  marker,
  position,
  width = 260,
  height,
  onClose,
  compact = false,
  children,
}: {
  title: string;
  /** Ce qui précise le surtitre — la région sous le pointeur, après le genre du sol. Au bureau
   *  seulement : la feuille du téléphone a son propre titre. */
  detail?: string;
  marker?: string;
  position: Position;
  width?: number;
  /**
   * Given, the panel stops sizing itself to its content and its body takes the remaining
   * room. That is what a caller does once the player has dragged a corner: from then on the
   * height is his, not the list's.
   */
  height?: number;
  /** Sous le seuil, ce qui ferme la feuille : sans lui, elle suit une sélection et ne réclame pas
   *  la place des autres surfaces. Au bureau, le panneau garde ses propres boutons. */
  onClose?: () => void;
  /** Sous le seuil, la feuille s'ouvre à l'aperçu et épouse son contenu, pour que la carte qu'elle
   *  décrit reste visible au-dessus ; au bureau, sans effet. */
  compact?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const narrow = useNarrowScreen();
  const header = (
    /* The header is the grab zone whenever a `Draggable` wraps this panel, and a plain header
       when nothing does — the handle reads the context rather than taking a callback, which
       is what lets a window, a widget and this panel move by exactly the same gesture. */
    /* Sans filet sous l'en-tête (table d'état-major) : il est le surtitre de l'affiche, et le
       titre qui suit le sépare déjà du reste. */
    <DragHandle className="flex shrink-0 items-center gap-2 px-3 pt-[9px] pb-[3px]">
      <span className="eyebrow min-w-0 flex-1">
        {title}
        {detail !== undefined && (
          <>
            {' · '}
            <span>{detail}</span>
          </>
        )}
      </span>
      {marker && (
        <span className="font-(family-name:--font-mono) text-[9px] text-[var(--ink-soft)]">
          {marker}
        </span>
      )}
      <button
        type="button"
        aria-expanded={!collapsed}
        title={collapsed ? fr.panel.expand : fr.panel.collapse}
        onClick={() => setCollapsed((previous) => !previous)}
        className="h-[15px] w-[15px] shrink-0 cursor-pointer border border-[var(--ink)] text-[11px] leading-[13px] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        {collapsed ? '+' : '–'}
      </button>
    </DragHandle>
  );

  /**
   * **Sous le seuil, un panneau devient la feuille basse** (piste A, passe 2) : la même que « à
   * faire » et les calques, trois hauteurs et une poignée, entre le bandeau et la barre de pied.
   * Le repli du bureau n'y a plus de bouton — c'est la poignée qui descend d'un cran. Le
   * `HandleContext` est coupé au passage : la feuille est ancrée, son en-tête ne promet pas un
   * geste qui n'a plus lieu.
   */
  if (narrow) {
    return (
      <HandleContext.Provider value={null}>
        <BottomSheet
          title={title}
          aside={
            marker && (
              <span className="font-(family-name:--font-mono) text-[9px] text-[var(--ink-soft)]">
                {marker}
              </span>
            )
          }
          {...(onClose ? { onClose } : {})}
          {...(compact ? { initial: 'peek', hug: true, keepsSelection: true } : {})}
        >
          <div className="px-3 py-[10px]">{children}</div>
        </BottomSheet>
      </HandleContext.Provider>
    );
  }

  return (
    <section
      className={`float hud paper-grain surface-in z-10 border border-[var(--ink)] ${ANCHORING[position]} ${
        height === undefined ? '' : 'flex flex-col'
      }`}
      style={{ width, height: collapsed ? undefined : height }}
    >
      {header}
      {!collapsed && (
        <div
          className={`px-3 pt-[2px] pb-[10px] ${
            height === undefined ? '' : 'flex min-h-0 flex-1 flex-col overflow-hidden'
          }`}
        >
          {children}
        </div>
      )}
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-(color:--ink)/14 py-[5px] last:border-0">
      <span className="text-[12.5px] text-[var(--ink-soft)]">{label}</span>
      <span className="font-(family-name:--font-mono) text-[12.5px] text-[var(--ink)]">
        {value}
      </span>
    </div>
  );
}
