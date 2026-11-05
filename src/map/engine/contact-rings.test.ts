import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3, type Color } from 'three';
import type { Contact } from '@/domain/contacts';
import type { LonLat } from '@/domain/geo';
import { ContactRings } from './contact-rings';
import { PROJECTION, WorldFrame } from './frame';
import type { InkRing } from './ink-ring';

const W = 1440;
const H = 900;
const frame = new WorldFrame(PROJECTION);

function eyeOver(at: LonLat, distance: number, back = 0.001): PerspectiveCamera {
  const eye = new PerspectiveCamera(42, W / H, 0.5, 3000);
  const ground = frame.projectLonLat(at);
  eye.position.copy(ground).add(new Vector3(0, distance, back));
  eye.lookAt(ground);
  eye.updateMatrixWorld();
  return eye;
}

const none = () => {};
/** Board units per pixel on the ground straight under `eyeOver(…, 60)`. */
const UPP = (2 * 60 * Math.tan((21 * Math.PI) / 180)) / H;
const contact = (number: number, points: LonLat[]) => ({ number, points }) as unknown as Contact;

describe('ContactRings — the circles of the contacts (#441)', () => {
  const metz: LonLat = [6.18, 49.12];

  it('circles a contact past its farthest piece, never under 22 px, and says when it is off the screen', () => {
    const rings = new ContactRings(frame);
    rings.display([
      contact(1, [
        [5.2, 49.12],
        [7.16, 49.12],
      ]),
      contact(2, [[-70, -30]]),
    ]);
    const [near, away] = rings.layout(eyeOver(metz, 60), W, H, UPP, false, 0, none)!;
    expect(near).toMatchObject({ number: 1, away: false });
    expect(near!.x).toBeCloseTo(W / 2, -1);
    expect(near!.rx).toBeGreaterThan(22);
    expect(away).toMatchObject({ number: 2, away: true });
  });

  it('draws a lone piece at 22 px, round from above and flattened under a tilted eye', () => {
    const rings = new ContactRings(frame);
    rings.display([contact(1, [metz])]);
    const [above] = rings.layout(eyeOver(metz, 60), W, H, UPP, false, 0, none)!;
    expect(above!.rx).toBeCloseTo(22, 0);
    expect(above!.ry).toBeCloseTo(22, 0);
    const [tilted] = rings.layout(eyeOver(metz, 60, 40), W, H, UPP, false, 0, none)!;
    expect(tilted!.ry).toBeLessThan(tilted!.rx * 0.9);
  });

  it('draws none during a replay', () => {
    const rings = new ContactRings(frame);
    rings.display([contact(1, [metz])]);
    expect(rings.layout(eyeOver(metz, 60), W, H, UPP, true, 0, none)).toBeNull();
    expect(rings.group.visible).toBe(false);
  });

  it('washes deeper under the moon, in an ink lifted toward its blue (maquette C)', () => {
    const rings = new ContactRings(frame);
    rings.display([contact(1, [metz])]);
    const uniforms = () => (rings.group.children[0] as InkRing).material.uniforms;
    rings.layout(eyeOver(metz, 60), W, H, UPP, false, 0, none);
    const day = (uniforms().uColor!.value as Color).clone();
    expect(uniforms().uFill!.value).toBeCloseTo(0.07);
    rings.layout(eyeOver(metz, 60), W, H, UPP, false, 1, none);
    const night = uniforms().uColor!.value as Color;
    expect(uniforms().uFill!.value).toBeCloseTo(0.12);
    expect(night.b).toBeGreaterThan(day.b);
  });

  it('reaches past the figurines drawn round a piece, not only past its point (d < 30)', () => {
    const rings = new ContactRings(frame);
    rings.display([contact(1, [metz])]);
    const at = frame.projectLonLat(metz);
    const [spot] = rings.layout(eyeOver(metz, 60), W, H, UPP, false, 0, (emit) => emit(at, 3, 1))!;
    expect(spot!.rx).toBeCloseTo(3 / UPP + 14, -1);
  });
});
