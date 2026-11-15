import type { Box3, Material } from 'three';
import type { AmbientLayer } from './ambience';
import type { MapMotion } from '@/domain/map-motion';
import { LIVE_PX } from './site-loops';

/** **The wind's clock**, seconds, shared by every cloth: the ambience advances it at its beat. */
export const WIND_TIME = { value: 0 };
/** **The instant the cloths are held at** when the ambience asks nothing (reduced and cut
 *  motion): a pose in the wind, never the cloth hanging straight down. A site held still (sealed,
 *  at work) stays at its own phase instead, on the instance as on its copy. Without the fx
 *  `sites` the layer does not exist and the clock stays at 0: still a pose at each phase.
 *  `@a-mesurer` */
export const REST_WIND = 1.3;
export const WIND_KEY = 'flag-wind';

/** **How far the cloth's tip leaves its plane**, in the metres of its file, and the slower, finer
 *  ripple riding on it. `@a-mesurer` */
const SWELL = 0.35;
const RIPPLE = 0.08;

/**
 * **A cloth that flies** (#422): its vertices lifted along their normal by a wave that runs from
 * the pole (u = 0, still) to the tip (u = 1). `aWind` is per instance — x is 1 for a cloth that
 * lives, 0 for one held still, y its phase, so that a row of sites is not a parade; a copy
 * (no instancing) lives at phase 0. Nothing here asks for a frame: the clock is the ambience's.
 */
export function windy<M extends Material>(material: M, still?: number): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND_TIME;
    // A copy held still reads its phase alone, never the clock.
    if (still !== undefined) shader.uniforms.uWindStill = { value: still };
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `uniform float uWindTime;
${still === undefined ? '' : 'uniform float uWindStill;'}
#ifdef USE_INSTANCING
attribute vec2 aWind;
#endif
void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
float windAt = uWindTime * aWind.x + aWind.y;
#else
float windAt = ${still === undefined ? 'uWindTime' : 'uWindStill'};
#endif
transformed += normalize(normal) * (sin(windAt * 3.0 - uv.x * 6.0) * ${SWELL.toFixed(2)} + sin(windAt * 5.3 - uv.x * 11.0) * ${RIPPLE.toFixed(2)}) * uv.x;`,
      );
  };
  material.customProgramCacheKey = () => (still === undefined ? WIND_KEY : `${WIND_KEY}-still`);
  return material;
}

/**
 * **My flags in the wind, an ambience** (`ambience.ts`): it only advances the clock. Idle when no
 * flag of mine in view reaches `LIVE_PX`, so the board rests; at reduced and cut motion it asks
 * nothing and the cloths hold `REST_WIND`.
 */
export class FlagWindLayer implements AmbientLayer {
  readonly fx = 'sites';
  readonly hz = 8;

  constructor(
    /** The cloths of my sites that fly, drawn whole, as boxes of the board. */
    private readonly flying: () => ReadonlyArray<Box3>,
    private readonly sees: (box: Box3, px: number) => boolean,
  ) {}

  idle(): boolean {
    return !this.flying().some((box) => this.sees(box, LIVE_PX));
  }

  frame(time: number, motion: MapMotion): void {
    WIND_TIME.value = motion === 'full' ? time : REST_WIND;
  }
}
