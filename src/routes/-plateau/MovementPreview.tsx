import { useMutation } from 'convex/react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import { asClockTime, asDuration, asLocalTime } from '@/domain/duration';
import type { MovementType } from '@/domain/ids';
import type { MovementAim } from '@/domain/movement-orders';
import { pathLengthKm, type LonLat } from '@/domain/geo';
import { landPaceOf, routeMedium } from '@/domain/routing';
import type { MarchStation } from '@/domain/troops';
import { handleError } from '@/data/errors';
import { placeLabel } from '@/domain/station-name';
import { BottomSheet } from '@/shell/BottomSheet';
import { useNarrowScreen } from '@/shell/viewport';
import type {
  CapturePreviewed,
  LootCollectionPreviewed,
  MovementPreviewed,
  PlunderPreviewed,
} from '@/data/serverView';
import { GARRISON_DAMAGE_TAKEN } from '../../../convex/constants';
import { ResourceAmounts } from './CargoReadout';
import type { Seat } from '@/data/session';

/**
 * **Une seule carte de confirmation pour trois missions.** Les trois aperçus du serveur portent
 * la même route et les mêmes heures ; ce qui les sépare — le relais, la reconnaissance, la
 * charge, la présence sur site — se lit là où il existe et se tait ailleurs, plutôt que d'ouvrir
 * une seconde carte qui redirait le reste mot pour mot.
 */
export type Previewed =
  MovementPreviewed | PlunderPreviewed | CapturePreviewed | LootCollectionPreviewed;

/** Ce que le fil demande à cet envoi-ci — la mutation, jamais un champ de plus sur `march`. */
export type PreviewMission =
  | { readonly kind: 'march' }
  | { readonly kind: 'plunder'; readonly buildingId: string }
  | {
      readonly kind: 'capture';
      readonly target: { readonly kind: 'building' | 'outpost'; readonly id: string };
    }
  | { readonly kind: 'collect'; readonly sightingId: string };

/**
 * **Un ordre que la carte a déjà décidé**, en attente de l'envoi. Trois missions et pas une de
 * plus : la marche ordinaire, l'expédition sur un site relevé, le ramassage d'une caisse relevée.
 * Le libellé et la conséquence sont ceux de la branche de la rose qui le portait — la feuille du
 * téléphone, qui les offre côte à côte, ne les réécrit pas.
 */
export type OrderChoice = {
  readonly aim: MovementAim;
  readonly type: MovementType;
  readonly label: string;
  readonly consequence: string;
  readonly mission: PreviewMission;
};

/** Ce qu'un envoi laisse derrière lui : de quoi suivre la colonne, dire où elle va et quand. */
export type Sent = {
  readonly movementId: string;
  readonly arrivesAt: number;
  readonly destination: string;
};

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
        : /** **Le camp voyage par son relevé, jamais par son point** (ADR 0024 §4) : c'est le
           *  serveur qui le résout en position, sur la ligne que ce joueur-là possède. */
          aim.kind === 'camp'
          ? ({ kind: 'camp', campId: aim.campId as Id<'campSightings'> } as const)
          : /** **Une colonne en vue** (Blitz) voyage par son relevé : le serveur la poursuit. */
            aim.kind === 'track'
            ? ({ kind: 'sighting', sightingId: aim.sightingId as Id<'sightings'> } as const)
          : /** **L'objectif voyage par son identité** : il est public, donc le serveur le lit dans
             *  la vérité du plateau — et c'est ce qui grave `movements.objectiveId`, sans quoi la
             *  colonne arriverait sans que rien dise ce qu'elle est venue prendre. */
            aim.kind === 'objective'
            ? ({ kind: 'objective', objectiveId: aim.objectiveId as Id<'objectives'> } as const)
            : ({ kind: 'point', point: { lon: aim.lon, lat: aim.lat } } as const);

export const wireCaptureTarget = (target: {
  readonly kind: 'building' | 'outpost';
  readonly id: string;
}) =>
  target.kind === 'building'
    ? ({ kind: 'building', buildingId: target.id as Id<'buildings'> } as const)
    : ({ kind: 'outpost', outpostId: target.id as Id<'outposts'> } as const);

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
  strength,
  choice,
  choices,
  onChoose,
  at,
  preview,
  slots,
  originName,
  onClose,
  onSent,
}: {
  seat: Seat;
  origin: MarchStation;
  troopIds: ReadonlyArray<string>;
  /** L'effectif de la pile, que la feuille du téléphone imprime avec la route. */
  strength: number;
  choice: OrderChoice;
  /** Tout ce que la cible accepte de cette pile ; un seul au bureau, où la rose a déjà choisi. */
  choices: ReadonlyArray<OrderChoice>;
  onChoose: (choice: OrderChoice) => void;
  at: { x: number; y: number };
  /** `undefined` while the route is being computed, `null` when nothing gets there. */
  preview: Previewed | undefined;
  /** `null` en Blitz : il n'y a pas de slots (B5). */
  slots: { readonly used: number; readonly total: number } | null;
  /** Le lieu d'où la pile part, en toutes lettres — l'en-tête de la feuille d'ordre. */
  originName: string;
  onClose: () => void;
  onSent: (sent: Sent) => void;
}) {
  const narrow = useNarrowScreen();
  const freeSlots = slots === null ? Infinity : slots.total - slots.used;
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const marchTo = useMutation(api.movements.marchTo);
  const enterGarrison = useMutation(api.movements.enterGarrison);
  const enterOutpost = useMutation(api.movements.enterOutpost);
  const attack = useMutation(api.movements.attack);
  const raid = useMutation(api.movements.raid);
  const plunder = useMutation(api.movements.plunder);
  const capture = useMutation(api.movements.capture);
  const collectLoot = useMutation(api.movements.collectLoot);
  const { aim, type, mission } = choice;

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
      mission.kind === 'capture'
        ? capture({
            ...seat,
            origin: from,
            troopIds: ids,
            target: wireCaptureTarget(mission.target),
          })
        : mission.kind === 'plunder'
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
                : /** **Une marche sur un avant-poste ne vise que le sien** (décision du 16/09) :
                   *  `refusalOf` le garantit, et la colonne y devient garnison à l'arrivée. */
                  type === 'march' && aim.kind === 'outpost'
                  ? enterOutpost({
                      ...seat,
                      origin: from,
                      troopIds: ids,
                      outpostId: aim.outpostId as Id<'outposts'>,
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

    order.then(
      ({ movementId, arrivesAt }) =>
        onSent({ movementId, arrivesAt, destination: destinationOf(aim, preview) }),
      (problem: unknown) => {
        setSending(false);
        handleError(problem, setError);
      },
    );
  };

  const cover = riposteCoverOf(choice);

  /** Ce qui explique une durée plutôt que de l'annoncer, et ce que le joueur ne sait pas : les
   *  deux cadres l'impriment sous leurs heures. */
  const notes = preview && (
    <>
      {/* **L'initiative, dite avant de payer** (B16) : qui frappe d'abord, et ce que les murs
          d'en face rendront — la seule chose que l'attaquant puisse savoir de la riposte. */}
      {cover !== null && (
        <div className="mt-[7px] border-t border-(color:--ink)/40 pt-[6px]">
          <div className="text-[10.5px] tracking-[.1em] text-[var(--ink-soft)] uppercase">
            {fr.aim.initiative}
          </div>
          <p className="mt-[2px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
            {fr.aim.cover[cover](GARRISON_DAMAGE_TAKEN)}
          </p>
        </div>
      )}
      {/* **Une poursuite** (Blitz, B18) : l'heure est celle d'une position, pas d'une prise. */}
      {'pursuit' in preview && preview.pursuit && (
        <div className="mt-[7px] border-t border-(color:--ink)/40 pt-[6px]">
          <div className="text-[10.5px] tracking-[.1em] text-[var(--ink-soft)] uppercase">
            {fr.aim.pursuit}
          </div>
          <p className="mt-[2px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
            {fr.aim.pursuitNote}
          </p>
        </div>
      )}
      {/* La seule ligne qui explique une durée plutôt que de l'annoncer : sans elle, le relais
          est un cadeau anonyme. */}
      {'relayed' in preview && preview.relayed > 0 && (
        <div className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7] text-[var(--valid)]">
          {fr.aim.relayed(asDuration(preview.relayed))}
        </div>
      )}
      {/* Ce que la pile peut ramener, et rien du stock d'en face : le relevé n'en porte aucun,
          et l'aperçu n'en invente pas (ADR 0005). */}
      {'cargo' in preview && (
        <div className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7]">
          {fr.loot.freeCapacity(Math.round(preview.cargo.free))}
        </div>
      )}
      {'captureMinutes' in preview && (
        <div className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7]">
          {fr.aim.capture(asDuration(preview.captureMinutes))}
        </div>
      )}
      {'presenceHours' in preview && (
        <div className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7]">
          {fr.aim.presence(asDuration(preview.presenceHours * 60))}
        </div>
      )}
      {preview.holdUntil !== null && (
        <div className="mt-[7px] flex items-center gap-[7px]">
          <span className="h-[5px] w-[5px] shrink-0" style={{ background: 'var(--critical)' }} />
          <span className="text-[10.5px] tracking-[.1em] text-[var(--critical)] uppercase">
            {fr.aim.restBite(asLocalTime(preview.holdUntil))}
          </span>
        </div>
      )}
      {/* What the player does not know, said before he pays for it (ADR 0019 §6). It is a
          statement about his own eyes, never about the ground — the note underneath is there so
          it cannot be read as a guarantee the other way round. */}
      {'estimatedLoot' in preview && (
        <div className="mt-[7px] border-t border-(color:--ink)/40 pt-[6px]">
          <div className="text-[10.5px] tracking-[.1em] text-[var(--ink-soft)] uppercase">
            {fr.aim.estimatedLoot}
          </div>
          <ResourceAmounts amounts={preview.estimatedLoot} />
        </div>
      )}
      {'recognised' in preview && !preview.recognised && (
        <div className="mt-[7px] border-t border-(color:--ink)/40 pt-[6px]">
          <div className="text-[10.5px] tracking-[.1em] text-[var(--notable)] uppercase">
            {fr.aim.unscouted}
          </div>
          <p className="mt-[2px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
            {fr.aim.unscoutedNote}
          </p>
        </div>
      )}
    </>
  );

  /** Ce que la route ne dit pas encore, ou ne dira pas : le calcul, l'absence de route, le refus. */
  const status = (
    <>
      {preview === undefined ? (
        <p className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          {fr.aim.computing}
        </p>
      ) : preview === null ? (
        <p className="text-[12.5px] leading-[1.45] text-[var(--critical)]">{fr.aim.noRoute}</p>
      ) : null}
      {error && (
        <p className="mt-[9px] border border-[var(--critical)] px-2 py-[5px] text-[11.5px] text-[var(--ink)]">
          {error}
        </p>
      )}
    </>
  );

  const blocked = !preview || sending || freeSlots <= 0;

  /**
   * **Sous le seuil, la feuille d'ordre** (refonte mobile, 1c) : la caméra cadre le départ et
   * l'arrivée au-dessus, la feuille dit où l'on va, ce que la cible accepte — chacun en onglet,
   * les seuls types que le serveur prendrait —, combien de temps et à quelle heure. **L'envoi se
   * tient appuyé** : rien d'irréversible en un toucher. Elle ne recalcule rien : la distance est
   * la longueur de la route que le serveur vient de servir.
   */
  if (narrow) {
    return (
      <BottomSheet
        title={fr.orderSheet.kicker}
        aside={
          slots !== null && (
            <span className="font-(family-name:--font-mono) text-[11px] whitespace-nowrap text-[var(--ink-quiet)]">
              {fr.compass.slotsCost(freeSlots)}
            </span>
          )
        }
        onClose={onClose}
        initial="peek"
        kicker
        hug
      >
        <div className="px-4 pt-[4px] text-[var(--ink)]">
          <h3 className="font-(family-name:--font-display) text-[25px] leading-[1.05] font-extrabold">
            {destinationOf(aim, preview)}
          </h3>
          <p className="mt-[3px] text-[13px] text-[var(--ink-soft)]">
            {fr.orderSheet.from(troopIds.length, originName)}
          </p>
          {choices.length > 1 && (
            <div
              role="radiogroup"
              className="mt-[11px] grid border border-[var(--ink)]"
              style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
            >
              {choices.map((option) => {
                const chosen = option.label === choice.label;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => onChoose(option)}
                    className={`min-h-[42px] cursor-pointer border-l border-[var(--ink)] px-1 text-[11px] font-semibold tracking-[.16em] uppercase first:border-l-0 ${
                      chosen ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-[8px] font-(family-name:--font-text) text-[13.5px] text-[var(--ink-quiet)] italic">
            {choice.consequence}
          </p>
          {preview && (
            <>
              <div className="mt-[10px] grid grid-cols-2 border-t border-b border-[var(--ink)] border-b-(color:--ink)/20">
                <Timing label={fr.orderSheet.duration}>{asDuration(preview.minutes)}</Timing>
                <Timing label={fr.orderSheet.arrival} ruled>
                  {asClockTime(preview.arrivesAt)}
                </Timing>
              </div>
              <p className="mt-[7px] text-[12.5px] text-[var(--ink-quiet)]">
                {fr.orderSheet.route(
                  legOf(preview.route),
                  Math.round(
                    pathLengthKm(preview.route.points.map((step): LonLat => [step.lon, step.lat])),
                  ),
                  troopIds.length,
                  strength,
                )}
              </p>
            </>
          )}
          <div className="mt-[6px]">
            {status}
            {notes}
            {slots !== null && freeSlots <= 0 && (
              <p className="mt-[6px] text-[12px] leading-[1.4] text-[var(--critical)]">
                {fr.errors.MOVEMENT_IN_FLIGHT({ maximum: slots.total })}
              </p>
            )}
          </div>
        </div>
        <div className="paper-grain sticky bottom-0 mt-[10px] flex gap-[8px] px-3 pt-[6px] pb-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[56px] w-[92px] shrink-0 cursor-pointer border border-[var(--ink)] text-[11px] font-semibold tracking-[.16em] uppercase"
          >
            {fr.aim.cancel}
          </button>
          {/* Changer d'ordre remonte le bouton : une tenue commencée sur l'ancien s'arrête là, au
              lieu de l'envoyer 700 ms plus tard. */}
          <HoldButton key={choice.label} disabled={blocked} onConfirm={send} />
        </div>
      </BottomSheet>
    );
  }

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    <div
      className="absolute z-[var(--z-popin)] w-[262px] max-w-full"
      style={{
        left: fromRight ? undefined : at.x + 18,
        right: fromRight ? `calc(100% - ${at.x - 18}px)` : undefined,
        top: fromBottom ? undefined : at.y + 18,
        bottom: fromBottom ? `calc(100% - ${at.y - 18}px)` : undefined,
      }}
    >
      <div className="float paper-grain border border-[var(--ink)] p-[3px]">
        <div className="border border-(color:--ink)/40 px-[11px] pt-[9px] pb-[11px] text-[var(--ink)]">
          {/* Wrapping rather than abbreviating: the cost says a whole sentence, and on a card
              262 px wide it does not always share a line with the kicker. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-[1px] text-[9px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
            <span>{fr.aim.previewKicker}</span>
            <span className="font-(family-name:--font-mono) tracking-[.06em]">{fr.aim.slot}</span>
          </div>
          <h3 className="mt-[3px] font-(family-name:--font-display) text-[18px] leading-[1.15] font-extrabold">
            {fr.aim.heading(destinationOf(aim, preview), choice.label)}
          </h3>
          <div className="my-[9px] h-px bg-[var(--ink)] opacity-55" />

          {status}
          {preview && (
            <div className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7]">
              {/* The medium is read off the **legs**, never off the route's mode: a pile with a
                  hull routes `combined` even when the road gets there dry, and the card would
                  then promise a crossing to the next region. */}
              <div>
                {fr.aim.duration(asDuration(preview.minutes), troopIds.length)} ·{' '}
                {legOf(preview.route)}
              </div>
              <div>{fr.aim.arrival(asLocalTime(preview.arrivesAt))}</div>
            </div>
          )}
          {notes}

          <button
            type="button"
            disabled={blocked}
            onClick={send}
            className="mt-[10px] w-full cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-[10px] py-[8px] text-[11px] tracking-[.18em] text-[var(--paper)] uppercase hover:border-[var(--critical)] hover:bg-[var(--critical)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {fr.aim.submit}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-[6px] w-full cursor-pointer border border-(color:--ink)/40 px-[10px] py-[5px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase hover:bg-(--ink)/7"
          >
            {fr.aim.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * **Ce que la cible rendra, lu sur ce qu'on vise et rien d'autre** : la protection tient
 * à une garnison (`convex/combat.ts`, `shelteredOf`). Un objectif est une garnison ; un point
 * n'en est une que debout et en service (`outpostShelters`), ce que le brouillard ne dit pas d'un
 * point adverse ; un camp relevé est une pile posée ; une région ou un site peuvent tenir l'un et
 * l'autre. `null` hors d'un ordre qui engage.
 */
function riposteCoverOf({
  aim,
  type,
  mission,
}: OrderChoice): 'sheltered' | 'open' | 'point' | 'either' | null {
  if (mission.kind === 'plunder') return 'either';
  if (type !== 'attack' && type !== 'raid') return null;
  if (aim.kind === 'objective') return 'sheltered';
  if (aim.kind === 'outpost') return 'point';
  if (aim.kind === 'camp') return 'open';
  return 'either';
}

function Timing({
  label,
  ruled = false,
  children,
}: {
  label: string;
  ruled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`py-[7px] ${ruled ? 'border-l border-(color:--ink)/20 pl-3' : ''}`}>
      <div className="text-[9.5px] tracking-[.16em] text-[var(--ink-soft)] uppercase">{label}</div>
      <div className="mt-1 font-(family-name:--font-mono) text-[16px] font-medium">{children}</div>
    </div>
  );
}

/** Ce que le doigt doit tenir pour qu'un ordre parte : assez pour qu'un toucher de passage ne
 *  l'envoie pas, assez peu pour ne pas se lire comme une panne (maquette 1c). */
const HOLD_MS = 700;

/** Ce que met la jauge à se vider quand le doigt lâche avant la fin : visible, pas traînant. */
const RELEASE_MS = 240;

/**
 * **Le seul bouton d'un geste irréversible** (refonte mobile, 1c) : il se remplit d'encre bleue
 * tant qu'on appuie, et l'ordre part au bout. Ce qui se rembourse — la file de chantier — ne
 * s'en sert pas : un toucher et « annuler ». La barre d'espace et Entrée le tiennent comme le
 * doigt, pour qui n'a pas d'écran tactile.
 */
function HoldButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  const reached = useRef(0);
  /** L'envoi lu au bout de la tenue, pas au toucher : l'aperçu a pu changer entre-temps. */
  const confirm = useRef(onConfirm);
  useEffect(() => {
    confirm.current = onConfirm;
  });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  /** Un bouton qui se ferme sous le doigt ne reçoit plus le relâcher : la tenue s'arrête ici,
   *  sinon elle irait au bout et enverrait un ordre que l'écran refuse déjà. */
  useEffect(() => {
    if (!disabled) return;
    cancelAnimationFrame(frame.current);
    reached.current = 0;
    setProgress(0);
  }, [disabled]);

  const show = (value: number) => {
    reached.current = value;
    setProgress(value);
  };

  const run = (filling: boolean) => {
    cancelAnimationFrame(frame.current);
    const start = performance.now();
    const from = reached.current;
    const step = (time: number) => {
      const elapsed = time - start;
      const next = filling
        ? Math.min(1, from + elapsed / HOLD_MS)
        : Math.max(0, from - elapsed / RELEASE_MS);
      /** Tenu jusqu'au bout, l'ordre part et la jauge se vide : c'est l'envoi en cours qui
       *  retient alors le bouton, et un refus le rend prêt à être tenu de nouveau. */
      if (filling && next >= 1) {
        show(0);
        confirm.current();
        return;
      }
      show(next);
      if (filling || next > 0) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  const press = () => {
    if (!disabled) run(true);
  };
  const release = () => {
    if (reached.current > 0) run(false);
  };
  const isHoldKey = (event: KeyboardEvent) => event.key === ' ' || event.key === 'Enter';

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(event) => {
        if (!isHoldKey(event) || event.repeat) return;
        event.preventDefault();
        press();
      }}
      onKeyUp={(event) => {
        if (isHoldKey(event)) release();
      }}
      onContextMenu={(event) => event.preventDefault()}
      className="relative min-h-[56px] flex-1 cursor-pointer overflow-hidden bg-[var(--ink)] text-[var(--paper)] select-none disabled:cursor-not-allowed disabled:opacity-45"
      style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-[var(--interaction)]"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative flex flex-col items-center gap-[5px]">
        <span className="text-[12px] leading-none font-bold tracking-[.16em] uppercase">
          {progress > 0 ? fr.orderSheet.holding : fr.orderSheet.hold}
        </span>
        <span className="text-[9.5px] leading-none tracking-[.14em] text-[var(--paper-dim-2)] uppercase">
          {fr.orderSheet.holdNote}
        </span>
      </span>
    </button>
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
  /** Un camp ou un objectif se nomme par la région sous lui, ou par son pays en mer. */
  const named = preview?.destinationName;
  return named === undefined ? '—' : placeLabel(named);
}
