import { describe, expect, it } from 'vitest';
import { DOMAIN_BY_ROLE, TIERS_BY_ROLE } from '@/domain/troops';
import { directRoute } from '@/domain/routing';
import type { ArcView } from '@/domain/player-view';
import type { UnitRole } from '@/domain/ids';
import { SPRITES_BY_NATION, movementSprite, spriteUrl, type NationSprites } from './manifest';

const ROLES = Object.keys(DOMAIN_BY_ROLE) as ReadonlyArray<UnitRole>;

function france(): NationSprites {
  const sprites = SPRITES_BY_NATION.france;
  if (sprites === undefined) throw new Error('France must be in the manifest');
  return sprites;
}

describe('unit sprite manifest', () => {
  it('answers for each of the nine roles for France', () => {
    const sprites = france();
    for (const role of ROLES) {
      expect(sprites, role).toHaveProperty(role);
    }
    expect(Object.keys(sprites)).toHaveLength(ROLES.length);
  });

  it('never announces two tiers where the domain only knows one', () => {
    const sprites = france();
    for (const role of ROLES) {
      const visual = sprites[role];
      if (visual === null) continue;
      if (TIERS_BY_ROLE[role] === 1) {
        expect(visual.kind, role).toBe('single');
        continue;
      }
      if (visual.kind !== 'tiered') continue;
      expect(visual.tiers, role).toHaveLength(2);
      expect(visual.tiers[0], role).not.toBe(visual.tiers[1]);
    }
  });

  /**
   * The carrier used to claim two tiers with a single plate drawn. The mismatch closed from
   * the design side, not the art side: `chiffrage-combat.md` §1 gives no nominal strength for
   * a tier-2 carrier, so the tier does not exist (ADR 0014). One tier, one plate.
   */
  it('gives the carrier a single tier and a single plate', () => {
    expect(TIERS_BY_ROLE.carrier).toBe(1);
    expect(france().carrier?.kind).toBe('single');
  });

  /**
   * The United States are the first nation drawn down to the last role — France has no cargo.
   * A `null` slipping into that plate would go unseen on screen: `UnitSprite` falls back to
   * its dotted frame, which is exactly what a half-drawn nation is supposed to look like.
   */
  it('leaves no role undrawn for the United States', () => {
    const sprites = SPRITES_BY_NATION.usa;
    if (sprites === undefined) throw new Error('the United States must be in the manifest');
    for (const role of ROLES) {
      expect(sprites[role], role).not.toBeNull();
    }
    expect(spriteUrl('usa', 'infantry', 1)).not.toBe(spriteUrl('usa', 'infantry', 2));
    expect(spriteUrl('usa', 'cargo', 1)).not.toBeNull();
  });

  it('serves one image per tier, and nothing where the visual is missing', () => {
    expect(spriteUrl('france', 'infantry', 1)).not.toBe(spriteUrl('france', 'infantry', 2));
    expect(spriteUrl('france', 'carrier', 1)).toBe(spriteUrl('france', 'carrier', 2));
    expect(spriteUrl('france', 'cargo', 1)).toBeNull();
    expect(spriteUrl('japan', 'fighter', 1)).toBeNull();
    expect(spriteUrl(null, 'fighter', 1)).toBeNull();
  });
});

describe('movementSprite', () => {
  const mine = {
    state: 'mine',
    id: 'MVT-1',
    from: [0, 0],
    to: [10, 10],
    route: directRoute([0, 0], [1, 1], 'land', 10),
    originCountry: 'France',
    destinationCountry: 'Chad',
    originLabel: 'France',
    destinationLabel: 'Tchad',
    type: 'attack',
    stack: { infantry: 2, armor: 5 },
    troopIds: [],
    minutesLeft: 60,
    borderWait: null,
    progress: 0.4,
  } as const satisfies ArcView;

  it('shows the dominant role of my stack', () => {
    expect(movementSprite(mine, 'france')).toBe(spriteUrl('france', 'armor', 1));
  });

  it('structurally shows nothing of an enemy arc', () => {
    const enemy: ArcView = {
      state: 'enemyDetected',
      id: 'MVT-2',
      from: [0, 0],
      to: [10, 10],
      route: directRoute([0, 0], [1, 1], 'land', 10),
      suspectedNation: 'france',
      headingDegrees: 45,
      headingAtMe: false,
      identification: { pierced: false },
      estimatedMinutesLeft: null,
      progress: 0.1,
    };
    expect(movementSprite(enemy, 'france')).toBeNull();
  });

  /**
   * Piercing a movement opens its timeline card, not its pawn: the map stays with the
   * medium. Without this test, reading `identification.stack` would one day look legitimate.
   */
  it('stays mute on an identified enemy, known stack included', () => {
    const identified: ArcView = {
      state: 'enemyDetected',
      id: 'MVT-3',
      from: [0, 0],
      to: [10, 10],
      route: directRoute([0, 0], [1, 1], 'land', 10),
      suspectedNation: 'germany',
      headingDegrees: 90,
      headingAtMe: true,
      identification: { pierced: true, type: 'attack', stack: { armor: 9 } },
      estimatedMinutesLeft: 30,
      progress: 0.6,
    };
    expect(movementSprite(identified, 'france')).toBeNull();
  });

  it('returns null without a drawn plate or on an empty stack', () => {
    expect(movementSprite(mine, 'japan')).toBeNull();
    expect(movementSprite({ ...mine, stack: {} }, 'france')).toBeNull();
  });
});
