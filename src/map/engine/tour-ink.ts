import { Group, Mesh, Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { WorldFrame } from './frame';
import { PALETTE } from './palette';
import { dashPitch, Ribbon, RibbonMaterial, ribbonWidth } from './route-ribbon';

/** **Une boucle de tournée** (ADR 0028) : le chargement, ses dépôts dans l'ordre — ceux que ce
 *  tour saute, pleins, marqués —, et retour. En tracé, elle est encore à l'encre pointillée. */
export type TourLoop = {
  readonly base: LonLat;
  readonly stops: ReadonlyArray<{ readonly at: LonLat; readonly skipped: boolean }>;
  readonly tracing: boolean;
};

type Stroke = { readonly points: ReadonlyArray<LonLat>; readonly dashed: boolean };

/** **Les traits d'une boucle** : pleins là où elle passe, pointillés par un dépôt sauté, et
 *  partout tant qu'on la trace. */
export function strokesOf({ base, stops, tracing }: TourLoop): ReadonlyArray<Stroke> {
  const points = [base, ...stops.map((stop) => stop.at), base];
  const skipped = [false, ...stops.map((stop) => stop.skipped), false];
  const strokes: Array<{ points: Array<LonLat>; dashed: boolean }> = [];
  for (let i = 1; i < points.length; i += 1) {
    const dashed = tracing || skipped[i - 1]! || skipped[i]!;
    const last = strokes[strokes.length - 1];
    if (last?.dashed === dashed) last.points.push(points[i]!);
    else strokes.push({ points: [points[i - 1]!, points[i]!], dashed });
  }
  return strokes;
}

const WIDTH = 0.04;
const FLOOR_PX = 3;
const LIFT = 0.01;
const INK = { color: PALETTE.border, opacity: 0.8 };
/** **Un liseré de papier** sous l'encre, comme les fils (`thread.ts`) : la nuit, une encre sombre
 *  sur un sol sombre ne se lit plus. */
const CASING_INK = { color: PALETTE.paper, opacity: 0.7 };
const CASING_BLEED_PX = 1.6;
/** Au-dessus du sol et des voiles, sous les fils des mouvements (`thread.ts`, 9 et plus). */
const TOUR_RANK = 5;
const TOUR_CASING_RANK = 4.5;

/**
 * **Les tournées tracées à l'encre**, chez soi seulement : une ligne fermée par boucle, pleine
 * quand elle tourne, pointillée par un dépôt sauté et tant qu'on la trace. Rien ne coule : l'encre est posée, elle ne
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
  private readonly casing = new RibbonMaterial({
    width: WIDTH,
    floorPx: FLOOR_PX,
    bleedPx: CASING_BLEED_PX,
    covered: CASING_INK,
    remaining: CASING_INK,
  });
  private key = '';

  constructor(private readonly frame: WorldFrame) {
    this.group.renderOrder = TOUR_RANK;
  }

  show(loops: ReadonlyArray<TourLoop>): void {
    const key = JSON.stringify(loops);
    if (key === this.key) return;
    this.key = key;
    for (const child of [...this.group.children]) {
      if (child instanceof Ribbon) child.geometry.dispose();
      child.removeFromParent();
    }
    for (const stroke of loops.flatMap(strokesOf)) {
      const lifted = stroke.points.map((point) => {
        const at = this.frame.projectLonLat(point);
        return new Vector3(at.x, at.y + LIFT, at.z);
      });
      const ribbon = new Ribbon(lifted, stroke.dashed ? this.dashed : this.solid);
      ribbon.renderOrder = TOUR_RANK;
      ribbon.frustumCulled = false;
      const backing = new Mesh(ribbon.geometry, this.casing);
      backing.renderOrder = TOUR_CASING_RANK;
      backing.frustumCulled = false;
      this.group.add(backing, ribbon);
    }
  }

  animate(unitsPerPixel: number, screenHeight: number): void {
    if (this.group.children.length === 0) return;
    const drawn = ribbonWidth(WIDTH, FLOOR_PX, unitsPerPixel);
    for (const material of [this.solid, this.dashed, this.casing]) {
      material.viewHeight = screenHeight;
      material.pitch = dashPitch(drawn);
    }
  }

  dispose(): void {
    this.show([]);
    this.solid.dispose();
    this.dashed.dispose();
    this.casing.dispose();
    this.group.removeFromParent();
  }
}
