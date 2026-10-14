import { describe, expect, it } from 'vitest';
import { DAMAGE_TABLE } from '../../convex/constants';
import { COMBAT_PROFILES, profileOf, TRANSPORT_PROFILES } from './combat';
import {
  bandOf,
  gunneryRows,
  movementSheetOf,
  PROFILE_UNITS,
  STRONG_SHARE,
  WEAK_SHARE,
} from './gunnery';

/** **La vraie table, jamais une copie** (ADR 0018 §4) : ces cas mesurent l'abaque contre le
 *  chiffrage que le jeu joue, sinon ils mesureraient une fiction. */
const rows = gunneryRows(DAMAGE_TABLE);

/** Tout ce qui suit lit une ligne qui tire : la seule qui ne tire pas a son propre cas. */
const firing = rows.flatMap((row) => (row.fires ? [row] : []));

describe('the firing abacus is the table, arranged', () => {
  it('gives a row to every profile, recruitable or not', () => {
    expect(rows.map((row) => row.attacker)).toEqual([...COMBAT_PROFILES]);
  });

  /** Se recrute, ne tire sur rien : ni omis ni aligné en cases vides — les deux se liraient
   *  comme une panne. */
  it('marks the air transport as firing on nothing rather than dropping it', () => {
    const silent = rows.filter((row) => !row.fires);
    expect(silent.map((row) => row.attacker)).toEqual(['airTransport']);
  });

  it('gives every firing row the eleven columns, in the canonical order', () => {
    for (const row of firing) {
      expect(row.shots.map((shot) => shot.defender)).toEqual([...COMBAT_PROFILES]);
    }
  });

  /** Les transports sont des cibles, et c'est ce que la colonne doit montrer — un trou se
   *  lirait comme un bug. */
  it('shows the three transports as targets rather than as gaps', () => {
    for (const transport of TRANSPORT_PROFILES) {
      const hits = firing.filter((row) =>
        row.shots.some((shot) => shot.defender === transport && shot.reach === 'hits'),
      );
      expect(hits.length).toBeGreaterThan(0);
    }
  });

  it('replays the ninety-three reachable couples and not one more', () => {
    const reached = firing.flatMap((row) => row.shots.filter((shot) => shot.reach === 'hits'));
    expect(reached).toHaveLength(93);
  });

  /** Une case absente est « ne l'atteint pas », jamais un zéro : un blindé qui n'atteint pas un
   *  bombardier n'est pas un blindé qui le touche pour rien. */
  it('never turns an unreachable couple into a nil share', () => {
    const armor = firing.find((row) => row.attacker === 'armor2')!;
    const atBomber = armor.shots.find((shot) => shot.defender === 'bomber')!;
    expect(atBomber.reach).toBe('none');
    expect(atBomber).not.toHaveProperty('share');
  });

  it('carries the very figure the table holds, untouched', () => {
    const infantry = firing.find((row) => row.attacker === 'infantry2')!;
    const atArmor = infantry.shots.find((shot) => shot.defender === 'armor1')!;
    expect(atArmor).toMatchObject({ reach: 'hits', share: DAMAGE_TABLE.infantry2.armor1 });
  });
});

describe('the three bands', () => {
  it('reads a frank counter as strong and a spite shot as weak', () => {
    expect(bandOf(DAMAGE_TABLE.infantry2.armor1!)).toBe('strong');
    expect(bandOf(DAMAGE_TABLE.fighter.bomber!)).toBe('strong');
    expect(bandOf(DAMAGE_TABLE.infantry1.armor2!)).toBe('weak');
    expect(bandOf(DAMAGE_TABLE.cargo.escort!)).toBe('weak');
  });

  it('leaves the even exchange between the two thresholds', () => {
    expect(bandOf(DAMAGE_TABLE.infantry1.infantry1!)).toBe('even');
    expect(bandOf(STRONG_SHARE)).toBe('strong');
    expect(bandOf(WEAK_SHARE)).toBe('weak');
  });

  /** Le motif ne vaut que s'il est motif : trois bandes toutes peuplées, sinon l'encre ne dit
   *  rien qu'un aplat. */
  it('puts couples in all three bands', () => {
    const bands = new Set(
      firing.flatMap((row) =>
        row.shots.flatMap((shot) => (shot.reach === 'hits' ? [shot.band] : [])),
      ),
    );
    expect(bands).toEqual(new Set(['strong', 'even', 'weak']));
  });
});

describe('a profile back to its role and its mark', () => {
  it('is the exact inverse of profileOf', () => {
    for (const profile of COMBAT_PROFILES) {
      const { role, tier } = PROFILE_UNITS[profile];
      expect(profileOf(role, tier)).toBe(profile);
    }
  });

  /** « MK1 » sur un cargo qui n'a qu'une marque est un chiffre qui n'oppose rien. */
  it('marks only the roles that carry two marks', () => {
    expect(PROFILE_UNITS.infantry2).toEqual({ role: 'infantry', tier: 2, marked: true });
    expect(PROFILE_UNITS.cargo).toEqual({ role: 'cargo', tier: 1, marked: false });
  });
});

describe('the movement rule printed on a unit sheet', () => {
  it('reads a foot role through the same composition rules as an order', () => {
    expect(movementSheetOf(['infantry'])).toEqual({
      mode: 'land',
      pace: 'foot',
      costs: { land: 1.6 },
    });
  });

  it('reads a truck as motorized rather than assigning it a vehicle speed', () => {
    expect(movementSheetOf(['landTransport'])).toEqual({
      mode: 'land',
      pace: 'motorized',
      costs: { land: 1.15 },
    });
  });

  it('reads hulls and wings through their route medium', () => {
    expect(movementSheetOf(['cargo'])).toEqual({ mode: 'naval', costs: { sea: 1 } });
    expect(movementSheetOf(['fighter'])).toEqual({ mode: 'air', costs: {} });
  });

  it('prices both media from one mixed composition', () => {
    expect(movementSheetOf(['infantry', 'cargo'])).toEqual({
      mode: 'combined',
      pace: 'foot',
      costs: { land: 1.6, sea: 1 },
    });
  });
});
