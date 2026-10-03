/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as auth from "../auth.js";
import type * as buildings from "../buildings.js";
import type * as cargo from "../cargo.js";
import type * as combat from "../combat.js";
import type * as constants from "../constants.js";
import type * as constructions from "../constructions.js";
import type * as control from "../control.js";
import type * as dev from "../dev.js";
import type * as errors from "../errors.js";
import type * as holding from "../holding.js";
import type * as industry from "../industry.js";
import type * as journal from "../journal.js";
import type * as lootCollections from "../lootCollections.js";
import type * as lootCrates from "../lootCrates.js";
import type * as lootRumors from "../lootRumors.js";
import type * as messages from "../messages.js";
import type * as movement_arrival from "../movement/arrival.js";
import type * as movement_cargoReturn from "../movement/cargoReturn.js";
import type * as movement_detection from "../movement/detection.js";
import type * as movement_forces from "../movement/forces.js";
import type * as movement_orders from "../movement/orders.js";
import type * as movement_rest from "../movement/rest.js";
import type * as movements from "../movements.js";
import type * as notifications from "../notifications.js";
import type * as objectives from "../objectives.js";
import type * as outposts from "../outposts.js";
import type * as passwords from "../passwords.js";
import type * as players from "../players.js";
import type * as plunder from "../plunder.js";
import type * as press from "../press.js";
import type * as production from "../production.js";
import type * as pushSend from "../pushSend.js";
import type * as regionGeometry from "../regionGeometry.js";
import type * as regions from "../regions.js";
import type * as resources from "../resources.js";
import type * as routes from "../routes.js";
import type * as seasons from "../seasons.js";
import type * as sites from "../sites.js";
import type * as surveys from "../surveys.js";
import type * as troops from "../troops.js";
import type * as upkeep from "../upkeep.js";
import type * as validators from "../validators.js";
import type * as victory from "../victory.js";
import type * as view from "../view.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auth: typeof auth;
  buildings: typeof buildings;
  cargo: typeof cargo;
  combat: typeof combat;
  constants: typeof constants;
  constructions: typeof constructions;
  control: typeof control;
  dev: typeof dev;
  errors: typeof errors;
  holding: typeof holding;
  industry: typeof industry;
  journal: typeof journal;
  lootCollections: typeof lootCollections;
  lootCrates: typeof lootCrates;
  lootRumors: typeof lootRumors;
  messages: typeof messages;
  "movement/arrival": typeof movement_arrival;
  "movement/cargoReturn": typeof movement_cargoReturn;
  "movement/detection": typeof movement_detection;
  "movement/forces": typeof movement_forces;
  "movement/orders": typeof movement_orders;
  "movement/rest": typeof movement_rest;
  movements: typeof movements;
  notifications: typeof notifications;
  objectives: typeof objectives;
  outposts: typeof outposts;
  passwords: typeof passwords;
  players: typeof players;
  plunder: typeof plunder;
  press: typeof press;
  production: typeof production;
  pushSend: typeof pushSend;
  regionGeometry: typeof regionGeometry;
  regions: typeof regions;
  resources: typeof resources;
  routes: typeof routes;
  seasons: typeof seasons;
  sites: typeof sites;
  surveys: typeof surveys;
  troops: typeof troops;
  upkeep: typeof upkeep;
  validators: typeof validators;
  victory: typeof victory;
  view: typeof view;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
