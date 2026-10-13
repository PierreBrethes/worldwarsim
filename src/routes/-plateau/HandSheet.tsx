import { detectionRangeOf, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr } from '@/i18n/fr';
import type { CompassAction } from '@/domain/compass-rose';
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
  founding,
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
  /**
   * **Fonder, d'ici** : au doigt la pile ne fait plus que se lever, et la fiche porte l'ordre que
   * sa rose porterait sur place — la même branche, le même prix, le même motif (ADR 0015).
   * `null` quand la rose n'a rien à dire là.
   */
  founding: {
    readonly action: Extract<CompassAction, { key: 'found' }> | null;
    readonly refusal: string | null;
    readonly onFound: () => void;
  } | null;
  onOpenGunnery: () => void;
  onDrop: () => void;
}) {
  const narrow = useNarrowScreen();
  const inHand = held.filter((troop) => troopIds.includes(troop.id));
  const supplied = inHand.every((troop) => troop.supplied);
  const hint = (
    <p className="mt-[6px] text-[11px] leading-[1.35] text-[var(--notable-paper)]">
      {narrow ? fr.hand.hintFinger : fr.hand.hint}
    </p>
  );
  const found = (
    <>
      {founding?.action != null && (
        <button
          type="button"
          onClick={founding.onFound}
          className={`mt-[8px] w-full cursor-pointer ${narrow ? 'min-h-[44px]' : ''} border border-[var(--ink)] px-[12px] py-[7px] text-left text-[10px] tracking-[.18em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]`}
        >
          {fr.hand.found}
          <span className="block font-(family-name:--font-mono) text-[10px] tracking-normal normal-case">
            {founding.action.bill.map((line) => line.text).join(' · ')} · {founding.action.duration}
          </span>
        </button>
      )}
      {founding?.action == null && founding?.refusal != null && (
        <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--lacking-ink)]">
          {founding.refusal}
        </p>
      )}
    </>
  );
  return (
    <MapCard
      kicker={fr.hand.kicker(place)}
      aside={<GunneryButton onOpen={onOpenGunnery} />}
      at={EDGE}
      gap={{ x: 0, y: 0 }}
      width={300}
      /* Au doigt, la feuille reste à son tiers et ouvre sur ce qui se joue — poser, fonder — :
         épousant les cartes de la pile, elle prenait la moitié de l'écran et la carte où l'on pose. */
      hug={false}
      onClose={onDrop}
    >
      {narrow && (
        <>
          {hint}
          {found}
        </>
      )}
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
      {!narrow && (
        <>
          {found}
          {hint}
        </>
      )}
    </MapCard>
  );
}

/** Le coin haut-gauche du plateau : loin du pointeur qui cherche où poser. */
const EDGE = { x: 16, y: 16 };
