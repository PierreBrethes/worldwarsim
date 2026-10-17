import { useMutation } from 'convex/react';
import { useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  outpostReachKm,
  OUTPOST_MAX_LEVEL,
  RELAY_SPEED_MULTIPLIER,
} from '../../../convex/constants';
import { fr, noBuilding, raiseHoldText } from '@/i18n/fr';
import { PRODUCER_OF } from '@/domain/economy';
import { asDuration, asLocalTime } from '@/domain/duration';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import {
  availabilityOf,
  outpostRaiseHold,
  pledgedOutposts,
  type OutpostRaiseHold,
} from '@/domain/construction';
import { currentStock, type OutpostView } from '@/domain/player-view';
import { ResourcePlate } from '@/emblems/Plate';
import { useClock } from '@/shell/clock';
import { marchingTroopIds, stationKeyOf, troopsAt, PROJECTION_BY_DOMAIN } from '@/domain/troops';
import type { BuildingKey } from '@/domain/ids';
import type { PlayerView, TroopStation } from '@/domain/player-view';
import { handleError } from '@/data/errors';
import { Stamp } from '@/shell/Stamp';
import { Draggable } from './Draggable';
import { GarrisonStack } from './GarrisonStack';
import { Panel } from './Panel';
import type { Seat } from '@/data/session';

const PROJECTION_KEYS: ReadonlySet<BuildingKey> = new Set(Object.values(PROJECTION_BY_DOMAIN));

/**
 * **La garnison d'une adresse qui n'est pas un site de production** — un avant-poste, une pile
 * posée, une troupe que le jeu ne sait plus placer. Le mât d'une caserne, d'un aérodrome ou d'un
 * port ne l'ouvre plus : depuis la décision 61a il ouvre la modale du site, qui absorbe la même
 * composition (`SiteModal`). Deux cadres, **un** flux — c'est `GarrisonStack` qui le tient.
 *
 * Le panneau garde ce qui n'appartient qu'à un point : le cachet d'avant-poste désactivé et le
 * choix de spécialisation, qui se règle sur le terrain une fois planté.
 *
 * **Le mât d'un avant-poste est sa porte** (précision du 04/09) : la colonne qui a fondé y
 * stationne (ADR 0019 §1), et depuis la disparition du widget de troupes plus rien ne l'ouvrait
 * — le seul marqueur cliquable était la pile posée sur un point. Il n'y a pas de modale de site
 * pour un avant-poste : il ne forme rien, donc l'en-tête porte ici sa région et son niveau.
 * Garnison vide, le panneau s'ouvre quand même : une porte qui ne s'ouvre que parfois se lit
 * comme une panne.
 */
export function GarrisonPanel({
  view,
  seat,
  station,
  at,
  preselect,
  onClose,
  onPrepare,
  onPickedChange,
}: {
  view: PlayerView;
  seat: Seat;
  /** `home` is the address of a troop whose building is gone: the game cannot place it, so
   *  nothing can march it (ADR 0019 §1). */
  station: TroopStation;
  at: { x: number; y: number };
  preselect: ReadonlyArray<string>;
  onClose: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
  /** Ce qui est coché, pour la carte : la troupe cochée y grossit (carte-lisible, 03/10). */
  onPickedChange?: (troopIds: ReadonlyArray<string>) => void;
}) {
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const stationKey = stationKeyOf(station);
  const held = useMemo(
    () => troopsAt(view.me, stationKey, marching),
    [view.me, stationKey, marching],
  );
  const [error, setError] = useState<string | null>(null);
  const respecialize = useMutation(api.movements.respecialize);
  const disembark = useMutation(api.movements.disembark);
  const [ashoreError, setAshoreError] = useState<string | null>(null);

  const building =
    station.kind === 'building'
      ? (view.me.buildings.find((candidate) => candidate.id === station.buildingId) ?? null)
      : null;
  const outpost =
    station.kind === 'outpost'
      ? (view.me.outposts.find((candidate) => candidate.id === station.outpostId) ?? null)
      : null;
  /** **Les trois portes, pas la seule caserne.** Le serveur part de n'importe quel bâtiment
   *  possédé (`departureOf`) et c'est `closedGate` qui lit la porte du domaine : un port arme
   *  une colonne de coques exactement comme la caserne arme une colonne de bottes. */
  const projection = building !== null && PROJECTION_KEYS.has(building.key);
  /**
   * **Une adresse compose, sauf celle qui n'en est pas une.** Le sol ne décide plus de ce qu'une
   * pile peut demander (ADR 0019 §1) et le mouvement terrestre ne demande plus de bâtiment du
   * tout (§2) : la porte du domaine se lit à la visée, par `closedGate`, et le motif du refus
   * s'affiche dans la rose. `home` reste dehors : c'est une troupe que le jeu ne sait plus
   * placer, donc qu'il ne sait pas router.
   */
  const canPrepare = station.kind !== 'home';
  const regionName = (regionId: string | null): string | null =>
    view.me.regions.find((candidate) => candidate.id === regionId)?.name ?? null;
  /** Ce que le panneau dit du lieu : la région d'un bâtiment, la région **et le niveau** d'un
   *  avant-poste — il n'a pas de modale de site pour les porter, il ne forme rien. */
  const ground = building
    ? regionName(building.regionId)
    : outpost !== null
      ? fr.garrison.outpostGround(outpost.level, regionName(outpost.regionId))
      : null;

  const title = building
    ? building.name
    : outpost
      ? fr.troops.garrisonAt(outpost.hostCountry)
      : station.kind === 'point'
        ? station.country === ''
          ? fr.troops.postedAtSea
          : fr.troops.postedAt(station.country)
        : fr.garrison.home;

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    /* Aimed at a point and therefore remembering none: the push the player gives it lasts as
       long as the panel does. See `Draggable`. */
    <Draggable
      className="absolute z-[var(--z-popin)]"
      style={{
        left: fromRight ? undefined : at.x,
        right: fromRight ? `calc(100% - ${at.x}px)` : undefined,
        top: fromBottom ? undefined : at.y,
        bottom: fromBottom ? `calc(100% - ${at.y}px)` : undefined,
      }}
    >
      <Panel
        title={title}
        marker={fr.garrison.kicker}
        position="static"
        width={340}
        onClose={onClose}
      >
        {/**
         * **Désactivé, jamais pris** (ADR 0004) : un raid gagné met le point hors service pour un
         * temps, il ne change pas de main. Le tampon est rouge parce que c'est la seule chose du
         * plateau qui cesse de payer sans que le joueur ait rien fait.
         *
         * Il n'y a **pas** de tampon « détruit » : la destruction attend le pillage et rien ne
         * compte les raids vers elle (ADR 0004). Un cachet qu'aucun état ne peut
         * allumer serait un état inventé.
         */}
        {outpost !== null && outpost.disabledMinutesLeft !== null && (
          <div className="mb-[9px] flex shrink-0 flex-col items-center gap-[6px]">
            <Stamp label={fr.stamps.outpostDisabled} tone="critical" />
            {/** **Le temps restant en clair** (15/09) : le cachet dit l'état, il ne dit pas
             *  combien de temps encore — et c'est la seule chose que le joueur ait à peser ici,
             *  sa zone étant hachurée sur la carte pendant tout ce temps (ADR 0020 §7). */}
            <span className="text-center text-[10.5px] text-[var(--ink-soft)]">
              {fr.garrison.disabledFor(
                Math.floor(outpost.disabledMinutesLeft / 60),
                String(Math.floor(outpost.disabledMinutesLeft % 60)).padStart(2, '0'),
              )}
            </span>
          </div>
        )}

        {/**
         * **En chantier** (révision du 15/09 de l'ADR 0020 §10) : le point n'existe pas encore —
         * il ne tient rien, n'atteint rien, ne détecte rien — et ce panneau est le seul cadre qui
         * porte la garnison qui le tient. Un cachet et l'heure, puis la phrase qui dit ce que
         * partir coûte : c'est la seule chose que le joueur peut décider ici.
         */}
        {outpost !== null && outpost.standsAt !== null && (
          <div className="mb-[9px] flex shrink-0 flex-col items-center gap-[6px]">
            <Stamp label={fr.stamps.outpostUnderConstruction} tone="critical" />
            <span className="text-center text-[10.5px] text-[var(--ink-soft)]">
              {fr.garrison.standsAt(asLocalTime(outpost.standsAt))}
            </span>
            <span className="text-center text-[10.5px] text-[var(--ink-quiet)] italic">
              {fr.garrison.foundationHeld}
            </span>
          </div>
        )}

        <div className="flex shrink-0 items-baseline gap-2 text-[11.5px] text-[var(--ink-soft)]">
          <span>{projection ? fr.garrison.projection : (ground ?? '')}</span>
          <span className="ml-auto font-(family-name:--font-mono)">
            {fr.garrison.troopCount(held.length)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[7px] py-[2px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] max-md:hidden"
          >
            {fr.common.close}
          </button>
        </div>

        <div className="mt-[10px]">
          <GarrisonStack
            view={view}
            station={station}
            held={held}
            preselect={preselect}
            canPrepare={canPrepare}
            observing={view.me.defeated}
            onPrepare={onPrepare}
            onPickedChange={onPickedChange}
            onDisembark={(troopIds) => {
              setAshoreError(null);
              disembark({
                ...seat,
                troopIds: troopIds.map((troopId) => troopId as Id<'troops'>),
              }).catch((problem: unknown) => handleError(problem, setAshoreError));
            }}
          />
          {ashoreError !== null && (
            <p className="mt-[6px] text-[11px] text-[var(--critical)]">{ashoreError}</p>
          )}
        </div>

        {/** **On ne monte pas ce qui n'est pas debout** : un chantier n'a pas de niveau à
         *  élever, il a une heure à attendre. */}
        {outpost !== null && outpost.standsAt === null && !view.me.defeated && (
          <OutpostRaise view={view} seat={seat} outpost={outpost} />
        )}

        {/**
         * **Le métier du point se règle sur le point, une fois planté** (décision Pierre, 29/08).
         * Il se choisissait au départ d'une colonne, puis sur la pile qui allait fonder — deux
         * fois à l'aveugle, sur deux mots. Ici le terrain est sous les pieds de la garnison et
         * l'avant-poste est déjà debout : c'est le dernier moment où le choix veut encore dire
         * quelque chose.
         *
         * Le serveur exige un mot à la fondation, alors le clic droit pose « relais » et ce
         * panneau rattrape. Scellé, il ne montre pas deux boutons éteints : il dit ce que le
         * point fait, et pourquoi il ne change plus (ADR 0015).
         */}
        {outpost !== null && outpost.standsAt === null && (
          <div className="mt-[11px] border-t border-(color:--ink)/32 pt-[9px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
                {fr.garrison.foundSpecialization}
              </span>
              {outpost.specializationLocked || view.me.defeated ? (
                <span className="text-[11px] text-[var(--ink)]">
                  {fr.specializations[outpost.specialization]}
                </span>
              ) : (
                (['relay', 'listening'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={outpost.specialization === key}
                    onClick={() => {
                      setError(null);
                      if (outpost.specialization === key) return;
                      respecialize({
                        ...seat,
                        outpostId: outpost.id as Id<'outposts'>,
                        specialization: key,
                      }).catch((problem: unknown) => handleError(problem, setError));
                    }}
                    className={`cursor-pointer border px-[7px] py-[3px] text-[10px] ${
                      outpost.specialization === key
                        ? 'border-[var(--ink)] bg-(--ink)/7 text-[var(--ink)]'
                        : 'border-(color:--ink)/32 text-[var(--ink-soft)]'
                    }`}
                  >
                    {fr.specializations[key]}
                  </button>
                ))
              )}
            </div>
            {/* **Le choix se faisait à l'aveugle** : deux mots, aucun chiffre, aucun effet. Le
                rayon est la seule donnée qui dise ce que le point rapporte. */}
            <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
              {outpost.specialization === 'relay'
                ? fr.specializationEffects.relay(
                    outpostReachKm(outpost.level),
                    RELAY_SPEED_MULTIPLIER,
                  )
                : fr.specializationEffects.listening(outpostReachKm(outpost.level))}
            </p>
            {outpost.specializationLocked && (
              <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-quiet)]">
                {fr.garrison.specializationSealed}
              </p>
            )}
            {error !== null && (
              <p className="mt-[6px] text-[11px] text-[var(--critical)]">{error}</p>
            )}
          </div>
        )}
      </Panel>
    </Draggable>
  );
}

/**
 * **Monter le point, là où on lit son niveau** (précision du 15/09 de l'ADR 0020 §10, décision
 * 1a). Il n'y a pas de modale de site pour un avant-poste — il ne forme rien — et son en-tête
 * porte déjà sa région et son niveau : la porte de l'élévation ne pouvait être nulle part
 * ailleurs. C'est le même geste que l'`UpgradeControl` d'un bâtiment, et le même contrat : **le
 * bouton n'est jamais absent, seulement empêché et expliqué** (ADR 0015) — sauf pour un
 * observateur, qui n'est pas empêché mais ne décide plus (décision du 31/08, d'où le retrait au
 * niveau de l'appelant).
 *
 * L'empêchement sort de la **même fonction** que la mutation (`outpostRaiseHold`) : deux
 * lectures auraient fini par offrir ce que le serveur refuse.
 */
function OutpostRaise({
  view,
  seat,
  outpost,
}: {
  view: PlayerView;
  seat: Seat;
  outpost: OutpostView;
}) {
  const now = useClock();
  const raise = useMutation(api.constructions.raiseOutpost);
  const [error, setError] = useState<string | null>(null);

  const next = outpost.level + 1;
  /** Le prix et la durée viennent de la vue, jamais d'un second barème ici : c'est le contrat
   *  de l'élévation d'un bâtiment (`UpgradeControl`), et le seul qui ne puisse pas diverger. */
  const cost = outpost.nextLevelCost;
  const stocks = Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;
  const hold = outpostRaiseHold(
    {
      level: outpost.level,
      disabled: outpost.disabledMinutesLeft !== null,
      queued: pledgedOutposts(view).has(outpost.id),
      stocks,
    },
    cost,
    OUTPOST_MAX_LEVEL,
  );
  const held = hold === null ? null : raiseHeld(hold);

  return (
    <div className="mt-[11px] border-t border-(color:--ink)/32 pt-[9px]">
      <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px]">
        <span className="text-[9px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {fr.garrison.raiseHeader}
        </span>
        {hold?.kind !== 'maxLevel' && (
          <>
            <span
              className="flex items-center gap-[10px] font-(family-name:--font-mono) text-[12.5px]"
              style={{ color: hold?.kind === 'materials' ? 'var(--critical)' : 'var(--ink)' }}
            >
              {RESOURCES.filter((key) => (cost[key] ?? 0) > 0).map((key) => (
                <span key={key} className="flex items-center gap-[4px]">
                  <ResourcePlate resource={key} height={18} />
                  {cost[key]}
                </span>
              ))}
            </span>
            <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
              {asDuration(outpost.nextLevelMinutes)}
            </span>
          </>
        )}
        <button
          type="button"
          disabled={held !== null}
          title={fr.garrison.raiseTitle(next)}
          onClick={() => {
            setError(null);
            raise({ ...seat, outpostId: outpost.id as Id<'outposts'> }).catch((problem: unknown) =>
              handleError(problem, setError),
            );
          }}
          className="ml-auto cursor-pointer border border-[var(--ink)] px-[10px] py-[4px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--ink)]"
        >
          {fr.garrison.raiseAction} {fr.garrison.raiseToLevel(next)}
        </button>
      </div>
      {/* Ce que le niveau ouvre, en chiffres : un emplacement de plus et le rayon suivant. Sans
          eux « monter au niveau 2 » n'achète rien de lisible. */}
      {hold?.kind !== 'maxLevel' && (
        <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
          {fr.garrison.raiseCarries(next, outpostReachKm(next))}
        </p>
      )}
      {held !== null && (
        <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">{held}</p>
      )}
      {hold?.kind === 'materials' && (
        <RaiseAvailability hold={hold} view={view} stock={stocks[hold.resource]} />
      )}
      {error !== null && <p className="mt-[6px] text-[11px] text-[var(--critical)]">{error}</p>}
    </div>
  );
}

/** **La facture se dit déjà en chiffres au-dessus, en encre critique** : la répéter en toutes
 *  lettres serait la dire deux fois. Partout ailleurs la phrase est celle de `raiseHoldText`,
 *  qu'un seul module écrit — la rose des vents la lit telle quelle (décision du 16/09). */
const raiseHeld = (hold: OutpostRaiseHold): string | null =>
  hold.kind === 'materials' ? null : raiseHoldText(hold);

/** **Quand la matière sera là** — la même ligne que l'élévation d'un bâtiment, et la même
 *  raison : un refus qui se date est un plan, un refus qui compte est un mur. */
function RaiseAvailability({
  hold,
  view,
  stock,
}: {
  hold: Extract<OutpostRaiseHold, { kind: 'materials' }>;
  view: PlayerView;
  stock: number;
}) {
  const when = availabilityOf(hold.needed, view.me.resources[hold.resource], stock);
  if (when.kind === 'now') return null;
  return (
    <p
      className="mt-[4px] text-[10.5px] leading-[1.4]"
      style={{ color: when.kind === 'never' ? 'var(--critical)' : 'var(--ink-soft)' }}
    >
      {when.kind === 'inMinutes'
        ? fr.upgrade.availableIn(asDuration(when.minutes))
        : fr.upgrade.never(noBuilding(PRODUCER_OF[hold.resource]))}
    </p>
  );
}
