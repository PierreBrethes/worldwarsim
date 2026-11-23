import { useEffect, useRef, useState } from 'react';
import { essentialStatsOf, pileStatsOf } from '@/domain/stat-sheet';
import { StatLines, statValue } from '@/shell/StatLines';
import { LOAD_CAPACITY_BY_ROLE, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { fr, roleLabel } from '@/i18n/fr';
import { UnitSprite } from '@/emblems/UnitSprite';
import { foundingTerms } from '@/domain/compass-works';
import { tagTourOf } from '@/domain/cargo-tag';
import type { Offer } from '@/domain/offers';
import { outpostNameIn, patrolLineOf } from '@/domain/patrol';
import { unitsOf, type MarchStation } from '@/domain/troops';
import type { PlayerView, TroopView } from '@/domain/player-view';
import type { SheetCycle } from '@/shell/BottomSheet';
import { useBoardInsets, useNarrowScreen } from '@/shell/viewport';
import { GarrisonStack } from './GarrisonStack';
import { GunneryButton } from './GunneryButton';
import { MapCard } from './MapCard';
import type { HandAim } from './hand-aim';
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
  aim = null,
  onChooseVerb,
  onSend,
  onCancelAim,
  onCompose,
  onOffer,
  onTour,
  onOpenGunnery,
  onDrop,
  onApproach,
  cycle,
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
  /** **La visée du doigt** (#586), sous le seuil : ce que la pièce ferait là où l'on a touché. */
  aim?: HandAim | null;
  onChooseVerb?: (index: number) => void;
  onSend?: () => void;
  /** Retire la visée ; la pièce reste en main. */
  onCancelAim?: () => void;
  onCompose: (troopIds: ReadonlyArray<string>) => void;
  /** Exécute une offre dont le refus est nul : le plateau la lit comme la rose la lirait. */
  onOffer: (offer: Offer) => void;
  /** Au bureau, un bouton par transport chargeable ouvre sa feuille de route (#619) ; absent, aucun. */
  onTour?: ((carrierId: string) => void) | undefined;
  onOpenGunnery: () => void;
  onDrop: () => void;
  /** La caméra descend sur la pile en main : au loin, au doigt, elle n'est qu'une épingle. */
  onApproach: () => void;
  /** ‹ › : la pile voisine, au téléphone (#593). Jamais en Blitz, où le toucher défile les unités. */
  cycle?: SheetCycle | undefined;
}) {
  const narrow = useNarrowScreen();
  const insets = useBoardInsets();
  const [tab, setTab] = useState<PileTab>('troops');
  /** Au bureau, les jauges se lisent à la demande : cinq chiffres suffisent à décider d'un ordre. */
  const [gauges, setGauges] = useState(false);
  const inHand = held.filter((troop) => troopIds.includes(troop.id));
  const supplied = inHand.every((troop) => troop.supplied);
  /** Sous le seuil, l'aide vit dans l'en-tête épinglé (`fr.hand.pickedAim`) : ici elle serait
   *  coupée par l'aperçu. */
  const hint = narrow ? null : (
    <p
      className={`mt-[6px] text-[11px] leading-[1.35] text-[var(--notable-paper)] ${
        view.mode === 'blitz' ? '' : 'truncate'
      }`}
    >
      {view.mode === 'blitz' ? fr.hand.hint : fr.hand.hintShort}
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
        onTour={onTour}
      />
    </>
  );
  /** **Épinglé sous l'en-tête, il tient à l'aperçu** : la visée et ses deux boutons, ou ce qu'il
   *  reste à faire pour viser (#586). Un refus connu prend la place d'« Envoyer ». */
  const pinned = narrow ? (
    <AimBar
      count={troopIds.length}
      aim={troopIds.length === 0 ? null : aim}
      onChooseVerb={onChooseVerb}
      onSend={onSend}
      onCancelAim={onCancelAim}
    />
  ) : undefined;
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
        pinned={pinned}
        cycle={cycle}
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
  /** **Débarquer un passager, de sa ligne** : la bulle de la pile le faisait, elle se tait pendant la
   *  main. Une offre qui parle d'un seul se rejoue sur ce passager. */
  const standing = offers.flatMap((offer) =>
    offer.key === 'disembark' && offer.refusal === null ? [offer] : [],
  );
  const standDown = (ids: ReadonlyArray<string>) => {
    const offer = standing.find((one) => ids.every((id) => one.troopIds.includes(id)));
    if (offer !== undefined) onOffer({ ...offer, troopIds: ids });
  };
  const disembarkable = new Set(standing.flatMap((offer) => offer.troopIds));
  const unsupplied = !supplied && (
    <p className="mt-[6px] font-(family-name:--font-mono) text-[10.5px] text-[var(--critical)]">
      {fr.troops.unsupplied(UPKEEP_UNSUPPLIED_MULTIPLIER)}
    </p>
  );
  if (!narrow) {
    const rows = inHand.length > 0 ? pileStatsOf(view, inHand) : [];
    return (
      <MapCard
        kicker={fr.hand.kicker(place)}
        aside={
          <>
            <span className="border border-(color:--ink)/45 px-[5px] text-[9px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
              {fr.hand.pieces(held.length)}
            </span>
            <GunneryButton onOpen={onOpenGunnery} />
          </>
        }
        at={edge()}
        gap={{ x: 0, y: 0 }}
        width={DESK_WIDTH}
        maxHeight={deskHeight(insets.bottom)}
        foot={
          <>
            {orders}
            {hint}
          </>
        }
        onClose={onDrop}
      >
        <div className="mt-[7px]">
          <GarrisonStack
            view={view}
            station={station}
            held={held}
            preselect={troopIds}
            canPrepare
            observing={false}
            onPickedChange={onCompose}
            onDisembark={standDown}
            disembarkable={disembarkable}
            statsBelow
          />
        </div>
        {unsupplied}
        {rows.length > 0 && (
          <dl
            data-testid="hand-essentials"
            className="mt-[8px] grid grid-cols-5 gap-x-[6px] gap-y-[4px] border-t border-(color:--ink)/32 pt-[6px]"
          >
            {essentialStatsOf(rows).map((row) => (
              <div key={row.key} data-essential={row.key} className="min-w-0">
                <dt className="text-[9px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
                  {fr.stats.names[row.key]}
                </dt>
                <dd className="font-(family-name:--font-mono) text-[11.5px] font-semibold break-words">
                  {row.reading.kind === 'scaled' && row.reading.of !== undefined
                    ? fr.stats.of(row.reading.value, row.reading.of)
                    : statValue(row.key, row.reading, true)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {rows.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={gauges}
              onClick={() => setGauges(!gauges)}
              className="mt-[8px] flex w-full cursor-pointer items-center justify-between border border-(color:--ink)/45 px-[10px] py-[5px] text-[10px] tracking-[.16em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.hand.gauges}
              <span aria-hidden>{gauges ? '▴' : '▾'}</span>
            </button>
            {gauges && (
              <div className="mt-[6px]">
                <StatLines rows={rows} />
              </div>
            )}
          </>
        )}
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
      pinned={pinned}
      cycle={cycle}
      onClose={onDrop}
    >
      {hint}
      {orders}
      <button
        type="button"
        onClick={onApproach}
        className="mt-[8px] min-h-[44px] w-full cursor-pointer border border-(color:--ink)/45 px-[12px] text-[10px] tracking-[.18em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        {fr.hand.approach}
      </button>
      <div className="mt-[7px]">
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
      </div>
      {unsupplied}
    </MapCard>
  );
}

/**
 * **La visée et son verdict, épinglés** (#586) : la ligne de l'étiquette, une rangée de verbes
 * quand le point en offre plusieurs, puis « Envoyer » et « Annuler ». Un refus connu remplace
 * « Envoyer » par sa phrase ; à zéro coché, rien ne part et la phrase le dit.
 */
function AimBar({
  count,
  aim,
  onChooseVerb,
  onSend,
  onCancelAim,
}: {
  count: number;
  aim: HandAim | null;
  onChooseVerb: ((index: number) => void) | undefined;
  onSend: (() => void) | undefined;
  onCancelAim: (() => void) | undefined;
}) {
  const quiet = 'text-[11.5px] leading-[1.4] text-[var(--ink-soft)]';
  const wrap = 'border-b border-[var(--ink)] px-4 py-[8px]';
  if (count === 0) return <p className={`${wrap} ${quiet}`}>{fr.hand.pickedNone}</p>;
  if (aim === null) return <p className={`${wrap} ${quiet}`}>{fr.hand.pickedAim(count)}</p>;
  return (
    <div className={wrap}>
      <p className="text-[12px] leading-[1.35] font-bold">{aim.line}</p>
      {aim.verbs.length > 1 && (
        <div role="radiogroup" className="mt-[6px] flex flex-wrap gap-[6px]">
          {aim.verbs.map((verb, index) => (
            <button
              key={`${verb}-${index}`}
              type="button"
              role="radio"
              aria-checked={index === aim.chosen}
              onClick={() => onChooseVerb?.(index)}
              className={`min-h-[44px] flex-1 cursor-pointer border border-[var(--ink)] px-[8px] text-[10px] tracking-[.14em] uppercase ${
                index === aim.chosen ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
              }`}
            >
              {verb}
            </button>
          ))}
        </div>
      )}
      <div className="mt-[8px] flex items-stretch gap-[8px]">
        {aim.refusal === null ? (
          <button
            type="button"
            onClick={onSend}
            className="min-h-[44px] flex-1 cursor-pointer bg-[var(--ink)] px-[12px] text-[12px] font-bold tracking-[.18em] text-[var(--paper)] uppercase"
          >
            {fr.hand.send}
          </button>
        ) : (
          <p className="min-w-0 flex-1 self-center text-[11px] leading-[1.35] text-[var(--critical)]">
            {aim.refusal}
          </p>
        )}
        <button
          type="button"
          onClick={onCancelAim}
          className="min-h-[44px] flex-1 cursor-pointer border border-[var(--ink)] px-[12px] text-[11px] font-bold tracking-[.18em] uppercase"
        >
          {fr.hand.cancelAim}
        </button>
      </div>
    </div>
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
  onTour,
}: {
  view: PlayerView;
  station: MarchStation;
  held: ReadonlyArray<TroopView>;
  troopIds: ReadonlyArray<string>;
  offers: ReadonlyArray<Offer>;
  /** L'onglet de la pile : en changer remet la confirmation à zéro. */
  tab: PileTab;
  onOffer: (offer: Offer) => void;
  onTour: ((carrierId: string) => void) | undefined;
}) {
  const narrow = useNarrowScreen();
  const round = patrolLineOf(view, troopIds);
  const button = `w-full cursor-pointer ${narrow ? 'min-h-[44px]' : ''} border border-[var(--ink)] px-[12px] py-[7px] text-left text-[10px] tracking-[.18em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]`;
  const sub = 'block font-(family-name:--font-mono) text-[10px] tracking-normal normal-case';
  const said = (text: string) => (
    <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--critical)]">{text}</p>
  );
  /** **Une feuille de route par transport chargeable** (#619) : la bulle de la pile se tait pendant la
   *  main, son geste vit ici. Au téléphone, la bulle reste l'unique porte. */
  const carriers =
    narrow || onTour === undefined
      ? []
      : held.filter(
          (troop) => troopIds.includes(troop.id) && LOAD_CAPACITY_BY_ROLE[troop.role] > 0,
        );
  return (
    <div className="mt-[2px]">
      {carriers.map((carrier) => {
        const tour = tagTourOf(carrier);
        return (
          <div key={`tour-${carrier.id}`}>
            <button
              type="button"
              title={fr.tourSheet.openTitle}
              onClick={() => onTour?.(carrier.id)}
              className={`mt-[8px] ${button}`}
            >
              {fr.tourSheet.open}
              <span className={sub}>{roleLabel(carrier.role, 1)}</span>
            </button>
            {tour !== null && (
              <p className="mt-[3px] font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
                {fr.logistics.tourLine(tour)}
              </p>
            )}
          </div>
        );
      })}
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
            /* Au bureau, chaque passager descend de sa ligne et le pied offre un seul « débarquer »
               pour tous (#619) : l'offre qui en porte la liste, posée à la première. */
            const all = narrow
              ? offer
              : {
                  ...offer,
                  troopIds: offers.flatMap((one) =>
                    one.key === 'disembark' && one.refusal === null ? one.troopIds : [],
                  ),
                };
            if (
              !narrow &&
              offer.refusal === null &&
              offers.find((one) => one.key === 'disembark' && one.refusal === null) !== offer
            )
              return null;
            const riders = held.filter((troop) => all.troopIds.includes(troop.id));
            const aboard = riders.map((troop) => roleLabel(troop.role, 1)).join(', ');
            return offer.refusal !== null ? (
              <div key={`disembark-${offer.troopIds.join()}`}>{said(offer.refusal)}</div>
            ) : (
              <button
                key={`disembark-${offer.troopIds.join()}`}
                type="button"
                onClick={() => onOffer(all)}
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

/** La fiche du bureau : 372 px d'écran, quelle que soit l'échelle de l'interface (`.hud`). */
const DESK_WIDTH = 'calc(372px / var(--hud-scale))';

/** **Entre la réglette et le bas de la coque** : la fiche ne couvre ni l'une ni l'autre. `bottom` est
 *  ce que la barre basse prend de la carte (`useBoardInsets`) ; `--board-bottom` vaut 0 au bureau. */
function deskHeight(bottom: number): string {
  const top = edge().y;
  return `calc((100dvh - ${top}px - ${bottom}px - ${EDGE_AIR}px) / var(--hud-scale))`;
}
