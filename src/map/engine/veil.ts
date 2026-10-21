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
import { lakeMaskOf, landMaskOf, type RouteGrid } from '@/domain/routing';
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

/**
 * **Où une coque ne va pas** : `inland`, les cellules de terre dont les quatre voisines sont de la
 * terre ou un lac — une coque s'échoue sur le reste, et un rivage de lac n'est pas une plage ;
 * `lakes`, les lacs (`LAKE_TARGET`), débordant d'une cellule sur leur rive pour couvrir l'eau
 * dessinée jusqu'au trait : le pochoir de la terre rogne ce débord.
 */
function hullBarred(grid: RouteGrid): {
  inland: Uint8Array<ArrayBuffer>;
  lakes: Uint8Array<ArrayBuffer>;
} {
  const { width, height } = grid;
  const land = landMaskOf(grid);
  const lake = lakeMaskOf(grid);
  const inland = new Uint8Array(land.length);
  const lakes = new Uint8Array(land.length);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const k = y * width + x;
      const around = [k - 1, k + 1, k - width, k + width];
      if (land[k] && around.every((n) => land[n] || lake[n])) inland[k] = 255;
      if (lake[k] || (land[k] && around.some((n) => lake[n]))) lakes[k] = 255;
    }
  return { inland, lakes };
}

function maskTexture(bytes: Uint8Array<ArrayBuffer>, grid: RouteGrid): DataTexture {
  const texture = new DataTexture(bytes, grid.width, grid.height, RedFormat);
  texture.unpackAlignment = 1;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Seulement hors de la terre dessinée : la mer, et les lacs que ses pays laissent en creux. */
function offLand(material: ShaderMaterial): ShaderMaterial {
  material.stencilWrite = true;
  material.stencilRef = LAND_STENCIL;
  material.stencilFunc = NotEqualStencilFunc;
  return material;
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
  private readonly lakeMask = { value: new DataTexture(new Uint8Array([0]), 1, 1, RedFormat) };
  private readonly board = {
    origin: { value: [0, 0] as [number, number] },
    scale: { value: [0, 0] as [number, number] },
  };
  private readonly sea: Mesh;
  private readonly inland: Mesh;
  /** Les lacs sous ce qui flotte : de l'eau, donc hors du pochoir de la terre où vit `inland`. */
  private readonly lakes: Mesh;
  private goal: Forbidden = null;
  private grounded = false;
  private clock = 0;
  motion: MapMotion = 'full';

  constructor(scene: Scene, surface: BufferGeometry) {
    this.sea = new Mesh(surface, offLand(veilMaterial(this.strength.sea, null, this.board)));
    this.inland = new Mesh(
      surface,
      onLand(veilMaterial(this.strength.inland, this.mask, this.board)),
    );
    this.lakes = new Mesh(
      surface,
      offLand(veilMaterial(this.strength.inland, this.lakeMask, this.board)),
    );
    for (const mesh of [this.sea, this.inland, this.lakes]) {
      mesh.position.y = VEIL_LIFT - SEA_LEVEL;
      mesh.renderOrder = VEIL_RANK;
      mesh.visible = false;
      mesh.frustumCulled = false;
    }
    scene.add(this.sea, this.inland, this.lakes);
  }

  /** The inland is read off the routing grid, once: asked for only when a hull is first lifted. */
  ground(grid: RouteGrid, frame: WorldFrame): void {
    if (this.grounded) return;
    this.grounded = true;
    const { inland, lakes } = hullBarred(grid);
    this.mask.value.dispose();
    this.mask.value = maskTexture(inland, grid);
    this.lakeMask.value.dispose();
    this.lakeMask.value = maskTexture(lakes, grid);
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
    this.lakes.visible = this.inland.visible;
  }

  dispose(): void {
    this.mask.value.dispose();
    this.lakeMask.value.dispose();
    for (const mesh of [this.sea, this.inland, this.lakes])
      (mesh.material as ShaderMaterial).dispose();
  }
}
