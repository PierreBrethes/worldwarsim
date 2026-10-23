import {
  useEffect,
  useRef,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { fr } from '@/i18n/fr';
import type { MapMotion } from '@/domain/map-motion';
import { pressRail } from './rail-gesture';
import { useOverflow } from './useOverflow';

/** Where a press starts: the element pressed, the pointer (`null` for Entrée), the point. */
export type Grab = {
  readonly element: HTMLElement;
  readonly pointerId: number | null;
  readonly x: number;
  readonly y: number;
};

type Take = (grab: Grab) => void;

/**
 * **Une tuile de la bande est un bouton** (#162) : un clic, un toucher ou Entrée la met en main,
 * un geste vers le haut la prend sous le pointeur, un geste de côté fait défiler sa rangée
 * (`pressRail`). Le clic qu'un pointeur laisse derrière sa pression ne la reprend pas.
 */
const gripOf =
  (rail: { readonly current: HTMLElement | null }, motion: MapMotion) =>
  (take: Take | null, { lifts = true }: { lifts?: boolean } = {}) =>
    take === null
      ? {}
      : {
          onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
            event.stopPropagation();
            const element = event.currentTarget;
            pressRail(
              event,
              rail.current,
              {
                pick: () => take({ element, pointerId: null, x: 0, y: 0 }),
                lift: lifts ? ({ x, y }, pointerId) => take({ element, pointerId, x, y }) : null,
              },
              motion,
            );
          },
          onClick: (event: ReactMouseEvent<HTMLElement>) => {
            if (event.detail === 0)
              take({ element: event.currentTarget, pointerId: null, x: 0, y: 0 });
          },
        };

export type Grip = ReturnType<ReturnType<typeof gripOf>>;

/** Between the tiles a press only scrolls. */
const NO_PICK = { pick: null, lift: null } as const;

/** **Un rang qu'on fait défiler** (#162) : glisser à la souris et au doigt, avec l'inertie que le
 *  réglage laisse ; flèches et molette au bureau. Bord à bord : ses bords s'estompent du côté où il
 *  continue, et la flèche de ce côté n'est posée que s'il y a une suite (#251). */
export function Rail({
  narrow,
  motion,
  label,
  children,
}: {
  narrow: boolean;
  motion: MapMotion;
  label: string;
  children: (grip: ReturnType<typeof gripOf>) => ReactNode;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const { before, after } = useOverflow(rail, 'x');
  const box = useRef<HTMLDivElement>(null);
  /** The arrow that holds the focus: when its side runs out it goes, and the focus must not fall. */
  const focused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const gone = focused.current;
    if (gone === null || gone.isConnected) return;
    focused.current = null;
    const other = box.current?.querySelector<HTMLElement>(':scope > button');
    const tiles = rail.current?.children;
    const reached = gone.dataset.side === 'next' ? tiles?.[tiles.length - 1] : tiles?.[0];
    const target = other ?? (reached as HTMLElement | undefined);
    target?.focus({ preventScroll: true });
  }, [before, after]);
  const track = {
    onFocus: (event: FocusEvent<HTMLElement>) => (focused.current = event.currentTarget),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.isConnected) focused.current = null;
    },
  };

  // The wheel turns the rail: a vertical wheel over a horizontal row means "the next ones".
  useEffect(() => {
    const node = rail.current;
    if (node === null) return;
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  const scroll = (direction: 1 | -1) =>
    rail.current?.scrollBy({
      left: direction * 324,
      behavior: motion === 'full' ? 'smooth' : 'auto',
    });
  const arrow =
    'paper-grain absolute top-1/2 h-[48px] w-[22px] -translate-y-[60%] cursor-pointer border border-[var(--ink)] text-[15px] leading-none hover:bg-[var(--ink)] hover:text-[var(--paper)]';

  return (
    <div ref={box} className="relative min-w-0">
      <div
        ref={rail}
        role="group"
        aria-label={label}
        data-before={narrow ? undefined : before}
        data-after={narrow ? undefined : after}
        onPointerDown={(event) => pressRail(event, rail.current, NO_PICK, motion)}
        className={`mat-rail flex h-full touch-pan-x touch-pan-y snap-x snap-proximity gap-[8px] overflow-x-auto [scrollbar-color:var(--ink-soft)_transparent] [scrollbar-width:thin] ${
          narrow ? 'pt-[2px] pr-3 pb-[6px] pl-[2px]' : 'pt-[2px] pb-[10px] pl-[2px]'
        }`}
      >
        {children(gripOf(rail, motion))}
      </div>
      {!narrow && before && (
        <button
          type="button"
          aria-label={fr.personalBoard.previous}
          data-side="previous"
          {...track}
          onClick={() => scroll(-1)}
          className={`${arrow} left-0`}
        >
          ‹
        </button>
      )}
      {!narrow && after && (
        <button
          type="button"
          aria-label={fr.personalBoard.next}
          data-side="next"
          {...track}
          onClick={() => scroll(1)}
          className={`${arrow} right-0`}
        >
          ›
        </button>
      )}
    </div>
  );
}
