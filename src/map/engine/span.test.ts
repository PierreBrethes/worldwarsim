import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE } from './palette';
import { Span } from './span';

const A = new Vector3(0, 0, 0);
const B = new Vector3(0, 3, 4);

describe('Span, a stroke of ink between two points (#503)', () => {
  it('draws nothing until a sequence sets it, and nothing once it clears it', () => {
    const span = new Span('full');
    expect(span.mesh.visible).toBe(false);
    span.set(A, B, 0.2);
    expect(span.mesh.visible).toBe(true);
    span.clear();
    expect(span.mesh.visible).toBe(false);
  });

  it('runs from one point to the other', () => {
    const span = new Span('full');
    span.set(A, B, 0.2, 0.1);
    span.mesh.updateMatrixWorld(true);
    expect(span.mesh.scale.z).toBeCloseTo(5);
    expect(span.mesh.localToWorld(new Vector3(0, 0, 1)).distanceTo(B)).toBeCloseTo(0);
    expect(span.mesh.localToWorld(new Vector3(0, 0, 0)).distanceTo(A)).toBeCloseTo(0);
  });

  it('draws nothing with the motion off, outside any sequence', () => {
    const span = new Span('off');
    span.set(A, B, 0.2);
    expect(span.mesh.visible).toBe(false);
  });

  it('lightens its ink with the night, which a dark ink on dark ground would lose', () => {
    const span = new Span('full');
    span.setNight(0);
    const day = span.material.color.getHex();
    span.setNight(1);
    expect(span.material.color.getHex()).not.toBe(day);
    expect(span.material.color.getHexString()).toBe(PALETTE.paper.slice(1));
  });
});
