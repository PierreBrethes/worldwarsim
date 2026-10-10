import type { Fx, MapMotion } from '@/domain/map-motion';

export const AMBIENT_HZ = 12;

/** Ambient time is quantised so every effect steps together, even when the map renders at 60. */
export const ambientStep = (nowMs: number): number => Math.floor((nowMs / 1000) * AMBIENT_HZ);
export const ambientTime = (step: number): number => step / AMBIENT_HZ;

export type AmbientLayer = {
  readonly fx: Fx;
  frame(time: number, motion: MapMotion): void;
};

export class Ambience {
  motion: MapMotion = 'full';
  private readonly layers: AmbientLayer[] = [];
  private step = Number.NEGATIVE_INFINITY;
  private time = 0;

  constructor(private readonly active: ReadonlySet<Fx>) {}

  enabled(fx: Fx): boolean {
    return this.active.has(fx);
  }

  add(layer: AmbientLayer): void {
    if (this.enabled(layer.fx)) this.layers.push(layer);
  }

  /** True when a new step fell and a layer will want it: ask for one frame, not a window. */
  advance(nowMs: number): boolean {
    const step = ambientStep(nowMs);
    if (this.motion !== 'full' || step === this.step) return false;
    this.step = step;
    this.time = ambientTime(step);
    return this.layers.length > 0;
  }

  frame(): void {
    for (const layer of this.layers) layer.frame(this.time, this.motion);
  }
}
