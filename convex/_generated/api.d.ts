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
import type * as errors from "../errors.js";
import type * as players from "../players.js";
import type * as resources from "../resources.js";
import type * as seasons from "../seasons.js";
import type * as units from "../units.js";
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
  errors: typeof errors;
  players: typeof players;
  resources: typeof resources;
  seasons: typeof seasons;
  units: typeof units;
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
