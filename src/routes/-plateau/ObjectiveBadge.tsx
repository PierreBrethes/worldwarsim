import { fr } from '@/i18n/fr';
import { lootWords } from '@/domain/journal';
import type { ObjectiveView } from '@/domain/player-view';
import { objectiveArchetype } from '../../../convex/constants';
import { ObjectivePlate } from '@/emblems/Plate';
import { Draggable, DragHandle } from './Draggable';

/**
 * **La popin lit, la carte agit** (décision Pierre, 30/08). Celle-ci lit ce qui est **public** —
 * le nom de 1940, le palier en toutes lettres, ce qu'il reste au dépôt et si l'objectif est
 * épuisé — et elle s'arrête exactement là où le brouillard reprend : *la composition de la
 * garnison n'y est pas*, et la phrase le dit une fois pour qu'un silence ne se lise pas comme un
 * chargement.
 *
 * Le palier se relit de la palette (`OBJECTIVE_ARCHETYPES`), la seule table qui le porte : une
 * copie cliente aurait dit « légères » d'une garnison que le serveur pose avec un blindé.
 *
 * Elle ne porte aucun ordre : l'attaque se donne au clic droit sur le même mât, comme partout
 * ailleurs sur la carte.
 */
export function ObjectiveBadge({
  objective,
  at,
  onClose,
}: {
  objective: ObjectiveView;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;
  const name = fr.objectives.names[objective.key] ?? objective.key;
  const tier = fr.objectives.tiers[objectiveArchetype(objective.key)?.tier ?? ''] ?? '';
  const emptied = objective.status === 'taken';

  return (
    <Draggable
      className="absolute z-[var(--z-popin)]"
      style={{
        left: fromRight ? undefined : at.x + ANCHOR_GAP,
        right: fromRight ? `calc(100% - ${at.x - ANCHOR_GAP}px)` : undefined,
        top: fromBottom ? undefined : at.y + 14,
        bottom: fromBottom ? `calc(100% - ${at.y - 14}px)` : undefined,
      }}
    >
      <div className="hud paper-grain w-[228px] border border-[var(--ink)] bg-[var(--paper)] px-[10px] py-[8px]">
        <DragHandle className="flex items-baseline gap-2">
          <span className="text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
            {fr.objectives.badgeKicker}
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
          {/* La planche de l'archétype, ou le cadre pointillé qui porte son nom : jamais une
              image cassée pour un dessin qui n'existe pas encore. */}
          <ObjectivePlate objective={objective.key} label={name} height={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-[var(--ink)]">{name}</span>
            <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
              {tier}
            </span>
          </span>
        </div>

        <p className="mt-[6px] font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
          {emptied
            ? fr.objectives.emptied
            : `${fr.objectives.depot} : ${lootWords(objective.depot)}`}
        </p>

        <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--ink-quiet)]">
          {fr.objectives.unknownGarrison}
        </p>
      </div>
    </Draggable>
  );
}

/** La même que celle du cartouche de camp : la rose s'ancre au même point que la popin. */
const ANCHOR_GAP = 64;
