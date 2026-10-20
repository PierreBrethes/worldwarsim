import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MapMotion } from '@/domain/map-motion';
import { scaleOf } from './dragging';

/**
 * **Les gestes d'une rangée de la bande** (#162) : appuyer puis glisser de côté la fait défiler,
 * à la souris comme au doigt, avec de l'inertie ; un geste vers le haut prend la tuile ; relâché
 * sans avoir bougé, c'est un clic, qui prend la tuile ou forme la carte.
 */
export type RailIntent = 'undecided' | 'lift' | 'scroll' | 'none';

const MOUSE_SLOP_PX = 5;
const TOUCH_SLOP_PX = 8;

export function intentOf(dx: number, dy: number, slop: number, lifts: boolean): RailIntent {
  if (Math.hypot(dx, dy) < slop) return 'undecided';
  if (Math.abs(dx) >= Math.abs(dy)) return 'scroll';
  return lifts && dy < 0 ? 'lift' : 'none';
}

/** What a frame keeps of the speed of a flung rail. @a-mesurer */
const FRICTION = 0.93;
/** Under this speed, in pixels per millisecond, the rail stops. @a-mesurer */
const STOP_SPEED = 0.05;
/** The release speed is read over this last stretch of the gesture. */
const SPEED_WINDOW_MS = 80;

/** The steps of a glide, in pixels per frame, from a release speed in pixels per millisecond. */
export function glideFrom(speed: number, frameMs: number): number[] {
  const steps: number[] = [];
  for (let at = speed; Math.abs(at) >= STOP_SPEED; at *= FRICTION) steps.push(at * frameMs);
  return steps;
}

const glides = new WeakMap<HTMLElement, () => void>();

/** « Coupées » ou « réduites », la rangée s'arrête où la main la laisse. */
function glide(rail: HTMLElement, speed: number, motion: MapMotion) {
  const steps = motion === 'full' ? glideFrom(speed, 16) : [];
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    glides.delete(rail);
    rail.style.scrollSnapType = '';
  };
  const step = (rank: number) => {
    const before = rail.scrollLeft;
    rail.scrollLeft += steps[rank]!;
    if (rank + 1 >= steps.length || rail.scrollLeft === before) return stop();
    frame = requestAnimationFrame(() => step(rank + 1));
  };
  if (steps.length === 0) return stop();
  glides.set(rail, stop);
  frame = requestAnimationFrame(() => step(0));
}

export type RailPress = {
  /** Released where it was pressed: the tile goes in hand, the card forms. */
  readonly pick: (() => void) | null;
  /** An upward gesture from a tile: it is taken under the pointer. */
  readonly lift: ((at: { x: number; y: number }, pointerId: number) => void) | null;
};

/**
 * Suivi à la fenêtre : la main quitte vite la tuile. Au doigt, le défilement est celui du
 * navigateur (`touch-pan-x`), inertie comprise ; à la souris, il est fait ici.
 */
export function pressRail(
  event: ReactPointerEvent<HTMLElement>,
  rail: HTMLElement | null,
  press: RailPress,
  motion: MapMotion,
) {
  if (event.button !== 0 || rail === null) return;
  const touch = event.pointerType === 'touch';
  if (!touch) event.preventDefault();
  glides.get(rail)?.();
  const { pointerId, clientX: x0, clientY: y0 } = event;
  const scale = scaleOf(rail);
  const start = rail.scrollLeft;
  let intent: RailIntent = 'undecided';
  let track: { t: number; x: number }[] = [{ t: event.timeStamp, x: x0 }];

  const off = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  };
  function cancel(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    off();
    rail!.style.scrollSnapType = '';
  }
  function move(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    const dx = next.clientX - x0;
    if (intent === 'undecided') {
      intent = intentOf(dx, next.clientY - y0, touch ? TOUCH_SLOP_PX : MOUSE_SLOP_PX, !!press.lift);
      if (intent === 'lift') {
        off();
        return press.lift!({ x: next.clientX, y: next.clientY }, pointerId);
      }
      if (intent === 'none' || (intent === 'scroll' && touch)) return off();
      if (intent === 'undecided') return;
      // Snapping would pull the rail back under the mouse at every move.
      rail!.style.scrollSnapType = 'none';
    }
    rail!.scrollLeft = start - dx / scale;
    track = [...track, { t: next.timeStamp, x: next.clientX }].filter(
      ({ t }) => next.timeStamp - t <= SPEED_WINDOW_MS,
    );
  }
  function up(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    off();
    if (intent === 'undecided') return press.pick?.();
    if (intent !== 'scroll') return;
    const first = track[0]!;
    const span = next.timeStamp - first.t;
    glide(rail!, span > 0 ? -(next.clientX - first.x) / span / scale : 0, motion);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}
