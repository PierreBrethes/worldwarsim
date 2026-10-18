import { useMutation } from 'convex/react';
import { useState, type ReactNode } from 'react';
import { api } from '../../../convex/_generated/api';
import { REST_WINDOW_MINUTES } from '../../../convex/constants';
import { aBuilding, fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { Gauge } from '@/shell/Gauge';
import { PRODUCER_OF } from '@/domain/economy';
import { asDayAndTime, asDuration } from '@/domain/duration';
import type { ChainView } from '@/domain/player-view';
import { lotFinishesAt } from '@/domain/player-view';
import type { Seat } from '@/data/session';

/**
 * **A chain that eats a matter spent elsewhere waits to be told how much.** The arsenal turned
 * steel into ammunition three an hour per level, forever, with no way to stop it: a player
 * saving 430 steel for a carrier lost 216 a day to it, and no screen ever said so. The lot
 * fixes it without adding a knob — exactly this many units, once, then silence.
 *
 * **There is deliberately no rate control.** The rate belongs to the building's level; a slider
 * on it would only ever let a player slow his own works down. The quantity is the decision, and
 * the duration is the answer he is actually after: it says whether the lot covers a night.
 */
export function LotControl({
  chain,
  seat,
  loadedAt,
  now,
  observing,
}: {
  chain: ChainView;
  seat: Seat;
  loadedAt: number;
  now: number;
  /** Le lot en cours se lit jusqu'à sa livraison — il court tout seul —, il ne s'annule plus et
   *  il ne s'en commande plus d'autre : le serveur refuse déjà les deux (`requirePlayable`). */
  observing: boolean;
}) {
  const place = useMutation(api.industry.order);
  const drop = useMutation(api.industry.cancelOrder);
  const [error, setError] = useState<string | null>(null);
  const [sizing, setSizing] = useState(false);
  const [asked, setAsked] = useState<number | null>(null);

  const input = chain.inputs[0];
  if (input === undefined) return null;

  const { order, maxOrder } = chain;
  const running = order !== null && order.produced < order.ordered;
  const delivered = order !== null && order.produced >= order.ordered;
  const inputLabel = fr.resources[input.resource];
  const outputLabel = fr.resources[chain.output];

  // Half the reserve is a lot a player can place without arithmetic, and leaves him the other
  // half for his buildings — the point of commanding the chain in the first place.
  const wanted = Math.max(0, Math.min(asked ?? Math.floor(maxOrder / 2), maxOrder));
  const hours = chain.nominalPerHour > 0 ? wanted / chain.nominalPerHour : 0;
  const coversNight = hours * 60 >= REST_WINDOW_MINUTES;

  const finishesAt = lotFinishesAt(chain, loadedAt);

  const send = (action: Promise<unknown>) => {
    setError(null);
    void action
      .then(() => setSizing(false))
      .catch((problem: unknown) => handleError(problem, setError));
  };

  return (
    <div className="shrink-0 border-y border-(color:--ink)/28 bg-(--ink)/[.035] px-4 py-[10px]">
      <p className="mb-[6px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.buildings[chain.by]} — {fr.economy.lot.commandsItself}
      </p>
      {running ? (
        <>
          <Gauge filled={order.produced / order.ordered} height={12} />
          <div className="mt-[7px] flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
            <span className="text-[var(--ink)]">
              {fr.economy.lot.progress(order.produced, order.ordered, outputLabel)}
            </span>
            <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
              {finishesAt === null
                ? fr.economy.lot.remainingUnknown
                : fr.economy.lot.remaining(asDuration((finishesAt - now) / 60_000))}
            </span>
            {finishesAt !== null && (
              <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
                {fr.economy.lot.endsAt(asDayAndTime(finishesAt))}
              </span>
            )}
            {!observing && (
              <button
                type="button"
                onClick={() => send(drop({ ...seat, chain: chain.by }))}
                className="ml-auto cursor-pointer border border-[var(--critical)] px-[11px] py-[5px] text-[9px] tracking-[.16em] text-[var(--critical)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
              >
                {fr.economy.lot.cancel}
              </button>
            )}
          </div>
          {!observing && (
            <p className="mt-[6px] max-w-[80ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.economy.lot.cancelNote}
            </p>
          )}
        </>
      ) : sizing ? (
        <>
          <input
            type="range"
            min={0}
            max={Math.max(1, maxOrder)}
            step={1}
            value={wanted}
            disabled={maxOrder <= 0}
            onChange={(event) => setAsked(Number(event.target.value))}
            className="w-full cursor-pointer accent-[var(--ink)]"
          />
          <div className="mt-[6px] flex flex-wrap items-baseline gap-x-3">
            <span className="font-(family-name:--font-display) text-[28px] leading-none font-extrabold text-[var(--ink)]">
              {wanted}
            </span>
            <span className="text-[12.5px] text-[var(--ink-soft)]">{outputLabel}</span>
            <span className="ml-auto text-[11.5px] text-[var(--ink-soft)]">
              {fr.economy.lot.maxOf(maxOrder, inputLabel)}
            </span>
          </div>

          <div className="mt-[10px] flex flex-wrap items-stretch border-y border-[var(--ink)]">
            <Reading label={fr.economy.lot.costs}>
              {fr.economy.lot.costOf(wanted * input.quantity, inputLabel)}
            </Reading>
            <Reading label={fr.economy.lot.duration}>{asDuration(hours * 60)}</Reading>
            <Reading label={fr.economy.lot.ends}>
              {wanted === 0 ? fr.common.dash : asDayAndTime(now + hours * 3_600_000)}
            </Reading>
            <Reading
              label={fr.economy.lot.coversNight}
              ink={coversNight ? 'var(--ink)' : 'var(--critical)'}
            >
              {wanted === 0
                ? fr.economy.lot.coversNone
                : coversNight
                  ? fr.economy.lot.coversYes
                  : fr.economy.lot.coversNo(asDuration(hours * 60))}
            </Reading>
          </div>

          <div className="mt-[10px] flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={wanted <= 0}
              onClick={() => send(place({ ...seat, chain: chain.by, quantity: wanted }))}
              className="cursor-pointer bg-[var(--ink)] px-[15px] py-[8px] text-[9px] tracking-[.18em] text-[var(--paper)] uppercase disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fr.economy.lot.launch}
            </button>
            <button
              type="button"
              onClick={() => setSizing(false)}
              className="cursor-pointer border border-[var(--ink)] px-[11px] py-[6px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.economy.lot.close}
            </button>
            <span className="max-w-[52ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.economy.lot.once}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {delivered && (
            <>
              <span className="border border-[var(--ink)] px-[7px] py-[2px] text-[10px] tracking-[.14em] text-[var(--ink)] uppercase">
                {fr.economy.lot.done}
              </span>
              <span className="text-[12.5px] font-semibold text-[var(--ink)]">
                {fr.economy.lot.delivered(order.ordered, outputLabel)}
              </span>
            </>
          )}
          {/* Les deux repos sont exclusifs : une réserve vide nomme son goulot et ne porte
              aucun bouton — offrir « commander un lot » là où le serveur refuserait serait la
              seule promesse fausse de la fenêtre. */}
          {maxOrder <= 0 ? (
            <>
              <span className="text-[12px] text-[var(--critical)]">
                {fr.economy.lot.impossible(inputLabel)}
              </span>
              <span className="ml-auto max-w-[52ch] text-right text-[11px] leading-[1.45] text-[var(--critical)]">
                {fr.economy.lot.bottleneck(aBuilding(PRODUCER_OF[input.resource]), inputLabel)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[12px] text-[var(--ink-soft)]">
                {delivered
                  ? fr.economy.lot.doneNote(fr.buildings[chain.by], inputLabel)
                  : fr.economy.lot.keepsAvailable(inputLabel)}
              </span>
              {!observing && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSizing(true);
                  }}
                  className="ml-auto cursor-pointer bg-[var(--ink)] px-[15px] py-[8px] text-[9px] tracking-[.18em] text-[var(--paper)] uppercase"
                >
                  {fr.economy.lot.order}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {error !== null && <p className="mt-[6px] text-[11.5px] text-[var(--critical)]">{error}</p>}
    </div>
  );
}

/** One cell of the lot's readout — the four figures the player weighs before committing. */
function Reading({
  label,
  ink = 'var(--ink)',
  children,
}: {
  label: string;
  ink?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-[110px] flex-1 border-l border-(color:--ink)/30 py-[9px] pl-3 first:border-l-0 first:pl-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-[3px] font-(family-name:--font-mono) text-[14px]" style={{ color: ink }}>
        {children}
      </div>
    </div>
  );
}
