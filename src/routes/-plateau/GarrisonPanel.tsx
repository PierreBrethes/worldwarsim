import { useMutation } from 'convex/react';
import { useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  FOOD_UPKEEP_PER_TROOP_PER_HOUR,
  outpostReachKm,
  RELAY_SPEED_MULTIPLIER,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
} from '../../../convex/constants';
import { fr, roleLabel } from '@/i18n/fr';
import {
  boards,
  marchingTroopIds,
  stackRows,
  stationKeyOf,
  troopsAt,
  DOMAIN_BY_ROLE,
  LIFT_CAPACITY,
  LIFT_COST,
  PROJECTION_BY_DOMAIN,
} from '@/domain/troops';
import { liftOf, motorized } from '@/domain/movement-orders';
import type { BuildingKey } from '@/domain/ids';
import type { PlayerView, TroopStation } from '@/domain/player-view';
import { handleError } from '@/data/errors';
import { UnitSprite } from '@/emblems/UnitSprite';
import { Stamp } from '@/shell/Stamp';
import { Draggable } from './Draggable';
import { Panel } from './Panel';

const PROJECTION_KEYS: ReadonlySet<BuildingKey> = new Set(Object.values(PROJECTION_BY_DOMAIN));

/**
 * **The garrison, and the column one composes out of it.** It opens on the mast of a projection
 * building or on a *stationnaire* card of the widget — two doors, **one** selection state and
 * one flow, never two (brief « flux de mouvement en carte »).
 *
 * One checks discrete troops; there is no +/− stepper anywhere, because there is nothing to
 * count: the ceiling is 24 and a troop is a row (ADR 0014).
 *
 * Only a **projection building** launches a column (ADR 0013): a garrison holding an outpost is
 * shown, and said to be where it stands. Saying it here beats a refusal landing after the click.
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
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(preselect));
  /**
   * **Ce que le geste a dit, et rien de plus.** Purement client, jamais envoyé, jamais stocké :
   * il déplace une troupe d'un transport à l'autre dans l'image, il ne change pas la pile — la
   * coche produit exactement le même état (note « à bord », arbitrage du 19/08).
   */
  const [placements, setPlacements] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [dragged, setDragged] = useState<string | null>(null);
  /** Le survol d'un transport pendant le geste : `taken` faux, c'est le refus qui se voit. */
  const [over, setOver] = useState<{ carrier: string; taken: boolean } | null>(null);
  const rows = useMemo(() => stackRows(held, picked, placements), [held, picked, placements]);
  /**
   * **Le refus se lit avant la visée, jamais après.** `liftOf` est la fonction que le serveur
   * appelle pour refuser (`NOT_ENOUGH_LIFT`) : une seconde table de ce qui tient à bord serait
   * exactement la divergence que l'ADR 0015 interdit à la rose. Pas de transport coché, pas de
   * compteur — `offered` vaut alors zéro et il n'y a rien à dire.
   */
  const roles = useMemo(
    () => held.filter((troop) => picked.has(troop.id)).map((troop) => troop.role),
    [held, picked],
  );
  const lift = useMemo(() => liftOf(roles), [roles]);
  /**
   * **L'allure se dit en composant.** Le compteur de places répond de l'embarquement ; celle-ci
   * répond du sol, et c'est la seule chose que le transport terrestre fait (note « le transport
   * terrestre et l'allure »). Sans troupe terrestre, il n'y a pas de sol à parcourir et rien à
   * dire.
   */
  const onLand = useMemo(() => roles.some((role) => DOMAIN_BY_ROLE[role] === 'land'), [roles]);
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
   *  une colonne de coques exactement comme la caserne arme une colonne de bottes. La ligne
   *  qui ne connaissait que `barracks` grisait la flotte au quai — le refus après le clic que
   *  l'ADR 0015 interdit, à l'envers. */
  const projection = building !== null && PROJECTION_KEYS.has(building.key);
  /**
   * **Une adresse compose, sauf celle qui n'en est pas une.** Le sol ne décide plus de ce qu'une
   * pile peut demander (ADR 0019 §1) et le mouvement terrestre ne demande plus de bâtiment du
   * tout (§2) : la porte du domaine se lit à la visée, par `closedGate`, et le motif du refus
   * s'affiche dans la rose. Exiger un bâtiment de projection ici grisait l'infanterie du QG —
   * une colonne que le serveur accepte et que l'écran refusait, la divergence même que l'ADR
   * 0015 interdit. `home` reste dehors : c'est une troupe que le jeu ne sait plus placer, donc
   * qu'il ne sait pas router.
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

  const toggle = (troopId: string) => {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(troopId)) next.delete(troopId);
      else next.add(troopId);
      return next;
    });
    // Un rang qu'on décoche oublie où le geste l'avait posé : le recocher repart de l'affectation
    // gloutonne, comme s'il n'avait jamais été glissé.
    setPlacements((previous) => {
      const next = new Map(previous);
      next.delete(troopId);
      return next;
    });
  };

  /** L'autre porte du même état : le geste coche la troupe et dit sous quel transport la lire. */
  const drop = (passengerId: string, carrierId: string) => {
    setPicked((previous) => new Set([...previous, passengerId]));
    setPlacements((previous) => new Map([...previous, [passengerId, carrierId]]));
  };

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

        {held.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-[var(--ink-soft)]">{fr.garrison.empty}</p>
        ) : (
          <div className="mt-[10px] flex max-h-[46vh] flex-col gap-[6px] overflow-auto">
            {rows.map(({ troop, carrier }) => {
              const on = picked.has(troop.id);
              const rides = (LIFT_COST[troop.role] ?? 0) > 0;
              const lifts = (LIFT_CAPACITY[troop.role] ?? 0) > 0;
              const aimed = over?.carrier === troop.id;
              return (
                /* Un rang, pas un `<button>` : Chromium ne démarre pas de glisser natif depuis
                   un bouton, et le geste est l'autre porte de la même coche. Le rôle et le
                   `tabIndex` gardent ce qu'un bouton donnait — la même paire que la carte des
                   mouvements du widget. */
                <div
                  key={troop.id}
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={!canPrepare}
                  tabIndex={canPrepare ? 0 : -1}
                  onClick={() => canPrepare && toggle(troop.id)}
                  onKeyDown={(key) =>
                    canPrepare && (key.key === 'Enter' || key.key === ' ') && toggle(troop.id)
                  }
                  draggable={canPrepare && rides}
                  onDragStart={() => setDragged(troop.id)}
                  onDragEnd={() => {
                    setDragged(null);
                    setOver(null);
                  }}
                  /* Le refus se voit **et** se sent : sans `preventDefault`, le curseur du
                     navigateur porte déjà l'interdit et le lâcher ne part jamais. */
                  onDragOver={(gesture) => {
                    if (!lifts || dragged === null || dragged === troop.id) return;
                    const taken = boards(held, picked, placements, dragged, troop.id);
                    if (taken) gesture.preventDefault();
                    setOver({ carrier: troop.id, taken });
                  }}
                  onDragLeave={() =>
                    setOver((previous) => (previous?.carrier === troop.id ? null : previous))
                  }
                  onDrop={(gesture) => {
                    gesture.preventDefault();
                    if (dragged !== null) drop(dragged, troop.id);
                    setOver(null);
                  }}
                  style={{
                    marginLeft: carrier === null ? undefined : 18,
                    borderColor: aimed
                      ? over?.taken
                        ? 'var(--notable)'
                        : 'var(--critical)'
                      : undefined,
                  }}
                  className={`flex items-center gap-[9px] border px-[8px] py-[6px] text-left ${
                    canPrepare ? 'cursor-pointer' : 'opacity-70'
                  } ${
                    on
                      ? 'border-[var(--ink)] bg-[rgba(42,33,24,.07)]'
                      : 'border-[rgba(42,33,24,.32)]'
                  }`}
                >
                  <span
                    className="flex h-[13px] w-[13px] shrink-0 items-center justify-center border border-[var(--ink)] text-[9px] leading-none"
                    style={{
                      background: on ? 'var(--ink)' : undefined,
                      color: on ? 'var(--paper)' : 'transparent',
                    }}
                  >
                    ×
                  </span>
                  <UnitSprite nation={view.me.nation} role={troop.role} height={28} width={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-[var(--ink)]">
                      {roleLabel(troop.role, 1)}
                    </span>
                    <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
                      {fr.troops.strength(troop.strength, troop.nominalStrength)}
                    </span>
                    {/**
                     * **La vie et le coût sur la même carte.** L'effectif *est* la barre de vie
                     * (ADR 0014) ; l'entretien est ce qu'elle coûte à l'heure, au taux plein ou
                     * au taux relevé — une coque posée en mer paie le second, et c'est ici
                     * qu'on l'apprend, pas sur un écran de comptabilité.
                     */}
                    <span
                      className="block font-(family-name:--font-mono) text-[10.5px]"
                      style={{ color: troop.supplied ? 'var(--ink-soft)' : 'var(--critical)' }}
                    >
                      {troop.supplied
                        ? fr.troops.upkeepRate(FOOD_UPKEEP_PER_TROOP_PER_HOUR)
                        : fr.troops.upkeepRaised(
                            FOOD_UPKEEP_PER_TROOP_PER_HOUR * UPKEEP_UNSUPPLIED_MULTIPLIER,
                            UPKEEP_UNSUPPLIED_MULTIPLIER,
                          )}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
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
        {outpost !== null && (
          <div className="mt-[11px] border-t border-[rgba(42,33,24,.32)] pt-[9px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
                {fr.garrison.foundSpecialization}
              </span>
              {outpost.specializationLocked ? (
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

        {onLand && (
          <div className="mt-[9px] font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
            {fr.garrison.paces[motorized(roles) ? 'motorized' : 'foot']}
          </div>
        )}

        {lift.offered > 0 && (
          <div className="mt-[9px] border-t border-[rgba(42,33,24,.32)] pt-[7px]">
            <span
              className="font-(family-name:--font-mono) text-[11.5px]"
              style={{
                color: lift.needed > lift.offered ? 'var(--critical)' : 'var(--ink-soft)',
              }}
            >
              {fr.garrison.seats(lift.needed, lift.offered)}
            </span>
            {lift.needed > lift.offered && (
              <p className="mt-[3px] text-[11px] leading-[1.4] text-[var(--critical)]">
                {fr.errors.NOT_ENOUGH_LIFT(lift)}
              </p>
            )}
          </div>
        )}

        {canPrepare ? (
          <div className="mt-[11px] flex items-center justify-between gap-3">
            <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
              {picked.size === 0 ? fr.garrison.noColumn : fr.garrison.column(picked.size)}
            </span>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onPrepare(station, [...picked])}
              className="cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-[12px] py-[7px] text-[10px] tracking-[.18em] text-[var(--paper)] uppercase hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {fr.garrison.prepare}
            </button>
          </div>
        ) : (
          held.length > 0 && (
            <p className="mt-[11px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.garrison.unplaceable}
            </p>
          )
        )}
      </Panel>
    </Draggable>
  );
}
