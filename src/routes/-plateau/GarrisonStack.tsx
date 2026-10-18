import { useEffect, useMemo, useState } from 'react';
import { CARRY_CAPACITY_BY_ROLE, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr, roleLabel } from '@/i18n/fr';
import { carryCapacityOf } from '@/domain/loot';
import { upkeepStep } from '@/domain/upkeep';
import {
  cargoOf,
  carrierIn,
  stationKeyOf,
  tierLabel,
  unitsOf,
  DOMAIN_BY_ROLE,
  ROLE_ORDER,
  type StackRow,
} from '@/domain/troops';
import { liftOf, motorized, strandedIn } from '@/domain/movement-orders';
import type { PlayerView, TroopStation, TroopView } from '@/domain/player-view';
import { UnitSprite } from '@/emblems/UnitSprite';
import { useNarrowScreen } from '@/shell/viewport';
import { CargoReadout } from './CargoReadout';
import { StrengthBar } from './StrengthBar';

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
  onPickedChange,
  onDisembark,
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
  /** Absent, la pile est déjà en main (fiche latérale, ADR 0026 §6) : on compose sans préparer. */
  onPrepare?: ((station: TroopStation, troopIds: ReadonlyArray<string>) => void) | undefined;
  onPickedChange?: ((troopIds: ReadonlyArray<string>) => void) | undefined;
  /** **Débarquer** (15/10) : la voie clavier de la branche de la rose ; absent, pas de bouton. */
  onDisembark?: ((troopIds: ReadonlyArray<string>) => void) | undefined;
}) {
  const narrow = useNarrowScreen();
  /** The step the army stands on: what the last troop pays, so what shedding one saves. */
  const stepRate = upkeepStep(Math.max(0, view.me.troops.length - 1)).rate;
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(preselect));
  /** La coche reste ici ; la carte n'en reçoit que l'écho, pour mettre en avant ce qui est
   *  coché — jamais un second état qu'elle pourrait modifier. */
  useEffect(() => {
    onPickedChange?.([...picked]);
  }, [picked, onPickedChange]);
  /** **Les passagers sous leur transport** (révision de l'ADR 0025, 15/10) : on est à bord parce
   *  qu'on a embarqué, et un passager suit son transport — il ne se coche pas seul. */
  const rows = useMemo(
    () =>
      unitsOf(held).flatMap((unit) =>
        unit.map((troop) => ({ troop, carrier: carrierIn(troop, held) })),
      ),
    [held],
  );
  /**
   * **Le refus se lit avant la visée, jamais après.** `liftOf` est la fonction que le serveur
   * appelle pour refuser (`NOT_ENOUGH_LIFT`) : une seconde table de ce qui tient à bord serait
   * exactement la divergence que l'ADR 0015 interdit à la rose. Pas de transport coché, pas de
   * compteur — `offered` vaut alors zéro et il n'y a rien à dire.
   */
  const selected = useMemo(() => held.filter((troop) => picked.has(troop.id)), [held, picked]);
  const roles = useMemo(() => selected.map((troop) => troop.role), [selected]);
  const lift = useMemo(() => liftOf(roles), [roles]);
  /** Le refus du serveur, par transport et non par somme (ADR 0025 §2). */
  const stranded = useMemo(() => lift.offered > 0 && strandedIn(roles), [lift, roles]);
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
  const cargoGroups = useMemo(
    () =>
      (view.me.stationedCargo ?? []).filter(
        (group) =>
          stationKeyOf(group.stationedAt) === stationKeyOf(station) &&
          group.troopIds.some((troopId) => held.some((troop) => troop.id === troopId)),
      ),
    [held, station, view.me.stationedCargo],
  );

  /** Cocher un transport coche ce qu'il porte : la pile ne part pas sans ses passagers. */
  const toggle = (troopId: string) => {
    const troop = held.find((one) => one.id === troopId);
    const ids = [troopId, ...(troop === undefined ? [] : cargoOf(troop, held).map((t) => t.id))];
    setPicked((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (previous.has(troopId)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  if (held.length === 0) {
    return <p className="text-[12.5px] text-[var(--ink-soft)]">{fr.garrison.empty}</p>;
  }

  return (
    <>
      {composes && <RoleShortcuts held={held} picked={picked} onPick={setPicked} />}
      {narrow ? (
        <>
          <TroopCards
            nation={view.me.nation}
            blitz={view.mode === 'blitz'}
            upkeepRate={stepRate}
            rows={rows}
            picked={picked}
            composes={composes}
            onToggle={toggle}
          />
        </>
      ) : (
        <div className="flex max-h-[46vh] flex-col gap-[6px] overflow-auto overscroll-contain">
          {rows.map(({ troop, carrier }) => {
            const on = picked.has(troop.id);
            /** Un passager suit son transport : il se lit, il ne se coche pas seul. */
            const ticks = composes && carrier === null;
            return (
              <div
                key={troop.id}
                role={ticks ? 'checkbox' : undefined}
                aria-checked={ticks ? on : undefined}
                tabIndex={ticks ? 0 : -1}
                onClick={() => ticks && toggle(troop.id)}
                onKeyDown={(key) =>
                  ticks && (key.key === 'Enter' || key.key === ' ') && toggle(troop.id)
                }
                style={{ marginLeft: carrier === null ? undefined : 18 }}
                className={`flex items-center gap-[9px] border px-[8px] py-[6px] text-left ${
                  ticks ? 'cursor-pointer' : composes ? '' : 'opacity-70'
                } ${on ? 'border-[var(--ink)] bg-(--ink)/7' : 'border-(color:--ink)/32'}`}
              >
                {ticks && (
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
                    {carrier === null
                      ? fr.troops.strength(troop.strength, troop.nominalStrength)
                      : fr.garrison.aboard(roleLabel(carrier.role, 1))}
                  </span>
                  {carrier === null && (
                    <Upkeep troop={troop} blitz={view.mode === 'blitz'} rate={stepRate} />
                  )}
                </span>
                {carrier !== null && onDisembark !== undefined && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDisembark([troop.id]);
                    }}
                    className="cursor-pointer border border-[var(--ink)] px-[8px] py-[3px] text-[9.5px] tracking-[.14em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                  >
                    {fr.hand.disembark}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cargoGroups.map((group) => (
        <CargoReadout
          key={group.troopIds.join('-')}
          cargo={group.cargo}
          carriers={group.troopIds.length}
        />
      ))}

      {composes && onLand && !narrow && (
        <div className="mt-[9px] font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          {fr.garrison.paces[motorized(roles) ? 'motorized' : 'foot']}
        </div>
      )}

      {composes && !narrow && view.mode !== 'blitz' && (
        <div className="mt-[9px] font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          {fr.garrison.lootCapacity(carryCapacity)}
        </div>
      )}

      {composes && lift.offered > 0 && (
        <div className="mt-[9px] border-t border-(color:--ink)/32 pt-[7px]">
          <span
            className="font-(family-name:--font-mono) text-[11.5px]"
            style={{ color: stranded ? 'var(--critical)' : 'var(--ink-soft)' }}
          >
            {fr.garrison.seats(lift.needed, lift.offered)}
          </span>
          {stranded && (
            <p className="mt-[3px] text-[11px] leading-[1.4] text-[var(--critical)]">
              {fr.errors.NOT_ENOUGH_LIFT(lift)}
            </p>
          )}
        </div>
      )}

      {/**
       * **Sous le seuil, le compte et le bouton restent collés en bas** (refonte mobile, 1e),
       * quelle que soit la taille de la garnison : ce qui est coché, l'allure et ce que la pile
       * peut ramener, puis « préparer un mouvement » sur toute la largeur.
       */}
      {composes && narrow ? (
        <div className="paper-grain sticky bottom-0 -mx-3 mt-[11px] flex flex-col gap-[8px] border-t-2 border-[var(--ink)] px-3 pt-[9px] pb-[2px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] font-bold tracking-[.08em] uppercase">
              {fr.garrison.picked(picked.size)}
            </span>
            <span
              className="font-(family-name:--font-mono) text-[11px]"
              style={{ color: stranded ? 'var(--critical)' : 'var(--ink-soft)' }}
            >
              {/* Les places d'abord : c'est ce qui décide si la pile part (ADR 0025). */}
              {lift.offered > 0 && `${fr.garrison.seatsShort(lift.needed, lift.offered)} · `}
              {onLand && `${fr.garrison.paces[motorized(roles) ? 'motorized' : 'foot']} · `}
              {fr.garrison.lootShort(carryCapacity)}
            </span>
          </div>
          {onPrepare && (
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onPrepare(station, [...picked])}
              className="min-h-[52px] w-full cursor-pointer bg-[var(--ink)] px-[12px] text-[12px] font-bold tracking-[.18em] text-[var(--paper)] uppercase disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fr.garrison.prepare}
            </button>
          )}
        </div>
      ) : composes ? (
        <div className="mt-[11px] flex flex-wrap items-center justify-between gap-3">
          <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {picked.size === 0
              ? fr.garrison.noColumn
              : fr.garrison.column(picked.size, view.mode !== 'blitz')}
          </span>
          {onPrepare && (
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onPrepare(station, [...picked])}
              className="cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-[12px] py-[7px] text-[10px] tracking-[.18em] text-[var(--paper)] uppercase hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fr.garrison.prepare}
            </button>
          )}
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

/**
 * **La vie et le coût sur la même carte.** L'effectif *est* la barre de vie (ADR 0014) ;
 * l'entretien est ce qu'elle coûte à l'heure, au taux plein ou au taux relevé — une coque posée en
 * mer paie le second, et c'est ici qu'on l'apprend, pas sur un écran de comptabilité.
 */
function Upkeep({ troop, blitz, rate }: { troop: TroopView; blitz: boolean; rate: number }) {
  /** **La Blitz ne nourrit personne** : la ligne dit le soin, quand il court, et rien sinon. */
  if (blitz) {
    return troop.mending ? (
      <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
        {fr.blitz.mending(1)}
      </span>
    ) : null;
  }
  return (
    <span
      className="block font-(family-name:--font-mono) text-[10.5px]"
      style={{ color: troop.supplied ? 'var(--ink-soft)' : 'var(--critical)' }}
    >
      {troop.supplied
        ? fr.troops.upkeepRate(rate)
        : fr.troops.upkeepRaised(rate * UPKEEP_UNSUPPLIED_MULTIPLIER, UPKEEP_UNSUPPLIED_MULTIPLIER)}
    </span>
  );
}

/**
 * **Les raccourcis de la composition** (refonte mobile, 1e) : tout, rien, ou un rôle entier d'un
 * toucher. Le raccourci allumé est celui que la coche reproduit exactement — composer à la main
 * l'éteint, il ne ment pas sur ce qui part.
 */
function RoleShortcuts({
  held,
  picked,
  onPick,
}: {
  held: ReadonlyArray<TroopView>;
  picked: ReadonlySet<string>;
  onPick: (picked: ReadonlySet<string>) => void;
}) {
  /** Un raccourci prend ce qui se tient debout, et ce que ses transports portent avec eux. */
  const standing = held.filter((troop) => carrierIn(troop, held) === null);
  const withCargo = (troops: ReadonlyArray<TroopView>) =>
    troops.flatMap((troop) => [troop, ...cargoOf(troop, held)]);
  const same = (troops: ReadonlyArray<TroopView>) =>
    troops.length === picked.size && troops.every((troop) => picked.has(troop.id));
  const shortcuts = [
    { label: fr.garrison.pickAll, troops: held },
    { label: fr.garrison.pickNone, troops: [] },
    ...ROLE_ORDER.flatMap((role) => {
      const ofRole = standing.filter((troop) => troop.role === role);
      return ofRole.length === 0 || ofRole.length === standing.length
        ? []
        : [
            {
              label: fr.garrison.pickRole(roleLabel(role, 1), ofRole.length),
              troops: withCargo(ofRole),
            },
          ];
    }),
  ];
  return (
    <div className="mb-[10px] flex flex-wrap gap-[6px]">
      {shortcuts.map(({ label, troops }) => {
        const on = same(troops);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(new Set(troops.map((troop) => troop.id)))}
            className={`min-h-[30px] cursor-pointer border border-[var(--ink)] px-[11px] text-[10.5px] font-semibold tracking-[.12em] uppercase ${
              on ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * **Une pile se compose en cartes qu'on coche d'un toucher** (refonte mobile, 1e) : deux par
 * ligne, la planche, le rôle et sa marque, l'entretien, l'effectif sur sa barre et la case au
 * coin. Le glisser d'un passager sous un transport reste au bureau — un doigt ne glisse pas une
 * carte, il déplace la feuille.
 */
function TroopCards({
  nation,
  blitz,
  upkeepRate,
  rows,
  picked,
  composes,
  onToggle,
}: {
  nation: string;
  blitz: boolean;
  upkeepRate: number;
  rows: ReadonlyArray<StackRow<TroopView>>;
  picked: ReadonlySet<string>;
  composes: boolean;
  onToggle: (troopId: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-[8px]">
      {rows.map(({ troop, carrier }) => {
        const on = picked.has(troop.id);
        return (
          <button
            key={troop.id}
            type="button"
            role={composes && carrier === null ? 'checkbox' : undefined}
            aria-checked={composes && carrier === null ? on : undefined}
            disabled={!composes || carrier !== null}
            onClick={() => onToggle(troop.id)}
            className={`relative flex min-h-[104px] cursor-pointer gap-[9px] px-[10px] py-[9px] text-left disabled:cursor-default ${
              on
                ? 'border-2 border-[var(--ink)] bg-[color-mix(in_srgb,var(--paper),white_45%)]'
                : 'border border-(color:--ink)/45'
            }`}
          >
            <UnitSprite nation={nation} role={troop.role} height={58} width={40} />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px] pr-[22px]">
              <span className="text-[14.5px] leading-[1.1] font-bold break-words hyphens-auto">
                {`${roleLabel(troop.role, 1)} · ${tierLabel(troop.tier)}`}
              </span>
              {carrier === null ? (
                <Upkeep troop={troop} blitz={blitz} rate={upkeepRate} />
              ) : (
                <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">
                  {fr.garrison.aboard(roleLabel(carrier.role, 1))}
                </span>
              )}
              {/* Dans le flux et non posé au pied : un nom sur deux lignes poussait le texte
                  sous la barre à 375 px. */}
              <span className="mt-auto flex flex-col gap-1 pt-[4px]">
                <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-quiet)]">
                  {fr.troops.strength(troop.strength, troop.nominalStrength)}
                </span>
                <StrengthBar strength={troop.strength} nominal={troop.nominalStrength} />
              </span>
            </span>
            {composes && carrier === null && (
              <span
                aria-hidden
                className={`absolute top-2 right-2 flex h-[24px] w-[24px] items-center justify-center border-[1.5px] border-[var(--ink)] text-[14px] text-[var(--paper)] ${
                  on ? 'bg-[var(--ink)]' : ''
                }`}
              >
                {on ? '✓' : ''}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
