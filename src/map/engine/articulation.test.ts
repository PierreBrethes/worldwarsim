import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import type { ReplayView } from '@/domain/player-view';
import { REPLAY_MS, replayAt, stepBounds } from '@/domain/replay';
import { GUNS, Guns, readyOf, recoilAt, turretLimitOf, wrap } from './articulation';

/** A tank as its articulated copy keeps it: the turret on the hull, the gun in the turret. */
function tank(gunName = 'gun'): { root: Group; turret: Group; gun: Group } {
  const root = new Group();
  const turret = new Group();
  turret.name = 'turret';
  turret.position.set(0, 0.67, 0.885);
  const gun = new Group();
  gun.name = gunName;
  gun.position.set(0, 0, 0.06);
  turret.add(gun);
  root.add(turret);
  return { root, turret, gun };
}

const deg = (angle: number) => (angle * Math.PI) / 180;

describe('the turret', () => {
  it('turns to its target the short way round, from where it rests', () => {
    const { root, turret } = tank();
    turret.rotation.y = 0.1;
    const guns = new Guns(root, 'armor', null);
    // The target lies 170° one way, the piece faces 170° the other: 20° apart, not 340°.
    guns.point(wrap(deg(170) - deg(-170)), 1, 1, 0);
    expect(turret.rotation.y).toBeCloseTo(0.1 - deg(20));
    // Half-way to its pose, half-way round.
    guns.point(deg(60), 0.5, 0.5, 0);
    expect(turret.rotation.y).toBeCloseTo(0.1 + deg(30));
  });

  it('comes back to its rest exactly when the piece is no longer in joue', () => {
    const { root, turret, gun } = tank();
    const guns = new Guns(root, 'armor', null);
    guns.point(deg(80), 1, 1, 1);
    guns.point(deg(80), 0, 0, 0);
    expect(turret.rotation.y).toBe(0);
    expect([gun.rotation.x, gun.position.y, gun.position.z]).toEqual([0, 0, 0.06]);
  });

  it('keeps the L3/35 mount, which has no turret, within ±12°', () => {
    const limit = turretLimitOf('italy', 1);
    expect(limit).toBeCloseTo(deg(12));
    const { root, turret } = tank();
    const guns = new Guns(root, 'armor', limit);
    guns.point(deg(80), 1, 1, 0);
    expect(turret.rotation.y).toBeCloseTo(deg(12));
    guns.point(deg(-80), 1, 1, 0);
    expect(turret.rotation.y).toBeCloseTo(-deg(12));
    guns.point(deg(5), 1, 1, 0);
    expect(turret.rotation.y).toBeCloseTo(deg(5));
  });

  it('leaves every other tank free, and the Italian mark 2', () => {
    expect(turretLimitOf('italy', 2)).toBeNull();
    expect(turretLimitOf('france', 1)).toBeNull();
    expect(turretLimitOf(null, 1)).toBeNull();
  });
});

describe('the recoil curve', () => {
  it('goes back in 80 ms and returns in 0.5 s, and is nothing before the shot or without one', () => {
    expect(recoilAt(null)).toBe(0);
    expect(recoilAt(-5)).toBe(0);
    expect(recoilAt(40)).toBeCloseTo(0.5);
    expect(recoilAt(80)).toBe(1);
    expect(recoilAt(80 + 250)).toBeCloseTo(0.25);
    expect(recoilAt(80 + 500)).toBe(0);
    expect(recoilAt(2000)).toBe(0);
  });
});

describe('the barrel', () => {
  it('draws back along its axis, raised by its elevation: 0.14 m for a tank', () => {
    const { root, gun } = tank();
    new Guns(root, 'armor', null).point(0, 1, 1, 1);
    const { elevation, tube } = GUNS.armor;
    expect(elevation).toBe(0.04);
    expect(gun.rotation.x).toBeCloseTo(-0.04);
    expect(gun.position.z).toBeCloseTo(0.06 - tube * Math.cos(0.04));
    expect(gun.position.y).toBeCloseTo(-tube * Math.sin(0.04));
    expect(tube).toBe(0.14);
  });

  it('draws back 0.35 m for a 75, on its `barrel`, and has no turret to turn', () => {
    const root = new Group();
    const barrel = new Group();
    barrel.name = 'barrel';
    root.add(barrel);
    new Guns(root, 'artillery', null).point(deg(40), 1, 1, 1);
    expect(GUNS.artillery).toMatchObject({ tube: 0.35, elevation: 0.1, piece: 0.08, rock: -3 });
    expect(barrel.rotation.x).toBeCloseTo(-0.1);
    expect(barrel.position.z).toBeCloseTo(-0.35 * Math.cos(0.1));
  });

  it('does not aim the B1 bis hull 75: only `gun` moves', () => {
    const { root, turret } = tank();
    const hull = new Group();
    hull.name = 'gun_hull';
    hull.position.set(-0.45, 1.2, 2.635);
    root.add(hull);
    new Guns(root, 'armor', null).point(deg(30), 1, 1, 1);
    expect(turret.rotation.y).toBeCloseTo(deg(30));
    expect(hull.rotation.x).toBe(0);
    expect(hull.position.toArray()).toEqual([-0.45, 1.2, 2.635]);
  });
});

describe('when the pieces are in joue', () => {
  const view: ReplayView = {
    combatId: 'c',
    at: 0,
    point: { lon: 6.1, lat: 49.6 },
    side: 'attacker',
    won: true,
    mine: [{ role: 'armor', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
    theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
  };
  const at = (t: number) => readyOf(replayAt(view, t));

  it('is nothing on the road, settled 0.6 s into the pose, held through the fire', () => {
    const pose = stepBounds('pose').start;
    expect(at(0)).toBe(0);
    expect(at(pose)).toBe(0);
    expect(at(pose + 300)).toBeCloseTo(0.5);
    expect(at(pose + 600)).toBe(1);
    expect(at(stepBounds('riposte').start)).toBe(1);
  });

  it('gets up in the account, and is at rest when it ends or at cut motion', () => {
    const report = stepBounds('compte-rendu').start;
    expect(at(report + 100)).toBe(1);
    expect(at(report + 500)).toBeCloseTo(0.5);
    expect(at(REPLAY_MS)).toBe(0);
    expect(readyOf(replayAt(view, 0, 'off'))).toBe(0);
  });

  it('holds the pose at reduced motion, each step played out', () => {
    expect(readyOf(replayAt(view, stepBounds('frappe').start + 1, 'reduced'))).toBe(1);
    expect(readyOf(replayAt(view, stepBounds('voyage').start + 1, 'reduced'))).toBe(0);
  });
});
