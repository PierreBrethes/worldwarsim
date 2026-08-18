import { describe, expect, it } from 'vitest';
import type { UnitRole } from './ids';
import { legalMovementTypes, refusalOf, type Column, type MovementAim } from './movement-orders';

const column = (roles: ReadonlyArray<UnitRole>, held: Partial<Column> = {}): Column => ({
  roles,
  myRegionIds: new Set(),
  myOutpostIds: new Set(),
  myBarracksRegionIds: new Set(),
  origin: 'building',
  ...held,
});

const region: MovementAim = { kind: 'region', regionId: 'TUN-1', country: 'Tunisia' };
const outpost: MovementAim = { kind: 'outpost', outpostId: 'op1', hostCountry: 'Libya' };

describe('what a column may ask for', () => {
  it('offers the attack and the foundation on a foreign region', () => {
    expect(legalMovementTypes(region, column(['infantry']))).toEqual(['attack', 'outpost']);
  });

  it('offers the attack and the raid on a foreign outpost, never the foundation', () => {
    expect(legalMovementTypes(outpost, column(['infantry']))).toEqual(['attack', 'raid']);
  });

  it('drops the foundation as soon as the column is not infantry alone', () => {
    expect(legalMovementTypes(region, column(['infantry', 'armor']))).toEqual(['attack']);
  });

  it('offers nothing on ground of mine — a fan that opens empty stays shut', () => {
    const held = column(['infantry'], { myRegionIds: new Set(['TUN-1']) });
    expect(legalMovementTypes(region, held)).toEqual([]);
  });

  it('offers nothing to an empty column', () => {
    expect(legalMovementTypes(region, column([]))).toEqual([]);
  });

  it('offers a garrison only the recall, never the attack, the raid or the foundation', () => {
    const home: MovementAim = { kind: 'region', regionId: 'FRA-1', country: 'France' };
    const held = column(['infantry'], {
      origin: 'outpost',
      myBarracksRegionIds: new Set(['FRA-1']),
    });
    expect(legalMovementTypes(home, held)).toEqual(['recall']);
  });

  it('offers a barracks column no recall at all — the outpost is not a second barracks', () => {
    const held = column(['infantry'], { myBarracksRegionIds: new Set(['TUN-1']) });
    expect(legalMovementTypes(region, held)).not.toContain('recall');
  });
});

describe('refusals', () => {
  it('names the ground as friendly rather than the column as wrong', () => {
    const held = column(['infantry'], { myOutpostIds: new Set(['op1']) });
    expect(refusalOf('raid', outpost, held)).toBe('FRIENDLY_TARGET');
  });

  it('refuses an air column on a land march', () => {
    expect(refusalOf('attack', region, column(['bomber']))).toBe('LAND_MOVEMENT_ONLY');
  });

  it('refuses a raid on a region: a region has no point to disable', () => {
    expect(refusalOf('raid', region, column(['infantry']))).toBe('OUTPOST_TARGET_ONLY');
  });

  it('refuses a foundation on an outpost', () => {
    expect(refusalOf('outpost', outpost, column(['infantry']))).toBe('REGION_TARGET_ONLY');
  });

  /** Nobody orders a return: the resolution creates it, so the rule has to say so out loud. */
  it('refuses the return, the agent and the decoy as unorderable', () => {
    expect(refusalOf('return', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('agent', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('decoy', region, column(['infantry']))).toBe('NOT_ORDERABLE');
  });

  it('refuses a recall from a barracks column — only a garrison may ask for one', () => {
    expect(refusalOf('recall', region, column(['infantry']))).toBe('NOT_ORDERABLE');
  });

  it('refuses a recall at an outpost: it marches at a barracks, never at a point', () => {
    const held = column(['infantry'], { origin: 'outpost' });
    expect(refusalOf('recall', outpost, held)).toBe('REGION_TARGET_ONLY');
  });

  it('refuses a recall at a region carrying none of my barracks', () => {
    const held = column(['infantry'], { origin: 'outpost' });
    expect(refusalOf('recall', region, held)).toBe('BARRACKS_TARGET_ONLY');
  });
});
