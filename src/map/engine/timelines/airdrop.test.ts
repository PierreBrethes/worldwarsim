import { describe, expect, it } from 'vitest';
import { AIR_ALTITUDE, metresOnBoard } from '@/domain/piece-size';
import { CRATE_METRES } from '../crate';
import { FALL_MS, PARACHUTE_MS, parachuteAt, STILL_MS } from '../parachute';
import {
  airdrop,
  airdropColumn,
  CANOPY_METRES,
  CANOPY_MS,
  COLUMN_GAP_MS,
  DRIFT_METRES,
  PASS_MS,
} from './airdrop';

const full = airdrop({ delivered: true, motion: 'full' });
const doorAt = (t: number) => full.plane(t).bay_door?.turn?.[0];
const board = metresOnBoard;

describe('airdrop (#481, « 3. Largage »)', () => {
  it('flies the plane level at AIR_ALTITUDE, at 70 m/s along +x, over the target at the pass', () => {
    for (const t of [0, PASS_MS / 2, PASS_MS, PASS_MS + 500])
      expect(full.plane(t).root?.travel?.[1]).toBe(AIR_ALTITUDE);
    expect(full.plane(PASS_MS).root?.travel?.[0]).toBeCloseTo(0);
    expect(full.plane(0).root?.travel?.[0]).toBeCloseTo(board(-160));
    expect(full.plane(PASS_MS + 1000).root?.travel?.[0]).toBeCloseTo(board(70));
    expect(full.plane(PASS_MS).root?.heading).toBeCloseTo(Math.PI / 2);
  });

  it('swings the bay door down (a negative turn about x) to 90°, open as the crate leaves', () => {
    expect(doorAt(0)).toBeUndefined();
    expect(doorAt(PASS_MS - 100)).toBeCloseTo(-Math.PI / 2);
    expect(doorAt(PASS_MS)).toBeCloseTo(-Math.PI / 2);
    expect(doorAt(PASS_MS + 600)).toBeCloseTo(-Math.PI / 2);
  });

  it('opens it over 0.5 s from 0.6 s before the drop, and shuts it over 0.6 s from 0.6 s after', () => {
    expect(doorAt(PASS_MS - 600)).toBeUndefined();
    expect(doorAt(PASS_MS - 350)!).toBeLessThan(-0.5);
    expect(doorAt(PASS_MS - 350)!).toBeGreaterThan(-Math.PI / 2);
    expect(doorAt(PASS_MS + 900)!).toBeGreaterThan(-Math.PI / 2);
    expect(doorAt(PASS_MS + 900)!).toBeLessThan(0);
    // shut, with the plane still there
    expect(full.plane(PASS_MS + 1300).root).toBeDefined();
    expect(doorAt(PASS_MS + 1300)).toBeUndefined();
  });

  it('lets the crate leave the plane at the pass, 1.2 m wide, and not before', () => {
    expect(full.packet(PASS_MS - 1)).toBeNull();
    const first = full.packet(PASS_MS)!;
    expect(first.at[1]).toBeCloseTo(AIR_ALTITUDE);
    expect(first.crate).toBeCloseTo(board(CRATE_METRES));
  });

  it('falls on the curve of parachuteAt, braked by the canopy', () => {
    const t = PASS_MS + FALL_MS / 2;
    expect(full.packet(t)!.at[1]).toBeCloseTo(
      AIR_ALTITUDE * parachuteAt(FALL_MS / 2, 'full')!.height,
    );
    const early = AIR_ALTITUDE - full.packet(PASS_MS + 200)!.at[1];
    const late = full.packet(PASS_MS + FALL_MS - 200)!.at[1];
    expect(early).toBeGreaterThan(late);
  });

  it('opens an 8 m canopy and drifts with the flight to land 6 m from the target', () => {
    expect(full.packet(PASS_MS)!.canopy).toBe(0);
    expect(full.packet(PASS_MS + 250 + CANOPY_MS)!.canopy).toBeCloseTo(board(CANOPY_METRES));
    const landed = full.packet(PASS_MS + FALL_MS)!;
    expect(landed.at[1]).toBeCloseTo(0);
    expect(landed.at[0]).toBeCloseTo(board(DRIFT_METRES));
    expect(landed.at[2]).toBeCloseTo(0);
    expect(full.packet(PASS_MS + FALL_MS / 2)!.at[0]).toBeGreaterThan(0);
  });

  it('drifts on the storyboard curve: most of it in the first 0.25 s, then easing out', () => {
    const at = (ms: number) => full.packet(PASS_MS + ms)!.at[0];
    const total = board(DRIFT_METRES);
    expect(at(250) / total).toBeCloseTo(0.596, 2);
    expect(at(FALL_MS / 2) / total).toBeCloseTo(0.941, 2);
    expect(at(FALL_MS)).toBeCloseTo(total);
  });

  it('holds the canopy to the ground, sinks it over 0.5 s, then clears it with the crate', () => {
    const touch = full.packet(PASS_MS + FALL_MS)!;
    expect(touch.canopy).toBeGreaterThan(0);
    expect(touch.collapse).toBeCloseTo(0);
    const after = full.packet(PASS_MS + FALL_MS + 100)!;
    expect(after.canopy).toBeGreaterThan(0);
    expect(after.collapse).toBeGreaterThan(0);
    expect(full.packet(PASS_MS + FALL_MS + 500)!.collapse).toBeCloseTo(1);
    expect(full.packet(PASS_MS + PARACHUTE_MS - 50)!.opacity).toBeLessThan(1);
    expect(full.packet(PASS_MS + PARACHUTE_MS)).toBeNull();
  });

  it('takes the crate and canopy away toward the piece that takes it', () => {
    const to = [10, 0, 4] as const;
    const taken = airdrop({ delivered: true, motion: 'full', to });
    const resting = taken.packet(PASS_MS + FALL_MS)!;
    const fading = taken.packet(PASS_MS + PARACHUTE_MS - 50)!;
    expect(fading.opacity).toBeLessThan(resting.opacity);
    expect(fading.at[0]).toBeGreaterThan(resting.at[0]);
    expect(fading.at[2]).toBeGreaterThan(0);
  });

  it('flies the plane past with its door shut and no packet when nothing is delivered', () => {
    const empty = airdrop({ delivered: false, motion: 'full' });
    for (let t = 0; t < empty.ms; t += 100) {
      expect(empty.plane(t).bay_door).toBeUndefined();
      expect(empty.packet(t)).toBeNull();
    }
    expect(empty.plane(PASS_MS).root?.travel?.[1]).toBe(AIR_ALTITUDE);
    expect(empty.ms).toBe(2 * PASS_MS);
    expect(empty.plane(empty.ms)).toEqual({});
  });

  it('turns the flight to the arc heading: travel, at, to and heading', () => {
    const north = airdrop({ delivered: true, motion: 'full', heading: 0, to: [10, 0, 0] });
    expect(north.plane(PASS_MS + 1000).root?.heading).toBe(0);
    const [x, , z] = north.plane(PASS_MS + 1000).root!.travel!;
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(board(70));
    const landed = north.packet(PASS_MS + FALL_MS)!.at;
    expect(landed[0]).toBeCloseTo(0);
    expect(landed[2]).toBeCloseTo(board(DRIFT_METRES));
    const gone = north.packet(PASS_MS + PARACHUTE_MS - 1)!.at;
    expect(gone[2]).toBeGreaterThan(landed[2]);
    expect(Math.abs(gone[0])).toBeLessThan(1e-6);
  });

  it('starts the crate at the plane marker, shed by the time it lands', () => {
    const marker = airdrop({ delivered: true, motion: 'full', release: [0, -2, 1] });
    const first = marker.packet(PASS_MS)!.at;
    expect(first[1]).toBeCloseTo(AIR_ALTITUDE - 2);
    expect(first[2]).toBeCloseTo(1);
    const landed = marker.packet(PASS_MS + FALL_MS)!.at;
    expect(landed[1]).toBeCloseTo(0);
    expect(landed[2]).toBeCloseTo(0);
  });

  it('sends one packet per loaded plane of a column, 0.4 s apart', () => {
    const column = airdropColumn([true, false, true], 'full');
    expect(column.drops.map((d) => d.start)).toEqual([0, COLUMN_GAP_MS, 2 * COLUMN_GAP_MS]);
    const at = (i: number, t: number) => column.drops[i]!.drop.packet(t - column.drops[i]!.start);
    const t = PASS_MS + 100;
    expect(at(0, t)).not.toBeNull();
    expect(at(1, t + COLUMN_GAP_MS)).toBeNull();
    expect(at(2, t + 2 * COLUMN_GAP_MS)).toEqual(at(0, t));
    expect(column.ms).toBe(2 * COLUMN_GAP_MS + full.ms);
    expect(COLUMN_GAP_MS).toBe(400);
  });

  it('hands the column its receiver and heading', () => {
    const column = airdropColumn([true], 'full', { to: [10, 0, 0], heading: 0 });
    const end = column.drops[0]!.drop.packet(PASS_MS + PARACHUTE_MS - 1)!.at;
    expect(end[2]).toBeGreaterThan(board(DRIFT_METRES));
  });

  it('plays nothing for a column with no crate, or cut', () => {
    expect(airdropColumn([false, false], 'full').ms).toBe(0);
    expect(airdropColumn([true, true, true], 'off').ms).toBe(0);
  });

  it('lays a column down at once under reduced motion, 0.4 s apart', () => {
    const column = airdropColumn([true, true], 'reduced');
    expect(column.ms).toBe(COLUMN_GAP_MS + STILL_MS);
    expect(column.drops[1]!.drop.packet(0)!.at[1]).toBe(0);
    expect(column.drops[1]!.drop.plane(100)).toEqual({});
  });

  it('under reduced motion, lays the packet down at once, no plane, no door, then fades it', () => {
    const still = airdrop({ delivered: true, motion: 'reduced' });
    expect(still.plane(100)).toEqual({});
    const down = still.packet(0)!;
    expect(down.at[1]).toBe(0);
    expect(down.at[0]).toBeCloseTo(board(DRIFT_METRES));
    expect(down.canopy).toBe(0);
    expect(still.packet(800)!.opacity).toBe(1);
    expect(still.packet(1000)!.opacity).toBeLessThan(1);
    expect(still.packet(STILL_MS)).toBeNull();
    expect(still.ms).toBe(STILL_MS);
  });

  it('under cut motion, draws nothing', () => {
    const off = airdrop({ delivered: true, motion: 'off' });
    expect(off.plane(PASS_MS)).toEqual({});
    expect(off.packet(PASS_MS + 500)).toBeNull();
    expect(off.ms).toBe(0);
  });
});
