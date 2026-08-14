import type { Nation, UnitRole } from '@/domain/ids';
import type { UnitTier } from '@/domain/troops';
import { isNation } from '@/domain/nations';

/**
 * The real equipment's name, per nation and per tier. It lives here, next to the sprites,
 * not in the domain: "char léger R35" is a property of the French plate, not of the game
 * rule. The day France changes tanks, the asset and this line move together and `UnitRole`
 * does not. Historical designations are proper nouns — they are not translated.
 */
type NationEquipment = Readonly<Partial<Record<UnitRole, ReadonlyArray<string>>>>;

const FRANCE: NationEquipment = {
  infantry: ['soldat', 'bazooka'],
  armor: ['char léger R35', 'char lourd B1 bis'],
  landTransport: ['VTC'],
  fighter: ['Dewoitine D.520'],
  bomber: ['LeO 451'],
  airTransport: ['D.338'],
  escort: ['Le Fantasque'],
  carrier: ['2 appareils'],
};

const EQUIPMENT_BY_NATION: Readonly<Partial<Record<Nation, NationEquipment>>> = {
  france: FRANCE,
};

export function equipmentLabel(
  nation: string | null,
  role: UnitRole,
  tier: UnitTier,
): string | null {
  const national =
    nation !== null && isNation(nation) ? EQUIPMENT_BY_NATION[nation] : undefined;
  const tiers = national?.[role];
  if (tiers === undefined) return null;
  return tiers[tier - 1] ?? tiers[0] ?? null;
}
