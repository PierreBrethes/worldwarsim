import { SCOUT_RADIUS_KM, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr, roleLabel } from '@/i18n/fr';
import { tierLabel } from '@/domain/troops';
import type { TroopView } from '@/domain/player-view';
import { UnitSprite } from '@/emblems/UnitSprite';
import { Draggable, DragHandle } from './Draggable';

/**
 * **Une troupe seule ne mérite pas une fenêtre** (décision Pierre, 29/08). La fenêtre de garnison
 * sert à *composer* une pile ; désigner une troupe ne compose rien, et ouvrir un panneau à chaque
 * clic revenait à faire payer un formulaire pour une question de deux lignes.
 *
 * Ce cartouche dit ce que la vue du joueur sait déjà — le rôle, l'effectif, l'état — et rien
 * d'autre : pas un bouton d'ordre, pas une composition. Ce qui l'accompagne se lit sur la carte
 * plutôt qu'ici : la planche prend l'encre du joueur, et le cercle de détection s'ouvre autour
 * d'elle. La fenêtre complète reste à un clic — sur un point qui porte plusieurs troupes, ou
 * depuis le widget.
 */
export function TroopBadge({
  nation,
  troop,
  at,
  onClose,
}: {
  nation: string;
  troop: TroopView;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    /* Poussé à la main comme la garnison, et sans rien retenir : il est visé sur une pile, et
       restituer la poussée d'hier l'arracherait à la troupe qu'il décrit (`Draggable`). */
    <Draggable
      className="absolute z-20"
      style={{
        left: fromRight ? undefined : at.x + 14,
        right: fromRight ? `calc(100% - ${at.x - 14}px)` : undefined,
        top: fromBottom ? undefined : at.y + 14,
        bottom: fromBottom ? `calc(100% - ${at.y - 14}px)` : undefined,
      }}
    >
      <div className="hud paper-grain w-[228px] border border-[var(--ink)] bg-[var(--paper)] px-[10px] py-[8px]">
        <DragHandle className="flex items-baseline gap-2">
          <span className="text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
            {fr.troops.badgeKicker}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer border border-[var(--ink)] px-[6px] py-[1px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="mt-[7px] flex items-center gap-[9px]">
          <UnitSprite nation={nation} role={troop.role} height={28} width={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-[var(--ink)]">
              {roleLabel(troop.role, 1)} · {tierLabel(troop.tier)}
            </span>
            <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
              {fr.troops.strength(troop.strength, troop.nominalStrength)}
            </span>
          </span>
        </div>

        <p
          className="mt-[6px] font-(family-name:--font-mono) text-[10.5px]"
          style={{ color: troop.supplied ? 'var(--ink-soft)' : 'var(--critical)' }}
        >
          {troop.supplied ? fr.troops.supplied : fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
        </p>

        {/* Ce que le cercle tracé sur la carte veut dire, une fois, à côté de lui (ADR 0019 §5). */}
        <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
          {fr.troops.badgeScouting(SCOUT_RADIUS_KM)}
        </p>
        <p className="mt-[3px] text-[10px] leading-[1.35] text-[var(--ink-quiet)]">
          {fr.troops.badgeAim}
        </p>
        <p className="mt-[2px] text-[10px] leading-[1.35] text-[var(--ink-quiet)]">
          {fr.troops.badgeFound}
        </p>
      </div>
    </Draggable>
  );
}
