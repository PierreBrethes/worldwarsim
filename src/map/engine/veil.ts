import {
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  NotEqualStencilFunc,
  RedFormat,
  ShaderMaterial,
  type BufferGeometry,
  type Scene,
} from 'three';
import type { Forbidden } from '@/domain/drop-order';
import { landMaskOf, type RouteGrid } from '@/domain/routing';
import type { MapMotion } from '@/domain/map-motion';
import { COUNTRY_THICKNESS, LAND_STENCIL, SEA_LEVEL, onLand, type WorldFrame } from './frame';
import { followShare } from './landing';
import { PALETTE } from './palette';
import { TRAME_SCALE } from './regions';

/** Over the night shade, under the theatre frame, the reaches, the threads and the pieces. */
const VEIL_LIFT = COUNTRY_THICKNESS + 0.011;
const VEIL_RANK = 2.5;
/** The prototype's: a third of ink, a hatch over it that says « pas ici » without a word. */
const VEIL_DEPTH = 0.26;
const HATCH_DEPTH = 0.14;
/** The hatch's period in CSS pixels, screen-space: it reads the same at every distance and at
 *  every pixel ratio the map renders at (#189) — 4.5, what nine buffer pixels made at 2. */
const HATCH_CSS_PX = 4.5;
const FADE_RATE = 10;

function veilMaterial(
  strength: { value: number },
  inland: { value: DataTexture } | null,
  board: { origin: { value: [number, number] }; scale: { value: [number, number] } },
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      strength,
      ink: { value: new Color(PALETTE.border) },
      trameScale: TRAME_SCALE,
      inland: inland ?? { value: null },
      origin: board.origin,
      scale: board.scale,
    },
    vertexShader: `
      varying vec2 vBoard;
      void main() {
        vBoard = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float strength;
      uniform vec3 ink;
      uniform float trameScale;
      uniform sampler2D inland;
      uniform vec2 origin;
      uniform vec2 scale;
      varying vec2 vBoard;
      void main() {
        float here = ${
          inland === null
            ? '1.0'
            : 'smoothstep(0.3, 0.7, texture2D(inland, (vBoard - origin) * scale).r)'
        };
        float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / trameScale / ${HATCH_CSS_PX.toFixed(1)}));
        float alpha = strength * here * (${VEIL_DEPTH} + ${HATCH_DEPTH} * hatch);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(ink, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/** The land cells whose four neighbours are land too: a hull beaches on the rest. */
function inlandBytes(grid: RouteGrid): Uint8Array<ArrayBuffer> {
  const { width, height } = grid;
  const land = landMaskOf(grid);
  const bytes = new Uint8Array(land.length);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const k = y * width + x;
      if (land[k] && land[k - 1] && land[k + 1] && land[k - width] && land[k + width])
        bytes[k] = 255;
    }
  return bytes;
}

/**
 * **Le voile du geste** (POC « Manipuler les pions », 16/10/2026) : la pièce en main, ce où elle
 * ne peut pas aller s'assombrit sous une hachure — la mer sous ce qui marche, découpée au pochoir
 * des pays donc au trait de côte exact ; l'intérieur des terres sous ce qui flotte, lu sur la
 * grille de routage, la plage laissée claire. Il vient et part en fondu ; animations coupées, d'un
 * coup.
 */
export class CarryVeil {
  private readonly strength = { sea: { value: 0 }, inland: { value: 0 } };
  private readonly mask = { value: new DataTexture(new Uint8Array([0]), 1, 1, RedFormat) };
  private readonly board = {
    origin: { value: [0, 0] as [number, number] },
    scale: { value: [0, 0] as [number, number] },
  };
  private readonly sea: Mesh;
  private readonly inland: Mesh;
  private goal: Forbidden = null;
  private grounded = false;
  private clock = 0;
  motion: MapMotion = 'full';

  constructor(scene: Scene, surface: BufferGeometry) {
    const sea = veilMaterial(this.strength.sea, null, this.board);
    sea.stencilWrite = true;
    sea.stencilRef = LAND_STENCIL;
    sea.stencilFunc = NotEqualStencilFunc;
    this.sea = new Mesh(surface, sea);
    this.inland = new Mesh(
      surface,
      onLand(veilMaterial(this.strength.inland, this.mask, this.board)),
    );
    for (const mesh of [this.sea, this.inland]) {
      mesh.position.y = VEIL_LIFT - SEA_LEVEL;
      mesh.renderOrder = VEIL_RANK;
      mesh.visible = false;
      mesh.frustumCulled = false;
    }
    scene.add(this.sea, this.inland);
  }

  /** The inland is read off the routing grid, once: asked for only when a hull is first lifted. */
  ground(grid: RouteGrid, frame: WorldFrame): void {
    if (this.grounded) return;
    this.grounded = true;
    const texture = new DataTexture(inlandBytes(grid), grid.width, grid.height, RedFormat);
    texture.unpackAlignment = 1;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.needsUpdate = true;
    this.mask.value.dispose();
    this.mask.value = texture;
    this.board.origin.value = [-frame.width / 2, -frame.height / 2];
    this.board.scale.value = [1 / (grid.width * grid.step), 1 / (grid.height * grid.step)];
  }

  get needsGround(): boolean {
    return this.goal === 'inland' && !this.grounded;
  }

  show(forbidden: Forbidden, now: number): void {
    if (this.goal === forbidden) return;
    this.goal = forbidden;
    this.clock = now;
  }

  /** True while a veil comes or goes: it wants frames until it has settled. */
  get fading(): boolean {
    return (
      Math.abs(this.strength.sea.value - (this.goal === 'sea' ? 1 : 0)) > 0.004 ||
      Math.abs(this.strength.inland.value - (this.goal === 'inland' ? 1 : 0)) > 0.004
    );
  }

  step(now: number): void {
    const dt = Math.min(0.1, (now - this.clock) / 1000);
    this.clock = now;
    const share = this.motion === 'off' ? 1 : followShare(dt, FADE_RATE);
    for (const kind of ['sea', 'inland'] as const) {
      const strength = this.strength[kind];
      const goal = this.goal === kind ? 1 : 0;
      strength.value += (goal - strength.value) * share;
      if (Math.abs(goal - strength.value) <= 0.004) strength.value = goal;
      this[kind].visible = strength.value > 0;
    }
  }

  dispose(): void {
    this.mask.value.dispose();
    for (const mesh of [this.sea, this.inland]) (mesh.material as ShaderMaterial).dispose();
  }
}
