import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { charred, PLUME_BY_WEAR, puffAt, Smoke, Wake, WAKE_LIFE, wakePuffAt } from './smoke';

describe('PLUME_BY_WEAR', () => {
  it('leaves a whole vehicle clean and burns thicker than it smokes', () => {
    expect(PLUME_BY_WEAR.whole).toBeNull();
    const { smoking, burning } = PLUME_BY_WEAR;
    expect(burning!.puffs).toBeGreaterThan(smoking!.puffs);
    expect(burning!.opacity).toBeGreaterThan(smoking!.opacity);
  });
});

describe('puffAt', () => {
  const plume = PLUME_BY_WEAR.smoking!;

  it('is born transparent at the marker and fades out at the top', () => {
    const born = puffAt(plume, 0, 0);
    expect(born.opacity).toBe(0);
    expect(born.height).toBe(0);
    expect(puffAt(plume, 0, plume.life * 0.999).opacity).toBeLessThan(0.01);
  });

  it('loops on its life, the puffs staggered along it', () => {
    const later = puffAt(plume, 1, 0.3 + plume.life);
    for (const [key, value] of Object.entries(puffAt(plume, 1, 0.3)))
      expect(later[key as keyof typeof later]).toBeCloseTo(value);
    expect(puffAt(plume, 1, 0).height).toBeGreaterThan(0);
  });
});

describe('Smoke', () => {
  it('fades out with `fade`: fully faded shows no puff', () => {
    const smoke = new Smoke(PLUME_BY_WEAR.burning!);
    smoke.frame(1.2);
    const shown = smoke.object.children.filter((c) => c.visible).length;
    smoke.frame(1.2, 0.5);
    const dimmed = smoke.object.children.filter((c) => c.visible).length;
    smoke.frame(1.2, 0);
    expect(shown).toBeGreaterThan(0);
    expect(dimmed).toBeLessThanOrEqual(shown);
    expect(smoke.object.children.some((c) => c.visible)).toBe(false);
  });

  it('keeps its pool whatever the time: a frame moves puffs, never adds one', () => {
    const smoke = new Smoke(PLUME_BY_WEAR.burning!);
    const pool = smoke.object.children.length;
    expect(pool).toBe(PLUME_BY_WEAR.burning!.puffs);
    for (const time of [0, 1.7, 40, 1e6]) smoke.frame(time);
    expect(smoke.object.children).toHaveLength(pool);
  });
});

describe('charred', () => {
  it('darkens a shared copy and leaves the model its own material', () => {
    const paint = new MeshStandardMaterial({ color: '#808080' });
    const burnt = charred(paint);
    expect(burnt).not.toBe(paint);
    expect(charred(paint)).toBe(burnt);
    expect(paint.color.getHexString()).toBe('808080');
    expect(burnt.color.r).toBeLessThan(paint.color.r);
  });
});

describe('wakePuffAt', () => {
  it('trails behind the stern, on both sides of the road', () => {
    for (const time of [0, 0.4, 1.1, 2.3]) {
      const left = wakePuffAt(0, time);
      const right = wakePuffAt(1, time);
      expect(left.ahead).toBeLessThan(0);
      expect(right.ahead).toBeLessThan(0);
      expect(Math.sign(left.side)).toBe(-Math.sign(right.side));
    }
  });

  it('spreads and fades as it falls behind', () => {
    const young = wakePuffAt(0, 0.2 * WAKE_LIFE);
    const old = wakePuffAt(0, 0.9 * WAKE_LIFE);
    expect(old.ahead).toBeLessThan(young.ahead);
    expect(Math.abs(old.side)).toBeGreaterThan(Math.abs(young.side));
    expect(old.size).toBeGreaterThan(young.size);
    expect(old.opacity).toBeLessThan(young.opacity);
  });
});

describe('Wake', () => {
  it('keeps its pool whatever the time', () => {
    const wake = new Wake();
    const pool = wake.object.children.length;
    for (const time of [0, 3.3, 1e6]) wake.frame(time);
    expect(wake.object.children).toHaveLength(pool);
  });
});

describe('a puff of smoke', () => {
  it('never catches the pointer: it is air over the piece', () => {
    const smoke = new Smoke(PLUME_BY_WEAR.smoking!);
    expect(smoke.object.children.every((puff) => puff.userData.ground === true)).toBe(true);
  });
});
