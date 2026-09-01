import { useMutation } from 'convex/react';
import { useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { outpostReachKm, RELAY_SPEED_MULTIPLIER } from '../../../convex/constants';
import { fr } from '@/i18n/fr';
import { marchingTroopIds, stationKeyOf, troopsAt, PROJECTION_BY_DOMAIN } from '@/domain/troops';
import type { BuildingKey } from '@/domain/ids';
import type { PlayerView, TroopStation } from '@/domain/player-view';
import { handleError } from '@/data/errors';
import { Stamp } from '@/shell/Stamp';
import { Draggable } from './Draggable';
import { GarrisonStack } from './GarrisonStack';
import { Panel } from './Panel';

const PROJECTION_KEYS: ReadonlySet<BuildingKey> = new Set(Object.values(PROJECTION_BY_DOMAIN));

/**
 * **La garnison d'une adresse qui n'est pas un site de production** — un avant-poste, une pile
 * posée, une troupe que le jeu ne sait plus placer. Le mât d'une caserne, d'un aérodrome ou d'un
 * port ne l'ouvre plus : depuis la décision 61a il ouvre la modale du site, qui absorbe la même
 * composition (`SiteModal`). Deux cadres, **un** flux — c'est `GarrisonStack` qui le tient.
 *
 * Le panneau garde ce qui n'appartient qu'à un point : le cachet d'avant-poste désactivé et le
 * choix de spécialisation, qui se règle sur le terrain une fois planté.
 */
export function GarrisonPanel({
  view,
  token,
  station,
  at,
  preselect,
  onClose,
  onPrepare,
}: {
  view: PlayerView;
  token: string;
  /** `home` is the address of a troop whose building is gone: the game cannot place it, so
   *  nothing can march it (ADR 0019 §1). */
  station: TroopStation;
  at: { x: number; y: number };
  preselect: ReadonlyArray<string>;
  onClose: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
}) {
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const stationKey = stationKeyOf(station);
  const held = useMemo(
    () => troopsAt(view.me, stationKey, marching),
    [view.me, stationKey, marching],
  );
  const [error, setError] = useState<string | null>(null);
  const respecialize = useMutation(api.movements.respecialize);

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
  const region = building
    ? (view.me.regions.find((candidate) => candidate.id === building.regionId)?.name ?? null)
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
      className="absolute z-20"
      style={{
        left: fromRight ? undefined : at.x,
        right: fromRight ? `calc(100% - ${at.x}px)` : undefined,
        top: fromBottom ? undefined : at.y,
        bottom: fromBottom ? `calc(100% - ${at.y}px)` : undefined,
      }}
    >
      <Panel title={title} marker={fr.garrison.kicker} position="static" width={340}>
        {/**
         * **Désactivé, jamais pris** (ADR 0004) : un raid gagné met le point hors service pour un
         * temps, il ne change pas de main. Le tampon est rouge parce que c'est la seule chose du
         * plateau qui cesse de payer sans que le joueur ait rien fait.
         *
         * Il n'y a **pas** de tampon « détruit » : la destruction attend le pillage et rien ne
         * compte les raids vers elle (ADR 0004, `CLAUDE.md`). Un cachet qu'aucun état ne peut
         * allumer serait un état inventé.
         */}
        {outpost !== null && outpost.disabledMinutesLeft !== null && (
          <div className="mb-[9px] flex shrink-0 justify-center">
            <Stamp label={fr.stamps.outpostDisabled} tone="critical" />
          </div>
        )}

        <div className="flex shrink-0 items-baseline gap-2 text-[11.5px] text-[var(--ink-soft)]">
          <span>{projection ? fr.garrison.projection : (region ?? '')}</span>
          <span className="ml-auto font-(family-name:--font-mono)">
            {fr.garrison.troopCount(held.length)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[7px] py-[2px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
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
          />
        </div>

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
        {outpost !== null && (
          <div className="mt-[11px] border-t border-[rgba(42,33,24,.32)] pt-[9px]">
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
                        token,
                        outpostId: outpost.id as Id<'outposts'>,
                        specialization: key,
                      }).catch((problem: unknown) => handleError(problem, setError));
                    }}
                    className={`cursor-pointer border px-[7px] py-[3px] text-[10px] ${
                      outpost.specialization === key
                        ? 'border-[var(--ink)] bg-[rgba(42,33,24,.07)] text-[var(--ink)]'
                        : 'border-[rgba(42,33,24,.32)] text-[var(--ink-soft)]'
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
