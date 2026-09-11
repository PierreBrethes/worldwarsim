import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import { asDuration, asLocalTime } from '@/domain/duration';
import type { MovementType } from '@/domain/ids';
import type { MovementAim } from '@/domain/movement-orders';
import { landPaceOf, routeMedium } from '@/domain/routing';
import type { MarchStation } from '@/domain/troops';
import { handleError } from '@/data/errors';
import type {
  LootCollectionPreviewed,
  MovementPreviewed,
  PlunderPreviewed,
} from '@/data/serverView';
import { ResourceAmounts } from './CargoReadout';
import type { Seat } from '@/data/session';

/**
 * **Une seule carte de confirmation pour trois missions.** Les trois aperçus du serveur portent
 * la même route et les mêmes heures ; ce qui les sépare — le relais, la reconnaissance, la
 * charge, la présence sur site — se lit là où il existe et se tait ailleurs, plutôt que d'ouvrir
 * une seconde carte qui redirait le reste mot pour mot.
 */
export type Previewed = MovementPreviewed | PlunderPreviewed | LootCollectionPreviewed;

/** Ce que le fil demande à cet envoi-ci — la mutation, jamais un champ de plus sur `march`. */
export type PreviewMission =
  | { readonly kind: 'march' }
  | { readonly kind: 'plunder'; readonly buildingId: string }
  | { readonly kind: 'collect'; readonly sightingId: string };

/**
 * The aim in the shape the mutations take. The point is passed through as it was named — the
 * client resolves nothing about it either (ADR 0019 §1).
 */
export const wireTarget = (aim: MovementAim) =>
  aim.kind === 'region'
    ? ({ kind: 'region', regionId: aim.regionId } as const)
    : aim.kind === 'outpost'
      ? ({ kind: 'outpost', outpostId: aim.outpostId as Id<'outposts'> } as const)
      : aim.kind === 'building'
        ? ({ kind: 'building', buildingId: aim.buildingId as Id<'buildings'> } as const)
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
  seat,
  origin,
  troopIds,
  aim,
  type,
  label,
  at,
  preview,
  mission,
  freeSlots,
  onClose,
}: {
  seat: Seat;
  origin: MarchStation;
  troopIds: ReadonlyArray<string>;
  aim: MovementAim;
  type: MovementType;
  label: string;
  at: { x: number; y: number };
  /** `undefined` while the route is being computed, `null` when nothing gets there. */
  preview: Previewed | undefined;
  mission: PreviewMission;
  freeSlots: number;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const marchTo = useMutation(api.movements.marchTo);
  const enterGarrison = useMutation(api.movements.enterGarrison);
  const attack = useMutation(api.movements.attack);
  const raid = useMutation(api.movements.raid);
  const plunder = useMutation(api.movements.plunder);
  const collectLoot = useMutation(api.movements.collectLoot);

  const send = () => {
    setError(null);
    setSending(true);
    // `PlayerView` carries plain strings — the fog cares about what a row says, not about
    // which table it came from. The branded ids are put back on at the one place that needs
    // them: the call itself.
    const ids = troopIds.map((troopId) => troopId as Id<'troops'>);
    const from = wireOrigin(origin);
    /** **La mission décide de la mutation avant le type** : l'expédition et le ramassage
     *  marchent tous deux, et c'est leur cible — un mât adverse, un relevé de caisse — qui les
     *  sépare, jamais un type de plus sur le fil. Reste la fondation, qui n'est plus un ordre
     *  (`foundOutpostHere`), et le leurre, retiré du jeu le 29/08/2026. */
    const order =
      mission.kind === 'plunder'
        ? plunder({
            ...seat,
            origin: from,
            troopIds: ids,
            buildingId: mission.buildingId as Id<'buildings'>,
          })
        : mission.kind === 'collect'
          ? collectLoot({
              ...seat,
              origin: from,
              troopIds: ids,
              sightingId: mission.sightingId as Id<'lootCrateSightings'>,
            })
          : type === 'march' && aim.kind === 'point'
            ? marchTo({
                ...seat,
                origin: from,
                troopIds: ids,
                point: { lon: aim.lon, lat: aim.lat },
              })
            : type === 'march' && aim.kind === 'building'
              ? enterGarrison({
                  ...seat,
                  origin: from,
                  troopIds: ids,
                  buildingId: aim.buildingId as Id<'buildings'>,
                })
              : type === 'raid' && aim.kind === 'outpost'
                ? raid({
                    ...seat,
                    origin: from,
                    troopIds: ids,
                    outpostId: aim.outpostId as Id<'outposts'>,
                  })
                : attack({
                    ...seat,
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
          {/* Wrapping rather than abbreviating: the cost says a whole sentence, and on a card
              262 px wide it does not always share a line with the kicker. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-[1px] text-[9px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
            <span>{fr.aim.previewKicker}</span>
            <span className="font-(family-name:--font-mono) tracking-[.06em]">{fr.aim.slot}</span>
          </div>
          <h3 className="mt-[3px] font-(family-name:--font-display) text-[18px] leading-[1.15] font-extrabold">
            {fr.aim.heading(destinationOf(aim, preview), label)}
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
                  {fr.aim.duration(asDuration(preview.minutes), troopIds.length)} ·{' '}
                  {legOf(preview.route)}
                </div>
                <div>{fr.aim.arrival(asLocalTime(preview.arrivesAt))}</div>
                {/* La seule ligne de la carte qui explique une durée plutôt que de l'annoncer :
                    sans elle, le relais est un cadeau anonyme. */}
                {'relayed' in preview && preview.relayed > 0 && (
                  <div className="text-[var(--valid)]">
                    {fr.aim.relayed(asDuration(preview.relayed))}
                  </div>
                )}
                {/* Ce que la pile peut ramener, et rien du stock d'en face : le relevé n'en
                    porte aucun, et l'aperçu n'en invente pas (ADR 0005). */}
                {'cargo' in preview && (
                  <div>{fr.loot.freeCapacity(Math.round(preview.cargo.free))}</div>
                )}
                {'presenceHours' in preview && (
                  <div>{fr.aim.presence(asDuration(preview.presenceHours * 60))}</div>
                )}
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
              {'estimatedLoot' in preview && (
                <div className="mt-[7px] border-t border-[rgba(42,33,24,.4)] pt-[6px]">
                  <div className="text-[10.5px] tracking-[.1em] text-[var(--ink-soft)] uppercase">
                    {fr.aim.estimatedLoot}
                  </div>
                  <ResourceAmounts amounts={preview.estimatedLoot} />
                </div>
              )}
              {'recognised' in preview && !preview.recognised && (
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
function legOf(route: NonNullable<Previewed>['route']): string {
  const medium = routeMedium(route.legs);
  if (medium === 'air' || medium === 'sea') return fr.aim.mediums[medium];
  return `${fr.aim.mediums[medium]}, ${fr.aim.paces[landPaceOf(route)]}`;
}

/**
 * What the card calls the destination. A region and an outpost are named by the server, which
 * holds the index; a **point** has no name to give — so it is written as what it is, a pair of
 * coordinates, rather than borrowed from the country it happens to fall in (ADR 0019 §1).
 */
function destinationOf(aim: MovementAim, preview: Previewed | undefined): string {
  if (aim.kind === 'point') return fr.aim.pointAt(aim.lon, aim.lat);
  /** The building, then the region the server names — « Port · Nord », the address the journal
   *  will print when the column enters it (`station-name.ts` writes it the same way). */
  if (aim.kind === 'building') {
    const region = preview?.destinationName;
    return region === undefined ? fr.buildings[aim.key] : `${fr.buildings[aim.key]} · ${region}`;
  }
  return preview?.destinationName ?? '—';
}
