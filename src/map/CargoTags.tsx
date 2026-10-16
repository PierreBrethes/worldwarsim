import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CargoTag } from '@/domain/cargo-tag';
import { fr, roleLabel } from '@/i18n/fr';
import { UnitSprite } from '@/emblems/UnitSprite';

/** Past this many pixels a press on a passenger is a pull, not a click. */
const PULL_PX = 6;
/** Beyond this many seats the slots are counted rather than drawn: a hull of twelve. */
const DRAWN_SEATS = 4;

/**
 * **L'étiquette d'un transport chargé** (POC « Manipuler les pions », 16/10), pendue sous la pile :
 * qui est à bord, les places qui restent, et la sortie. Un passager se tire hors de l'étiquette —
 * ou se clique — et descend au pied de son transport ; « tout débarquer » les fait descendre tous.
 * Là où personne ne peut descendre, l'étiquette dit pourquoi, et rien n'y est grisé (ADR 0015).
 */
export function CargoTags({
  tags,
  nation,
  onDisembark,
}: {
  tags: ReadonlyArray<CargoTag>;
  nation: string | null;
  onDisembark: (troopIds: ReadonlyArray<string>) => void;
}) {
  const [pulled, setPulled] = useState<{ id: string; x: number; y: number } | null>(null);
  // The label under the tags carries a pile: nothing pressed here may reach it.
  const keep = (event: { stopPropagation: () => void }) => event.stopPropagation();

  const pull = (riderId: string, free: boolean) => (event: ReactPointerEvent<HTMLElement>) => {
    keep(event);
    if (!free) return;
    const from = { x: event.clientX, y: event.clientY };
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let moved = false;
    const move = (step: PointerEvent) => {
      moved ||= Math.hypot(step.clientX - from.x, step.clientY - from.y) > PULL_PX;
      if (moved) setPulled({ id: riderId, x: step.clientX, y: step.clientY });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      setPulled(null);
      onDisembark([riderId]);
    };
    const cancel = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      setPulled(null);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
  };

  return (
    <div
      className="cargo-tags pointer-events-auto mt-[6px] flex-col items-center gap-[5px]"
      onPointerDown={keep}
      onClick={keep}
      onContextMenu={keep}
    >
      {tags.map((tag) => {
        const free = tag.refusal === null;
        const empty = Math.max(0, tag.seats - tag.used);
        return (
          <div key={tag.carrierId} className="relative flex flex-col items-center">
            {/* The string it hangs by, from the cartouche above. */}
            <span aria-hidden className="h-[10px] border-l border-dashed border-[var(--ink)]" />
            <div
              className="float paper-grain border border-[var(--ink)] py-[5px] pr-[8px] pl-[16px] text-[var(--ink)]"
              style={{ clipPath: 'polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)' }}
            >
              <span
                aria-hidden
                className="absolute top-1/2 left-[5px] h-[5px] w-[5px] -translate-y-1/2 rounded-full border border-[var(--ink)] bg-[var(--paper)]"
              />
              <div className="flex items-baseline justify-between gap-[10px] whitespace-nowrap">
                <b className="font-(family-name:--font-display) text-[12.5px] leading-none">
                  {roleLabel(tag.role, 1)}
                </b>
                <span className="font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
                  {fr.cargo.seats(tag.used, tag.seats)}
                </span>
              </div>
              <div className="mt-[4px] flex flex-wrap gap-[3px]">
                {tag.riders.map((rider) => (
                  <button
                    key={rider.id}
                    type="button"
                    title={
                      free
                        ? fr.cargo.pull(roleLabel(rider.role, 1))
                        : (fr.errors[tag.refusal!]?.() ?? '')
                    }
                    onPointerDown={pull(rider.id, free)}
                    className={`flex h-[26px] min-w-[30px] items-center justify-center border border-[var(--ink)] bg-[var(--paper)] px-[2px] ${
                      free
                        ? 'cursor-grab hover:-translate-y-px hover:shadow-[0_2px_0_var(--ink)]'
                        : 'cursor-not-allowed'
                    } ${pulled?.id === rider.id ? 'opacity-40' : ''}`}
                  >
                    <UnitSprite
                      nation={nation}
                      role={rider.role}
                      tier={rider.tier}
                      height={20}
                      width={28}
                    />
                  </button>
                ))}
                {tag.seats <= DRAWN_SEATS &&
                  Array.from({ length: empty }, (_, k) => (
                    <span
                      key={`free-${k}`}
                      aria-hidden
                      className="h-[26px] w-[30px] border border-dashed border-(color:--ink)/50"
                    />
                  ))}
              </div>
              {free ? (
                <button
                  type="button"
                  onClick={(event) => {
                    keep(event);
                    onDisembark(tag.riders.map((rider) => rider.id));
                  }}
                  className="mt-[5px] cursor-pointer border border-[var(--ink)] px-[6px] py-[3px] text-[9.5px] tracking-[.12em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                >
                  {fr.cargo.all}
                </button>
              ) : (
                <p className="mt-[4px] max-w-[170px] text-[10.5px] leading-[1.25] text-[var(--ink-soft)]">
                  {fr.errors[tag.refusal!]?.()}
                </p>
              )}
            </div>
          </div>
        );
      })}
      {pulled !== null && (
        <div
          aria-hidden
          className="float paper-grain pointer-events-none fixed z-[var(--z-popin)] border border-[var(--ink)] px-[7px] py-[4px] text-[10px] font-bold tracking-[.12em] text-[var(--ink)] uppercase"
          style={{ left: pulled.x + 14, top: pulled.y + 14 }}
        >
          {fr.cargo.release}
        </div>
      )}
    </div>
  );
}
