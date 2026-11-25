import type { FunctionArgs, FunctionReference } from 'convex/server';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BotOrder } from '../src/domain/bot';

/**
 * **La seule table d'un ordre de bot vers sa mutation publique** (ADR 0042 §1, #704) : le pilote
 * Node (`scripts/bots-mondiale.mjs`, `ConvexHttpClient`), le banc (`convex-test`) et le serveur
 * (`convex/botTurns.ts`, `ctx.runMutation`) la lisent tous, chacun avec sa façon d'appeler une
 * mutation. Elle ne nomme que `api.*` : un bot passe toujours par `playerOf` puis
 * `requirePlayable`, avec son jeton. Les ids de la vue sont des `string` : le serveur les valide.
 */
export type CallMutation = (
  mutation: FunctionReference<'mutation'>,
  args: Record<string, unknown>,
) => Promise<unknown>;

export type BotSeat = { readonly token: string; readonly seasonId: Id<'seasons'> };

export function submitBotOrder(
  call: CallMutation,
  seat: BotSeat,
  order: BotOrder,
): Promise<unknown> {
  const run = <M extends FunctionReference<'mutation'>>(mutation: M, args: FunctionArgs<M>) =>
    call(mutation, args as Record<string, unknown>);
  const ids = (list: ReadonlyArray<string>) => list as Array<Id<'troops'>>;
  switch (order.fn) {
    case 'constructions.start':
      return run(api.constructions.start, { ...seat, ...order.args });
    case 'constructions.raiseOutpost':
      return run(api.constructions.raiseOutpost, {
        ...seat,
        ...order.args,
        outpostId: order.args.outpostId as Id<'outposts'>,
      });
    case 'troops.recruit':
      return run(api.troops.recruit, {
        ...seat,
        ...order.args,
        buildingId: order.args.buildingId as Id<'buildings'>,
      });
    case 'movements.attack':
      return run(api.movements.attack, {
        ...seat,
        origin: originOf(order.args.origin),
        troopIds: ids(order.args.troopIds),
        target: { kind: 'camp', campId: order.args.target.campId as Id<'campSightings'> },
      });
    case 'movements.capture':
      return run(api.movements.capture, {
        ...seat,
        origin: originOf(order.args.origin),
        troopIds: ids(order.args.troopIds),
        target: { kind: 'point', pointId: order.args.target.pointId as Id<'strategicPoints'> },
      });
    case 'movements.marchTo':
      return run(api.movements.marchTo, {
        ...seat,
        origin: originOf(order.args.origin),
        troopIds: ids(order.args.troopIds),
        point: order.args.point,
      });
    case 'movements.enterGarrison':
      return run(api.movements.enterGarrison, {
        ...seat,
        origin: originOf(order.args.origin),
        troopIds: ids(order.args.troopIds),
        buildingId: order.args.buildingId as Id<'buildings'>,
      });
    case 'movements.foundOutpostHere':
      return run(api.movements.foundOutpostHere, {
        ...seat,
        ...order.args,
        troopIds: ids(order.args.troopIds),
      });
    case 'logistics.load':
      return run(api.logistics.load, {
        ...seat,
        ...order.args,
        troopId: order.args.troopId as Id<'troops'>,
      });
    case 'movements.board':
      return run(api.movements.board, {
        ...seat,
        troopIds: ids(order.args.troopIds),
        carrierId: order.args.carrierId as Id<'troops'>,
      });
    case 'movements.disembark':
      return run(api.movements.disembark, { ...seat, troopIds: ids(order.args.troopIds) });
    case 'tours.recall':
      return run(api.tours.recall, {
        ...seat,
        troopId: order.args.troopId as Id<'troops'>,
      });
    case 'tours.start':
      return run(api.tours.start, {
        ...seat,
        troopId: order.args.troopId as Id<'troops'>,
        stops: order.args.stops.map((stop) =>
          typeof stop === 'string'
            ? (stop as Id<'outposts'>)
            : { kind: 'site' as const, id: stop.id as Id<'buildings'> },
        ),
      });
  }
}

const originOf = (origin: Extract<BotOrder, { fn: 'movements.marchTo' }>['args']['origin']) =>
  origin.kind === 'building'
    ? { kind: 'building' as const, buildingId: origin.buildingId as Id<'buildings'> }
    : origin;
