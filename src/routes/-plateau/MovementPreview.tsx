import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import { asHoursMinutes, asLocalTime } from '@/domain/duration';
import type { MovementType } from '@/domain/ids';
import type { MovementAim } from '@/domain/movement-orders';
import { landPaceOf, routeMedium } from '@/domain/routing';
import type { MarchStation } from '@/domain/troops';
import { handleError } from '@/data/errors';
import type { MovementPreviewed } from '@/data/serverView';

/**
 * The aim in the shape the mutations take. The point is passed through as it was named — the
 * client resolves nothing about it either (ADR 0019 §1).
 */
export const wireTarget = (aim: MovementAim) =>
  aim.kind === 'region'
    ? ({ kind: 'region', regionId: aim.regionId } as const)
    : aim.kind === 'outpost'
      ? ({ kind: 'outpost', outpostId: aim.outpostId as Id<'outposts'> } as const)
      : ({ kind: 'point', point: { lon: aim.lon, lat: aim.lat } } as const);

/**
 * Where a column stands, in the shape the mutations take — the branded ids go back on at the one
 * place that needs them, the call itself. It is the troop's own address (`MarchStation`) and not
 * a second vocabulary: since ADR 0019 the origin no longer says what may be asked for, it says
 * which address the order leaves from, and that is all.
 */
export const wireOrigin = (station: MarchStation) =>
  station.kind === 'outpost'
    ? ({ kind: 'outpost', outpostId: station.outpostId as Id<'outposts'> } as const)
    : station.kind === 'building'
      ? ({ kind: 'building', buildingId: station.buildingId as Id<'buildings'> } as const)
      : ({
          kind: 'point',
          point: { lon: station.lonLat[0], lat: station.lonLat[1] },
        } as const);

/**
 * **The confirmation sits at the end of the arc, not in the middle of the screen**: the gesture
 * finishes where the movement arrives. It prints what the player is about to buy — the real
 * duration of the real route, the hour of arrival, the target's rest window if it bites, and the
 * slot — then says the one thing that matters out loud: *irréversible*.
 *
 * It never computes any of it. The route and the hour come from the server, which is the only
 * one entitled to date a movement (`convex/movements.ts`, `preview`).
 */
export function MovementPreview({
  token,
  origin,
  troopIds,
  aim,
  type,
  at,
  preview,
  freeSlots,
  onClose,
}: {
  token: string;
  origin: MarchStation;
  troopIds: ReadonlyArray<string>;
  aim: MovementAim;
  type: MovementType;
  at: { x: number; y: number };
  /** `undefined` while the route is being computed, `null` when nothing gets there. */
  preview: MovementPreviewed | undefined;
  freeSlots: number;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const marchTo = useMutation(api.movements.marchTo);
  const attack = useMutation(api.movements.attack);
  const raid = useMutation(api.movements.raid);

  const send = () => {
    setError(null);
    setSending(true);
    // `PlayerView` carries plain strings — the fog cares about what a row says, not about
    // which table it came from. The branded ids are put back on at the one place that needs
    // them: the call itself.
    const ids = troopIds.map((troopId) => troopId as Id<'troops'>);
    const from = wireOrigin(origin);
    /** Three orders and no fourth: founding is not one of them any more — it is what a column
     *  does where it stands (`foundOutpostHere`), and the fan stopped offering it. */
    const order =
      type === 'march' && aim.kind === 'point'
        ? marchTo({
            token,
            origin: from,
            troopIds: ids,
            point: { lon: aim.lon, lat: aim.lat },
          })
        : type === 'raid' && aim.kind === 'outpost'
          ? raid({
              token,
              origin: from,
              troopIds: ids,
              outpostId: aim.outpostId as Id<'outposts'>,
            })
          : attack({
              token,
              origin: from,
              troopIds: ids,
              target: wireTarget(aim),
            });

    order.then(onClose, (problem: unknown) => {
      setSending(false);
      handleError(problem, setError);
    });
  };

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    <div
      className="absolute z-20 w-[262px]"
      style={{
        left: fromRight ? undefined : at.x + 18,
        right: fromRight ? `calc(100% - ${at.x - 18}px)` : undefined,
        top: fromBottom ? undefined : at.y + 18,
        bottom: fromBottom ? `calc(100% - ${at.y - 18}px)` : undefined,
      }}
    >
      <div className="paper-grain border border-[var(--ink)] p-[3px]">
        <div className="border border-[rgba(42,33,24,.4)] px-[11px] pt-[9px] pb-[11px] text-[var(--ink)]">
          <div className="flex items-baseline justify-between text-[9px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
            <span>{fr.aim.previewKicker}</span>
            <span className="font-(family-name:--font-mono) tracking-[.06em]">{fr.aim.slot}</span>
          </div>
          <h3 className="mt-[3px] font-(family-name:--font-display) text-[18px] leading-[1.15] font-extrabold">
            {fr.aim.heading(destinationOf(aim, preview), fr.movementTypes[type])}
          </h3>
          <div className="my-[9px] h-px bg-[var(--ink)] opacity-55" />

          {preview === undefined ? (
            <p className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
              {fr.aim.computing}
            </p>
          ) : preview === null ? (
            <p className="text-[12.5px] leading-[1.45] text-[var(--critical)]">{fr.aim.noRoute}</p>
          ) : (
            <>
              <div className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7]">
                {/* The medium is read off the **legs**, never off the route's mode: a pile with
                    a hull routes `combined` even when the road gets there dry, and the card
                    would then promise a crossing to the next region. */}
                <div>
                  {fr.aim.duration(asHoursMinutes(preview.minutes), preview.troops)} ·{' '}
                  {legOf(preview.route)}
                </div>
                <div>{fr.aim.arrival(asLocalTime(preview.arrivesAt))}</div>
              </div>
              {preview.holdUntil !== null && (
                <div className="mt-[7px] flex items-center gap-[7px]">
                  <span
                    className="h-[5px] w-[5px] shrink-0"
                    style={{ background: 'var(--critical)' }}
                  />
                  <span className="text-[10.5px] tracking-[.1em] text-[var(--critical)] uppercase">
                    {fr.aim.restBite(asLocalTime(preview.holdUntil))}
                  </span>
                </div>
              )}
              {/* What the player does not know, said before he pays for it (ADR 0019 §6). It is
                  a statement about his own eyes, never about the ground — the note underneath is
                  there so it cannot be read as a guarantee the other way round. */}
              {!preview.recognised && (
                <div className="mt-[7px] border-t border-[rgba(42,33,24,.4)] pt-[6px]">
                  <div className="text-[10.5px] tracking-[.1em] text-[var(--notable)] uppercase">
                    {fr.aim.unscouted}
                  </div>
                  <p className="mt-[2px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
                    {fr.aim.unscoutedNote}
                  </p>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="mt-[9px] border border-[var(--critical)] px-2 py-[5px] text-[11.5px] text-[var(--ink)]">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!preview || sending || freeSlots <= 0}
            onClick={send}
            className="mt-[10px] w-full cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-[10px] py-[8px] text-[11px] tracking-[.18em] text-[var(--paper)] uppercase hover:border-[var(--critical)] hover:bg-[var(--critical)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {fr.aim.submit}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-[6px] w-full cursor-pointer border border-[rgba(42,33,24,.4)] px-[10px] py-[5px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase hover:bg-[rgba(42,33,24,.07)]"
          >
            {fr.aim.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The medium, and the pace when the trip touches the ground at all. A crossing that never sets a
 * boot down has no pace to name, and saying "à pied" of a flight would be a word too many.
 */
function legOf(route: NonNullable<MovementPreviewed>['route']): string {
  const medium = routeMedium(route.legs);
  if (medium === 'air' || medium === 'sea') return fr.aim.mediums[medium];
  return `${fr.aim.mediums[medium]}, ${fr.aim.paces[landPaceOf(route)]}`;
}

/**
 * What the card calls the destination. A region and an outpost are named by the server, which
 * holds the index; a **point** has no name to give — so it is written as what it is, a pair of
 * coordinates, rather than borrowed from the country it happens to fall in (ADR 0019 §1).
 */
function destinationOf(aim: MovementAim, preview: MovementPreviewed | undefined): string {
  if (aim.kind === 'point') return fr.aim.pointAt(aim.lon, aim.lat);
  return preview?.destinationName ?? '—';
}
