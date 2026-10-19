import { Group, Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { WorldFrame } from './frame';
import { PALETTE } from './palette';
import { dashPitch, Ribbon, RibbonMaterial, ribbonWidth } from './route-ribbon';

/** **Une boucle de tournée** (ADR 0028) : le chargement, ses dépôts dans l'ordre, et retour. En
 *  tracé, elle est encore à l'encre pointillée. */
export type TourLoop = { readonly points: ReadonlyArray<LonLat>; readonly tracing: boolean };

const WIDTH = 0.04;
const FLOOR_PX = 2.2;
const LIFT = 0.01;
const INK = { color: PALETTE.border, opacity: 0.8 };

/**
 * **Les tournées tracées à l'encre**, chez soi seulement : une ligne fermée par boucle, pleine
 * quand elle tourne, pointillée tant qu'on la trace. Rien ne coule : l'encre est posée, elle ne
 * demande aucune image (`frame-demand.ts`), seule l'épaisseur suit le zoom.
 */
export class TourInk {
  readonly group = new Group();
  private readonly solid = new RibbonMaterial({
    width: WIDTH,
    floorPx: FLOOR_PX,
    covered: INK,
    remaining: INK,
  });
  private readonly dashed = new RibbonMaterial({
    width: WIDTH,
    floorPx: FLOOR_PX,
    covered: INK,
    remaining: INK,
    dashed: true,
  });
  private key = '';

  constructor(private readonly frame: WorldFrame) {
    this.group.renderOrder = 5;
  }

  show(loops: ReadonlyArray<TourLoop>): void {
    const key = JSON.stringify(loops);
    if (key === this.key) return;
    this.key = key;
    for (const child of [...this.group.children]) {
      (child as Ribbon).geometry.dispose();
      child.removeFromParent();
    }
    for (const loop of loops) {
      if (loop.points.length < 2) continue;
      const lifted = loop.points.map((point) => {
        const at = this.frame.projectLonLat(point);
        return new Vector3(at.x, at.y + LIFT, at.z);
      });
      const ribbon = new Ribbon(lifted, loop.tracing ? this.dashed : this.solid);
      ribbon.renderOrder = 5;
      ribbon.frustumCulled = false;
      this.group.add(ribbon);
    }
  }

  animate(unitsPerPixel: number, screenHeight: number): void {
    if (this.group.children.length === 0) return;
    const drawn = ribbonWidth(WIDTH, FLOOR_PX, unitsPerPixel);
    for (const material of [this.solid, this.dashed]) {
      material.viewHeight = screenHeight;
      material.pitch = dashPitch(drawn);
    }
  }

  dispose(): void {
    this.show([]);
    this.solid.dispose();
    this.dashed.dispose();
    this.group.removeFromParent();
  }
}
