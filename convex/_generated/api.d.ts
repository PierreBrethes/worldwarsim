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
import type * as blitz from "../blitz.js";
import type * as buildingReads from "../buildingReads.js";
import type * as buildings from "../buildings.js";
import type * as captures from "../captures.js";
import type * as cargo from "../cargo.js";
import type * as combat from "../combat.js";
import type * as constants from "../constants.js";
import type * as constructions from "../constructions.js";
import type * as control from "../control.js";
import type * as crateStock from "../crateStock.js";
import type * as dev from "../dev.js";
import type * as errors from "../errors.js";
import type * as holding from "../holding.js";
import type * as industry from "../industry.js";
import type * as journal from "../journal.js";
import type * as lootCollections from "../lootCollections.js";
import type * as listening from "../listening.js";
import type * as lootCrates from "../lootCrates.js";
import type * as lootRumors from "../lootRumors.js";
import type * as messages from "../messages.js";
import type * as movement_arrival from "../movement/arrival.js";
import type * as movement_bombard from "../movement/bombard.js";
import type * as movement_cargoReturn from "../movement/cargoReturn.js";
import type * as movement_detection from "../movement/detection.js";
import type * as movement_forces from "../movement/forces.js";
import type * as movement_orders from "../movement/orders.js";
import type * as movement_pace from "../movement/pace.js";
import type * as movement_pursuit from "../movement/pursuit.js";
import type * as movement_rest from "../movement/rest.js";
import type * as movement_theatre from "../movement/theatre.js";
import type * as movements from "../movements.js";
import type * as notifications from "../notifications.js";
import type * as objectives from "../objectives.js";
import type * as outposts from "../outposts.js";
import type * as passwords from "../passwords.js";
import type * as placeNames from "../placeNames.js";
import type * as players from "../players.js";
import type * as plunder from "../plunder.js";
import type * as press from "../press.js";
import type * as production from "../production.js";
import type * as pushSend from "../pushSend.js";
import type * as race from "../race.js";
import type * as readMarks from "../readMarks.js";
import type * as regionGeometry from "../regionGeometry.js";
import type * as regions from "../regions.js";
import type * as replay from "../replay.js";
import type * as resources from "../resources.js";
import type * as routes from "../routes.js";
import type * as seasonReport from "../seasonReport.js";
import type * as seasons from "../seasons.js";
import type * as seats from "../seats.js";
import type * as sessions from "../sessions.js";
import type * as sites from "../sites.js";
import type * as strategicPoints from "../strategicPoints.js";
import type * as surveys from "../surveys.js";
import type * as troops from "../troops.js";
import type * as upkeep from "../upkeep.js";
import type * as validators from "../validators.js";
import type * as view from "../view.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auth: typeof auth;
  blitz: typeof blitz;
  buildingReads: typeof buildingReads;
  buildings: typeof buildings;
  captures: typeof captures;
  cargo: typeof cargo;
  combat: typeof combat;
  constants: typeof constants;
  constructions: typeof constructions;
  control: typeof control;
  crateStock: typeof crateStock;
  dev: typeof dev;
  errors: typeof errors;
  holding: typeof holding;
  industry: typeof industry;
  journal: typeof journal;
  lootCollections: typeof lootCollections;
  listening: typeof listening;
  lootCrates: typeof lootCrates;
  lootRumors: typeof lootRumors;
  messages: typeof messages;
  "movement/arrival": typeof movement_arrival;
  "movement/bombard": typeof movement_bombard;
  "movement/cargoReturn": typeof movement_cargoReturn;
  "movement/detection": typeof movement_detection;
  "movement/forces": typeof movement_forces;
  "movement/orders": typeof movement_orders;
  "movement/pace": typeof movement_pace;
  "movement/pursuit": typeof movement_pursuit;
  "movement/rest": typeof movement_rest;
  "movement/theatre": typeof movement_theatre;
  movements: typeof movements;
  notifications: typeof notifications;
  objectives: typeof objectives;
  outposts: typeof outposts;
  passwords: typeof passwords;
  placeNames: typeof placeNames;
  players: typeof players;
  plunder: typeof plunder;
  press: typeof press;
  production: typeof production;
  pushSend: typeof pushSend;
  race: typeof race;
  readMarks: typeof readMarks;
  regionGeometry: typeof regionGeometry;
  regions: typeof regions;
  replay: typeof replay;
  resources: typeof resources;
  routes: typeof routes;
  seasonReport: typeof seasonReport;
  seasons: typeof seasons;
  seats: typeof seats;
  sessions: typeof sessions;
  sites: typeof sites;
  strategicPoints: typeof strategicPoints;
  surveys: typeof surveys;
  troops: typeof troops;
  upkeep: typeof upkeep;
  validators: typeof validators;
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
