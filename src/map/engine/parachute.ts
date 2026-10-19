import {
  BoxGeometry,
  CircleGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import type { WorldFrame } from './frame';

/** The descent, the rest on the ground, and the fade: a packet is a moment, never ambience. */
export const FALL_MS = 1800;
const REST_MS = 700;
const FADE_MS = 500;
export const PARACHUTE_MS = FALL_MS + REST_MS + FADE_MS;
/** Reduced motion lays the packet down at once, for as long as a stamp's first beat. */
const STILL_MS = 1400;

/** On screen, in pixels: the canopy's width and the height it falls from. */
const CANOPY_PX = 34;
const HEIGHT_PX = 150;

/**
 * **Where a packet is at `age` ms** (ADR 0028 §4): the share of its height still to fall
 * (`1` at the plane, `0` on the ground) and its opacity; `null` once gone. Cut motion draws
 * nothing, reduced motion only lays it down, and a full fall slows as it nears the ground, the
 * canopy being a brake.
 */
export function parachuteAt(
  age: number,
  motion: MapMotion,
): { readonly height: number; readonly opacity: number } | null {
  if (motion === 'off' || age < 0) return null;
  if (motion === 'reduced')
    return age < STILL_MS ? { height: 0, opacity: age < STILL_MS - FADE_MS ? 1 : 0.5 } : null;
  if (age >= PARACHUTE_MS) return null;
  if (age < FALL_MS) return { height: (1 - age / FALL_MS) ** 1.6, opacity: 1 };
  const resting = age - FALL_MS;
  return { height: 0, opacity: resting < REST_MS ? 1 : 1 - (resting - REST_MS) / FADE_MS };
}

const CANOPY = new SphereGeometry(0.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
const CRATE = new BoxGeometry(0.16, 0.16, 0.16);
const FOUR_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-0.4, -0.1],
  [0.4, -0.1],
  [-0.1, 0.4],
  [0.1, -0.4],
];
const LINES = (() => {
  const vertices: number[] = [];
  for (const [x, z] of FOUR_CORNERS) vertices.push(x, 0.12, z, 0, -0.45, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return geometry;
})();
const SHADOW = new CircleGeometry(0.22, 16);

type Packet = { readonly object: Group; readonly start: number; readonly ground: Vector3 };

/**
 * **Le paquet sous parachute** (ADR 0028 §4): a canopy, four lines and a crate coming down on
 * the target, drawn the size of a hand whatever the zoom. One per drop; gone a moment after it
 * lands.
 */
export class ParachuteLayer {
  readonly group = new Group();
  motion: MapMotion = 'full';
  private packets: Packet[] = [];

  constructor(private readonly frame: WorldFrame) {}

  get active(): boolean {
    return this.packets.length > 0;
  }

  drop(at: LonLat, now: number): void {
    if (this.motion === 'off') return;
    const object = new Group();
    const paper = new MeshBasicMaterial({ color: '#efe6cf', transparent: true, toneMapped: false });
    const canopy = new Mesh(CANOPY, paper);
    canopy.name = 'canopy';
    canopy.position.y = 0.2;
    const rope = new LineSegments(
      LINES,
      new LineBasicMaterial({ color: '#5e4526', transparent: true, toneMapped: false }),
    );
    const crate = new Mesh(
      CRATE,
      new MeshBasicMaterial({ color: '#8a6a3e', transparent: true, toneMapped: false }),
    );
    crate.position.y = -0.53;
    // On the ground the canopy lies flat beside the crate: the shadow stays under it.
    const shadow = new Mesh(
      SHADOW,
      new MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.25,
        toneMapped: false,
      }),
    );
    shadow.name = 'shadow';
    shadow.rotation.x = -Math.PI / 2;
    object.add(canopy, rope, crate);
    const ground = this.frame.projectLonLat(at);
    this.group.add(object, shadow);
    object.userData.shadow = shadow;
    this.packets.push({ object, start: now, ground });
  }

  animate(now: number, unitsPerPixel: number): void {
    this.packets = this.packets.filter((packet) => this.place(packet, now, unitsPerPixel));
  }

  private place({ object, start, ground }: Packet, now: number, unitsPerPixel: number): boolean {
    const shadow = object.userData.shadow as Mesh;
    const state = parachuteAt(now - start, this.motion);
    if (state === null) {
      this.group.remove(object, shadow);
      return false;
    }
    const size = CANOPY_PX * unitsPerPixel;
    const landed = state.height === 0;
    object.scale.setScalar(size * (landed ? 0.7 : 1));
    // The pack hangs 0.53 under the origin: resting, it sits on the sheet.
    object.position.set(
      ground.x +
        (landed || this.motion !== 'full'
          ? 0
          : Math.sin((now - start) / 340) * size * 0.12 * state.height),
      ground.y + 0.53 * object.scale.x + state.height * HEIGHT_PX * unitsPerPixel,
      ground.z,
    );
    object.rotation.z = landed ? 0 : Math.sin((now - start) / 420) * 0.12 * state.height;
    // Down, the canopy collapses onto the ground and the lines go slack.
    const canopy = object.getObjectByName('canopy')!;
    canopy.scale.y = landed ? 0.15 : 1;
    canopy.position.y = landed ? -0.5 : 0.2;
    shadow.position.set(ground.x, ground.y + 0.001, ground.z);
    shadow.scale.setScalar(size * (1 + state.height * 0.4));
    for (const child of [...object.children, shadow])
      ((child as Mesh).material as MeshBasicMaterial).opacity =
        child === shadow ? 0.25 * state.opacity : state.opacity;
    return true;
  }

  dispose(): void {
    this.group.clear();
    this.packets = [];
  }
}
