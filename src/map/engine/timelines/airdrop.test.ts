import { describe, expect, it } from 'vitest';
import { AIR_ALTITUDE, metresOnBoard } from '@/domain/piece-size';
import { CRATE_METRES } from '../crate';
import { FALL_MS, PARACHUTE_MS, parachuteAt } from '../parachute';
import {
  airdrop,
  airdropColumn,
  CANOPY_METRES,
  COLUMN_GAP_MS,
  DRIFT_METRES,
  OPEN_MS,
  PASS_MS,
} from './airdrop';

const full = airdrop({ delivered: true, motion: 'full' });
const doorAt = (t: number) => full.plane(t).bay_door?.turn?.[0] ?? 0;

describe('airdrop (#481, « 3. Largage »)', () => {
  it('flies the plane level at AIR_ALTITUDE, over the target at the pass', () => {
    for (const t of [0, PASS_MS / 2, PASS_MS, PASS_MS + 500])
      expect(full.plane(t).root?.travel?.[1]).toBe(AIR_ALTITUDE);
    expect(full.plane(PASS_MS).root?.travel?.[0]).toBeCloseTo(0);
    expect(full.plane(0).root?.travel?.[0]).toBeLessThan(0);
  });

  it('opens the bay door before the pass and closes it after', () => {
    expect(doorAt(0)).toBe(0);
    expect(doorAt(PASS_MS)).toBeGreaterThan(0);
    expect(doorAt(PASS_MS + 2000)).toBe(0);
  });

  it('lets the crate leave the plane at the pass, 1.2 m wide, and not before', () => {
    expect(full.packet(PASS_MS - 1)).toBeNull();
    const first = full.packet(PASS_MS)!;
    expect(first.at[1]).toBeCloseTo(AIR_ALTITUDE);
    expect(first.crate).toBeCloseTo(metresOnBoard(CRATE_METRES));
  });

  it('falls on the curve of parachuteAt, braked by the canopy', () => {
    const t = PASS_MS + FALL_MS / 2;
    expect(full.packet(t)!.at[1]).toBeCloseTo(
      AIR_ALTITUDE * parachuteAt(FALL_MS / 2, 'full')!.height,
    );
    const early = AIR_ALTITUDE - full.packet(PASS_MS + 200)!.at[1];
    const late = full.packet(PASS_MS + FALL_MS - 200)!.at[1];
    expect(early).toBeGreaterThan(late); // slowing: the last 200 ms cover less than the first
  });

  it('opens an 8 m canopy and drifts with the flight to land 6 m from the target', () => {
    expect(full.packet(PASS_MS)!.canopy).toBe(0);
    expect(full.packet(PASS_MS + OPEN_MS)!.canopy).toBeCloseTo(metresOnBoard(CANOPY_METRES));
    const landed = full.packet(PASS_MS + FALL_MS)!;
    expect(landed.at[1]).toBeCloseTo(0);
    expect(landed.at[0]).toBeCloseTo(metresOnBoard(DRIFT_METRES));
    expect(landed.at[2]).toBeCloseTo(0);
    expect(full.packet(PASS_MS + FALL_MS / 2)!.at[0]).toBeGreaterThan(0);
  });

  it('takes the crate and canopy away toward the piece that takes it', () => {
    const to = [10, 0, 4] as const;
    const taken = airdrop({ delivered: true, motion: 'full', to });
    const resting = taken.packet(PASS_MS + FALL_MS)!;
    const fading = taken.packet(PASS_MS + PARACHUTE_MS - 50)!;
    expect(fading.opacity).toBeLessThan(resting.opacity);
    expect(fading.at[0]).toBeGreaterThan(resting.at[0]);
    expect(fading.at[2]).toBeGreaterThan(0);
    expect(taken.packet(PASS_MS + PARACHUTE_MS)).toBeNull();
  });

  it('flies the plane past with its door shut and no packet when nothing is delivered', () => {
    const empty = airdrop({ delivered: false, motion: 'full' });
    for (let t = 0; t < empty.ms; t += 100) {
      expect(empty.plane(t).bay_door).toBeUndefined();
      expect(empty.packet(t)).toBeNull();
    }
    expect(empty.plane(PASS_MS).root?.travel?.[1]).toBe(AIR_ALTITUDE);
  });

  it('sends one packet per loaded plane of a column, 0.4 s apart', () => {
    const column = airdropColumn([true, false, true], 'full');
    expect(column.drops.map((d) => d.start)).toEqual([0, COLUMN_GAP_MS, 2 * COLUMN_GAP_MS]);
    const at = (i: number, t: number) => column.drops[i]!.drop.packet(t - column.drops[i]!.start);
    const t = PASS_MS + 100;
    expect(at(0, t)).not.toBeNull();
    expect(at(1, t + COLUMN_GAP_MS)).toBeNull(); // empty plane: no packet
    expect(at(2, t + 2 * COLUMN_GAP_MS)).toEqual(at(0, t));
    expect(column.ms).toBe(2 * COLUMN_GAP_MS + full.ms);
    expect(COLUMN_GAP_MS).toBe(400);
  });

  it('under reduced motion, lays the packet down at once, no plane, no door, then fades it', () => {
    const still = airdrop({ delivered: true, motion: 'reduced' });
    expect(still.plane(100)).toEqual({});
    const down = still.packet(0)!;
    expect(down.at[1]).toBe(0);
    expect(down.at[0]).toBeCloseTo(metresOnBoard(DRIFT_METRES));
    expect(down.canopy).toBe(0);
    expect(still.packet(800)!.opacity).toBe(1);
    expect(still.packet(1000)!.opacity).toBeLessThan(1);
    expect(still.packet(1400)).toBeNull();
    expect(still.ms).toBe(1400);
  });

  it('under cut motion, draws nothing', () => {
    const off = airdrop({ delivered: true, motion: 'off' });
    expect(off.plane(PASS_MS)).toEqual({});
    expect(off.packet(PASS_MS + 500)).toBeNull();
    expect(off.ms).toBe(0);
  });
});
