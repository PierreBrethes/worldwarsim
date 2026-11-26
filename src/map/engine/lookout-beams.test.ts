import { Box3, type Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { LonLat } from '@/domain/geo';
import { Ambience } from './ambience';
import {
  BEAM_STEP_MS,
  BEAM_GAIN,
  beamAzimuth,
  type BeamPoint,
  LookoutBeams,
  MAX_BEAMS,
} from './lookout-beams';
import { LIVE_PX } from './site-loops';

const NOON = Date.UTC(2026, 2, 20, 12);
const MIDNIGHT = NOON + 12 * 3_600_000;
type Lit = { material: { opacity: number } };
const frame = { projectLonLat: ([lon, lat]: LonLat) => new Vector3(lon, 0, -lat) };

const point = (id: string, lon: number, km: number | null = 20): BeamPoint => ({
  id,
  lonLat: [lon, 48],
  lookoutKm: km,
});

function setup(
  options: {
    instant?: number;
    cap?: number;
    sees?: boolean;
    source?: (point: BeamPoint) => { at: Vector3; dip: number } | null;
  } = {},
) {
  const clock = { ms: 0 };
  const asked: number[] = [];
  const layer = new LookoutBeams(
    frame,
    () => options.instant ?? MIDNIGHT,
    (_box: Box3, px) => {
      asked.push(px);
      return options.sees ?? true;
    },
    () => new Vector3(0, 5, 0),
    options.cap ?? 6,
    () => clock.ms,
    options.source,
  );
  return { layer, clock, asked };
}

describe('the lookout beams ambience', () => {
  it('lights only the points that see, and the night of their place', () => {
    const night = setup();
    night.layer.show([point('a', 2), point('silent', 3, null)]);
    night.layer.frame(0, 'reduced');
    expect(night.layer.size).toBe(1);

    const day = setup({ instant: NOON });
    day.layer.show([point('a', 2)]);
    day.layer.frame(0, 'reduced');
    expect(day.layer.size).toBe(0);
  });

  it('is idle by day, with nothing in view, and without a point that sees', () => {
    const { layer, asked } = setup();
    expect(layer.idle()).toBe(true);
    layer.show([point('a', 2)]);
    expect(layer.idle()).toBe(false);
    expect(asked).toContain(LIVE_PX);
    const blind = setup({ sees: false });
    blind.layer.show([point('a', 2)]);
    expect(blind.layer.idle()).toBe(true);
    const day = setup({ instant: NOON });
    day.layer.show([point('a', 2)]);
    expect(day.layer.idle()).toBe(true);
    const silent = setup();
    silent.layer.show([point('a', 2, null)]);
    expect(silent.layer.idle()).toBe(true);
  });

  it('keeps the nearest to the eye, up to its own cap', () => {
    const { layer } = setup({ cap: MAX_BEAMS.touch });
    layer.show([20, 1, 15, 2, 30, 3].map((lon, k) => point(`p${k}`, lon)));
    layer.frame(0, 'reduced');
    expect(layer.size).toBe(3);
    expect(layer.object.children.map((child) => child.position.x).sort((a, b) => a - b)).toEqual([
      1, 2, 3,
    ]);
  });

  it('fades in and out in 180 ms at full motion, at once without it', () => {
    const { layer, clock } = setup();
    const opacity = () =>
      (layer.object.children[0] as never as { material: { opacity: number } }).material.opacity;
    // Frames of 30 ms, under the step cap: three make half a fade.
    const run = (frames: number) => {
      for (let k = 0; k < frames; k++) {
        clock.ms += 30;
        layer.frame(0, 'full');
      }
    };
    layer.show([point('a', 2)]);
    layer.frame(0, 'full');
    run(3);
    expect(opacity()).toBeCloseTo(BEAM_GAIN / 2, 5);
    run(6);
    expect(opacity()).toBeCloseTo(BEAM_GAIN, 5);
    // The coal runs out: the same point, no longer seeing.
    layer.show([point('a', 2, null)]);
    run(3);
    expect(opacity()).toBeCloseTo(BEAM_GAIN / 2, 5);
    run(6);
    expect(layer.size).toBe(0);

    const still = setup();
    still.layer.show([point('a', 2)]);
    still.layer.frame(0, 'reduced');
    expect((still.layer.object.children[0] as never as Lit).material.opacity).toBeCloseTo(
      BEAM_GAIN,
      5,
    );
  });

  it('spreads the fade over frames after a long rest, lighting and putting out alike', () => {
    const { layer, clock } = setup();
    const opacity = () => (layer.object.children[0] as never as Lit).material.opacity;
    // The map rested a minute, then the view is served: the first frame is not the whole fade.
    clock.ms = 60_000;
    layer.show([point('a', 2)]);
    layer.frame(0, 'full');
    expect(opacity()).toBeGreaterThan(0);
    expect(opacity()).toBeLessThan(BEAM_GAIN);
    for (let k = 0; k < 4; k++) {
      clock.ms += BEAM_STEP_MS;
      layer.frame(0, 'full');
    }
    expect(opacity()).toBeCloseTo(BEAM_GAIN, 5);
    clock.ms += 60_000;
    layer.show([point('a', 2, null)]);
    layer.frame(0, 'full');
    expect(layer.size).toBe(1);
    expect(opacity()).toBeGreaterThan(0);
    expect(opacity()).toBeLessThan(BEAM_GAIN);
  });

  it('frees the material of a beam put out, and of every one left on dispose', () => {
    const dispose = vi.spyOn(MeshBasicMaterial.prototype, 'dispose');
    const { layer, clock } = setup();
    layer.show([point('a', 2), point('b', 3)]);
    layer.frame(0, 'reduced');
    layer.show([point('a', 2), point('b', 3, null)]);
    clock.ms += 1000;
    layer.frame(0, 'reduced');
    expect(layer.size).toBe(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    layer.dispose();
    expect(dispose).toHaveBeenCalledTimes(2);
    dispose.mockRestore();
  });

  it('turns at full motion, rests at its azimuth at reduced and cut motion', () => {
    const { layer } = setup();
    layer.show([point('a', 2)]);
    const turn = () => layer.object.children[0]!.rotation.y;
    layer.frame(10, 'full');
    expect(turn()).toBeCloseTo(beamAzimuth('a', 10), 5);
    layer.frame(11, 'reduced');
    expect(turn()).toBeCloseTo(beamAzimuth('a', 0), 5);
    layer.frame(12, 'off');
    expect(turn()).toBeCloseTo(beamAzimuth('a', 0), 5);
  });

  it('keeps its azimuth when the view is served again', () => {
    const { layer } = setup();
    layer.show([point('a', 2)]);
    layer.frame(10, 'full');
    const before = layer.object.children[0]!.rotation.y;
    const mesh = layer.object.children[0];
    layer.show([point('a', 2), point('b', 4)]);
    layer.frame(10, 'full');
    expect(layer.object.children[0]).toBe(mesh);
    expect(layer.object.children[0]!.rotation.y).toBeCloseTo(before, 10);
    expect(beamAzimuth('a', 1)).not.toBeCloseTo(beamAzimuth('b', 1), 3);
  });

  it('is an ambience of the sites fx, at 8 a second, that the board steps with the others', () => {
    const { layer } = setup();
    const ambience = new Ambience(new Set(['sites']));
    ambience.add(layer);
    layer.show([point('a', 2)]);
    expect(ambience.advance(1000)).toBe(true);
    expect(new Ambience(new Set(['sea'])).enabled(layer.fx)).toBe(false);
    expect(layer.hz).toBe(8);
  });

  it("leaves my lookout's projector, looking down as its lens, while its maquette stands (#468)", () => {
    const lens = { at: new Vector3(2.01, 0.004, -48.02), dip: Math.PI / 18 };
    const drawn = { now: true };
    const { layer } = setup({
      source: (point) => (point.site === 'outpost-a' && drawn.now ? lens : null),
    });
    layer.show([{ ...point('a', 2), site: 'outpost-a' }, point('b', 3)]);
    layer.frame(10, 'full');
    const [a, b] = layer.object.children as [Mesh, Mesh];
    expect(a.position.distanceTo(lens.at)).toBeLessThan(1e-9);
    expect(a.rotation.x).toBeCloseTo(lens.dip, 9);
    expect(a.rotation.y).toBeCloseTo(beamAzimuth('a', 10), 5);
    // Down 10° whichever way it turns: tilted on its own axis, then turned.
    const tip = new Vector3(0, 0, 1).applyEuler(a.rotation);
    expect(Math.asin(-tip.y)).toBeCloseTo(lens.dip, 9);
    expect(b.position.x).toBe(3);
    expect(b.rotation.x).toBe(0);
    // Far off, the maquette gives way to its pin: the beam is back on its point.
    drawn.now = false;
    layer.frame(11, 'full');
    expect(a.position.x).toBe(2);
    expect(a.rotation.x).toBe(0);
  });
});
