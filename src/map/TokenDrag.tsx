import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { grabbedAfter, grabbedWithin, type SupplyLoad } from '@/domain/logistics';
import { ResourcePlate } from '@/emblems/Plate';
import { motionNow } from '@/shell/paper-motion';

/** Under this travel the press is still growing the grab, not yet carrying it. */
const MOVE_PX = 5;

/** The tokens let go over nothing go back to their bin in this long (#251). */
const HOME_MS = 280;

type Point = { readonly x: number; readonly y: number };

export type TokenHint = {
  readonly text: string;
  readonly refused: boolean;
  readonly amount: number;
};

/**
 * **Glisser des jetons sur un transport** (ADR 0028 §4, prototype v3) : le geste de
 * l'embarquement. La prise vaut 10, ou ce que la source tient si c'est moins ; tenue sans bouger, elle grossit (`grabbedAfter`). Sous la
 * main, l'étiquette d'un transport (`[data-carrier-id]`) ; la pastille dit ce que le lâcher
 * chargerait, ou le refus en rouge, et les jetons rentrent.
 */
export function useTokenDrag<From>({
  read,
  stock,
  drop,
  onHold,
}: {
  /** Ce que la source tient : la prise ne le dépasse pas, sous la main comme au lâcher. */
  stock: (from: From, resource: keyof SupplyLoad) => number;
  /** Ce que le lâcher ferait sur ce transport (`null` : rien sous la main), pour cette prise. */
  read: (
    from: From,
    carrierId: string | null,
    resource: keyof SupplyLoad,
    grabbed: number,
  ) => TokenHint;
  drop: (from: From, carrierId: string, resource: keyof SupplyLoad, amount: number) => void;
  /** La main porte des jetons : les étiquettes des transports se montrent toutes. */
  onHold?: (holding: boolean) => void;
}) {
  const [carry, setCarry] = useState<{
    resource: keyof SupplyLoad;
    grabbed: number;
    hint: TokenHint | null;
  } | null>(null);
  const node = useRef<HTMLDivElement>(null);
  const latest = useRef({ read, stock, drop, onHold });
  latest.current = { read, stock, drop, onHold };
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const start = (from: From, resource: keyof SupplyLoad, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    // A bin that is empty is not taken from: the tap that pins it goes its own way.
    if (grabbedWithin(grabbedAfter(0), latest.current.stock(from, resource)) === 0) return;
    event.preventDefault();
    event.stopPropagation();
    cancel.current?.();
    const element = event.currentTarget;
    /** The bin the tokens come out of, where there is one: it says what the hand holds. */
    const bins = (() => {
      const resourceOf = element.closest<HTMLElement>('[data-bin]')?.dataset.bin;
      return resourceOf === undefined
        ? []
        : [...document.querySelectorAll<HTMLElement>(`[data-bin="${resourceOf}"]`)];
    })();
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    const origin = { x: event.clientX, y: event.clientY };
    const pressedAt = performance.now();
    let moved = false;
    const held = (ms: number) =>
      grabbedWithin(grabbedAfter(ms), latest.current.stock(from, resource));
    let grabbed = held(0);
    let at = origin;
    const carrierAt = (x: number, y: number): string | null => {
      for (const under of document.elementsFromPoint(x, y)) {
        const id = under.closest<HTMLElement>('[data-carrier-id]')?.dataset.carrierId;
        if (id !== undefined) return id;
      }
      return null;
    };
    const show = () => {
      grabbed = grabbedWithin(grabbed, latest.current.stock(from, resource));
      for (const bin of bins) if (moved || grabbed > held(0)) bin.dataset.holding = String(grabbed);
      const hint = moved
        ? latest.current.read(from, carrierAt(at.x, at.y), resource, grabbed)
        : null;
      setCarry({ resource, grabbed, hint });
      if (node.current) node.current.style.transform = `translate(${at.x}px, ${at.y}px)`;
    };
    const grow = window.setInterval(() => {
      if (moved) return;
      grabbed = held(performance.now() - pressedAt);
      show();
    }, 100);
    const finish = (returns = false) => {
      if (returns && moved) flyHome(node.current, element.closest<HTMLElement>('[data-bin]'), at);
      for (const bin of bins) delete bin.dataset.holding;
      window.clearInterval(grow);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelled);
      window.removeEventListener('keydown', escape);
      cancel.current = null;
      setCarry(null);
      latest.current.onHold?.(false);
    };
    const move = (step: PointerEvent) => {
      if (step.pointerId !== pointerId) return;
      at = { x: step.clientX, y: step.clientY };
      moved ||= Math.hypot(at.x - origin.x, at.y - origin.y) > MOVE_PX;
      show();
    };
    const up = (step: PointerEvent) => {
      if (step.pointerId !== pointerId) return;
      const carrierId = carrierAt(step.clientX, step.clientY);
      const hint = latest.current.read(from, carrierId, resource, grabbed);
      const drops = moved && carrierId !== null && !hint.refused && hint.amount > 0;
      finish(!drops);
      /** Le lâcher n'est pas un clic : l'étiquette dessous n'ouvre rien. */
      const swallow = (click: MouseEvent) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (drops) latest.current.drop(from, carrierId, resource, hint.amount);
    };
    const cancelled = () => finish(true);
    const escape = (key: KeyboardEvent) => {
      if (key.key === 'Escape') finish(true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelled);
    window.addEventListener('keydown', escape);
    cancel.current = finish;
    latest.current.onHold?.(true);
    show();
  };

  const chip = createPortal(
    <div
      ref={node}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[var(--z-popin)]"
      style={{ display: carry === null ? 'none' : 'block' }}
    >
      {carry !== null && (
        <div className="relative -translate-x-1/2 -translate-y-1/2">
          <div className="flex rotate-[-3deg] items-center gap-[4px] border border-[var(--ink)] bg-[#efe5cc] px-[6px] py-[4px] font-(family-name:--font-mono) text-[12px] font-semibold shadow-[0_10px_18px_rgba(0,0,0,.45)]">
            <ResourcePlate resource={carry.resource} height={20} />×{carry.grabbed}
          </div>
          {carry.hint !== null && (
            <div
              role="status"
              className="paper-grain absolute top-[calc(100%+8px)] left-1/2 w-max max-w-[280px] -translate-x-1/2 border border-[var(--ink)] px-[9px] py-[6px] text-[12px] leading-[1.3] font-semibold"
              style={
                carry.hint.refused
                  ? { borderColor: 'var(--critical)', color: 'var(--critical)' }
                  : undefined
              }
            >
              {carry.hint.text}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );

  return { start, chip, carrying: carry !== null };
}

/**
 * **Les jetons rentrent au bac** : une copie de la main, sans son étiquette, glisse de l'endroit où
 * on les a lâchés jusqu'au bac et s'efface. « actives » seulement.
 */
function flyHome(hand: HTMLElement | null, bin: HTMLElement | null, from: Point) {
  if (hand === null || bin === null || motionNow() !== 'full') return;
  const box = bin.getBoundingClientRect();
  const ghost = hand.cloneNode(true) as HTMLElement;
  ghost.querySelector('[role="status"]')?.remove();
  document.body.append(ghost);
  ghost
    .animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 1 },
        {
          transform: `translate(${box.left + box.width / 2}px, ${box.top + 20}px)`,
          opacity: 0.2,
        },
      ],
      { duration: HOME_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    )
    .finished.then(
      () => ghost.remove(),
      () => ghost.remove(),
    );
}
