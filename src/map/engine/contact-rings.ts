import { Group, Vector3, type Camera } from 'three';
import type { Contact } from '@/domain/contacts';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { InkRing } from './ink-ring';
import { ARC_COLORS } from './palette';

/** Where a contact's circle stands on the screen this image, in CSS pixels. */
export type ContactSpot = {
  readonly number: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
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
  ): ReadonlyArray<ContactSpot> | null {
    this.group.visible = !hidden;
    if (hidden) return null;
    const screen = (at: Vector3) => {
      const v = scratch.copy(at).project(eye);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height] as const;
    };
    const ink = inkAt(ARC_COLORS.enemyDetected.trace, night);
    const wash = WASH.day + (WASH.night - WASH.day) * night;
    return this.contacts.map(({ number, points }, k) => {
      const center = points
        .reduce((sum, point) => sum.add(point), new Vector3())
        .divideScalar(points.length);
      const [x, y] = screen(center);
      const farthest = Math.max(
        ...points.map((point) => {
          const [px, py] = screen(point);
          return Math.hypot(px - x, py - y);
        }),
      );
      const radius = Math.max(MIN_RADIUS_PX, farthest + MARGIN_PX);
      const ring = this.rings[k]!;
      ring.position.copy(center);
      ring.scale.setScalar(radius * unitsPerPixel);
      ring.outline(ink, 1 - BAND_PX / radius, Math.round((2 * Math.PI * radius) / DASH_PX), wash);
      const away = x + radius < 0 || y + radius < 0 || x - radius > width || y - radius > height;
      return { number, x, y, radius, away };
    });
  }
}

const scratch = new Vector3();

/** Under the moon an ink climbs toward a pale blue to stay legible (maquette `inkAt`). */
function inkAt(hex: string, night: number): string {
  const channels = [1, 3, 5].map((at, k) => {
    const v = parseInt(hex.slice(at, at + 2), 16);
    const lifted = (v * 0.55 + MOON[k]! * 255) * 1.2;
    return Math.round(Math.min(255, v + (lifted - v) * 0.7 * night));
  });
  return `rgb(${channels.join(',')})`;
}
