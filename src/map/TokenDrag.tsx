import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { grabbedWithin, type SupplyLoad } from '@/domain/logistics';
import { fineLoadOf, railLoadOf, wheelLoadOf, type LoadBound } from '@/domain/load-gauge';
import { ResourcePlate } from '@/emblems/Plate';
import { motionNow } from '@/shell/paper-motion';
import { GAUGE_H, GAUGE_W, LoadGauge, type GaugeLayout } from './LoadGauge';

/** Under this travel the press is still a tap, not yet a carry. */
const MOVE_PX = 5;

/** The tokens let go over nothing go back to their bin in this long (#251). */
const HOME_MS = 280;

/** A finger hides what it aims at: the held pile is drawn this far above it (#319). */
const FINGER_LIFT_PX = 64;

/** Reach of the three bands around an open gauge, past its own edges (#319, `jauge.html`). */
const SIDE_PX = 40;
const FINE_BAND_PX = 150;
const TAG_BAND_PX = 16;

/** The view moves under a held hand (a transport leaves, a stock falls): the gauge reads it again. */
const RESYNC_MS = 200;

/** The whole bin: the hand takes everything the source holds. */
const WHOLE_BIN = Number.POSITIVE_INFINITY;

type Point = { readonly x: number; readonly y: number };

/** **What a drop on this transport would do**, and what its gauge reads (#319). */
export type TokenHint = {
  readonly text: string;
  readonly refused: boolean;
  /** The load chosen: the full load until the hand sets one. */
  readonly amount: number;
  /** The gauge: aboard, capacity, the full load and what binds it, aboard per resource. */
  readonly held: number;
  readonly capacity: number;
  readonly max: number;
  readonly bound: LoadBound;
  readonly load: SupplyLoad;
  readonly title: string;
  readonly word: string | null;
};

type Band = 'tag' | 'rail' | 'fine';

const within = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * **Glisser des jetons sur un transport** (ADR 0028 §4, #319) : la main prend tout le bac. Sous
 * elle, l'étiquette d'un transport (`[data-carrier-id]`) déplie la jauge de bord au-dessus de sa
 * colonne, préremplie au plein ; la main y règle la charge (la voie, le pas fin au-dessus, la
 * molette) et le lâcher charge ce que la jauge montre. Un refus se dit sur la pastille de la main
 * et d'un liseré (`data-aim`) ; hors de l'étiquette et de la jauge, celle-ci se replie.
 */
export function useTokenDrag<From>({
  read,
  stock,
  drop,
  onHold,
}: {
  /** Ce que la source tient : la main en prend tout, sous la main comme au lâcher. */
  stock: (from: From, resource: keyof SupplyLoad) => number;
  /** Ce que le lâcher ferait sur ce transport (`null` : rien sous la main) pour cette charge
   *  (`null` : le plein). */
  read: (
    from: From,
    carrierId: string | null,
    resource: keyof SupplyLoad,
    picked: number | null,
  ) => TokenHint;
  drop: (from: From, carrierId: string, resource: keyof SupplyLoad, amount: number) => void;
  /** La main porte des jetons : les étiquettes des transports se montrent toutes. */
  onHold?: (holding: boolean) => void;
}) {
  const [carry, setCarry] = useState<{
    resource: keyof SupplyLoad;
    grabbed: number;
    hint: TokenHint | null;
    touch: boolean;
    gauge: { layout: GaugeLayout; fine: boolean } | null;
  } | null>(null);
  const node = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const latest = useRef({ read, stock, drop, onHold });
  latest.current = { read, stock, drop, onHold };
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const start = (from: From, resource: keyof SupplyLoad, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    // A bin that is empty is not taken from: the tap that pins it goes its own way.
    if (grabbedWithin(WHOLE_BIN, latest.current.stock(from, resource)) === 0) return;
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
    const touch = event.pointerType === 'touch';
    const origin = { x: event.clientX, y: event.clientY };
    let moved = false;
    let at: Point = origin;
    /** The gauge open on a transport, and the load the hand set in it (`null`: the full load). */
    let open: string | null = null;
    let picked: number | null = null;
    let reading: TokenHint | null = null;
    let marked: HTMLElement[] = [];
    const carrierAt = (x: number, y: number): string | null => {
      for (const under of document.elementsFromPoint(x, y)) {
        const id = under.closest<HTMLElement>('[data-carrier-id]')?.dataset.carrierId;
        if (id !== undefined) return id;
      }
      return null;
    };
    const tagOf = (id: string) => document.querySelector<HTMLElement>(`[data-carrier-id="${id}"]`);
    /** Where the gauge stands: over the whole column of tags of the pile, or under it at the top of the screen. */
    const layoutOf = (id: string) => {
      const tag = tagOf(id);
      if (tag === null) return null;
      const column = (tag.closest('.cargo-tags') ?? tag).getBoundingClientRect();
      const width = Math.min(GAUGE_W, window.innerWidth - 16);
      const below = column.top - GAUGE_H - 8 < 8;
      const layout: GaugeLayout = {
        left: within(column.left + column.width / 2 - width / 2, 8, window.innerWidth - width - 8),
        top: below ? column.bottom + 8 : column.top - GAUGE_H - 8,
        width,
      };
      return { column, below, layout };
    };
    /** Three bands: the tag (the full load, or the one set), the gauge (the hand sets it), past
     *  the gauge (the fine step). Outside the three the gauge folds. */
    const bandOf = (found: NonNullable<ReturnType<typeof layoutOf>>): Band | null => {
      const { column, below, layout } = found;
      const near = (left: number, right: number) =>
        at.x >= left - SIDE_PX && at.x <= right + SIDE_PX;
      const bottom = layout.top + GAUGE_H;
      if (near(layout.left, layout.left + layout.width) && at.y >= layout.top && at.y < bottom)
        return 'rail';
      if (near(column.left, column.right)) {
        if (
          below
            ? at.y >= column.top - TAG_BAND_PX && at.y < layout.top
            : at.y >= bottom && at.y <= column.bottom + TAG_BAND_PX
        )
          return 'tag';
      }
      if (near(layout.left, layout.left + layout.width)) {
        if (
          below
            ? at.y >= bottom && at.y <= bottom + FINE_BAND_PX
            : at.y < layout.top && at.y >= layout.top - FINE_BAND_PX
        )
          return 'fine';
      }
      return null;
    };
    const mark = (id: string | null, aim: 'open' | 'refused') => {
      const tag = id === null ? null : tagOf(id);
      if (tag === null) return;
      tag.dataset.aim = aim;
      marked.push(tag);
    };
    const unmark = () => {
      for (const tag of marked) delete tag.dataset.aim;
      marked = [];
    };
    /** Read the hand again: the view, the stock, the carriers and the hand itself may all have moved. */
    const update = (dx: number) => {
      const grabbed = grabbedWithin(WHOLE_BIN, latest.current.stock(from, resource));
      for (const bin of bins) if (moved) bin.dataset.holding = String(grabbed);
      unmark();
      if (!moved) {
        setCarry({ resource, grabbed, hint: null, touch, gauge: null });
        place();
        return;
      }
      const under = carrierAt(at.x, at.y);
      let found = open === null ? null : layoutOf(open);
      let band = found === null ? null : bandOf(found);
      if (open !== null && band === 'tag' && under !== null && under !== open) {
        // Another tag of the column: the gauge moves to it without folding.
        open = null;
        picked = null;
        found = null;
      } else if (band === null) {
        open = null;
        picked = null;
        found = null;
      }
      if (open !== null && found !== null) {
        const bar = rail.current?.getBoundingClientRect();
        const held = latest.current.read(from, open, resource, null);
        if (band === 'rail' && bar !== undefined && bar.width > 0)
          picked = railLoadOf({
            fraction: within((at.x - bar.left) / bar.width, 0, 1),
            held: held.held,
            capacity: held.capacity,
            max: held.max,
          });
        else if (band === 'fine' && bar !== undefined && bar.width > 0)
          picked = fineLoadOf({
            value: picked ?? held.max,
            dx,
            railWidth: bar.width,
            capacity: held.capacity,
            max: held.max,
          });
      }
      if (open === null && under !== null) {
        const first = latest.current.read(from, under, resource, null);
        if (!first.refused) {
          open = under;
          picked = null;
          found = layoutOf(under);
          band = found === null ? null : bandOf(found);
        }
      }
      reading = latest.current.read(from, open ?? under, resource, picked);
      if (open !== null && reading.refused) {
        // The view refused it meanwhile (it left, went on a tour): the gauge folds.
        open = null;
        picked = null;
        found = null;
        reading = latest.current.read(from, under, resource, null);
      }
      if (open !== null && picked !== null) picked = Math.min(picked, reading.max);
      if (open !== null) mark(open, 'open');
      else if (reading.refused && under !== null) mark(under, 'refused');
      for (const bin of bins)
        bin.dataset.holding = String(open === null ? grabbed : reading.amount);
      setCarry({
        resource,
        grabbed: open === null ? grabbed : reading.amount,
        hint: reading,
        touch,
        gauge:
          open !== null && found !== null ? { layout: found.layout, fine: band === 'fine' } : null,
      });
      place();
    };
    const place = () => {
      if (node.current)
        node.current.style.transform = `translate(${at.x}px, ${at.y - (touch ? FINGER_LIFT_PX : 0)}px)`;
    };
    const finish = (returns = false) => {
      if (returns && moved)
        flyHome(node.current, element.closest<HTMLElement>('[data-bin]'), {
          x: at.x,
          y: at.y - (touch ? FINGER_LIFT_PX : 0),
        });
      for (const bin of bins) delete bin.dataset.holding;
      unmark();
      window.clearInterval(resync);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelled);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('wheel', wheel, true);
      cancel.current = null;
      setCarry(null);
      latest.current.onHold?.(false);
    };
    const resync = window.setInterval(() => update(0), RESYNC_MS);
    const move = (step: PointerEvent) => {
      if (step.pointerId !== pointerId) return;
      const before = at;
      at = { x: step.clientX, y: step.clientY };
      moved ||= Math.hypot(at.x - origin.x, at.y - origin.y) > MOVE_PX;
      update(at.x - before.x);
    };
    /** The gauge owns the wheel while it is open: it sets the load, the map does not zoom. */
    const wheel = (turn: WheelEvent) => {
      if (open === null || reading === null) return;
      turn.preventDefault();
      turn.stopPropagation();
      picked = wheelLoadOf({
        value: picked ?? reading.max,
        // Shift swaps the axis on some systems.
        deltaY: turn.deltaY || turn.deltaX,
        shift: turn.shiftKey,
        max: reading.max,
      });
      update(0);
    };
    const up = (step: PointerEvent) => {
      if (step.pointerId !== pointerId) return;
      const before = at;
      at = { x: step.clientX, y: step.clientY };
      if (moved) update(at.x - before.x);
      const carrierId = open;
      const hint = reading;
      const drops =
        moved && carrierId !== null && hint !== null && !hint.refused && hint.amount > 0;
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
    // Capture: OrbitControls listens on the canvas, the gauge takes the wheel before it.
    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    cancel.current = finish;
    latest.current.onHold?.(true);
    update(0);
  };

  const hidden = carry !== null && carry.touch && carry.gauge !== null && !carry.gauge.fine;
  const chip = createPortal(
    <>
      <div
        ref={node}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[var(--z-popin)]"
        style={{ display: carry === null || hidden ? 'none' : 'block' }}
      >
        {carry !== null && (
          <div className="relative -translate-x-1/2 -translate-y-1/2">
            <div className="flex rotate-[-3deg] items-center gap-[4px] border border-[var(--ink)] bg-[#efe5cc] px-[6px] py-[4px] font-(family-name:--font-mono) text-[12px] font-semibold shadow-[0_10px_18px_rgba(0,0,0,.45)]">
              <ResourcePlate resource={carry.resource} height={20} />×{carry.grabbed}
            </div>
            {carry.hint !== null && carry.gauge === null && (
              <div
                role="status"
                className={`paper-grain absolute left-1/2 w-max max-w-[280px] -translate-x-1/2 border border-[var(--ink)] px-[9px] py-[6px] text-[12px] leading-[1.3] font-semibold ${
                  carry.touch ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'
                }`}
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
      </div>
      {carry?.gauge && carry.hint && (
        <LoadGauge
          reading={carry.hint}
          resource={carry.resource}
          layout={carry.gauge.layout}
          fine={carry.gauge.fine}
          railRef={rail}
        />
      )}
    </>,
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
