import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import type { Sequence } from './sequences';
import { airfieldSequence, delayed, doorsOf, slipSequence } from './site-ways';
import { formation } from './timelines/airfield';
import { launch } from './timelines/port';

const still: Sequence = { ms: 1000, at: () => ({ root: { travel: [1, 0, 0] } }) };

describe('a piece that waits its turn (#487)', () => {
  it('stands unseen until its lead has passed, then plays from its start', () => {
    const wait = delayed(still, 2000);
    expect(wait.ms).toBe(3000);
    expect(wait.at(0).root?.fade).toBe(0);
    expect(wait.at(1999).root?.fade).toBe(0);
    expect(wait.at(2000).root?.fade).toBeUndefined();
    expect(wait.at(2500).root?.travel).toEqual([1, 0, 0]);
  });

  it('is the sequence itself with no lead', () => {
    expect(delayed(still, 0)).toBe(still);
  });
});

const lane = AIRFIELD.lanes[0];
const out = (to: number) => formation('fighter', { x: lane, z: to }, 5.5);

describe('the doors of a hangar, one set for all its planes (#487)', () => {
  const [a, b] = [out(40), out(30)];
  const lead = 2500;
  const planes = [
    { lead: 0, doors: a.doors, closing: a.closing },
    { lead, doors: b.doors, closing: b.closing },
  ];
  const open = doorsOf(planes);
  const end = lead + b.ms;

  it('opens at the first plane and stays open until the last is clear', () => {
    expect(open(0)).toBe(0);
    for (let t = 1500; t < lead + b.closing; t += 50) expect(open(t)).toBeCloseTo(1, 6);
  });

  it('shuts behind the last plane', () => {
    expect(open(end)).toBe(0);
    expect(open(end + 1000)).toBe(0);
  });

  it('is the doors of its own plane when it is alone', () => {
    const alone = doorsOf([planes[0]!]);
    for (const t of [0, 700, 1500, a.closing + 400, a.ms])
      expect(alone(t)).toBeCloseTo(a.doors(t), 9);
  });
});

describe('the airfield with a door set per hangar (#487)', () => {
  it('moves each hangar its doors name, the right one and the left one', () => {
    const both = airfieldSequence(3000, [
      { lane: AIRFIELD.lanes[0], open: () => 1 },
      { lane: AIRFIELD.lanes[1], open: () => 1 },
    ]);
    const names = Object.keys(both.at(1000));
    expect(names).toContain('porte_gauche_1');
    expect(names).toContain('porte_gauche_1_b');
  });
});

describe('the slip with a hull launched after another (#487)', () => {
  const [first, second] = [
    launch('cargo', 18, 3, { x: 10, z: 175, yaw: Math.PI }),
    launch('cargo', 18, 3, { x: 0, z: 175, yaw: Math.PI }),
  ];
  const lead = first.ms;
  const slip = slipSequence([
    { lead: 0, ...first },
    { lead, ...second },
  ]);

  it('lasts until the last hull is hauled', () => {
    expect(slip.ms).toBe(lead + second.ms);
  });

  it('dresses a new hull on the slip when the second starts: its shores stand again', () => {
    expect(slip.at(lead - 1)['accore_1' as never]).toMatchObject({
      turn: [0, 0, expect.any(Number)],
    });
    expect(slip.at(lead - 1)['accore_1' as never]!.turn![2]).not.toBe(0);
    expect(slip.at(lead)['accore_1' as never]!.turn![2]).toBeCloseTo(0, 9);
    expect(slip.at(lead)['coque_cale' as never]!.fade).toBe(1);
  });
});
