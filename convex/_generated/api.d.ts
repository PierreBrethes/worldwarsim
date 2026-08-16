/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as buildings from "../buildings.js";
import type * as constants from "../constants.js";
import type * as constructions from "../constructions.js";
import type * as dev from "../dev.js";
import type * as errors from "../errors.js";
import type * as industry from "../industry.js";
import type * as players from "../players.js";
import type * as regions from "../regions.js";
import type * as resources from "../resources.js";
import type * as seasons from "../seasons.js";
import type * as troops from "../troops.js";
import type * as validators from "../validators.js";
import type * as view from "../view.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  buildings: typeof buildings;
  constants: typeof constants;
  constructions: typeof constructions;
  dev: typeof dev;
  errors: typeof errors;
  industry: typeof industry;
  players: typeof players;
  regions: typeof regions;
  resources: typeof resources;
  seasons: typeof seasons;
  troops: typeof troops;
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
