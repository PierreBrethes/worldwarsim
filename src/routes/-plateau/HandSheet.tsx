import { useEffect, useRef, useState } from 'react';
import { pileStatsOf } from '@/domain/stat-sheet';
import { StatLines } from '@/shell/StatLines';
import { UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr, roleLabel } from '@/i18n/fr';
import { UnitSprite } from '@/emblems/UnitSprite';
import { foundingTerms } from '@/domain/compass-works';
import type { Offer } from '@/domain/offers';
import { outpostNameIn, patrolLineOf } from '@/domain/patrol';
import { unitsOf, type MarchStation } from '@/domain/troops';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { useNarrowScreen } from '@/shell/viewport';
import { GarrisonStack } from './GarrisonStack';
import { GunneryButton } from './GunneryButton';
import { MapCard } from './MapCard';
import { PileTabs, type PileTab } from './PileTabs';

/**
 * **La fiche de la pièce en main, posée au bord** (ADR 0026 §6) : les cases du panneau de
 * garnison, et cocher ou décocher ajuste ce qu'on tient sans lâcher la pièce. Elle est au bord et
 * non au pointeur parce que le pointeur cherche où poser — elle ne doit jamais être sous lui.
 *
 * **Ses ordres sortent d'`offersOf`** (#585, ADR 0015) : le plateau lit les offres de la pile et la
 * fiche les rend, chacune avec son refus dit à la place de son bouton ; `onOffer` les exécute
 * toutes. Au téléphone elle s'ouvre à l'aperçu — l'essentiel sous le pouce —, et ses onglets
 * (`PileTabs`) se lisent en la déroulant.
 */
export function HandSheet({
  view,
  station,
  place,
  held,
  troopIds,
  offers,
  onCompose,
  onOffer,
  onOpenGunnery,
  onDrop,
  onApproach,
}: {
  view: PlayerView;
  station: MarchStation;
  /** Où se tient la pile, en toutes lettres. */
  place: string;
  /** Toute la pile à cette adresse : ce qu'on peut cocher. */
  held: ReadonlyArray<TroopView>;
  /** Ce qu'on tient. */
  troopIds: ReadonlyArray<string>;
  /** Les ordres que la pile en main a (`offersOf`) : fonder, débarquer, la ronde, dissoudre. */
  offers: ReadonlyArray<Offer>;
  onCompose: (troopIds: ReadonlyArray<string>) => void;
  /** Exécute une offre dont le refus est nul : le plateau la lit comme la rose la lirait. */
  onOffer: (offer: Offer) => void;
  onOpenGunnery: () => void;
  onDrop: () => void;
  /** La caméra descend sur la pile en main : au loin, au doigt, elle n'est qu'une épingle. */
  onApproach: () => void;
}) {
  const narrow = useNarrowScreen();
  const [tab, setTab] = useState<PileTab>('troops');
  const inHand = held.filter((troop) => troopIds.includes(troop.id));
  const supplied = inHand.every((troop) => troop.supplied);
  const hint = (
    <p className="mt-[6px] text-[11px] leading-[1.35] text-[var(--notable-paper)]">
      {narrow ? fr.hand.hintFinger : fr.hand.hint}
    </p>
  );
  /** **Restée d'une Guerre éclair** (#451) : au doigt, pas d'affiche au survol ; la fiche le dit. */
  const stood = view.journal?.find((dispatch) =>
    dispatch.stood?.troopIds.some((id) => troopIds.includes(id)),
  )?.stood;
  const orders = (
    <>
      {stood !== undefined && (
        <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--critical)]">
          {stood.text}
          <span className="block text-[var(--ink-quiet)]">{stood.reread}</span>
        </p>
      )}
      <HandOffers
        view={view}
        station={station}
        held={held}
        troopIds={troopIds}
        offers={offers}
        tab={tab}
        onOffer={onOffer}
      />
    </>
  );
  const [unit, ...aboard] = unitsOf(inHand)[0] ?? [];
  /** A Blitz hand holds one unit: a strip says it, the pile's grid and its range say nothing more.
   *  What rides a transport is listed under it, and « débarquer » sets it ashore beside it — a
   *  capture is made on foot. */
  if (view.mode === 'blitz' && unit !== undefined) {
    return (
      <MapCard
        kicker={fr.hand.kicker(place)}
        at={edge()}
        gap={{ x: 0, y: 0 }}
        width={240}
        hug={false}
        onClose={onDrop}
      >
        <div className="mt-[6px] flex items-center gap-[8px]">
          <UnitSprite nation={view.me.nation} role={unit.role} height={28} width={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">{roleLabel(unit.role, 1)}</span>
            <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
              {fr.troops.strength(unit.strength, unit.nominalStrength)}
            </span>
          </span>
        </div>
        {aboard.length > 0 && (
          <ul className="mt-[6px] border-t border-[var(--ink)] pt-[4px]">
            {aboard.map((passenger) => {
              const offer = offers.find(
                (one) => one.key === 'disembark' && one.troopIds.includes(passenger.id),
              );
              return (
                <li key={passenger.id} className="flex items-center gap-[8px] py-[2px]">
                  <span className="min-w-0 flex-1 truncate text-[11.5px]">
                    {fr.hand.aboard} · {roleLabel(passenger.role, 1)}
                  </span>
                  {offer?.refusal != null && (
                    <span className="text-[10.5px] text-[var(--critical)]">{offer.refusal}</span>
                  )}
                  {offer !== undefined && offer.refusal === null && (
                    <button
                      type="button"
                      onClick={() => onOffer(offer)}
                      className={`cursor-pointer border border-[var(--ink)] px-[8px] ${narrow ? 'min-h-[44px]' : 'py-[3px]'} text-[9.5px] tracking-[.14em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]`}
                    >
                      {fr.hand.disembark}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!supplied && (
          <p className="mt-[4px] font-(family-name:--font-mono) text-[10.5px] text-[var(--critical)]">
            {fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
          </p>
        )}
        {hint}
      </MapCard>
    );
  }
  return (
    <MapCard
      kicker={fr.hand.kicker(place)}
      aside={<GunneryButton onOpen={onOpenGunnery} />}
      at={edge()}
      gap={{ x: 0, y: 0 }}
      width={300}
      /* Au doigt, la feuille s'ouvre à l'aperçu : l'essentiel — poser, fonder, débarquer — y tient,
         et la carte où l'on pose reste en vue ; les onglets se lisent en la déroulant. */
      hug={false}
      onClose={onDrop}
    >
      {narrow && (
        <>
          {hint}
          {orders}
          <button
            type="button"
            onClick={onApproach}
            className="mt-[8px] min-h-[44px] w-full cursor-pointer border border-(color:--ink)/45 px-[12px] text-[10px] tracking-[.18em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.hand.approach}
          </button>
        </>
      )}
      <div className="mt-[7px]">
        {narrow ? (
          <PileTabs
            view={view}
            station={station}
            held={held}
            preselect={troopIds}
            canPrepare
            observing={false}
            onPickedChange={onCompose}
            onTabChange={setTab}
          />
        ) : (
          <GarrisonStack
            view={view}
            station={station}
            held={held}
            preselect={troopIds}
            canPrepare
            observing={false}
            onPickedChange={onCompose}
            statsBelow
          />
        )}
      </div>
      {!supplied && (
        <p className="mt-[6px] font-(family-name:--font-mono) text-[10.5px] text-[var(--critical)]">
          {fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
        </p>
      )}
      {!narrow && (
        <>
          {inHand.length > 0 && (
            <div className="mt-[8px]">
              <StatLines rows={pileStatsOf(view, inHand)} />
            </div>
          )}
          {orders}
          {hint}
        </>
      )}
    </MapCard>
  );
}

/**
 * **Les offres de la pile en main, une ligne chacune** : l'ordre part au toucher, ou son refus se
 * lit à sa place. « Dissoudre » demande un second toucher dans la ligne, qui dit ce qu'on perd :
 * rien de modal.
 */
function HandOffers({
  view,
  station,
  held,
  troopIds,
  offers,
  tab,
  onOffer,
}: {
  view: PlayerView;
  station: MarchStation;
  held: ReadonlyArray<TroopView>;
  troopIds: ReadonlyArray<string>;
  offers: ReadonlyArray<Offer>;
  /** L'onglet de la pile : en changer remet la confirmation à zéro. */
  tab: PileTab;
  onOffer: (offer: Offer) => void;
}) {
  const narrow = useNarrowScreen();
  const round = patrolLineOf(view, troopIds);
  const button = `w-full cursor-pointer ${narrow ? 'min-h-[44px]' : ''} border border-[var(--ink)] px-[12px] py-[7px] text-left text-[10px] tracking-[.18em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]`;
  const sub = 'block font-(family-name:--font-mono) text-[10px] tracking-normal normal-case';
  const said = (text: string) => (
    <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--critical)]">{text}</p>
  );
  return (
    <div className="mt-[2px]">
      {round?.kind === 'patrolling' && (
        <p className="mt-[8px] font-(family-name:--font-mono) text-[10.5px]">
          {fr.patrol.title} · {fr.patrol.state(round)}
        </p>
      )}
      {offers.map((offer) => {
        switch (offer.key) {
          case 'found': {
            if (offer.refusal !== null) return <div key="found">{said(offer.refusal)}</div>;
            const { bill, duration } = foundingTerms(view);
            return (
              <button
                key="found"
                type="button"
                onClick={() => onOffer(offer)}
                className={`mt-[8px] ${button}`}
              >
                {narrow ? fr.hand.foundShort : fr.hand.found}
                <span className={sub}>
                  {bill.map((line) => line.text).join(' · ')} · {duration}
                </span>
              </button>
            );
          }
          case 'disembark': {
            const riders = held.filter((troop) => offer.troopIds.includes(troop.id));
            const aboard = riders.map((troop) => roleLabel(troop.role, 1)).join(', ');
            return offer.refusal !== null ? (
              <div key={`disembark-${offer.troopIds.join()}`}>{said(offer.refusal)}</div>
            ) : (
              <button
                key={`disembark-${offer.troopIds.join()}`}
                type="button"
                onClick={() => onOffer(offer)}
                className={`mt-[8px] ${button}`}
              >
                {fr.hand.disembark}
                <span className={sub}>
                  {fr.hand.aboard} · {aboard}
                </span>
              </button>
            );
          }
          case 'patrol': {
            const [from, to] = offer.liaison;
            const other = outpostNameIn(
              view.me,
              station.kind === 'outpost' && station.outpostId === from ? to : from,
            );
            return offer.refusal !== null ? (
              <p
                key={`patrol-${offer.liaison.join()}`}
                className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--critical)]"
              >
                {fr.patrol.toward(other)} · {offer.refusal}
              </p>
            ) : (
              <button
                key={`patrol-${offer.liaison.join()}`}
                type="button"
                onClick={() => onOffer(offer)}
                className={`mt-[8px] ${button}`}
              >
                {fr.patrol.launchRound}
                <span className={sub}>{fr.patrol.toward(other)}</span>
              </button>
            );
          }
          case 'recall':
            return (
              <button
                key="recall"
                type="button"
                onClick={() => onOffer(offer)}
                className={`mt-[8px] ${button}`}
              >
                {fr.patrol.recall}
              </button>
            );
          case 'disband':
            /* Au bureau, U dissout la sélection : la fiche n'ajoute pas de bouton (#585). */
            if (!narrow) return null;
            return offer.refusal !== null ? (
              <div key="disband">{said(offer.refusal)}</div>
            ) : (
              <DisbandButton
                /* Une confirmation armée ne survit pas à ce qu'elle confirmait : autre main, autre
                   onglet, autre offre, et le premier toucher est à refaire. */
                key={`${troopIds.join()}|${tab}|${offer.point.join()}|${offer.loses}`}
                offer={offer}
                className={`mt-[8px] ${button}`}
                onOffer={onOffer}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

/** Un second toucher plus rapide que ça est le premier qui rebondit : il ne confirme rien. */
const CONFIRM_DELAY_MS = 300; // @a-mesurer

/** **« Dissoudre » en deux touchers** : le second, qui dit ce que l'escouade perd sur le bouton
 *  même, part l'ordre. L'état vit ici pour que `key` le remette à zéro. */
function DisbandButton({
  offer,
  className,
  onOffer,
}: {
  offer: Offer;
  className: string;
  onOffer: (offer: Offer) => void;
}) {
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const confirming = armedAt !== null;
  /** À l'aperçu, la confirmation tombe sous le pied de la feuille : on la ramène. */
  useEffect(() => {
    if (confirming) button.current?.scrollIntoView?.({ block: 'nearest' });
  }, [confirming]);
  return (
    <button
      ref={button}
      type="button"
      onClick={() => {
        if (armedAt === null) setArmedAt(Date.now());
        else if (Date.now() - armedAt >= CONFIRM_DELAY_MS) onOffer(offer);
      }}
      className={`${className} ${confirming ? 'border-[var(--critical)] text-[var(--critical)]' : ''}`}
    >
      {confirming ? fr.hand.confirm(offer.loses) : fr.selection.disband}
    </button>
  );
}

/** Le coin haut-gauche du plateau, sous la réglette et à droite de la colonne (`Shell` publie
 *  leurs bords) : loin du pointeur qui cherche où poser, et sans rien couvrir de la table. */
function edge(): { x: number; y: number } {
  const root = getComputedStyle(document.documentElement);
  const inset = (name: string) => parseFloat(root.getPropertyValue(name)) || 0;
  return { x: inset('--board-left') + EDGE_AIR, y: inset('--board-top') + EDGE_AIR };
}

const EDGE_AIR = 12;
