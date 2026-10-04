import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { isOrder } from '@/domain/compass-rose';
import type { Destination } from '@/map/WorldMap';
import { BottomSheet } from '@/shell/BottomSheet';

/** Ce que la feuille offre d'emblée : trois boutons tiennent sur une ligne sous le pouce. */
const NEAREST = 3;

/**
 * **La visée avant la destination, sous le seuil**, pour une pile armée depuis un mât ou un
 * avant-poste : rien de désigné sur la carte ne porte son cartouche. La feuille dit ce qui est
 * armé, d'où, offre les cibles les plus proches et donne la sortie. Une troupe posée porte la
 * même offre dans sa fiche (`TroopBadge`).
 */
export function AimingSheet({
  count,
  originName,
  slots,
  destinations,
  onPick,
  onCancel,
}: {
  count: number;
  originName: string;
  slots: { readonly used: number; readonly total: number };
  destinations: ReadonlyArray<Destination>;
  onPick: (destination: Destination) => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet
      title={fr.aimSheet.kicker(count, originName)}
      aside={
        <span className="font-(family-name:--font-mono) text-[11px] whitespace-nowrap text-[var(--ink-soft)]">
          {fr.aimSheet.slots(slots.used, slots.total)}
        </span>
      }
      onClose={onCancel}
      initial="peek"
      kicker
      hug
    >
      <div className="px-4 pb-[12px]">
        <AimTargets destinations={destinations} onPick={onPick} />
        <button
          type="button"
          onClick={onCancel}
          className="mt-[10px] min-h-[44px] w-full cursor-pointer border border-[var(--ink)] px-[10px] text-[11px] tracking-[.18em] text-[var(--ink)] uppercase"
        >
          {fr.aim.cancel}
        </button>
      </div>
    </BottomSheet>
  );
}

/**
 * **Les cibles de la colonne, les plus proches sous le pouce** (refonte mobile, 1b). La carte
 * reste la porte — les destinations y sont cerclées, celles hors champ s'annoncent au bord — et la
 * feuille en offre le raccourci : trois boutons, puis la liste entière d'un toucher. Chacun rejoue
 * la rose de sa cible, donc n'offre que ce que le serveur prendrait (ADR 0015).
 */
export function AimTargets({
  destinations,
  onPick,
}: {
  destinations: ReadonlyArray<Destination>;
  onPick: (destination: Destination) => void;
}) {
  const [all, setAll] = useState(false);
  if (destinations.length === 0)
    return <p className="pt-[10px] text-[13px] leading-[1.45]">{fr.aimSheet.pick}</p>;

  const shown = all ? destinations : destinations.slice(0, NEAREST);
  return (
    <>
      <div className="flex items-baseline gap-2 pt-[10px] text-[12.5px] text-[var(--ink-soft)]">
        <span className="flex-1">{fr.aimSheet.pickShort}</span>
        {destinations.length > NEAREST && (
          <button
            type="button"
            onClick={() => setAll((open) => !open)}
            className="cursor-pointer font-semibold text-[var(--ink)] underline underline-offset-[3px]"
          >
            {all ? fr.aimSheet.fewerTargets : fr.aimSheet.allTargets(destinations.length)}
          </button>
        )}
      </div>
      <div className={`mt-[7px] gap-[6px] ${all ? 'flex flex-col' : 'grid grid-cols-3'}`}>
        {shown.map((destination) => (
          <button
            key={destination.labelId}
            type="button"
            onClick={() => onPick(destination)}
            className="flex min-h-[50px] min-w-0 cursor-pointer flex-col justify-center gap-[5px] border py-[7px] border-[var(--ink)] bg-[color-mix(in_srgb,var(--paper),white_35%)] px-[9px] text-left"
          >
            <span className="truncate text-[13.5px] leading-none font-bold">
              {destination.name}
            </span>
            <span className="line-clamp-2 font-(family-name:--font-mono) text-[10.5px] leading-[1.25] text-[var(--ink-soft)]">
              {destination.compass.actions
                .filter(isOrder)
                .map((action) => action.label)
                .join(' · ')}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
