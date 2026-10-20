import { SupplyPictos } from '@/shell/SupplyPictos';
import { fullSupplies, pileSupplies } from '@/domain/supplies';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { aBuilding, aSecondBuilding, fr, researchRequired, roleLabel } from '@/i18n/fr';
import { pieceAt } from '@/domain/research';
import { useClock } from '@/shell/clock';
import { Stamp } from '@/shell/Stamp';
import { Price } from '@/shell/Price';
import { handleError } from '@/data/errors';
import type { ResourceKey } from '@/emblems/ResourceIcon';
import { BuildingPlate } from '@/emblems/Plate';
import { UnitSprite } from '@/emblems/UnitSprite';
import { equipmentLabel } from '@/emblems/units/equipment';
import type { UnitTier } from '@/domain/troops';
import {
  DOMAIN_BY_ROLE,
  hasSiteSheet,
  marchingTroopIds,
  stationKeyOf,
  TIERS_BY_ROLE,
  tierLabel,
  troopsAt,
} from '@/domain/troops';
import type { PlayerView, TroopStation, UnitRole } from '@/domain/player-view';
import { currentMinutes, currentStock } from '@/domain/player-view';
import { asClockTime, asDuration } from '@/domain/duration';
import { spedMinutes, speedsUp } from '@/domain/level-speed';
import { produces, shortfallOf } from '@/domain/economy';
import { blitzRecruitRefusalOf, fundsAt, incomePerMinute, rolesFormedBy } from '@/domain/blitz';
import { BLITZ } from '../../../convex/constants';
import { HelpMark } from './HelpMark';
import { UpgradeControl } from './UpgradeControl';
import { RaiseControl } from './RaiseControl';
import { GunneryButton } from './GunneryButton';
import { GarrisonStack } from './GarrisonStack';
import { FloatingWindow, useWindowSized, type WindowProps, WindowHead } from './Window';
import { useNarrowScreen } from '@/shell/viewport';
import type { Seat } from '@/data/session';

/**
 * **La modale d'un site de production : ce bâtiment-là, et rien des autres** (décisions 59a,
 * 60b, 61a du 01/09). La fenêtre Production générale empilait trois domaines, un sélecteur de
 * site et deux bandeaux « bloqué : aucun … » pour un joueur qui voulait former une infanterie
 * dans sa caserne de Normandie. Elle est morte, et son onglet de rail avec elle.
 *
 * **Aucune section de domaine sans bâtiment.** Le catalogue de ce qu'on ne peut pas encore
 * former a déménagé dans l'abaque (60b, contrat 06) : cette surface n'existe pas sans le
 * bâtiment, donc elle n'a rien à griser. La découverte se lit ailleurs, et sans rien posséder.
 *
 * **Elle absorbe la garnison** (61a) : le mât n'a plus qu'une destination, et composer une pile
 * se fait où l'on voit ce que le site tient debout.
 */
export function SiteModal({
  view,
  seat,
  buildingId,
  onOpenGunnery,
  onPrepare,
  onClose,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  seat: Seat;
  buildingId: string;
  /** L'abaque de tir, ouvert d'ici : c'est au moment où l'on choisit quoi former que « qui bat
   *  qui » est une question (ADR 0018 §4). Muet — le libellé est l'infobulle. */
  onOpenGunnery: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
}) {
  const building = view.me.buildings.find((candidate) => candidate.id === buildingId) ?? null;
  /** Un lien mort — le bâtiment est tombé, l'URL le nomme encore — n'ouvre pas un cadre vide :
   *  il n'ouvre rien, et la carte reste ce qu'elle est. */
  if (building === null || !hasSiteSheet(view.mode, building.key)) return null;

  return (
    <FloatingWindow name="site" onClose={onClose} {...windowProps} alignment="top" width={1180}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        {view.mode === 'blitz' ? (
          <BlitzSite
            key={building.id}
            view={view}
            seat={seat}
            building={building}
            onOpenGunnery={onOpenGunnery}
            onPrepare={onPrepare}
            onClose={onClose}
          />
        ) : (
          <Site
            key={building.id}
            view={view}
            seat={seat}
            building={building}
            onOpenGunnery={onOpenGunnery}
            onPrepare={onPrepare}
            onClose={onClose}
          />
        )}
      </div>
    </FloatingWindow>
  );
}

type Building = PlayerView['me']['buildings'][number];

function Site({
  view,
  seat,
  building,
  onOpenGunnery,
  onPrepare,
  onClose,
}: {
  view: PlayerView;
  seat: Seat;
  building: Building;
  onOpenGunnery: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
  onClose: () => void;
}) {
  const now = useClock();
  const sized = useWindowSized();
  const narrow = useNarrowScreen();
  const nation = view.me.nation;
  const workshop = useQuery(api.troops.workshop, seat);
  const recruit = useMutation(api.troops.recruit);
  const cancel = useMutation(api.troops.cancel);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Partial<Record<UnitRole, UnitTier>>>({});

  const station = useMemo<TroopStation>(
    () => ({ kind: 'building', buildingId: building.id }),
    [building.id],
  );
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const held = useMemo(
    () => troopsAt(view.me, stationKeyOf(station), marching),
    [view.me, station, marching],
  );
  const region = view.me.regions.find((candidate) => candidate.id === building.regionId);

  const observing = view.me.defeated;
  const onFailure = (failure: unknown) => handleError(failure, setError);

  /** La query sert toute la nation ; la modale n'en lit **que** son site. Le filtre est client
   *  parce que `workshop` n'a pas changé (contrat 03 : aucun changement serveur). */
  const facility = workshop?.facilities.find((candidate) => candidate.id === building.id) ?? null;

  /** **Nul, l'ordre n'existe pas** — c'est ainsi que l'observateur lit la fiche sans qu'elle lui
   *  promette une compagnie : un bouton grisé se lit comme « pas encore », et ce n'est pas « pas
   *  encore ». */
  const enqueueOf = (
    role: UnitRole,
    onRecruited?: (recruitmentId: string) => void,
  ): (() => void) | null =>
    observing
      ? null
      : () => {
          setError(null);
          void recruit({
            ...seat,
            buildingId: building.id as Id<'buildings'>,
            role,
            tier: tiers[role] ?? 1,
          }).then(({ recruitmentId }) => onRecruited?.(recruitmentId), onFailure);
        };
  const cancelOf = (batch: Batch): (() => void) | null =>
    observing
      ? null
      : () => {
          setError(null);
          void cancel({ ...seat, recruitmentId: batch.id }).catch(onFailure);
        };
  /** Les durées du barème, raccourcies au niveau du site (ADR 0031) : celles que le serveur date.
   *  La Blitz forme en `BLITZ.recruitMinutes`, sans niveau. */
  const sped = <Piece extends { minutes: number }>(piece: Piece): Piece =>
    workshop?.blitz ? piece : { ...piece, minutes: spedMinutes(piece.minutes, building.level) };
  const roles =
    facility === null
      ? []
      : (workshop?.grid ?? [])
          .filter((entry) => DOMAIN_BY_ROLE[entry.role] === facility.domain)
          .map((entry) => ({
            ...entry,
            unit: sped(entry.unit),
            unitTier2: entry.unitTier2 === null ? null : sped(entry.unitTier2),
          }));
  const unlinked = region !== undefined && !region.linked && produces(building.key);

  if (narrow)
    return (
      <NarrowSite
        view={view}
        seat={seat}
        building={building}
        regionName={region?.name ?? building.regionId}
        unlinked={unlinked}
        now={now}
        error={error}
        workshop={workshop}
        facility={facility}
        roles={roles}
        tiers={tiers}
        onTier={(role, picked) => setTiers((previous) => ({ ...previous, [role]: picked }))}
        enqueueOf={enqueueOf}
        cancelOf={cancelOf}
        station={station}
        held={held}
        onOpenGunnery={onOpenGunnery}
        onPrepare={onPrepare}
        onClose={onClose}
      />
    );

  return (
    <>
      <WindowHead
        lead={<BuildingPlate building={building.key} height={30} />}
        eyebrow={
          <>
            {fr.economy.inRegion(region?.name ?? building.regionId)} ·{' '}
            {speedsUp(building.key)
              ? fr.common.levelSpeed(building.level)
              : fr.production.siteLevel(building.level)}
          </>
        }
        title={fr.buildings[building.key]}
        onClose={onClose}
      >
        {/* **Un état, jamais une action** (ADR 0020 §6). Rien ne se répare ici : le bâtiment est
            debout, entier, et c'est sa région qui a changé de couleur. Le tampon le constate, et
            il n'ouvre aucun bouton — ce qui se reprend se reprend sur la carte. */}
        {unlinked && (
          <Stamp label={fr.stamps.unlinkedBy(view.me.unlinkedShare)} tone="critical" size="small" />
        )}
        {/* L'élévation passe **après** la fermeture sous le seuil : pleine ligne, elle repoussait
            « fermer » à une troisième ligne et l'en-tête mangeait un tiers du téléphone. */}
        <span className="order-last w-full min-w-0 md:order-none md:w-auto">
          <UpgradeControl building={building} view={view} seat={seat} now={now} />
        </span>
      </WindowHead>
      <UnderCapture view={view} buildingId={building.id} />

      {error && (
        <p className="shrink-0 border-b border-[var(--critical)] px-4 py-[9px] text-[12.5px] text-[var(--critical)]">
          {error}
        </p>
      )}

      {workshop === undefined || facility === null ? (
        <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">{fr.production.opening}</p>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-x-[18px] gap-y-2 border-b border-(color:--ink)/35 px-4 py-[9px]">
            <span className="flex items-baseline gap-[9px]">
              <span className="font-(family-name:--font-mono) text-[19px] text-[var(--ink)]">
                {workshop.troopsInService}
              </span>
              <span className="eyebrow">{fr.production.inService}</span>
              <span className="ml-[8px] font-(family-name:--font-mono) text-[19px] text-[var(--ink)]">
                {workshop.troopsQueued}
              </span>
              <span className="eyebrow">{fr.production.inQueue}</span>
            </span>
          </div>

          {/* **Deux colonnes larges, une seule feuille étroite.** Sous `@4xl` — un écran de
              téléphone, jamais le bureau — les cartes et la file s'empilent et **un seul
              défileur** les porte : deux boîtes qui se disputaient une hauteur fixe laissaient
              les cartes à zéro pixel, et l'on ne pouvait plus former une compagnie. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain @4xl:flex-row @4xl:items-stretch @4xl:overflow-visible">
            <div
              className={`flex min-w-0 flex-col @4xl:flex-1 ${
                sized ? '@4xl:min-h-0 @4xl:overflow-auto' : '@4xl:max-h-[620px] @4xl:overflow-auto'
              }`}
            >
              <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3">
                {roles.map((entry) => (
                  <RoleCard
                    key={entry.role}
                    entry={entry}
                    nation={nation}
                    tier={tiers[entry.role] ?? 1}
                    onTier={(picked) =>
                      setTiers((previous) => ({ ...previous, [entry.role]: picked }))
                    }
                    owned={workshop.roster.filter((row) => row.role === entry.role)}
                    siteName={facility.regionName}
                    lacking={lackOf(
                      view,
                      now,
                      roleTermsOf(entry, tiers[entry.role] ?? 1).cost.costs,
                    )}
                    onEnqueue={enqueueOf(entry.role)}
                  />
                ))}
              </div>

              {/* **La garnison sous ce qui la remplit** (61a) : on lit ce que le site forme, puis
                  ce qu'il tient debout, et on compose la colonne sans changer de fenêtre. */}
              <section className="border-t border-(color:--ink)/35">
                <div className="flex items-center gap-3 border-b border-(color:--ink)/35 px-4 py-[9px]">
                  <span className="eyebrow">{fr.garrison.kicker}</span>
                  <span className="h-px flex-1 bg-(--ink)/20" />
                  <span className="eyebrow">{fr.garrison.troopCount(held.length)}</span>
                </div>
                <div className="px-4 py-3">
                  <GarrisonStack
                    view={view}
                    station={station}
                    held={held}
                    preselect={[]}
                    canPrepare
                    observing={observing}
                    onPrepare={onPrepare}
                  />
                </div>
              </section>
            </div>

            <aside className="flex w-full min-w-0 flex-col border-t border-(color:--ink)/35 @4xl:min-h-0 @4xl:w-[300px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
              <div className="shrink-0 border-b border-(color:--ink)/35 px-4 py-[10px]">
                <span className="eyebrow">{fr.production.queueHeader}</span>
              </div>
              <div
                className={`flex flex-col @4xl:flex-1 ${
                  sized
                    ? '@4xl:min-h-0 @4xl:overflow-auto'
                    : '@4xl:max-h-[520px] @4xl:overflow-auto'
                }`}
              >
                {facility.queue.length === 0 ? (
                  <p className="px-4 py-5 text-[12.5px] text-[var(--ink-soft)]">
                    {fr.production.queueEmpty}
                  </p>
                ) : (
                  <>
                    <div className="border-b border-(color:--ink)/35 bg-(--ink)/5 px-4 py-[5px]">
                      <span className="eyebrow">
                        {fr.production.queueOf(facility.regionName, facility.queue.length)}
                      </span>
                    </div>
                    {facility.queue.map((batch) => (
                      <QueueRow
                        key={batch.id}
                        batch={batch}
                        nation={nation}
                        loadedAt={workshop.loadedAt}
                        now={now}
                        onCancel={cancelOf(batch)}
                      />
                    ))}
                  </>
                )}
                <div className="mt-auto flex items-center gap-2 px-4 pt-3 pb-4">
                  <span className="eyebrow">{fr.production.atWaking}</span>
                  <HelpMark>{fr.production.wakingNote}</HelpMark>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center gap-[10px] border-t border-[var(--ink)] px-4 py-[9px]">
        <GunneryButton onOpen={onOpenGunnery} />
        <span className="h-px flex-1 bg-(--ink)/20" />
      </div>
    </>
  );
}

/**
 * **Le site d'une Blitz** (lot 4) : ce qu'il verse, ce qu'il forme — une marque par rôle, payée
 * en fonds, prête en une minute —, sa file et sa garnison. Ni niveau, ni élévation, ni plafond
 * affiché : le frein est le prix, et le refus est celui du serveur (`blitzRecruitRefusalOf`).
 */
function BlitzSite({
  view,
  seat,
  building,
  onOpenGunnery,
  onPrepare,
  onClose,
}: {
  view: PlayerView;
  seat: Seat;
  building: Building;
  onOpenGunnery: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
  onClose: () => void;
}) {
  const now = useClock();
  const workshop = useQuery(api.troops.workshop, seat);
  const recruit = useMutation(api.troops.recruit);
  const cancel = useMutation(api.troops.cancel);
  const [error, setError] = useState<string | null>(null);
  const station = useMemo<TroopStation>(
    () => ({ kind: 'building', buildingId: building.id }),
    [building.id],
  );
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const held = useMemo(
    () => troopsAt(view.me, stationKeyOf(station), marching),
    [view.me, station, marching],
  );
  const region = view.me.regions.find((candidate) => candidate.id === building.regionId);
  const observing = view.me.defeated;
  const onFailure = (failure: unknown) => handleError(failure, setError);
  const facility = workshop?.facilities.find((candidate) => candidate.id === building.id) ?? null;
  const funds =
    view.me.funds === null ? 0 : Math.floor(fundsAt({ ...view.me.funds, at: view.loadedAt }, now));
  const army = view.me.troops.length + (workshop?.troopsQueued ?? 0);
  const income = incomePerMinute([building.key]);
  const mending = held.filter((troop) => troop.mending).length;

  return (
    <>
      <WindowHead
        lead={<BuildingPlate building={building.key} height={30} />}
        eyebrow={fr.economy.inRegion(region?.name ?? building.regionId)}
        title={fr.buildings[building.key]}
        onClose={onClose}
      >
        {income > 0 && (
          <span className="font-(family-name:--font-mono) text-[12px] text-[var(--ink)]">
            {fr.blitz.siteIncome(income)}
          </span>
        )}
        <span className="font-(family-name:--font-mono) text-[12px] text-[var(--ink-soft)]">
          {fr.blitz.fundsHeld(funds)}
        </span>
      </WindowHead>
      <UnderCapture view={view} buildingId={building.id} />
      {error && (
        <p className="shrink-0 border-b border-[var(--critical)] px-4 py-[9px] text-[12.5px] text-[var(--critical)]">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain">
        {rolesFormedBy(building.key).length > 0 && (
          <div className="grid grid-cols-1 border-b border-(color:--ink)/35 @xl:grid-cols-3">
            {rolesFormedBy(building.key).map((role) => {
              const refusal = blitzRecruitRefusalOf({
                site: building.key,
                role,
                funds,
                troops: army,
                occupied: held.length > 0 || (facility?.queue.length ?? 0) > 0,
              });
              const price = BLITZ.rolePrice[role];
              return (
                <div key={role} className="flex flex-col border-r border-b border-(color:--ink)/16">
                  <div className="flex h-[120px] items-center justify-center border-b border-(color:--ink)/16 bg-(--ink)/5">
                    <UnitSprite
                      nation={view.me.nation}
                      role={role}
                      tier={1}
                      height={104}
                      width={200}
                    />
                  </div>
                  <div className="px-4 pt-[10px]">
                    <div className="font-(family-name:--font-display) text-[18px] leading-[1.1] font-extrabold text-[var(--ink)]">
                      {roleLabel(role, 1)}
                    </div>
                    <div className="mt-[3px] font-(family-name:--font-mono) text-[12px] text-[var(--ink-soft)]">
                      {fr.blitz.terms(price, asDuration(BLITZ.recruitMinutes))}
                    </div>
                  </div>
                  <div className="px-4 pt-[9px] pb-[14px]">
                    {observing ? null : refusal === null ? (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          void recruit({
                            ...seat,
                            buildingId: building.id as Id<'buildings'>,
                            role,
                            tier: 1,
                          }).catch(onFailure);
                        }}
                        className="w-full cursor-pointer border border-[var(--ink)] py-[8px] text-[10.5px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                      >
                        {fr.blitz.recruit(price)}
                      </button>
                    ) : (
                      <p className="text-[12px] text-[var(--ink-soft)] italic">
                        {refusal === 'INSUFFICIENT_FUNDS'
                          ? fr.blitz.short(price - funds)
                          : fr.errors[refusal]({})}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {facility !== null && facility.queue.length > 0 && (
          <section className="border-b border-(color:--ink)/35">
            <div className="border-b border-(color:--ink)/35 px-4 py-[9px]">
              <span className="eyebrow">{fr.production.queueHeader}</span>
            </div>
            {facility.queue.map((batch) => (
              <QueueRow
                key={batch.id}
                batch={batch}
                nation={view.me.nation}
                loadedAt={workshop?.loadedAt ?? view.loadedAt}
                now={now}
                onCancel={
                  observing
                    ? null
                    : () => {
                        setError(null);
                        void cancel({ ...seat, recruitmentId: batch.id }).catch(onFailure);
                      }
                }
              />
            ))}
          </section>
        )}

        <section>
          <div className="flex items-center gap-3 border-b border-(color:--ink)/35 px-4 py-[9px]">
            <span className="eyebrow">{fr.garrison.kicker}</span>
            <span className="h-px flex-1 bg-(--ink)/20" />
            {mending > 0 && <span className="eyebrow">{fr.blitz.mendingHere(mending)}</span>}
            <span className="eyebrow">{fr.garrison.troopCount(held.length)}</span>
          </div>
          <div className="px-4 py-3">
            <GarrisonStack
              view={view}
              station={station}
              held={held}
              preselect={[]}
              canPrepare
              observing={observing}
              onPrepare={onPrepare}
            />
            {held.length > 0 && (
              <p className="mt-2 text-[11.5px] text-[var(--ink-quiet)] italic">
                {fr.blitz.mendNote(BLITZ.mend.sharePerStep, BLITZ.mend.stepMinutes * 60)}
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="flex shrink-0 items-center gap-[10px] border-t border-[var(--ink)] px-4 py-[9px]">
        <GunneryButton onOpen={onOpenGunnery} />
        <span className="h-px flex-1 bg-(--ink)/20" />
      </div>
    </>
  );
}

type WorkshopView = NonNullable<ReturnType<typeof useQuery<typeof api.troops.workshop>>>;
type Facility = WorkshopView['facilities'][number];
type GridEntry = WorkshopView['grid'][number];
type Batch = Facility['queue'][number];

/** Ce qu'un rôle coûte au palier choisi, et ce qui le retient : la carte du bureau et la ligne
 *  du téléphone lisent la même règle. */
/** The resource a price is short in, read off the live stocks: what `Price` turns critical. */
const lackOf = (
  view: PlayerView,
  now: number,
  costs: GridEntry['unit']['costs'],
): ResourceKey | null =>
  shortfallOf(costs, (resource) => currentStock(view.me.resources[resource], view.loadedAt, now))
    ?.resource ?? null;

function roleTermsOf(entry: GridEntry, tier: UnitTier) {
  const cost = pieceAt(entry, tier);
  return {
    /** La carte qui tient ce palier : la marque choisie se dit, la pièce reste lisible. */
    lockedBy: cost.lockedBy,
    /**
     * **La carte reste, la condition se dit, le bouton s'en va** (67b) : le porte-avions se lit
     * avant sa recherche — rien de caché ne se débloque (60b) — et un bouton grisé se lirait
     * « pas encore » là où il faut lire « posez la carte ».
     */
    roleLocked: entry.unit.lockedBy !== null,
    cost,
  };
}

type SheetTab = 'form' | 'queue' | 'garrison';

/** Le temps qu'on laisse au cartouche pour se lire, et à son « annuler » pour servir. */
const RECRUITED_NOTICE_MS = 8_000;

/**
 * **La feuille d'un site, sur un téléphone** (refonte mobile, 2a à 2c). La fenêtre du bureau y
 * tenait un en-tête, une bande de plafond et un pied fixes, et laissait aux cartes une boîte de
 * quelques pixels. Ici toute la feuille défile ; l'en-tête, les trois onglets et le plafond restent
 * collés. Un seul gabarit pour la caserne, le port et l'aérodrome : former, la file, la garnison.
 */
/**
 * **Le site se fait capturer** (14/10) : le tampon, et pourquoi — une infanterie adverse le tient
 * et il change de main à l'heure dite si personne ne l'en chasse. Jamais qui : la vue ne le sert
 * pas. Le remède est sur la carte, comme pour « hors réseau ».
 */
function UnderCapture({ view, buildingId }: { view: PlayerView; buildingId: string }) {
  const capture = view.captures.find(
    (candidate) =>
      candidate.side === 'defender' &&
      candidate.target.kind === 'building' &&
      candidate.target.id === buildingId,
  );
  if (capture === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-(color:--ink)/18 px-4 py-2">
      <Stamp label={fr.capture.underCapture} tone="critical" size="small" />
      <span className="text-[12.5px] text-[var(--critical)]">
        {fr.capture.underCaptureWhy(asClockTime(capture.completesAt))}
      </span>
    </div>
  );
}

function NarrowSite({
  view,
  seat,
  building,
  regionName,
  unlinked,
  now,
  error,
  workshop,
  facility,
  roles,
  tiers,
  onTier,
  enqueueOf,
  cancelOf,
  station,
  held,
  onOpenGunnery,
  onPrepare,
  onClose,
}: {
  view: PlayerView;
  seat: Seat;
  building: Building;
  regionName: string;
  unlinked: boolean;
  now: number;
  error: string | null;
  workshop: WorkshopView | undefined;
  facility: Facility | null;
  roles: ReadonlyArray<GridEntry>;
  tiers: Partial<Record<UnitRole, UnitTier>>;
  onTier: (role: UnitRole, tier: UnitTier) => void;
  enqueueOf: (role: UnitRole, onRecruited: (recruitmentId: string) => void) => (() => void) | null;
  cancelOf: (batch: Batch) => (() => void) | null;
  station: TroopStation;
  held: ReturnType<typeof troopsAt>;
  onOpenGunnery: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SheetTab>('form');
  const [recruited, setRecruited] = useState<{ id: string; at: number } | null>(null);
  const sheet = useRef<HTMLElement>(null);
  const pick = (next: SheetTab) => {
    setTab(next);
    if (sheet.current !== null) sheet.current.scrollTop = 0;
  };

  const ready = workshop !== undefined && facility !== null;
  const queue = facility?.queue ?? [];
  const nation = view.me.nation;
  const stockOf = (resource: ResourceKey) =>
    currentStock(view.me.resources[resource], view.loadedAt, now);
  const siteLevel = facility?.level ?? building.level;
  const termsOf = (entry: GridEntry) => roleTermsOf(entry, tiers[entry.role] ?? 1);
  const open = roles.filter((entry) => !termsOf(entry).roleLocked);
  const locked = roles.filter((entry) => termsOf(entry).roleLocked);
  /** Ce qui retient un rôle ouvert, dit à la place du bouton : la même chaîne de refus que le
   *  serveur (`troops.recruit`), dans son ordre. */
  const blockOf = (entry: GridEntry): string | null => {
    if (!ready) return null;
    const { lockedBy, cost } = termsOf(entry);
    if (lockedBy !== null) return researchRequired(lockedBy);
    if (queue.length >= workshop.maxQueue) return fr.production.sheet.queueFull;
    const short = shortfallOf(cost.costs, stockOf);
    if (short !== null)
      return fr.production.sheet.short(short.missing, fr.resources[short.resource]);
    return null;
  };
  const minutesOf = (batch: Batch) => {
    const entry = roles.find((candidate) => candidate.role === batch.role);
    if (entry === undefined) return 0;
    return batch.tier === 2 && entry.unitTier2 ? entry.unitTier2.minutes : entry.unit.minutes;
  };
  const deliveredAt = (batch: Batch) =>
    asClockTime((workshop?.loadedAt ?? now) + batch.minutesLeft * 60_000);

  const noticeIndex =
    recruited !== null && now - recruited.at < RECRUITED_NOTICE_MS
      ? queue.findIndex((batch) => batch.id === recruited.id)
      : -1;
  const noticed = noticeIndex >= 0 ? queue[noticeIndex] : undefined;

  const counts: Record<SheetTab, string> = {
    form: '',
    queue: String(queue.length),
    garrison: String(held.length),
  };
  /** Une tête que la famine a laissée sans date n'a pas commencé : elle attend, et se rembourse. */
  const running = queue.filter((batch) => batch.started);
  const waiting = queue.filter((batch) => !batch.started);

  return (
    <article
      ref={sheet}
      className="paper-grain min-h-0 w-full flex-1 overflow-y-auto overscroll-contain text-[var(--ink)]"
    >
      <div className="paper-grain sticky top-0 z-[2] border-b border-[var(--ink)]">
        <div className="flex min-h-[56px] items-center gap-[10px] py-[6px] pr-3 pl-[14px]">
          <BuildingPlate building={building.key} height={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-(family-name:--font-display) text-[21px] leading-[1.05] font-extrabold">
              {fr.buildings[building.key]}
            </div>
            <div className="mt-[2px] truncate text-[12.5px] text-[var(--ink-soft)]">
              {fr.production.siteLevel(building.level)} · {fr.economy.inRegion(regionName)}
            </div>
          </div>
          <span className="flex h-[36px] w-[44px] shrink-0 [&>button]:h-full [&>button]:w-full [&>button]:justify-center">
            <GunneryButton onOpen={onOpenGunnery} />
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[10px] font-semibold tracking-[.18em] uppercase"
          >
            {fr.common.close}
          </button>
        </div>
        {/* Un état, jamais une action (ADR 0020 §6) : ce qui se reprend se reprend sur la carte. */}
        {unlinked && (
          <div className="px-4 pb-2">
            <Stamp
              label={fr.stamps.unlinkedBy(view.me.unlinkedShare)}
              tone="critical"
              size="small"
            />
          </div>
        )}
        <UnderCapture view={view} buildingId={building.id} />
        <div role="tablist" className="grid h-[40px] grid-cols-3">
          {(['form', 'queue', 'garrison'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => pick(id)}
              className={`flex cursor-pointer items-center justify-center gap-[6px] border-b-[3px] text-[10.5px] tracking-[.14em] uppercase ${
                tab === id
                  ? 'border-[var(--ink)] font-bold text-[var(--ink)]'
                  : 'border-transparent font-semibold text-[var(--ink-soft)]'
              }`}
            >
              {fr.production.sheet.tabs[id]}
              {counts[id] !== '' && (
                <span className="font-(family-name:--font-mono) text-[11px] tracking-normal">
                  {counts[id]}
                </span>
              )}
            </button>
          ))}
        </div>
        {ready && (
          <div className="flex min-h-[42px] items-center border-t border-(color:--ink)/25 py-[6px] pr-[14px] pl-4">
            <span className="truncate text-[12.5px] leading-[1.1]">
              {fr.production.sheet.capLine(workshop.troopsInService, workshop.troopsQueued)}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="border-b border-[var(--critical)] px-4 py-[9px] text-[12.5px] text-[var(--critical)]">
          {error}
        </p>
      )}

      {!ready ? (
        <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">{fr.production.opening}</p>
      ) : tab === 'form' ? (
        <>
          {!view.me.defeated && (
            <SiteLadder
              building={building}
              view={view}
              seat={seat}
              now={now}
              siteLevel={siteLevel}
            />
          )}
          <SheetHeading
            title={fr.production.sheet.formHeader}
            note={fr.production.sheet.formNote}
          />
          {open.map((entry) => (
            <RoleSheetCard
              key={entry.role}
              entry={entry}
              nation={nation}
              tier={tiers[entry.role] ?? 1}
              onTier={(picked) => onTier(entry.role, picked)}
              owned={workshop.roster.filter((row) => row.role === entry.role)}
              cost={termsOf(entry).cost}
              siteName={facility.regionName}
              blocked={blockOf(entry)}
              lacking={lackOf(view, now, termsOf(entry).cost.costs)}
              onEnqueue={enqueueOf(entry.role, (id) => setRecruited({ id, at: Date.now() }))}
            />
          ))}
          {locked.length > 0 && (
            <>
              <div className="mt-[18px] flex items-baseline justify-between gap-[10px] border-t-2 border-[var(--ink)] px-4 pt-3 pb-[6px]">
                <span className="font-(family-name:--font-display) text-[18px] font-extrabold">
                  {fr.production.sheet.lockedHeader}
                </span>
                <span className="text-[12px] text-[var(--ink-quiet)]">
                  {fr.production.sheet.lockedNote}
                </span>
              </div>
              {locked.map((entry) => (
                <LockedRoleLine key={entry.role} entry={entry} nation={nation} />
              ))}
            </>
          )}
        </>
      ) : tab === 'queue' ? (
        <>
          {running.map((batch) => (
            <RunningCard
              key={batch.id}
              batch={batch}
              nation={nation}
              loadedAt={workshop.loadedAt}
              now={now}
              totalMinutes={minutesOf(batch)}
              deliveredAt={deliveredAt(batch)}
            />
          ))}
          {waiting.length > 0 && (
            <>
              <SheetHeading
                title={fr.production.sheet.waitingHeader}
                note={fr.production.sheet.waitingNote}
              />
              {waiting.map((batch, index) => (
                <WaitingLine
                  key={batch.id}
                  batch={batch}
                  rank={index + running.length + 1}
                  nation={nation}
                  minutes={minutesOf(batch)}
                  deliveredAt={deliveredAt(batch)}
                  onCancel={cancelOf(batch)}
                />
              ))}
            </>
          )}
          {queue.length === 0 && (
            <div className="px-4 pt-7 pb-1">
              <div className="font-(family-name:--font-display) text-[19px] leading-[1.2] font-extrabold">
                {fr.production.sheet.queueEmptyTitle}
              </div>
              <div className="mt-[6px] text-[13.5px] leading-[1.45] text-[var(--ink-soft)]">
                {fr.production.sheet.queueEmptyNote}
              </div>
              <button
                type="button"
                onClick={() => pick('form')}
                className="mt-[14px] h-[48px] cursor-pointer border border-[var(--ink)] px-[18px] text-[11px] font-bold tracking-[.16em] uppercase"
              >
                {fr.production.sheet.formHeader}
              </button>
            </div>
          )}
          <div className="mx-4 mt-[18px] mb-6">
            <HelpMark>{fr.production.sheet.queueNote(aSecondBuilding(building.key))}</HelpMark>
          </div>
        </>
      ) : held.length === 0 ? (
        <div className="px-4 pt-7 pb-6">
          <div className="font-(family-name:--font-display) text-[19px] leading-[1.2] font-extrabold">
            {fr.production.sheet.garrisonEmpty[facility.domain]}
          </div>
          <div className="mt-[6px] text-[13.5px] leading-[1.45] text-[var(--ink-soft)]">
            {fr.production.sheet.garrisonEmptyNote}
          </div>
        </div>
      ) : (
        /* La garnison du site est la composition même de 1e : la feuille la porte telle quelle
           plutôt qu'un bouton « composer une pile » qui n'ouvrirait qu'elle. */
        <div className="px-3 pt-3 pb-4">
          <GarrisonStack
            view={view}
            station={station}
            held={held}
            preselect={[]}
            canPrepare
            observing={view.me.defeated}
            onPrepare={onPrepare}
          />
        </div>
      )}

      {noticed !== undefined && (
        <RecruitedNotice
          batch={noticed}
          rank={noticeIndex + 1}
          deliveredAt={deliveredAt(noticed)}
          onUndo={noticed.started ? null : cancelOf(noticed)}
          onDone={() => setRecruited(null)}
        />
      )}
    </article>
  );
}

/** Un titre de section en petites capitales, et sa phrase à droite. */
function SheetHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[10px] px-4 pt-[14px] pb-1">
      <span className="text-[10px] font-bold tracking-[.18em] uppercase">{title}</span>
      <span className="text-right text-[12px] text-[var(--ink-quiet)]">{note}</span>
    </div>
  );
}

/**
 * **Ce que le niveau rend, et le bouton qui le monte** — en tête de « former » : chaque niveau
 * raccourcit la formation (ADR 0031). Le bouton est celui des Chantiers.
 */
function SiteLadder({
  building,
  view,
  seat,
  now,
  siteLevel,
}: {
  building: Building;
  view: PlayerView;
  seat: Seat;
  now: number;
  siteLevel: number;
}) {
  return (
    <div className="mx-3 mt-3 flex items-center gap-[10px] border border-[var(--ink)] bg-(--paper)/35 py-[10px] pr-[10px] pl-3">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {fr.production.sheet.siteKicker(siteLevel)}
        </div>
        <div className="mt-[3px] text-[14.5px] leading-[1.2] font-bold">
          {fr.common.levelSpeed(siteLevel)}
        </div>
      </div>
      <RaiseControl building={building} view={view} seat={seat} now={now} />
    </div>
  );
}

/**
 * **Un rôle ouvert, une carte** : la vignette, le nom, l'équipement et ce qu'il bat ; MK1 / MK2 et
 * le bouton sous le pouce, prix et durée dedans. Ce qui retient se dit à la place du bouton, en
 * pointillé rouge — jamais un bouton grisé (ADR 0015).
 */
function RoleSheetCard({
  entry,
  nation,
  tier,
  onTier,
  owned,
  cost,
  siteName,
  blocked,
  lacking,
  onEnqueue,
}: {
  entry: GridEntry;
  nation: string;
  tier: UnitTier;
  onTier: (chosen: UnitTier) => void;
  owned: ReadonlyArray<{ tier: number; count: number }>;
  cost: GridEntry['unit'];
  siteName: string;
  blocked: string | null;
  lacking: ResourceKey | null;
  onEnqueue: (() => void) | null;
}) {
  const { role, tiers } = entry;
  const sheet = fr.unitSheets[role];
  const equipment = equipmentLabel(nation, role, tier);
  const total = owned.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="mx-3 mt-[10px] border border-[var(--ink)] bg-(--paper)/30">
      <div className="flex gap-3 pt-[10px] pr-3 pl-[10px]">
        <div className="flex h-[92px] w-[112px] shrink-0 items-center justify-center bg-(--ink)/7">
          <UnitSprite nation={nation} role={role} tier={tier} height={84} width={104} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-(family-name:--font-display) text-[19px] leading-[1.1] font-extrabold first-letter:uppercase">
            {roleLabel(role, 1)}
          </div>
          <div className="mt-[2px] text-[12.5px] text-[var(--ink-soft)]">
            {[equipment, `${cost.strength} ${fr.strengthUnits[role]}`].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-[2px] text-[11px] text-[var(--ink-soft)]" title={fr.supplies.formed}>
            <SupplyPictos supplies={pileSupplies([{ role, supplies: fullSupplies(role) }])} />
          </div>
          <div className="mt-px font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {total} {fr.production.inService}
          </div>
          {sheet.kind === 'combat' ? (
            <div className="mt-[6px] text-[12.5px] leading-[1.4]">
              <div>
                <span className="text-[var(--ink-soft)]">{fr.production.strongAgainst} </span>
                {sheet.strongAgainst.join(', ')}
              </div>
              <div>
                <span className="text-[var(--ink-soft)]">{fr.production.weakAgainst} </span>
                {sheet.weakAgainst.join(', ')}
              </div>
            </div>
          ) : (
            <p className="mt-[6px] text-[12.5px] leading-[1.4] text-[var(--ink-soft)] italic">
              {sheet.contribution} {fr.production.supportNote}
            </p>
          )}
        </div>
      </div>
      {/* L'observateur lit la carte sans bouton : il ne décide plus (décision du 31/08). */}
      {onEnqueue === null ? (
        <div className="h-[10px]" />
      ) : (
        <div className="flex gap-[6px] p-[10px]">
          {tiers === 2 &&
            ([1, 2] as const).map((level) => {
              const lockedBy = pieceAt(entry, level).lockedBy;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={tier === level}
                  title={
                    lockedBy !== null ? researchRequired(lockedBy) : fr.production.tierLabel(level)
                  }
                  onClick={() => onTier(level)}
                  className={`h-[52px] w-[52px] shrink-0 cursor-pointer border border-[var(--ink)] font-(family-name:--font-mono) text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40 ${
                    tier === level ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
                  }`}
                >
                  {tierLabel(level)}
                </button>
              );
            })}
          {blocked === null ? (
            <button
              type="button"
              onClick={onEnqueue}
              title={fr.production.enqueueTitle(roleLabel(role, 1), tierLabel(tier), siteName)}
              className="flex h-[52px] min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 bg-[var(--ink)] px-[14px] text-[var(--paper)]"
            >
              <span className="text-[11.5px] font-bold tracking-[.12em] whitespace-nowrap uppercase">
                {fr.production.enqueue}
              </span>
              <span className="font-(family-name:--font-mono) text-[11px] whitespace-nowrap text-[var(--paper-dim-2)]">
                <Price costs={cost.costs} onPaper={false} lacking={lacking} size={11} />
                {` · ${asDuration(cost.minutes)}`}
              </span>
            </button>
          ) : (
            <span className="flex min-h-[52px] min-w-0 flex-1 items-center border border-dashed border-[var(--critical)] px-3 py-[6px] text-[12.5px] leading-[1.3] text-[var(--critical)]">
              {blocked}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Un rôle que le site n'ouvre pas encore : sa vignette, son prix pour qu'on prépare l'acier, et
 *  sa condition en toutes lettres — la même que l'abaque (contrats 03 et 06). */
function LockedRoleLine({ entry, nation }: { entry: GridEntry; nation: string }) {
  const { role, unit } = entry;
  const equipment = equipmentLabel(nation, role, 1);
  return (
    <div className="flex min-h-[76px] items-center gap-3 border-b border-(color:--ink)/18 py-2 pr-[14px] pl-3">
      <div className="flex h-[58px] w-[76px] shrink-0 items-center justify-center bg-(--ink)/7">
        <UnitSprite nation={nation} role={role} height={52} width={70} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[16px] leading-[1.1] font-bold first-letter:uppercase">
            {roleLabel(role, 1)}
          </span>
          <span className="shrink-0 font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            <Price costs={unit.costs} size={11} />
            {` · ${asDuration(unit.minutes)}`}
          </span>
        </div>
        <div className="mt-[2px] text-[12px] text-[var(--ink-soft)]">
          {[equipment, `${unit.strength} ${fr.strengthUnits[role]}`].filter(Boolean).join(' · ')}
        </div>
        <div className="mt-1 text-[10.5px] font-semibold tracking-[.1em] text-[var(--critical)] uppercase">
          {unit.lockedBy === null
            ? fr.production.formsIn(aBuilding(entry.producedBy))
            : researchRequired(unit.lockedBy)}
        </div>
      </div>
    </div>
  );
}

/** Le nom d'un lot : le rôle, et sa marque quand le rôle en a deux. */
const batchName = (batch: Batch): string => {
  const name = roleLabel(batch.role, 1);
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return TIERS_BY_ROLE[batch.role] === 2
    ? `${label} ${tierLabel(batch.tier === 2 ? 2 : 1)}`
    : label;
};

/**
 * **La troupe en chaîne, en tête et seule** : son compte à rebours, sa barre, son heure. Elle ne
 * porte pas de bouton, elle porte la phrase — une troupe commencée ne s'annule plus.
 */
function RunningCard({
  batch,
  nation,
  loadedAt,
  now,
  totalMinutes,
  deliveredAt,
}: {
  batch: Batch;
  nation: string;
  loadedAt: number;
  now: number;
  totalMinutes: number;
  deliveredAt: string;
}) {
  const left = currentMinutes(batch.minutesLeft, loadedAt, now);
  const done = totalMinutes > 0 ? Math.min(1, Math.max(0, 1 - left / totalMinutes)) : 0;
  const tier = batch.tier === 2 ? 2 : 1;
  const equipment = equipmentLabel(nation, batch.role, tier);
  return (
    <div className="mx-3 mt-3 border-2 border-[var(--ink)] bg-(--ink)/5 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-[52px] w-[64px] shrink-0 items-center justify-center">
          <UnitSprite nation={nation} role={batch.role} tier={tier} height={52} width={64} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.production.sheet.running}
          </div>
          <div className="mt-[2px] font-(family-name:--font-display) text-[19px] leading-[1.05] font-extrabold">
            {batchName(batch)}
          </div>
          <div className="mt-[2px] text-[12.5px] text-[var(--ink-soft)]">
            {[equipment, `${batch.strength} ${fr.strengthUnits[batch.role]}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-(family-name:--font-display) text-[23px] leading-none font-extrabold">
            {asDuration(left)}
          </div>
          <div className="mt-[5px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.production.sheet.remaining}
          </div>
        </div>
      </div>
      <div className="mt-[10px] h-[4px] bg-(--ink)/16">
        <div className="h-[4px] bg-[var(--ink)]" style={{ width: `${Math.round(done * 100)}%` }} />
      </div>
      <div className="mt-2 text-[12px] text-[var(--ink-quiet)] italic">
        {fr.production.sheet.deliveredAround(deliveredAt)} · {fr.production.cancelStarted}
      </div>
    </div>
  );
}

/** Une troupe qui attend son tour : son rang, sa durée, son heure, et l'annulation remboursée. */
function WaitingLine({
  batch,
  rank,
  nation,
  minutes,
  deliveredAt,
  onCancel,
}: {
  batch: Batch;
  rank: number;
  nation: string;
  minutes: number;
  deliveredAt: string;
  onCancel: (() => void) | null;
}) {
  return (
    <div className="flex min-h-[58px] items-center gap-[10px] border-b border-(color:--ink)/18 py-[2px] pr-[10px] pl-4">
      <span className="w-[28px] shrink-0 font-(family-name:--font-display) text-[18px] font-extrabold">
        {fr.production.sheet.rank(rank)}
      </span>
      <span className="flex h-[36px] w-[46px] shrink-0 items-center justify-center">
        <UnitSprite
          nation={nation}
          role={batch.role}
          tier={batch.tier === 2 ? 2 : 1}
          height={36}
          width={46}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{batchName(batch)}</span>
        <span className="block truncate text-[12px] text-[var(--ink-soft)]">
          {asDuration(minutes)} · {fr.production.sheet.deliveredAround(deliveredAt)}
        </span>
      </span>
      {onCancel !== null && (
        <button
          type="button"
          onClick={onCancel}
          title={fr.production.cancelRefund}
          className="h-[44px] shrink-0 cursor-pointer px-[6px] text-[10.5px] font-semibold tracking-[.16em] uppercase underline underline-offset-[3px]"
        >
          {fr.production.cancel}
        </button>
      )}
    </div>
  );
}

/**
 * **Ce qui vient d'être enfilé, et la porte pour le reprendre** — le cartouche des Chantiers. Une
 * troupe passée aussitôt en tête n'a plus de retour : le cartouche le dit, sans le bouton.
 */
function RecruitedNotice({
  batch,
  rank,
  deliveredAt,
  onUndo,
  onDone,
}: {
  batch: Batch;
  rank: number;
  deliveredAt: string;
  onUndo: (() => void) | null;
  onDone: () => void;
}) {
  return (
    <div
      role="status"
      className="sticky bottom-3 z-[3] mx-[10px] mt-3 flex min-h-[60px] items-center gap-[10px] bg-[var(--ink)] py-2 pr-2 pl-[14px] text-[var(--paper)] float"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[13.5px] font-bold">
          {batch.started
            ? fr.production.sheet.toastRunning(batchName(batch), deliveredAt)
            : fr.production.sheet.toastQueued(batchName(batch), rank, deliveredAt)}
        </span>
        <span className="text-[11px] leading-[1.3] text-[var(--paper-dim-2)]">
          {batch.started
            ? fr.production.sheet.toastRunningNote
            : fr.production.sheet.toastQueuedNote}
        </span>
      </span>
      {onUndo !== null && (
        <button
          type="button"
          onClick={() => {
            onUndo();
            onDone();
          }}
          className="h-[44px] shrink-0 cursor-pointer border border-[var(--paper-dim)] px-3 text-[10.5px] font-semibold tracking-[.16em] uppercase"
        >
          {fr.production.cancel}
        </button>
      )}
    </div>
  );
}

/**
 * **One role, one card, the vignette in the lead.** The stacked rows priced a troop in a line
 * of figures and showed the sprite as a thumbnail; here the subject is what the eye lands on
 * and the numbers are read under it.
 *
 * The card keeps the row's rule that a refusal is *said*, never merely greyed: a locked role
 * carries its sentence in the body, and the dead button below repeats nothing.
 */
function RoleCard({
  entry,
  nation,
  tier,
  onTier,
  owned,
  siteName,
  lacking,
  onEnqueue,
}: {
  entry: GridEntry;
  nation: string;
  tier: UnitTier;
  onTier: (chosen: UnitTier) => void;
  owned: ReadonlyArray<{ tier: number; count: number }>;
  siteName: string;
  lacking: ResourceKey | null;
  onEnqueue: (() => void) | null;
}) {
  const { role, tiers } = entry;
  const { lockedBy, cost } = roleTermsOf(entry, tier);
  const sheet = fr.unitSheets[role];
  const equipment = equipmentLabel(nation, role, tier);
  const total = owned.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col border-r border-b border-(color:--ink)/16">
      <div className="relative flex h-[150px] items-center justify-center border-b border-(color:--ink)/16 bg-(--ink)/5">
        <UnitSprite nation={nation} role={role} tier={tier} height={132} width={230} />
        {tiers === 2 && (
          <div className="absolute top-[8px] left-[8px] flex gap-[2px]">
            {([1, 2] as const).map((level) => {
              const locked = pieceAt(entry, level).lockedBy;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={tier === level}
                  title={
                    locked !== null ? researchRequired(locked) : fr.production.tierLabel(level)
                  }
                  onClick={() => onTier(level)}
                  className={`cursor-pointer border border-[var(--ink)] px-[5px] py-[3px] font-(family-name:--font-mono) text-[9.5px] leading-none disabled:cursor-not-allowed disabled:opacity-40 ${
                    tier === level
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'bg-[var(--paper)] text-[var(--ink)]'
                  }`}
                >
                  {tierLabel(level)}
                </button>
              );
            })}
          </div>
        )}
        <span className="absolute top-[8px] right-[8px] flex items-baseline gap-[5px]">
          <span className="text-[9.5px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.production.inService}
          </span>
          <span className="font-(family-name:--font-mono) text-[14px] text-[var(--ink)]">
            {total}
          </span>
        </span>
      </div>

      <div className="px-4 pt-[10px] pb-[8px]">
        <div className="font-(family-name:--font-display) text-[19px] leading-[1.1] font-extrabold text-[var(--ink)]">
          {roleLabel(role, 1)}
        </div>
        {equipment && (
          <div className="mt-[2px] text-[12.5px] text-[var(--ink-soft)]">{equipment}</div>
        )}
        {lockedBy !== null && (
          <div className="mt-[3px] text-[11.5px] text-[var(--critical)]">
            {researchRequired(lockedBy)}
          </div>
        )}
      </div>

      {/* The bill and the wait, side by side and ruled apart — the two questions a recruitment
          answers, and the only figures on the card that decide anything. */}
      <div className="mx-4 flex items-stretch border-y border-(color:--ink)/16">
        <div className="flex-1 py-[7px]">
          <div className="text-[9px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
            {fr.production.costLabel}
          </div>
          <div className="mt-[3px] font-(family-name:--font-mono) text-[13.5px] text-[var(--ink)]">
            <Price costs={cost.costs} lacking={lacking} size={12} />
          </div>
        </div>
        <div className="w-px self-stretch bg-(--ink)/16" />
        <div className="flex-1 py-[7px] pl-3">
          <div className="text-[9px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
            {fr.production.trainingLabel}
          </div>
          <div className="mt-[3px] flex items-baseline gap-[9px]">
            <span className="font-(family-name:--font-mono) text-[13.5px] text-[var(--ink)]">
              {asDuration(cost.minutes)}
            </span>
            <span className="font-(family-name:--font-mono) text-[13.5px] text-[var(--ink)]">
              {cost.strength}
            </span>
            <span className="text-[10.5px] text-[var(--ink-soft)]">{fr.strengthUnits[role]}</span>
          </div>
          <div className="mt-[2px] text-[11px] text-[var(--ink-soft)]" title={fr.supplies.formed}>
            <SupplyPictos supplies={pileSupplies([{ role, supplies: fullSupplies(role) }])} />
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-[9px]">
        {sheet.kind === 'combat' ? (
          <div className="text-[12.5px] leading-[1.5]">
            <div>
              <span className="text-[var(--ink-soft)]">{fr.production.strongAgainst} </span>
              <span className="text-[var(--ink)]">{sheet.strongAgainst.join(', ')}</span>
            </div>
            <div>
              <span className="text-[var(--ink-soft)]">{fr.production.weakAgainst} </span>
              <span className="text-[var(--ink)]">{sheet.weakAgainst.join(', ')}</span>
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] leading-[1.5] text-[var(--ink-soft)] italic">
            {sheet.contribution} {fr.production.supportNote}
          </p>
        )}
      </div>

      {/* Derrière sa carte, la carte reste et le bouton s'en va : la phrase est dans le corps. */}
      {onEnqueue !== null && lockedBy === null && (
        <div className="px-4 pt-3 pb-[14px]">
          <button
            type="button"
            onClick={onEnqueue}
            title={fr.production.enqueueTitle(roleLabel(role, 1), tierLabel(tier), siteName)}
            className="w-full cursor-pointer border border-[var(--ink)] py-[8px] text-[10.5px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.production.enqueue}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * **Un lot commencé ne porte plus de bouton, il porte la phrase.** Il était grisé, et un bouton
 * grisé se lit « pas encore » : celui-là ne reviendra jamais — la matière est prise et le temps
 * a commencé de courir. Dire la règle à sa place est la seule lecture honnête (ADR 0015).
 */
function QueueRow({
  batch,
  nation,
  loadedAt,
  now,
  onCancel,
}: {
  batch: Batch;
  nation: string;
  loadedAt: number;
  now: number;
  onCancel: (() => void) | null;
}) {
  return (
    /* Une ligne de file est une cible sous le doigt, annulation comprise : 44 px au moins sous
       le seuil (lot mobile-3, §4), la même mesure que le reste de la fenêtre. */
    <div className="flex items-center gap-[10px] border-b border-(color:--ink)/16 px-4 py-[8px] max-md:min-h-[44px]">
      <UnitSprite
        nation={nation}
        role={batch.role}
        tier={batch.tier === 2 ? 2 : 1}
        height={26}
        width={38}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-[var(--ink)]">
          {roleLabel(batch.role, 1)}{' '}
          <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {tierLabel(batch.tier === 2 ? 2 : 1)} — {batch.strength} {fr.strengthUnits[batch.role]}
          </span>
        </div>
        <div className="text-[10px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
          {batch.started ? fr.production.inChain : fr.production.pending}
        </div>
        {batch.started && (
          <div className="text-[11px] leading-[1.4] text-[var(--ink-quiet)] italic">
            {fr.production.cancelStarted}
          </div>
        )}
      </div>
      <span className="shrink-0 font-(family-name:--font-mono) text-[12.5px] text-[var(--ink)]">
        {asDuration(currentMinutes(batch.minutesLeft, loadedAt, now))}
      </span>
      {onCancel !== null && !batch.started && (
        <button
          type="button"
          onClick={onCancel}
          title={fr.production.cancelRefund}
          className="shrink-0 cursor-pointer border border-[var(--ink)] px-[7px] py-[3px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
        >
          {fr.production.cancel}
        </button>
      )}
    </div>
  );
}
