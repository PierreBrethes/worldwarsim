import { detectionRangeOf, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr, roleLabel, stackLabel } from '@/i18n/fr';
import { representativeRole, tierLabel } from '@/domain/troops';
import type { CargoView, Stack, TroopView } from '@/domain/player-view';
import { UnitSprite } from '@/emblems/UnitSprite';
import type { Destination } from '@/map/WorldMap';
import { Stamp } from '@/shell/Stamp';
import { useNarrowScreen } from '@/shell/viewport';
import { AimTargets } from './AimingSheet';
import { MapCard } from './MapCard';
import { GunneryButton } from './GunneryButton';
import { CargoReadout } from './CargoReadout';
import { StrengthBar } from './StrengthBar';

/**
 * **La popin lit, la carte agit** (décision Pierre, 30/08). Ce cartouche dit ce que la vue du
 * joueur sait déjà — le rôle, l'effectif, l'état — et **ne porte aucun ordre** : ceux-ci passent
 * par la rose des vents, qui s'ouvre sur le sprite en même temps que lui et ne propose que ce que
 * le serveur accepterait. Le renvoi vers l'abaque de tir n'y déroge pas : il ouvre une lecture,
 * il ne commande rien.
 *
 * **Il porte l'état de la visée**, et c'est ce qui a fait disparaître la fenêtre « visée armée »
 * du coin haut-gauche : le seul fait qu'elle disait — combien de troupes partent ensemble — se lit
 * ici, à côté de la pile qu'il décrit, plutôt qu'à l'autre bout de l'écran. Son pied est donc le
 * mode : au repos il renvoie aux ordres, en visée il nomme la destination qui manque et la touche
 * qui défait — jamais une action à cliquer.
 *
 * Ce qui l'accompagne se lit sur la carte plutôt qu'ici : la planche prend l'encre du joueur, et
 * le cercle de détection s'ouvre autour d'elle. La fenêtre de garnison reste pour *composer* une
 * pile — sur un point qui en porte plusieurs, ou depuis le widget.
 */
export function TroopBadge({
  nation,
  troops,
  where,
  at,
  aiming,
  cargo,
  destinations,
  onPick,
  onOpenGunnery,
  onClose,
}: {
  nation: string;
  /** Où elle se tient, en toutes lettres : le surtitre de la feuille du téléphone. */
  where: string;
  /** La force désignée, une troupe ou la pile entière qu'une garnison a armée. Jamais vide. */
  troops: ReadonlyArray<TroopView>;
  at: { x: number; y: number };
  /** Une colonne est armée. Désigner une troupe l'arme, donc c'est vrai partout sauf pour un
   *  observateur, à qui il ne reste aucun ailleurs à nommer — et le pied se tait plutôt que de
   *  lui promettre un geste. */
  aiming: boolean;
  /** Server-grouped loads touching this selection; never divided between individual troops. */
  cargo: ReadonlyArray<{
    readonly id: string;
    readonly cargo: CargoView;
    readonly carriers: number;
  }>;
  /** Les destinations de la colonne, de la plus proche à la plus lointaine : sous le seuil, la
   *  feuille en offre le raccourci (refonte mobile, 1b). */
  destinations: ReadonlyArray<Destination>;
  onPick: (destination: Destination) => void;
  /** **La seule chose qu'on peut cliquer ici, et elle n'agit pas** : l'abaque de tir ouvre une
   *  lecture, il ne prend aucun ordre. La règle « la popin lit, la carte agit » tient. */
  onOpenGunnery: () => void;
  onClose: () => void;
}) {
  const narrow = useNarrowScreen();
  const lead = leadOf(troops);
  if (lead === undefined) return null;

  const strength = troops.reduce((sum, troop) => sum + troop.strength, 0);
  const nominal = troops.reduce((sum, troop) => sum + troop.nominalStrength, 0);
  // Une seule troupe hors ravitaillement suffit à le dire : la ligne nomme le surcoût, et le
  // surcoût est payé dès qu'il y en a une.
  const supplied = troops.every((troop) => troop.supplied);
  const name =
    troops.length > 1
      ? stackLabel(stackOf(troops))
      : `${roleLabel(lead.role, 1)} · ${tierLabel(lead.tier)}`;
  const scouting = fr.troops.badgeScouting(detectionRangeOf(troops.map((troop) => troop.role)));

  /**
   * **Sous le seuil, une fiche de 230 px et la visée sous le pouce** (refonte mobile, 1b) : le
   * nom en vedette, l'effectif sur sa barre, l'état en cachet, puis les cibles les plus proches.
   * L'en-tête ne tient qu'une ligne — il prenait un tiers de la feuille.
   */
  if (narrow) {
    return (
      <MapCard
        kicker={fr.troops.badgeKickerAt(where)}
        aside={
          <button
            type="button"
            onClick={onOpenGunnery}
            className="shrink-0 cursor-pointer border border-(color:--ink)/45 px-[10px] text-[10px] font-semibold tracking-[.14em] uppercase"
          >
            {fr.rail.gunnery.label}
          </button>
        }
        at={at}
        gap={{ x: ANCHOR_GAP, y: 14 }}
        width={228}
        onClose={onClose}
      >
        <div className="flex items-center gap-3">
          <UnitSprite nation={nation} role={lead.role} height={50} width={34} />
          <div className="min-w-0 flex-1">
            <div className="font-(family-name:--font-display) text-[23px] leading-[1.05] font-extrabold">
              {name}
            </div>
            <div className="mt-[6px] flex items-center gap-[10px]">
              <span className="font-(family-name:--font-mono) text-[12px] whitespace-nowrap text-[var(--ink-quiet)]">
                {fr.troops.strength(strength, nominal)}
              </span>
              <span className="max-w-[110px] min-w-0 flex-1">
                <StrengthBar strength={strength} nominal={nominal} height={5} />
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-[6px] pt-2">
          {!supplied && (
            <Stamp
              label={fr.troops.unsuppliedStamp(UPKEEP_UNSUPPLIED_MULTIPLIER)}
              tone="critical"
              size="small"
            />
          )}
          {troops.length > 1 && (
            <span className="text-[11px] font-semibold tracking-[.1em] text-[var(--ink-soft)] uppercase">
              {fr.troops.badgePile(troops.length)}
            </span>
          )}
          <span className="text-[11px] font-semibold tracking-[.1em] text-[var(--ink-soft)] uppercase">
            {scouting}
          </span>
        </div>
        {cargo.map((group) => (
          <CargoReadout key={group.id} cargo={group.cargo} carriers={group.carriers} />
        ))}
        {aiming && <AimTargets destinations={destinations} onPick={onPick} />}
      </MapCard>
    );
  }

  return (
    <MapCard
      kicker={fr.troops.badgeKicker}
      aside={<GunneryButton onOpen={onOpenGunnery} />}
      at={at}
      gap={{ x: ANCHOR_GAP, y: 14 }}
      width={228}
      onClose={onClose}
    >
      <div className="mt-[7px] flex items-center gap-[9px]">
        <UnitSprite nation={nation} role={lead.role} height={28} width={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-[var(--ink)]">{name}</span>
          <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
            {fr.troops.strength(strength, nominal)}
          </span>
        </span>
      </div>

      {/* Ce que la fenêtre « visée armée » disait d'unique, rendu à la pile qu'il décrit. */}
      {troops.length > 1 && (
        <p className="mt-[6px] text-[10.5px] tracking-[.06em] text-[var(--ink-soft)] uppercase">
          {fr.troops.badgePile(troops.length)}
        </p>
      )}

      <p
        className="mt-[6px] font-(family-name:--font-mono) text-[10.5px]"
        style={{ color: supplied ? 'var(--ink-soft)' : 'var(--critical)' }}
      >
        {supplied ? fr.troops.supplied : fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
      </p>

      {/* Ce que le cercle tracé sur la carte veut dire, une fois, à côté de lui (ADR 0019 §5). */}
      <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">{scouting}</p>

      {cargo.map((group) => (
        <CargoReadout key={group.id} cargo={group.cargo} carriers={group.carriers} />
      ))}

      {/* **Désigner arme**, donc le cartouche est en visée dès qu'il paraît : il nomme le geste
            qui reste et la sortie, et il ne porte aucun bouton d'ordre — la carte agit, la popin
            lit. Un observateur n'a plus d'ailleurs à viser : le pied se tait pour lui. */}
      {aiming && (
        <>
          <p className="mt-[6px] text-[11px] leading-[1.35] text-[var(--notable-paper)]">
            {fr.troops.badgeAiming}
          </p>
          <p className="mt-[3px] text-[10px] leading-[1.35] text-[var(--ink-quiet)]">
            {fr.troops.badgeDisarm}
          </p>
        </>
      )}
    </MapCard>
  );
}

/** **La place que la rose occupe sur le sprite**, quand il y a quelque chose à faire sur place :
 *  les deux sont ancrés au même point, et sous les quatorze pixels d'avant la popin passait sous
 *  les médaillons qu'elle venait de faire apparaître. */
const ANCHOR_GAP = 64;

/** Le visage de la pile est celui de son rôle majoritaire — la règle du pion d'un mouvement et
 *  de la planche posée sur la carte, pour qu'une colonne ne change pas de visage en s'ouvrant. */
function leadOf(troops: ReadonlyArray<TroopView>): TroopView | undefined {
  const face = representativeRole(stackOf(troops));
  return troops.find((troop) => troop.role === face) ?? troops[0];
}

const stackOf = (troops: ReadonlyArray<TroopView>): Stack =>
  troops.reduce<Stack>(
    (counted, troop) => ({ ...counted, [troop.role]: (counted[troop.role] ?? 0) + 1 }),
    {},
  );
