import { detectionRangeOf, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr } from '@/i18n/fr';
import type { MarchStation } from '@/domain/troops';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { useNarrowScreen } from '@/shell/viewport';
import { GarrisonStack } from './GarrisonStack';
import { GunneryButton } from './GunneryButton';
import { MapCard } from './MapCard';

/**
 * **La fiche de la pièce en main, posée au bord** (ADR 0026 §6) : les cases du panneau de
 * garnison, et cocher ou décocher ajuste ce qu'on tient sans lâcher la pièce. Elle est au bord et
 * non au pointeur parce que le pointeur cherche où poser — elle ne doit jamais être sous lui.
 */
export function HandSheet({
  view,
  station,
  place,
  held,
  troopIds,
  onCompose,
  onOpenGunnery,
  onDrop,
}: {
  view: PlayerView;
  station: MarchStation;
  /** Où se tient la pile, en toutes lettres. */
  place: string;
  /** Toute la pile à cette adresse : ce qu'on peut cocher. */
  held: ReadonlyArray<TroopView>;
  /** Ce qu'on tient. */
  troopIds: ReadonlyArray<string>;
  onCompose: (troopIds: ReadonlyArray<string>) => void;
  onOpenGunnery: () => void;
  onDrop: () => void;
}) {
  const narrow = useNarrowScreen();
  const inHand = held.filter((troop) => troopIds.includes(troop.id));
  const supplied = inHand.every((troop) => troop.supplied);
  return (
    <MapCard
      kicker={fr.hand.kicker(place)}
      aside={<GunneryButton onOpen={onOpenGunnery} />}
      at={EDGE}
      gap={{ x: 0, y: 0 }}
      width={300}
      onClose={onDrop}
    >
      <div className="mt-[7px]">
        <GarrisonStack
          view={view}
          station={station}
          held={held}
          preselect={troopIds}
          canPrepare
          observing={false}
          onPickedChange={onCompose}
        />
      </div>
      {!supplied && (
        <p className="mt-[6px] font-(family-name:--font-mono) text-[10.5px] text-[var(--critical)]">
          {fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
        </p>
      )}
      <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
        {fr.hand.scouting(detectionRangeOf(inHand.map((troop) => troop.role)))}
      </p>
      <p className="mt-[6px] text-[11px] leading-[1.35] text-[var(--notable-paper)]">
        {narrow ? fr.hand.hintFinger : fr.hand.hint}
      </p>
    </MapCard>
  );
}

/** Le coin haut-gauche du plateau : loin du pointeur qui cherche où poser. */
const EDGE = { x: 16, y: 16 };
