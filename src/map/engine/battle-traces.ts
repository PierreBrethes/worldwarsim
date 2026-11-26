import {
  BufferAttribute,
  CanvasTexture,
  Color,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import type { BattleTrace } from '@/domain/battle-traces';
import { metresOnBoard } from '@/domain/piece-size';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';
import { inkDownAtNight, type NightUniforms } from './night-here';
import { PALETTE } from './palette';

/** **Un cratère d'obus, à sa vraie taille** et à l'échelle commune (ADR 0035). `@a-mesurer` */
const CRATER_METRES = 10;
/** Le plus noir d'une trace fraîche : l'encre pâle du plateau, jamais celle d'une pièce. `@a-mesurer` */
const TRACE_GAIN = 0.55;
/** Les cratères d'une trace, autour du premier : à tant de diamètres du point, au plus. */
const SCATTER = 2.2;
const NEAREST = 1.15;
/** Au-dessus des dessins de terrain (0,2) et des bassins (0,3), sous les contours (0,5). */
const RANK = 0.4;
const LIFT = 0.004;
/** La lèvre occupe un peu plus de la moitié de sa case : la case est plus grande que le cratère. */
const CELL_SHARE = 1.85;
/** Trois cratères gravés côte à côte sur une planche, chacun lu par ses propres UV. */
const VARIANTS = 3;
const CELL = 128;

/** Le même nombre pour le même identifiant, d'une vue à l'autre : la trace ne bouge pas. */
const seeded = (id: string, k: number): number => {
  let hash = 2166136261 ^ k;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  return ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
};

/**
 * Un cratère à la gravure, à l'encre blanche que le matériau teinte : des éclats autour, la lèvre
 * irrégulière, l'ombre du fond en hachures, plus serrées du côté du soir.
 */
function engrave(context: CanvasRenderingContext2D, cell: number, seed: number): void {
  const random = (() => {
    let state = seed * 9973 + 1;
    return () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
  })();
  const x0 = cell * CELL;
  const centre = { x: x0 + CELL / 2, y: CELL / 2 };
  const radius = CELL * 0.27;
  const rim = (angle: number) =>
    radius * (1 + 0.05 * Math.sin(3 * angle + seed) + 0.03 * Math.sin(7 * angle + 2 * seed));
  context.save();
  context.strokeStyle = '#fff';
  context.fillStyle = '#fff';
  context.lineCap = 'round';
  // Les éclats : des traits courts qui partent de la lèvre.
  for (let k = 0; k < 26; k++) {
    const angle = random() * Math.PI * 2;
    const from = rim(angle) * (1.08 + random() * 0.1);
    const to = from + radius * (0.15 + random() * 0.5);
    context.lineWidth = 1 + random() * 1.5;
    context.globalAlpha = 0.5 + random() * 0.4;
    context.beginPath();
    context.moveTo(centre.x + Math.cos(angle) * from, centre.y + Math.sin(angle) * from);
    context.lineTo(centre.x + Math.cos(angle) * to, centre.y + Math.sin(angle) * to);
    context.stroke();
  }
  for (let k = 0; k < 18; k++) {
    const angle = random() * Math.PI * 2;
    const at = radius * (1.4 + random() * 0.6);
    context.globalAlpha = 0.4 + random() * 0.4;
    context.beginPath();
    context.arc(
      centre.x + Math.cos(angle) * at,
      centre.y + Math.sin(angle) * at,
      0.8 + random() * 1.4,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  // La lèvre.
  const lip = new Path2D();
  for (let step = 0; step <= 48; step++) {
    const angle = (step / 48) * Math.PI * 2;
    const r = rim(angle);
    const x = centre.x + Math.cos(angle) * r;
    const y = centre.y + Math.sin(angle) * r;
    if (step === 0) lip.moveTo(x, y);
    else lip.lineTo(x, y);
  }
  context.globalAlpha = 1;
  context.lineWidth = 3.2;
  context.stroke(lip);
  // Le fond : des hachures obliques, serrées sur la moitié dans l'ombre.
  context.clip(lip);
  context.lineWidth = 1.1;
  for (let offset = -radius * 1.5; offset < radius * 1.5; offset += 3) {
    const shaded = offset < radius * 0.2;
    if (!shaded && Math.round(offset / 3) % 2 === 0) continue;
    context.globalAlpha = shaded ? 0.85 : 0.45;
    context.beginPath();
    context.moveTo(centre.x + offset - radius, centre.y - radius);
    context.lineTo(centre.x + offset + radius, centre.y + radius);
    context.stroke();
  }
  context.restore();
}

let plate: CanvasTexture | null = null;
/** La planche, gravée au premier usage : le module se charge avant tout document. */
function plateOf(): CanvasTexture {
  if (plate !== null) return plate;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * VARIANTS;
  canvas.height = CELL;
  const context = canvas.getContext('2d')!;
  for (let cell = 0; cell < VARIANTS; cell++) engrave(context, cell, cell + 1);
  plate = new CanvasTexture(canvas);
  plate.minFilter = LinearMipmapLinearFilter;
  plate.anisotropy = 4;
  return plate;
}

/** Une case de la planche, couchée au sol, de côté 1. */
const CELLS = Array.from({ length: VARIANTS }, (_, cell) => {
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setX(k, (cell + uv.getX(k)) / VARIANTS);
  return geometry;
});

/** **Où se posent les cratères d'une trace**, en diamètres autour de son point, et leur taille. */
export function cratersAround(
  trace: Pick<BattleTrace, 'id' | 'craters'>,
): Array<{ dx: number; dz: number; size: number; variant: number; turn: number }> {
  return Array.from({ length: trace.craters }, (_, k) => {
    const angle = seeded(trace.id, 4 * k) * Math.PI * 2;
    const away = k === 0 ? 0 : NEAREST + seeded(trace.id, 4 * k + 1) * (SCATTER - NEAREST);
    return {
      dx: Math.cos(angle) * away,
      dz: Math.sin(angle) * away,
      size: k === 0 ? 1 : 0.65 + seeded(trace.id, 4 * k + 2) * 0.45,
      variant: Math.floor(seeded(trace.id, 4 * k + 3) * VARIANTS),
      turn: seeded(trace.id, 4 * k + 5) * Math.PI * 2,
    };
  });
}

/**
 * **Le champ de bataille se souvient** (#642) : les cratères de mes combats sur terre, à l'encre
 * pâle, sous les contours et les pièces, sur la terre seule (`onLand`). Rien n'est animé : la
 * trace est posée à chaque vue, identique dans les trois réglages, et pâlit d'une vue à l'autre.
 */
export class BattleTraces {
  readonly object = new Group();
  private readonly ink = new Color(PALETTE.border);

  constructor(
    private readonly frame: Pick<WorldFrame, 'projectLonLat'>,
    private readonly night: NightUniforms,
  ) {}

  show(traces: ReadonlyArray<BattleTrace>): void {
    this.clear();
    if (traces.length === 0) return;
    const diameter = metresOnBoard(CRATER_METRES);
    for (const trace of traces) {
      const material = inkDownAtNight(
        onLand(
          new MeshBasicMaterial({
            color: this.ink,
            map: plateOf(),
            transparent: true,
            opacity: TRACE_GAIN * trace.ink,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -4,
          }),
        ),
        this.night,
      );
      const at = this.frame.projectLonLat(trace.point, COUNTRY_THICKNESS + LIFT);
      for (const crater of cratersAround(trace)) {
        const mesh = new Mesh(CELLS[crater.variant]!, material);
        mesh.position.set(at.x + crater.dx * diameter, at.y, at.z + crater.dz * diameter);
        mesh.scale.setScalar(crater.size * diameter * CELL_SHARE);
        mesh.rotation.y = crater.turn;
        mesh.renderOrder = RANK;
        // Décor : ni visé ni cliqué.
        mesh.raycast = () => {};
        this.object.add(mesh);
      }
    }
  }

  /** How many craters stand now: what the tests read. */
  get size(): number {
    return this.object.children.length;
  }

  dispose(): void {
    this.clear();
    this.object.removeFromParent();
  }

  private clear(): void {
    const materials = new Set(
      this.object.children.map((mesh) => (mesh as Mesh<PlaneGeometry, MeshBasicMaterial>).material),
    );
    for (const material of materials) material.dispose();
    this.object.clear();
  }
}
