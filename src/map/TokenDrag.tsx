import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { grabbedAfter, type SupplyLoad } from '@/domain/logistics';
import { ResourcePlate } from '@/emblems/Plate';

/** Under this travel the press is still growing the grab, not yet carrying it. */
const MOVE_PX = 5;

export type TokenHint = {
  readonly text: string;
  readonly refused: boolean;
  readonly amount: number;
};

/**
 * **Glisser des jetons sur un transport** (ADR 0028 §4, prototype v3) : le geste de
 * l'embarquement. La prise vaut 10 ; tenue sans bouger, elle grossit (`grabbedAfter`). Sous la
 * main, l'étiquette d'un transport (`[data-carrier-id]`) ; la pastille dit ce que le lâcher
 * chargerait, ou le refus en rouge, et les jetons rentrent.
 */
export function useTokenDrag<From>({
  read,
  drop,
  onHold,
}: {
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
  const latest = useRef({ read, drop, onHold });
  latest.current = { read, drop, onHold };
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const start = (from: From, resource: keyof SupplyLoad, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cancel.current?.();
    const element = event.currentTarget;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    const origin = { x: event.clientX, y: event.clientY };
    const pressedAt = performance.now();
    let moved = false;
    let grabbed = grabbedAfter(0);
    let at = origin;
    const carrierAt = (x: number, y: number): string | null => {
      for (const under of document.elementsFromPoint(x, y)) {
        const id = under.closest<HTMLElement>('[data-carrier-id]')?.dataset.carrierId;
        if (id !== undefined) return id;
      }
      return null;
    };
    const show = () => {
      const hint = moved
        ? latest.current.read(from, carrierAt(at.x, at.y), resource, grabbed)
        : null;
      setCarry({ resource, grabbed, hint });
      if (node.current) node.current.style.transform = `translate(${at.x}px, ${at.y}px)`;
    };
    const grow = window.setInterval(() => {
      if (moved) return;
      grabbed = grabbedAfter(performance.now() - pressedAt);
      show();
    }, 100);
    const finish = () => {
      window.clearInterval(grow);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', finish);
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
      finish();
      if (moved && carrierId !== null && !hint.refused && hint.amount > 0)
        latest.current.drop(from, carrierId, resource, hint.amount);
    };
    const escape = (key: KeyboardEvent) => {
      if (key.key === 'Escape') finish();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', finish);
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
