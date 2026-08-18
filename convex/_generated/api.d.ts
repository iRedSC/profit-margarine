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
import type * as amazon_client from "../amazon/client.js";
import type * as amazon_finance from "../amazon/finance.js";
import type * as amazon_processOrder from "../amazon/processOrder.js";
import type * as amazon_sync from "../amazon/sync.js";
import type * as auth from "../auth.js";
import type * as ebay from "../ebay.js";
import type * as ebay_processOrder from "../ebay/processOrder.js";
import type * as ebay_sync from "../ebay/sync.js";
import type * as ebay_transactions from "../ebay/transactions.js";
import type * as ebayMutations from "../ebayMutations.js";
import type * as ebayOAuth from "../ebayOAuth.js";
import type * as ebayRoutes from "../ebayRoutes.js";
import type * as http from "../http.js";
import type * as importCosts from "../importCosts.js";
import type * as importData from "../importData.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_marketplace from "../lib/marketplace.js";
import type * as lib_oauthHttp from "../lib/oauthHttp.js";
import type * as lib_orderCosts from "../lib/orderCosts.js";
import type * as lib_validators from "../lib/validators.js";
import type * as marketplaceConnections from "../marketplaceConnections.js";
import type * as marketplaceUtils from "../marketplaceUtils.js";
import type * as migrations from "../migrations.js";
import type * as productResync from "../productResync.js";
import type * as products from "../products.js";
import type * as products_mutations from "../products/mutations.js";
import type * as products_queries from "../products/queries.js";
import type * as products_resync from "../products/resync.js";
import type * as products_sync from "../products/sync.js";
import type * as router from "../router.js";
import type * as shopify from "../shopify.js";
import type * as shopify_graphql from "../shopify/graphql.js";
import type * as shopify_orderProcessing from "../shopify/orderProcessing.js";
import type * as shopify_shopifyql from "../shopify/shopifyql.js";
import type * as shopify_sync from "../shopify/sync.js";
import type * as shopifyMutations from "../shopifyMutations.js";
import type * as shopifyOAuth from "../shopifyOAuth.js";
import type * as syncMessages from "../syncMessages.js";
import type * as tiktok from "../tiktok.js";
import type * as tiktok_client from "../tiktok/client.js";
import type * as tiktok_finance from "../tiktok/finance.js";
import type * as tiktok_processOrder from "../tiktok/processOrder.js";
import type * as tiktok_region from "../tiktok/region.js";
import type * as tiktok_sign from "../tiktok/sign.js";
import type * as tiktok_sync from "../tiktok/sync.js";
import type * as tiktok_token from "../tiktok/token.js";
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
  "amazon/client": typeof amazon_client;
  "amazon/finance": typeof amazon_finance;
  "amazon/processOrder": typeof amazon_processOrder;
  "amazon/sync": typeof amazon_sync;
  auth: typeof auth;
  ebay: typeof ebay;
  "ebay/processOrder": typeof ebay_processOrder;
  "ebay/sync": typeof ebay_sync;
  "ebay/transactions": typeof ebay_transactions;
  ebayMutations: typeof ebayMutations;
  ebayOAuth: typeof ebayOAuth;
  ebayRoutes: typeof ebayRoutes;
  http: typeof http;
  importCosts: typeof importCosts;
  importData: typeof importData;
  "lib/auth": typeof lib_auth;
  "lib/marketplace": typeof lib_marketplace;
  "lib/oauthHttp": typeof lib_oauthHttp;
  "lib/orderCosts": typeof lib_orderCosts;
  "lib/validators": typeof lib_validators;
  marketplaceConnections: typeof marketplaceConnections;
  marketplaceUtils: typeof marketplaceUtils;
  migrations: typeof migrations;
  productResync: typeof productResync;
  products: typeof products;
  "products/mutations": typeof products_mutations;
  "products/queries": typeof products_queries;
  "products/resync": typeof products_resync;
  "products/sync": typeof products_sync;
  router: typeof router;
  shopify: typeof shopify;
  "shopify/graphql": typeof shopify_graphql;
  "shopify/orderProcessing": typeof shopify_orderProcessing;
  "shopify/shopifyql": typeof shopify_shopifyql;
  "shopify/sync": typeof shopify_sync;
  shopifyMutations: typeof shopifyMutations;
  shopifyOAuth: typeof shopifyOAuth;
  syncMessages: typeof syncMessages;
  tiktok: typeof tiktok;
  "tiktok/client": typeof tiktok_client;
  "tiktok/finance": typeof tiktok_finance;
  "tiktok/processOrder": typeof tiktok_processOrder;
  "tiktok/region": typeof tiktok_region;
  "tiktok/sign": typeof tiktok_sign;
  "tiktok/sync": typeof tiktok_sync;
  "tiktok/token": typeof tiktok_token;
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
