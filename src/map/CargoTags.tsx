import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CargoTag } from '@/domain/cargo-tag';
import { fr, roleLabel } from '@/i18n/fr';
import { UnitSprite } from '@/emblems/UnitSprite';

/** Past this many pixels a press on a passenger is a pull, not a click. */
const PULL_PX = 6;

/** **Le transport sous la main** : l'étiquette qui le porte, les places qu'on y prendrait. */
export type CargoAim = {
  readonly labelId: string;
  readonly carrierId: string;
  readonly need: number;
  readonly fits: boolean;
};

/** A seat is 26 px square; a rider taking several spans them, gaps included (POC, `.slot.wide`). */
const slotWidth = (seats: number): number => 26 * seats + 4 * (seats - 1);

/**
 * **L'étiquette d'un transport** (POC « Manipuler les pions », `.tag`), pendue au-dessus de la
 * pile par un fil : qui est à bord, chacun sur les places qu'il tient, les places libres, et la
 * sortie. Elle pend quand le transport porte quelqu'un, quand la pièce en main pourrait y monter,
 * et au survol ; sous la main, elle s'ouvre et dit en ocre les places qu'on y prendrait — en
 * rouge celles qui manquent. Un passager se tire hors de l'étiquette — ou se clique — et descend
 * au pied de son transport. Là où personne ne peut descendre, elle dit pourquoi (ADR 0015).
 */
export function CargoTags({
  tags,
  nation,
  onDisembark,
  aim = null,
  available = false,
}: {
  tags: ReadonlyArray<CargoTag>;
  nation: string | null;
  onDisembark: (troopIds: ReadonlyArray<string>) => void;
  aim?: CargoAim | null;
  available?: boolean;
}) {
  const [pulled, setPulled] = useState<{ id: string; x: number; y: number } | null>(null);
  /** Riders already on the tag: only one who climbs aboard under the eyes is stamped in. */
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set(
    seen.current === null
      ? []
      : tags
          .flatMap((tag) => tag.riders.map((rider) => rider.id))
          .filter((id) => !seen.current!.has(id)),
  );
  useEffect(() => {
    seen.current = new Set(tags.flatMap((tag) => tag.riders.map((rider) => rider.id)));
  }, [tags]);
  // The label under the tags carries a pile: nothing pressed here may reach it.
  const keep = (event: { stopPropagation: () => void }) => event.stopPropagation();

  const pull = (riderId: string, free: boolean) => (event: ReactPointerEvent<HTMLElement>) => {
    keep(event);
    if (!free) {
      event.currentTarget.animate(
        [
          { transform: 'none' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'none' },
        ],
        { duration: 260 },
      );
      return;
    }
    const from = { x: event.clientX, y: event.clientY };
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let moved = false;
    const move = (step: PointerEvent) => {
      moved ||= Math.hypot(step.clientX - from.x, step.clientY - from.y) > PULL_PX;
      if (moved) setPulled({ id: riderId, x: step.clientX, y: step.clientY });
    };
    // The tag may go under the pull (the view re-served): a lost capture lets go without an order.
    const cancel = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('lostpointercapture', cancel);
      setPulled(null);
    };
    const up = () => {
      cancel();
      onDisembark([riderId]);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('lostpointercapture', cancel);
  };

  return (
    <div className="cargo-tags" onPointerDown={keep} onClick={keep} onContextMenu={keep}>
      {tags.map((tag) => {
        const free = tag.refusal === null;
        const open = aim?.carrierId === tag.carrierId;
        const empty = Math.max(0, tag.seats - tag.used);
        const want = open ? aim.need : 0;
        const shown = tag.riders.length > 0 || available || open;
        return (
          <div
            key={tag.carrierId}
            className={`cargo-tag${shown ? '' : ' cargo-tag--idle'}${open ? ' cargo-tag--open' : ''}`}
          >
            <div className="cargo-tag-body float paper-grain">
              <div className="cargo-tag-head">
                <b>{roleLabel(tag.role, 1)}</b>
                <span>{fr.cargo.seats(tag.used, tag.seats)}</span>
              </div>
              <div className="cargo-tag-slots">
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
                    style={{ width: slotWidth(rider.seats) }}
                    className={`cargo-slot cargo-slot--full${fresh.has(rider.id) ? ' cargo-slot--stamp' : ''}${
                      pulled?.id === rider.id ? ' opacity-40' : ''
                    }`}
                  >
                    <UnitSprite
                      nation={nation}
                      role={rider.role}
                      tier={rider.tier}
                      height={18}
                      width={22}
                    />
                  </button>
                ))}
                {Array.from({ length: empty }, (_, k) => (
                  <span
                    key={`free-${k}`}
                    aria-hidden
                    className={`cargo-slot${k < want ? (aim?.fits === true ? ' cargo-slot--ghost' : ' cargo-slot--over') : ''}`}
                  />
                ))}
                {open && want > empty && (
                  <span className="cargo-slot cargo-slot--over cargo-slot--more">
                    +{want - empty}
                  </span>
                )}
              </div>
              {tag.riders.length > 0 &&
                (free ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      keep(event);
                      onDisembark(tag.riders.map((rider) => rider.id));
                    }}
                    className="cargo-tag-out"
                  >
                    {fr.cargo.all}
                  </button>
                ) : (
                  <p className="cargo-tag-why">{fr.errors[tag.refusal!]?.()}</p>
                ))}
            </div>
            {/* The string it hangs by, down to its piece. */}
            <span aria-hidden className="cargo-tag-string" />
          </div>
        );
      })}
      {pulled !== null && (
        <div
          aria-hidden
          className="float paper-grain pointer-events-none fixed z-[var(--z-popin)] border border-[var(--ink)] bg-[var(--paper)] px-[7px] py-[4px] text-[10px] font-bold tracking-[.12em] text-[var(--ink)] uppercase"
          style={{ left: pulled.x + 14, top: pulled.y + 14 }}
        >
          {fr.cargo.release}
        </div>
      )}
    </div>
  );
}
