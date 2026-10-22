import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CircleGeometry, type Mesh, type MeshBasicMaterial, Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { World } from '@/domain/world';
import projectionAsset from '../../../public/projection.json';
import { WorldFrame } from './frame';
import { MapEngine } from './index';
import { depositAim, PlacingGhost, THREAD_MARGIN, threadPath } from './placing';
import { destinationPoint } from '@/domain/geo';
import { DEPOSIT_POINTS } from '@/domain/world';

const world = {
  sphere: projectionAsset.sphere,
  outline: projectionAsset.outline,
  countries: [],
} as unknown as World;

const PARIS: LonLat = [2.35, 48.86];
const DEPOSIT: LonLat = [3.0, 50.4];

/** The pointer is over Paris, the magnet drags it to the deposit: the pin must stand there. */
const armed = (touch = false) => {
  const frame = new WorldFrame(world);
  const ghost = new PlacingGhost(frame, touch);
  ghost.arm(null, () => DEPOSIT);
  const at = frame.projectLonLat(PARIS);
  ghost.aimAt(at.x + frame.centerX, at.z + frame.centerY);
  return { frame, ghost };
};

describe('the pin of a placement', () => {
  it('is planted at the very point the ghost holds, not under the pointer', () => {
    const { frame, ghost } = armed();
    expect(ghost.spot).toEqual(DEPOSIT);
    expect(ghost.pin.visible).toBe(true);
    ghost.object.updateMatrixWorld(true);
    const foot = ghost.pin.getWorldPosition(new Vector3());
    const held = frame.projectLonLat(DEPOSIT);
    expect(foot.x).toBeCloseTo(held.x);
    expect(foot.z).toBeCloseTo(held.z);
  });

  /** The head is blue-grey on ink: on a night sea only the ink reads. A paper ring outside it
   *  keeps the pin legible on day land and night sea alike. */
  it('wears a paper ring round its ink ring, whatever the sky', () => {
    const { ghost } = armed();
    const ring = (hex: string) =>
      ghost.pin.children.filter(
        (part) =>
          (part as Mesh<CircleGeometry, MeshBasicMaterial>).material.color.getHexString() === hex,
      ) as Array<Mesh<CircleGeometry, MeshBasicMaterial>>;
    const [paper] = ring('f1e8d2');
    const ink = ring('2a2118').find((part) => part.geometry.type === 'CircleGeometry');
    expect(paper).toBeDefined();
    expect(paper!.geometry.parameters.radius).toBeGreaterThan(ink!.geometry.parameters.radius);
    expect(paper!.renderOrder).toBeLessThan(ink!.renderOrder);
  });

  it('is not there before the pointer has been on the board', () => {
    const ghost = new PlacingGhost(new WorldFrame(world));
    ghost.arm(null, (pointer) => pointer);
    expect(ghost.pin.visible).toBe(false);
  });

  it('turns red when the placement is refused, and back when it is not', () => {
    const { ghost } = armed();
    const free = ghost.pinHead.material.color.getHexString();
    ghost.refuse(true);
    expect(ghost.pinHead.material.color.getHexString()).toBe('8f3a2c');
    ghost.refuse(false);
    expect(ghost.pinHead.material.color.getHexString()).toBe(free);
  });

  /** The board says a point is refused through `MapEngine.setPlacingRefused`: the pin follows. */
  it('is reddened by the engine when the board says the point is refused', () => {
    const { ghost } = armed();
    const engine = {
      ghost,
      placingRefused: false,
      invalidate: () => {},
      refreshCursor: () => {},
    };
    MapEngine.prototype.setPlacingRefused.call(engine as never, true);
    expect(ghost.pinHead.material.color.getHexString()).toBe('8f3a2c');
  });

  it('drops onto the point when the magnet snaps, unless motion is reduced', () => {
    const { ghost } = armed();
    expect(ghost.pinDrop(0, 'full')).toBeGreaterThan(0);
    expect(ghost.pinDrop(1000, 'full')).toBe(0);
    expect(ghost.pinDrop(0, 'reduced')).toBe(0);
  });

  describe('along a coast', () => {
    afterEach(() => vi.useRealTimers());
    const headOf = (ghost: PlacingGhost) => {
      ghost.orient(new Vector3(0, 5, 0));
      return ghost.pinHead.position.y;
    };
    /** The coast magnet hands back a new point at every step of the pointer. */
    const along = () => {
      vi.useFakeTimers({ now: 0 });
      const frame = new WorldFrame(world);
      const ghost = new PlacingGhost(frame);
      ghost.arm(null, ([lon, lat]) => [lon + 0.01, lat + 0.01], false);
      const aim = (lonLat: LonLat) => {
        const at = frame.projectLonLat(lonLat);
        ghost.aimAt(at.x + frame.centerX, at.z + frame.centerY);
      };
      return { ghost, aim };
    };

    it('drops once when the magnet takes hold, not at every step along the shore', () => {
      const { ghost, aim } = along();
      aim([2, 48]);
      expect(headOf(ghost)).toBeGreaterThan(ghost.pinHeight);
      vi.advanceTimersByTime(1000);
      expect(headOf(ghost)).toBe(ghost.pinHeight);
      aim([2.2, 48.1]);
      expect(headOf(ghost)).toBe(ghost.pinHeight);
    });

    it('drops again when the magnet picks another deposit', () => {
      const { ghost, aim } = along();
      ghost.arm(null, ([lon, lat]) => [lon + 0.01, lat + 0.01], true);
      aim([2, 48]);
      vi.advanceTimersByTime(1000);
      aim([5, 50]);
      expect(headOf(ghost)).toBeGreaterThan(ghost.pinHeight);
    });
  });

  it('holds its head higher under a finger, which hides what is just beneath it', () => {
    expect(armed(true).ghost.pinHeight).toBeGreaterThan(armed(false).ghost.pinHeight);
  });
});

describe('a deposit key in hand (#239)', () => {
  const at = (id: string) => DEPOSIT_POINTS.find((deposit) => deposit.id === id)!;
  const HAINAUT = { deposit: at('coal-BEL-2'), refusal: null };
  const RUHR = { deposit: at('coal-DEU-1572'), refusal: { code: 'OUT_OF_REACH' as const } };
  const calls = [HAINAUT, RUHR];

  it('leaps onto a deposit the pose takes, and threads the pointer to it from afar', () => {
    const near = destinationPoint(HAINAUT.deposit.lonLat, 20, 0);
    expect(depositAim(calls, near).spot).toEqual(HAINAUT.deposit.lonLat);
    const far: LonLat = [2.35, 48.86];
    const aim = depositAim(calls, far);
    expect(aim.spot).toEqual(far);
    expect(aim.target?.call).toBe(HAINAUT);
    expect(aim.target!.km).toBeGreaterThan(150);
  });

  it('neither leaps onto nor threads to a deposit out of reach, though it is the nearest', () => {
    const onRuhr = destinationPoint(RUHR.deposit.lonLat, 10, 0);
    const aim = depositAim(calls, onRuhr);
    expect(aim.spot).toEqual(onRuhr);
    expect(aim.target?.call).toBe(HAINAUT);
  });

  it('threads nowhere when no deposit is open', () => {
    expect(depositAim([RUHR], [2.35, 48.86]).target).toBeNull();
  });
});

describe('the thread on screen (#239)', () => {
  it('sags between the ghost and its basin when both are on screen', () => {
    const path = threadPath({ x: 100, y: 100 }, { x: 500, y: 100 }, 1440, 900);
    expect(path.off).toBe(false);
    expect(path.to).toEqual({ x: 500, y: 100 });
    expect(path.bend.y).toBeGreaterThan(100);
  });

  it('stops at the edge of the screen, with an arrow, when the basin is off it', () => {
    const path = threadPath({ x: 700, y: 450 }, { x: 3000, y: 450 }, 1440, 900);
    expect(path.off).toBe(true);
    expect(path.to.x).toBe(1440 - THREAD_MARGIN);
    expect(path.to.y).toBe(450);
  });
});
