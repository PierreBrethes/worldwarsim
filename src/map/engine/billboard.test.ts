import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { cameraYaw } from './billboard';

describe('the camera azimuth shared by upright pieces', () => {
  it('looks along +z from the south, along +x from the east', () => {
    expect(cameraYaw(new Vector3(0, 5, 5), new Vector3())).toBe(0);
    expect(cameraYaw(new Vector3(5, 5, 0), new Vector3())).toBeCloseTo(Math.PI / 2);
  });

  it('is finite and stable straight overhead', () => {
    const yaw = cameraYaw(new Vector3(0, 90, 0), new Vector3());
    expect(Number.isFinite(yaw)).toBe(true);
    expect(cameraYaw(new Vector3(0, 90, 0), new Vector3())).toBe(yaw);
  });
});
