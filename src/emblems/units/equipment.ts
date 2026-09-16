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

const UK: NationEquipment = {
  infantry: ['Lee-Enfield', 'fusil antichar Boys'],
  armor: ['Vickers Mk VI', 'Matilda II'],
  landTransport: ['Bedford QL'],
  fighter: ['Spitfire'],
  bomber: ['Wellington'],
  airTransport: ['Bristol Bombay'],
  escort: ['corvette Flower'],
  cargo: ['cargo marchand'],
  carrier: ['HMS Illustrious'],
};

const USA: NationEquipment = {
  infantry: ['M1 Garand', 'bazooka M1'],
  armor: ['M5 Stuart', 'M4 Sherman'],
  landTransport: ['GMC CCKW'],
  fighter: ['P-40 Warhawk'],
  bomber: ['B-17'],
  airTransport: ['C-47'],
  escort: ['destroyer Fletcher'],
  cargo: ['Liberty ship'],
  carrier: ['USS Essex'],
};

const USSR: NationEquipment = {
  infantry: ['Mosin-Nagant', 'fusil antichar PTRS'],
  armor: ['BT-7', 'T-34'],
  landTransport: ['ZiS-5'],
  fighter: ['Yak-1'],
  bomber: ['Il-2'],
  airTransport: ['Li-2'],
  escort: ['destroyer Gnevny'],
  cargo: ['cargo marchand'],
};

const GERMANY: NationEquipment = {
  infantry: ['Kar98k', 'Schießbecher'],
  armor: ['Panzer II', 'Panzer IV'],
  landTransport: ['Opel Blitz'],
  fighter: ['Bf 109'],
  bomber: ['Ju 87 Stuka'],
  escort: ['Zerstörer 1934'],
  cargo: ['Frachter'],
  carrier: ['Graf Zeppelin'],
};

const CHINA: NationEquipment = {
  infantry: ['Hanyang 88', 'mitrailleuse Type 24'],
  armor: ['Vickers 6-Ton', 'T-26'],
  landTransport: ['camion'],
  fighter: ['Polikarpov I-15'],
  bomber: ['Tupolev SB'],
  airTransport: ['DC-3 (CNAC)'],
  escort: ['croiseur Ning Hai'],
  cargo: ['jonque'],
};

const ITALY: NationEquipment = {
  infantry: ['Carcano M91', 'fusil antichar Solothurn'],
  armor: ['L3/35', 'M13/40'],
  landTransport: ['Fiat 626'],
  fighter: ['Macchi C.200'],
  bomber: ['SM.79 Sparviero'],
  airTransport: ['SM.82'],
  escort: ['destroyer Soldati'],
  cargo: ['cargo marchand'],
};

const JAPAN: NationEquipment = {
  infantry: ['Arisaka Type 38', 'canon antichar Type 1'],
  armor: ['Type 95 Ha-Go', 'Type 97 Chi-Ha'],
  landTransport: ['Isuzu Type 94'],
  fighter: ['A6M Zero'],
  bomber: ['G3M « Nell »'],
  escort: ['kaibokan'],
  cargo: ['maru'],
  carrier: ['Akagi'],
};

const EQUIPMENT_BY_NATION: Readonly<Partial<Record<Nation, NationEquipment>>> = {
  france: FRANCE,
  uk: UK,
  usa: USA,
  ussr: USSR,
  germany: GERMANY,
  china: CHINA,
  italy: ITALY,
  japan: JAPAN,
};

export function equipmentLabel(
  nation: string | null,
  role: UnitRole,
  tier: UnitTier,
): string | null {
  const national = nation !== null && isNation(nation) ? EQUIPMENT_BY_NATION[nation] : undefined;
  const tiers = national?.[role];
  if (tiers === undefined) return null;
  return tiers[tier - 1] ?? tiers[0] ?? null;
}
