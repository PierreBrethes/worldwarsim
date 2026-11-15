import { Box3, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Ambience, ambientStep } from './ambience';
import { FlagWindLayer, REST_WIND, WIND_KEY, WIND_TIME, windy } from './flag-wind';
import { LIVE_PX } from './site-loops';

const box = new Box3(new Vector3(), new Vector3(1, 1, 1));

describe('windy', () => {
  it('lifts the cloth by its u along its normal, per instance, on the shared clock', () => {
    const material = windy(new MeshStandardMaterial());
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    };
    expect(material.customProgramCacheKey()).toBe(WIND_KEY);
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uWindTime).toBe(WIND_TIME);
    expect(shader.vertexShader).toContain('attribute vec2 aWind');
    expect(shader.vertexShader).toContain('transformed +=');
    // The pole side (u = 0) does not move: the lift is multiplied by u.
    expect(shader.vertexShader).toMatch(/\)\s*\*\s*uv\.x;/);
  });

  it('holds a copy still at its phase when told so, off the shared clock', () => {
    const material = windy(new MeshStandardMaterial(), 0.7);
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    };
    expect(material.customProgramCacheKey()).not.toBe(WIND_KEY);
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uWindStill!.value).toBe(0.7);
    expect(shader.vertexShader).toContain('uWindStill');
  });
});

describe('the flags ambience', () => {
  const layerOf = (seen: (box: Box3, px: number) => boolean, boxes = [box]) =>
    new FlagWindLayer(() => boxes, seen);

  it('is idle when no flag of mine in view reaches the readable size', () => {
    const asked: number[] = [];
    const layer = layerOf((_, px) => {
      asked.push(px);
      return false;
    });
    expect(layer.idle()).toBe(true);
    expect(asked).toEqual([LIVE_PX]);
    expect(layerOf(() => true).idle()).toBe(false);
    expect(layerOf(() => true, []).idle()).toBe(true);
  });

  it('runs the clock at its beat, and holds a pose in the wind at reduced and cut motion', () => {
    const layer = layerOf(() => true);
    layer.frame(12.5, 'full');
    expect(WIND_TIME.value).toBe(12.5);
    layer.frame(13, 'reduced');
    expect(WIND_TIME.value).toBe(REST_WIND);
    layer.frame(14, 'off');
    expect(WIND_TIME.value).toBe(REST_WIND);
    // Never the instant the cloth hangs straight down.
    expect(REST_WIND).not.toBe(0);
  });

  it('asks a frame per beat while a flag is read, and never once it is not, nor off full motion', () => {
    const beat = (layer: FlagWindLayer, motion: 'full' | 'reduced' | 'off', at: number) => {
      const ambience = new Ambience(new Set(['sites']));
      ambience.motion = motion;
      ambience.add(layer);
      return ambience.advance(at);
    };
    expect(
      beat(
        layerOf(() => true),
        'full',
        1000,
      ),
    ).toBe(true);
    expect(
      beat(
        layerOf(() => false),
        'full',
        1000,
      ),
    ).toBe(false);
    expect(
      beat(
        layerOf(() => true),
        'reduced',
        1000,
      ),
    ).toBe(false);
    expect(
      beat(
        layerOf(() => true),
        'off',
        1000,
      ),
    ).toBe(false);
    expect(
      ambientStep(
        1000,
        new FlagWindLayer(
          () => [],
          () => true,
        ).hz,
      ),
    ).toBe(8);
  });
});
