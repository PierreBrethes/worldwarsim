import type { Fx, MapMotion } from '@/domain/map-motion';

export const AMBIENT_HZ = 12;

/** Ambient time is quantised so every effect steps on its own beat, even when the map renders at 60. */
export const ambientStep = (nowMs: number, hz = AMBIENT_HZ): number =>
  Math.floor((nowMs / 1000) * hz);
export const ambientTime = (step: number, hz = AMBIENT_HZ): number => step / hz;

export type AmbientLayer = {
  readonly fx: Fx;
  /** Steps per second, `AMBIENT_HZ` when absent: the sea swells at 12, the wind flows at 30. */
  readonly hz?: number;
  /** Steps with the frames the map draws anyway and never asks for one: the contours at the finger. */
  readonly passive?: boolean;
  /** True when it has nothing to animate: its beat asks for no frame — a smoke without a worn pile in sight. */
  idle?(): boolean;
  frame(time: number, motion: MapMotion): void;
};

type Paced = { readonly layer: AmbientLayer; step: number; time: number };

export class Ambience {
  motion: MapMotion = 'full';
  private readonly layers: Paced[] = [];

  constructor(private readonly active: ReadonlySet<Fx>) {}

  enabled(fx: Fx): boolean {
    return this.active.has(fx);
  }

  add(layer: AmbientLayer): void {
    if (this.enabled(layer.fx)) {
      this.layers.push({ layer, step: Number.NEGATIVE_INFINITY, time: 0 });
    }
  }

  /** True when a layer's new step fell: ask for one frame, not a window. */
  advance(nowMs: number): boolean {
    if (this.motion !== 'full') return false;
    let stepped = false;
    for (const paced of this.layers) {
      if (paced.layer.idle?.()) continue;
      const step = ambientStep(nowMs, paced.layer.hz);
      if (step === paced.step) continue;
      paced.step = step;
      paced.time = ambientTime(step, paced.layer.hz);
      if (!paced.layer.passive) stepped = true;
    }
    return stepped;
  }

  frame(): void {
    for (const { layer, time } of this.layers) layer.frame(time, this.motion);
  }
}
