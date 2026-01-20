/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as amazon from "../amazon.js";
import type * as auth from "../auth.js";
import type * as ebay from "../ebay.js";
import type * as ebayMutations from "../ebayMutations.js";
import type * as ebayOAuth from "../ebayOAuth.js";
import type * as ebayRouter from "../ebayRouter.js";
import type * as ebayRoutes from "../ebayRoutes.js";
import type * as http from "../http.js";
import type * as importCosts from "../importCosts.js";
import type * as marketplaceConnections from "../marketplaceConnections.js";
import type * as marketplaceUtils from "../marketplaceUtils.js";
import type * as productResync from "../productResync.js";
import type * as products from "../products.js";
import type * as products_mutations from "../products/mutations.js";
import type * as products_queries from "../products/queries.js";
import type * as products_resync from "../products/resync.js";
import type * as products_sync from "../products/sync.js";
import type * as router from "../router.js";
import type * as shopify from "../shopify.js";
import type * as shopifyMutations from "../shopifyMutations.js";
import type * as shopifyOAuth from "../shopifyOAuth.js";
import type * as shopifyRouter from "../shopifyRouter.js";
import type * as shopify_graphql from "../shopify/graphql.js";
import type * as shopify_orderProcessing from "../shopify/orderProcessing.js";
import type * as shopify_shipping from "../shopify/shipping.js";
import type * as shopify_sync from "../shopify/sync.js";
import type * as syncMessages from "../syncMessages.js";
import type * as tiktokMutations from "../tiktokMutations.js";
import type * as tiktokOAuth from "../tiktokOAuth.js";
import type * as tiktokRoutes from "../tiktokRoutes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  amazon: typeof amazon;
  auth: typeof auth;
  ebay: typeof ebay;
  ebayMutations: typeof ebayMutations;
  ebayOAuth: typeof ebayOAuth;
  ebayRouter: typeof ebayRouter;
  ebayRoutes: typeof ebayRoutes;
  http: typeof http;
  importCosts: typeof importCosts;
  marketplaceConnections: typeof marketplaceConnections;
  marketplaceUtils: typeof marketplaceUtils;
  productResync: typeof productResync;
  products: typeof products;
  "products/mutations": typeof products_mutations;
  "products/queries": typeof products_queries;
  "products/resync": typeof products_resync;
  "products/sync": typeof products_sync;
  router: typeof router;
  shopify: typeof shopify;
  shopifyMutations: typeof shopifyMutations;
  shopifyOAuth: typeof shopifyOAuth;
  shopifyRouter: typeof shopifyRouter;
  "shopify/graphql": typeof shopify_graphql;
  "shopify/orderProcessing": typeof shopify_orderProcessing;
  "shopify/shipping": typeof shopify_shipping;
  "shopify/sync": typeof shopify_sync;
  syncMessages: typeof syncMessages;
  tiktokMutations: typeof tiktokMutations;
  tiktokOAuth: typeof tiktokOAuth;
  tiktokRoutes: typeof tiktokRoutes;
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
