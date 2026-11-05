import { Group, Vector3, type Camera } from 'three';
import type { Contact } from '@/domain/contacts';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { InkRing } from './ink-ring';
import { ARC_COLORS } from './palette';

/** Where a contact's circle stands on the screen this image, in CSS pixels: laid on the board,
 *  it reads as an ellipse under a tilted eye, `rx` across and `ry` down. */
export type ContactSpot = {
  readonly number: number;
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  /** Wholly off the screen: its number waits at the edge. */
  readonly away: boolean;
};

/** The circle reaches 14 px past its farthest piece, and is never under 22 (maquette C).
 *  @a-mesurer */
const MARGIN_PX = 14;
const MIN_RADIUS_PX = 22;
const BAND_PX = 1.8;
/** Five pixels of ink, three of paper. */
const DASH_PX = 8;
/** The wash inside, by day and under the moon (maquette C). */
const WASH = { day: 0.07, night: 0.12 };
const MOON = [0.2, 0.23, 0.34];
const ELEVATION = COUNTRY_THICKNESS + 0.005;

/**
 * **Les accrochages, cerclés** (#441, maquette `carte-lisible` C) : un cercle d'encre adverse en
 * tirets autour de mes pièces et de ce que j'ai relevé au contact, lavé de la même encre. Sa
 * taille se lit en pixels : elle se refait à chaque image entière, sans en demander aucune.
 */
export class ContactRings {
  readonly group = new Group();
  private contacts: ReadonlyArray<{ readonly number: number; readonly points: Vector3[] }> = [];
  private readonly rings: InkRing[] = [];

  constructor(private readonly frame: WorldFrame) {}

  display(contacts: ReadonlyArray<Contact>): void {
    this.contacts = contacts.map(({ number, points }) => ({
      number,
      points: points.map((point) => this.frame.projectLonLat(point, ELEVATION)),
    }));
    while (this.rings.length < contacts.length) {
      const ring = new InkRing();
      this.rings.push(ring);
      this.group.add(ring);
    }
    this.rings.forEach((ring, k) => (ring.visible = k < contacts.length));
  }

  /** Lays each circle for this eye, and says where it stands; `null` while `hidden`. */
  layout(
    eye: Camera,
    width: number,
    height: number,
    unitsPerPixel: number,
    hidden: boolean,
    night: number,
    /** The figurines and maquettes drawn this image, round their point (`Standing.lights`). */
    footprints: (emit: (at: Vector3, radius: number, near: number) => void) => void,
  ): ReadonlyArray<ContactSpot> | null {
    this.group.visible = !hidden;
    if (hidden) return null;
    const screen = (at: Vector3) => {
      const v = scratch.copy(at).project(eye);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height] as const;
    };
    const drawn: Array<readonly [Vector3, number]> = [];
    if (this.contacts.length > 0) footprints((at, radius) => drawn.push([at, radius]));
    const ink = inkAt(ARC_COLORS.enemyDetected.trace, night);
    const wash = WASH.day + (WASH.night - WASH.day) * night;
    return this.contacts.map(({ number, points }, k) => {
      const center = points
        .reduce((sum, point) => sum.add(point), new Vector3())
        .divideScalar(points.length);
      const flat = (at: Vector3) => Math.hypot(at.x - center.x, at.z - center.z);
      // A piece reaches as far as what is drawn of it: up close, its figurines spread round it.
      let reach = 0;
      for (const point of points) {
        reach = Math.max(reach, flat(point));
        for (const [at, radius] of drawn)
          if (Math.hypot(at.x - point.x, at.z - point.z) <= radius)
            reach = Math.max(reach, flat(at) + radius);
      }
      const radius = Math.max(MIN_RADIUS_PX * unitsPerPixel, reach + MARGIN_PX * unitsPerPixel);
      let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let step = 0; step < RIM_SAMPLES; step++) {
        const angle = (step / RIM_SAMPLES) * 2 * Math.PI;
        const [px, py] = screen(
          rim.set(
            center.x + radius * Math.cos(angle),
            center.y,
            center.z + radius * Math.sin(angle),
          ),
        );
        [left, top, right, bottom] = [
          Math.min(left, px),
          Math.min(top, py),
          Math.max(right, px),
          Math.max(bottom, py),
        ];
      }
      const [x, y, rx, ry] = [
        (left + right) / 2,
        (top + bottom) / 2,
        (right - left) / 2,
        (bottom - top) / 2,
      ];
      const ring = this.rings[k]!;
      ring.position.copy(center);
      ring.scale.setScalar(radius);
      ring.outline(
        ink,
        1 - (BAND_PX * unitsPerPixel) / radius,
        Math.round((2 * Math.PI * Math.hypot(rx, ry)) / Math.SQRT2 / DASH_PX),
        wash,
      );
      const away = right < 0 || bottom < 0 || left > width || top > height;
      return { number, x, y, rx, ry, away };
    });
  }
}

/** Points of the rim projected to find its ellipse on the screen. */
const RIM_SAMPLES = 16;
const rim = new Vector3();
const scratch = new Vector3();

/** Under the moon an ink climbs toward a pale blue to stay legible (maquette `inkAt`). */
export function inkAt(hex: string, night: number): string {
  const channels = [1, 3, 5].map((at, k) => {
    const v = parseInt(hex.slice(at, at + 2), 16);
    const lifted = (v * 0.55 + MOON[k]! * 255) * 1.2;
    return Math.round(Math.min(255, v + (lifted - v) * 0.7 * night));
  });
  return `rgb(${channels.join(',')})`;
}
