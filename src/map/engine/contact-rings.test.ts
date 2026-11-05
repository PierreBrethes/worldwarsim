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

function eyeOver(at: LonLat, distance: number): PerspectiveCamera {
  const eye = new PerspectiveCamera(42, W / H, 0.5, 3000);
  const ground = frame.projectLonLat(at);
  eye.position.copy(ground).add(new Vector3(0, distance, 0.001));
  eye.lookAt(ground);
  eye.updateMatrixWorld();
  return eye;
}

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
    const [near, away] = rings.layout(eyeOver(metz, 60), W, H, 0.05, false, 0)!;
    expect(near).toMatchObject({ number: 1, away: false });
    expect(near!.x).toBeCloseTo(W / 2, -1);
    expect(near!.radius).toBeGreaterThan(22);
    expect(away).toMatchObject({ number: 2, away: true, radius: 22 });
  });

  it('draws none during a replay', () => {
    const rings = new ContactRings(frame);
    rings.display([contact(1, [metz])]);
    expect(rings.layout(eyeOver(metz, 60), W, H, 0.05, true, 0)).toBeNull();
    expect(rings.group.visible).toBe(false);
  });

  it('washes deeper under the moon, in an ink lifted toward its blue (maquette C)', () => {
    const rings = new ContactRings(frame);
    rings.display([contact(1, [metz])]);
    const uniforms = () => (rings.group.children[0] as InkRing).material.uniforms;
    rings.layout(eyeOver(metz, 60), W, H, 0.05, false, 0);
    const day = (uniforms().uColor!.value as Color).clone();
    expect(uniforms().uFill!.value).toBeCloseTo(0.07);
    rings.layout(eyeOver(metz, 60), W, H, 0.05, false, 1);
    const night = uniforms().uColor!.value as Color;
    expect(uniforms().uFill!.value).toBeCloseTo(0.12);
    expect(night.b).toBeGreaterThan(day.b);
  });
});
