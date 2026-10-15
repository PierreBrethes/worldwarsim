import { detectionRangeOf, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr, roleLabel } from '@/i18n/fr';
import { UnitSprite } from '@/emblems/UnitSprite';
import type { CompassAction } from '@/domain/compass-rose';
import { unitsOf, type MarchStation } from '@/domain/troops';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { playedTheatre } from '@/domain/theatres';
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
        <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--critical)]">
          {founding.refusal}
        </p>
      )}
    </>
  );
  const [unit, ...aboard] = unitsOf(inHand)[0] ?? [];
  /** A Blitz hand holds one unit: a strip says it, the pile's grid and its range say nothing more.
   *  What rides a transport is listed under it, and « faire descendre » takes it alone — the one
   *  way off a truck, since a capture is made on foot. */
  if (view.mode === 'blitz' && unit !== undefined) {
    return (
      <MapCard
        kicker={fr.hand.kicker(place)}
        at={edge()}
        gap={{ x: 0, y: 0 }}
        width={240}
        hug={false}
        onClose={onDrop}
      >
        <div className="mt-[6px] flex items-center gap-[8px]">
          <UnitSprite nation={view.me.nation} role={unit.role} height={28} width={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">{roleLabel(unit.role, 1)}</span>
            <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
              {fr.troops.strength(unit.strength, unit.nominalStrength)}
            </span>
          </span>
        </div>
        {aboard.length > 0 && (
          <ul className="mt-[6px] border-t border-[var(--ink)] pt-[4px]">
            {aboard.map((passenger) => (
              <li key={passenger.id} className="flex items-center gap-[8px] py-[2px]">
                <span className="min-w-0 flex-1 truncate text-[11.5px]">
                  {fr.hand.aboard} · {roleLabel(passenger.role, 1)}
                </span>
                <button
                  type="button"
                  onClick={() => onCompose([passenger.id])}
                  className={`cursor-pointer border border-[var(--ink)] px-[8px] ${narrow ? 'min-h-[44px]' : 'py-[3px]'} text-[9.5px] tracking-[.14em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]`}
                >
                  {fr.hand.getOff}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!supplied && (
          <p className="mt-[4px] font-(family-name:--font-mono) text-[10.5px] text-[var(--critical)]">
            {fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
          </p>
        )}
        {hint}
      </MapCard>
    );
  }
  return (
    <MapCard
      kicker={fr.hand.kicker(place)}
      aside={<GunneryButton onOpen={onOpenGunnery} />}
      at={edge()}
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
        {fr.hand.scouting(
          detectionRangeOf(
            inHand.map((troop) => troop.role),
            playedTheatre(view),
          ),
        )}
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

/** Le coin haut-gauche du plateau, sous la réglette et à droite de la colonne (`Shell` publie
 *  leurs bords) : loin du pointeur qui cherche où poser, et sans rien couvrir de la table. */
function edge(): { x: number; y: number } {
  const root = getComputedStyle(document.documentElement);
  const inset = (name: string) => parseFloat(root.getPropertyValue(name)) || 0;
  return { x: inset('--board-left') + EDGE_AIR, y: inset('--board-top') + EDGE_AIR };
}

const EDGE_AIR = 12;
