import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr, roleLabel } from '@/i18n/fr';
import { carrierIn } from '@/domain/troops';
import type { PlayerView } from '@/domain/player-view';
import { UnitSprite } from '@/emblems/UnitSprite';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';

/**
 * **Qui met pied à terre** (15/10) : quand plusieurs troupes sont à bord, la branche « débarquer »
 * de la rose demande lesquelles — toutes cochées, puisque c'est le cas le plus courant. Une seule
 * à bord descend d'un clic, sans cette carte.
 */
export function DisembarkCard({
  seat,
  view,
  troopIds,
  at,
  onClose,
}: {
  seat: Seat;
  view: PlayerView;
  troopIds: ReadonlyArray<string>;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(troopIds));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const disembark = useMutation(api.movements.disembark);
  const aboard = view.me.troops.filter((troop) => troopIds.includes(troop.id));

  const toggle = (troopId: string) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(troopId)) next.delete(troopId);
      else next.add(troopId);
      return next;
    });

  const send = () => {
    setError(null);
    setSending(true);
    disembark({ ...seat, troopIds: [...picked].map((id) => id as Id<'troops'>) }).then(
      onClose,
      (problem: unknown) => {
        setSending(false);
        handleError(problem, setError);
      },
    );
  };

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    <div
      className="absolute z-[var(--z-popin)] w-[268px] max-w-full"
      style={{
        left: fromRight ? undefined : at.x + 18,
        right: fromRight ? `calc(100% - ${at.x - 18}px)` : undefined,
        top: fromBottom ? undefined : at.y + 18,
        bottom: fromBottom ? `calc(100% - ${at.y - 18}px)` : undefined,
      }}
    >
      <div className="float paper-grain border border-[var(--ink)] p-[3px]">
        <div className="border border-(color:--ink)/40 px-[11px] pt-[9px] pb-[11px] text-[var(--ink)]">
          <div className="text-[9px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
            {fr.disembark.kicker}
          </div>
          <h3 className="mt-[3px] font-(family-name:--font-display) text-[18px] leading-[1.15] font-extrabold">
            {fr.disembark.heading(aboard.length)}
          </h3>
          <div className="my-[9px] h-px bg-[var(--ink)] opacity-55" />
          <ul className="flex flex-col gap-[4px]">
            {aboard.map((troop) => {
              const on = picked.has(troop.id);
              const carrier = carrierIn(troop, view.me.troops);
              return (
                <li key={troop.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(troop.id)}
                    className={`flex w-full cursor-pointer items-center gap-[8px] border px-[7px] py-[4px] text-left ${
                      on ? 'border-[var(--ink)] bg-(--ink)/7' : 'border-(color:--ink)/32'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="flex h-[13px] w-[13px] shrink-0 items-center justify-center border border-[var(--ink)] text-[9px] leading-none"
                      style={{
                        background: on ? 'var(--ink)' : undefined,
                        color: on ? 'var(--paper)' : 'transparent',
                      }}
                    >
                      ×
                    </span>
                    <UnitSprite nation={view.me.nation} role={troop.role} height={24} width={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold">
                        {roleLabel(troop.role, 1)}
                      </span>
                      {carrier !== null && (
                        <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
                          {fr.disembark.aboardOf(roleLabel(carrier.role, 1))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {error && (
            <p className="mt-[9px] border border-[var(--critical)] px-2 py-[5px] text-[11.5px] text-[var(--ink)]">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={sending || picked.size === 0}
            onClick={send}
            className="mt-[10px] w-full cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-[10px] py-[8px] text-[11px] tracking-[.18em] text-[var(--paper)] uppercase hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {fr.disembark.submit(picked.size)}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-[6px] w-full cursor-pointer border border-(color:--ink)/40 px-[10px] py-[5px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase hover:bg-(--ink)/7"
          >
            {fr.demolition.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
