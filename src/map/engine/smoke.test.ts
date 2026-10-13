import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { charred, PLUME_BY_WEAR, puffAt, Smoke } from './smoke';

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
