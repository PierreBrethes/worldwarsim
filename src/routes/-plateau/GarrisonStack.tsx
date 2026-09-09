import { useMemo, useState } from 'react';
import {
  CARRY_CAPACITY_BY_ROLE,
  FOOD_UPKEEP_PER_TROOP_PER_HOUR,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
} from '../../../convex/constants';
import { fr, roleLabel } from '@/i18n/fr';
import { carryCapacityOf } from '@/domain/loot';
import { boards, stackRows, DOMAIN_BY_ROLE, LIFT_CAPACITY, LIFT_COST } from '@/domain/troops';
import { liftOf, motorized } from '@/domain/movement-orders';
import type { PlayerView, TroopStation, TroopView } from '@/domain/player-view';
import { UnitSprite } from '@/emblems/UnitSprite';

/**
 * **La pile qu'on compose, et la seule.** Elle avait deux portes — le mât d'un bâtiment et une
 * pile posée sur la carte — et depuis la décision 61a le mât ouvre la modale du site : les deux
 * cadres restent, le flux ne se dédouble pas. Un second état de sélection serait le bug qu'on
 * a passé une révision à éviter (brief « flux de mouvement en carte »).
 *
 * On coche des troupes discrètes ; il n'y a nulle part de compteur +/−, parce qu'il n'y a rien à
 * compter : le plafond est en troupes et une troupe est un rang (ADR 0014).
 */
export function GarrisonStack({
  view,
  station,
  held,
  preselect,
  canPrepare,
  observing,
  onPrepare,
}: {
  view: PlayerView;
  station: TroopStation;
  /** Servi par l'appelant, qui l'a déjà compté pour son propre en-tête. */
  held: ReadonlyArray<TroopView>;
  preselect: ReadonlyArray<string>;
  /** `home` est la seule adresse d'où rien ne part : le jeu ne sait plus où sont ces troupes. */
  canPrepare: boolean;
  /** **Un observateur lit sa garnison sans cases** (décision du 31/08) : il ne compose plus, et
   *  une case cochable lui promettrait l'ordre que `requirePlayable` refuse. */
  observing: boolean;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
}) {
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
  const selected = useMemo(() => held.filter((troop) => picked.has(troop.id)), [held, picked]);
  const roles = useMemo(() => selected.map((troop) => troop.role), [selected]);
  const lift = useMemo(() => liftOf(roles), [roles]);
  const carryCapacity = useMemo(
    () => carryCapacityOf(selected, CARRY_CAPACITY_BY_ROLE),
    [selected],
  );
  /**
   * **L'allure se dit en composant.** Le compteur de places répond de l'embarquement ; celle-ci
   * répond du sol, et c'est la seule chose que le transport terrestre fait (note « le transport
   * terrestre et l'allure »). Sans troupe terrestre, il n'y a pas de sol à parcourir et rien à
   * dire.
   */
  const onLand = useMemo(() => roles.some((role) => DOMAIN_BY_ROLE[role] === 'land'), [roles]);

  const composes = canPrepare && !observing;

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

  if (held.length === 0) {
    return <p className="text-[12.5px] text-[var(--ink-soft)]">{fr.garrison.empty}</p>;
  }

  return (
    <>
      <div className="flex max-h-[46vh] flex-col gap-[6px] overflow-auto">
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
              role={composes ? 'checkbox' : undefined}
              aria-checked={composes ? on : undefined}
              tabIndex={composes ? 0 : -1}
              onClick={() => composes && toggle(troop.id)}
              onKeyDown={(key) =>
                composes && (key.key === 'Enter' || key.key === ' ') && toggle(troop.id)
              }
              draggable={composes && rides}
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
                composes ? 'cursor-pointer' : 'opacity-70'
              } ${on ? 'border-[var(--ink)] bg-[rgba(42,33,24,.07)]' : 'border-[rgba(42,33,24,.32)]'}`}
            >
              {composes && (
                <span
                  className="flex h-[13px] w-[13px] shrink-0 items-center justify-center border border-[var(--ink)] text-[9px] leading-none"
                  style={{
                    background: on ? 'var(--ink)' : undefined,
                    color: on ? 'var(--paper)' : 'transparent',
                  }}
                >
                  ×
                </span>
              )}
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

      {composes && onLand && (
        <div className="mt-[9px] font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          {fr.garrison.paces[motorized(roles) ? 'motorized' : 'foot']}
        </div>
      )}

      {composes && (
        <div className="mt-[9px] font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          {fr.garrison.lootCapacity(carryCapacity)}
        </div>
      )}

      {composes && lift.offered > 0 && (
        <div className="mt-[9px] border-t border-[rgba(42,33,24,.32)] pt-[7px]">
          <span
            className="font-(family-name:--font-mono) text-[11.5px]"
            style={{ color: lift.needed > lift.offered ? 'var(--critical)' : 'var(--ink-soft)' }}
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

      {composes ? (
        <div className="mt-[11px] flex flex-wrap items-center justify-between gap-3">
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
        /** Un observateur n'a pas d'ordre à préparer et le silence est la bonne réponse : la
         *  phrase ne reste que là où une pile *pourrait* partir et ne le peut pas. */
        !canPrepare && (
          <p className="mt-[11px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
            {fr.garrison.unplaceable}
          </p>
        )
      )}
    </>
  );
}
