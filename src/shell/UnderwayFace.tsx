import type { UnderwayFace } from '@/domain/underway';
import { BuildingPlate } from '@/emblems/Plate';
import { UnitSprite } from '@/emblems/UnitSprite';
import { Pictogram } from './IndicatorGlyph';

/** Le picto d'une échéance : la planche de ce qui marche ou de ce qui se bâtit. */
export function FaceIcon({ face, nation }: { face: UnderwayFace; nation: string }) {
  switch (face.kind) {
    case 'unit':
      return face.role === null ? (
        <Pictogram pictogram="forces" weight={40} size={26} />
      ) : (
        <UnitSprite nation={nation} role={face.role} height={32} width={34} />
      );
    case 'building':
      return <BuildingPlate building={face.key} height={30} />;
    case 'outpost':
      return <Pictogram pictogram="outpost" weight={40} size={26} />;
  }
}
