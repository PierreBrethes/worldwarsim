import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fr } from '@/i18n/fr';
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
  marker,
  position,
  width = 260,
  height,
  children,
}: {
  title: string;
  marker?: string;
  position: Position;
  width?: number;
  /**
   * Given, the panel stops sizing itself to its content and its body takes the remaining
   * room. That is what a caller does once the player has dragged a corner: from then on the
   * height is his, not the list's.
   */
  height?: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const narrow = useNarrowScreen();
  const header = (
    /* The header is the grab zone whenever a `Draggable` wraps this panel, and a plain header
       when nothing does — the handle reads the context rather than taking a callback, which
       is what lets a window, a widget and this panel move by exactly the same gesture. */
    <DragHandle className="flex shrink-0 items-center gap-2 border-b border-[var(--ink)] px-3 py-2">
      <span className="eyebrow flex-1">{title}</span>
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
        className={`shrink-0 cursor-pointer border border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] ${
          narrow ? 'w-[44px] text-[15px]' : 'h-[15px] w-[15px] text-[11px] leading-[13px]'
        }`}
      >
        {collapsed ? '+' : '–'}
      </button>
    </DragHandle>
  );

  /**
   * **Sous le seuil, un panneau devient une feuille ancrée en bas** (décision du 15/09) : pleine
   * largeur, au-dessus du rail, bornée à 60 % de l'écran et défilante. La carte reste visible
   * par-dessus — un panneau de garnison qui la cache ne sert plus la visée.
   *
   * Il sort par un portail parce que ses appelants le posent dans un `Draggable`, dont la
   * translation est un bloc conteneur : un `fixed` à l'intérieur se mesurerait sur la poussée du
   * joueur au lieu de l'écran. Et le `HandleContext` est coupé au passage — la feuille est
   * ancrée, son en-tête ne promet pas un geste qui n'a plus lieu.
   *
   * **Son plan est celui du bandeau** (`--z-band`), le seul qui tienne les deux bouts : au-dessus
   * de ce que la carte épingle — à `--z-marker` et `--z-indicator`, les chiffres de gisement
   * traversaient la feuille — et sous les fenêtres, parce qu'un panneau n'a jamais été au-dessus
   * d'une fenêtre et que l'écran étroit ne renverse pas cet ordre.
   */
  if (narrow) {
    return createPortal(
      <HandleContext.Provider value={null}>
        <section className="hud hud-dock paper-grain z-[var(--z-band)] flex flex-col border-t-2 border-[var(--ink)]">
          {header}
          {!collapsed && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-[10px]">{children}</div>
          )}
        </section>
      </HandleContext.Provider>,
      document.body,
    );
  }

  return (
    <section
      className={`hud paper-grain z-10 border border-[var(--ink)] ${ANCHORING[position]} ${
        height === undefined ? '' : 'flex flex-col'
      }`}
      style={{ width, height: collapsed ? undefined : height }}
    >
      {header}
      {!collapsed && (
        <div
          className={`px-3 py-[10px] ${
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
