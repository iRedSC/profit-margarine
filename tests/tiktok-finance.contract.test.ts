import { describe, expect, it } from "vitest";
import {
  TIKTOK_ESTIMATED_FEE_LABEL,
  TIKTOK_ESTIMATED_FEE_RATE,
} from "../convex/lib/orderCosts";
import {
  allocateFinanceToUnits,
  parseOrderFinance,
  parseSignedAmount,
} from "../convex/tiktok/finance";
import {
  tokenExpiresAtMs,
  unwrapTokenPayload,
} from "../convex/tiktok/token";
import { signTiktokRequest } from "../convex/tiktok/sign";
import { isEstimatedFee } from "../src/lib/feeUtils";

const statementPayload = {
  code: 0,
  data: {
    currency: "VND",
    fee_and_tax_amount: "-32205",
    order_create_time: 1774685957,
    order_id: "583272927048795256",
    revenue_amount: "99000",
    settlement_amount: "66795",
    shipping_cost_amount: "0",
    sku_transactions: [
      {
        fee_tax_amount: "-32205",
        fee_tax_breakdown: {
          fee: {
            affiliate_commission_amount: "-9900",
            affiliate_commission_amount_before_pit: "-9900",
            platform_commission_amount: "-12870",
            referral_fee_amount: "0",
            transaction_fee_amount: "-4950",
            vn_fix_infrastructure_fee: "-3000",
          },
          tax: {
            pit_amount: "-495",
            sales_tax_amount: "-1200",
            vat_amount: "-990",
          },
        },
        quantity: "1",
        shipping_cost_amount: "0",
        shipping_cost_breakdown: {
          actual_shipping_fee_amount: "-14000",
          customer_paid_shipping_fee_amount: "5000",
          shipping_fee_discount_amount: "14000",
          supplementary_component: {
            fbt_fulfillment_fee_amount: "-4000",
            platform_shipping_fee_discount_amount: "14000",
          },
        },
        sku_id: "1734491732301285269",
        sku_name: "AOTHUN",
      },
    ],
    total_count: 1,
  },
  message: "Success",
};

describe("TikTok token contracts", () => {
  it("reads credentials from the nested data wrapper", () => {
    expect(
      unwrapTokenPayload({
        code: 0,
        data: { access_token: "tok", refresh_token: "ref" },
      }),
    ).toEqual({ access_token: "tok", refresh_token: "ref" });
  });

  it("treats access_token_expire_in as a unix timestamp", () => {
    expect(
      tokenExpiresAtMs({ access_token_expire_in: 1_700_000_000 }, 0),
    ).toBe(1_700_000_000_000);
    expect(tokenExpiresAtMs({ expires_in: 60 }, 1_000)).toBe(61_000);
  });
});

describe("TikTok finance contracts", () => {
  it("parses SKU statement transactions into seller fees and net shipping", () => {
    const [row] = parseOrderFinance(statementPayload);

    expect(row).toMatchObject({
      skuId: "1734491732301285269",
      quantity: 1,
      shipping: 0,
      buyerPaidShipping: 5000,
    });
    expect(row.fees).toBe(32205);
    expect(row.feesBreakdown).toEqual([
      ["affiliate_commission", 9900],
      ["platform_commission", 12870],
      ["transaction_fee", 4950],
      ["vn_fix_infrastructure_fee", 3000],
      ["pit", 495],
      ["vat", 990],
    ]);
    expect(row.shippingBreakdown).toEqual([
      ["actual_shipping_fee", 14000],
      ["shipping_fee_discount", 14000],
    ]);
  });

  it("splits a SKU finance row across matching units and estimates unknown SKUs", () => {
    const [skuFinance] = parseOrderFinance(statementPayload);
    const shares = allocateFinanceToUnits(
      [
        { skuId: "1734491732301285269", quantity: 2, price: 50 },
        { skuId: "other", quantity: 1, price: 100 },
      ],
      [skuFinance],
    );

    expect(shares[0].fees).toBe(32205 / 2);
    expect(shares[0].buyerPaidShipping).toBe(2500);
    expect(shares[1].fees).toBe(100 * TIKTOK_ESTIMATED_FEE_RATE);
    expect(shares[1].feesBreakdown).toEqual([
      [TIKTOK_ESTIMATED_FEE_LABEL, 6],
    ]);
    expect(isEstimatedFee(TIKTOK_ESTIMATED_FEE_LABEL)).toBe(true);
  });

  it("splits order-level finance across every unit", () => {
    const shares = allocateFinanceToUnits(
      [
        { skuId: "a", quantity: 1, price: 10 },
        { skuId: "b", quantity: 1, price: 10 },
      ],
      [
        {
          skuId: "",
          quantity: 1,
          fees: 8,
          feesBreakdown: [["platform_commission", 8]],
          shipping: 4,
          shippingBreakdown: [["actual_shipping_fee", 4]],
          buyerPaidShipping: 2,
        },
      ],
    );

    expect(shares).toEqual([
      {
        fees: 4,
        feesBreakdown: [["platform_commission", 4]],
        shipping: 2,
        shippingBreakdown: [["actual_shipping_fee", 2]],
        buyerPaidShipping: 1,
      },
      {
        fees: 4,
        feesBreakdown: [["platform_commission", 4]],
        shipping: 2,
        shippingBreakdown: [["actual_shipping_fee", 2]],
        buyerPaidShipping: 1,
      },
    ]);
  });

  it("parses signed decimal strings", () => {
    expect(parseSignedAmount("-12.50")).toBe(-12.5);
    expect(parseSignedAmount({ amount: "3" })).toBe(3);
  });
});

describe("TikTok request signing", () => {
  it("signs sorted query params and body while excluding access_token", () => {
    const body = JSON.stringify({
      create_time_ge: 1,
      create_time_lt: 2,
    });
    const sign = signTiktokRequest({
      path: "/order/202309/orders/search",
      query: {
        access_token: "should-not-be-signed",
        app_key: "key",
        shop_cipher: "cipher",
        timestamp: "1700000000",
      },
      secret: "secret",
      body,
    });

    expect(sign).toMatch(/^[a-f0-9]{64}$/);
    expect(
      signTiktokRequest({
        path: "/order/202309/orders/search",
        query: {
          app_key: "key",
          shop_cipher: "cipher",
          timestamp: "1700000000",
        },
        secret: "secret",
        body,
      }),
    ).toBe(sign);
  });
});
