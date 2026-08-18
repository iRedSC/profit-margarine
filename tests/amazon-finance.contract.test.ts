import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyFinancialEvents,
  extractFBAFeesFromShipmentLikeEvents,
  extractFulfillmentFromAdjustmentEvents,
  extractFulfillmentFromShipmentLikeEvents,
  extractItemFeesFromShipmentLikeEvents,
  getPendingImportReason,
  getShipmentLikeEvents,
  mergeFinancialEvents,
} from "../convex/amazon/finance";

afterEach(() => vi.useRealTimers());

describe("Amazon finance contracts", () => {
  it("merges paginated event arrays without replacing first-page metadata", () => {
    const target: Record<string, unknown> = {
      ShipmentEventList: [{ id: 1 }],
      Currency: "USD",
    };
    mergeFinancialEvents(target, {
      ShipmentEventList: [{ id: 2 }],
      Currency: "CAD",
      AdjustmentEventList: [{ id: 3 }],
    });

    expect(target).toEqual({
      ShipmentEventList: [{ id: 1 }, { id: 2 }],
      Currency: "USD",
      AdjustmentEventList: [{ id: 3 }],
    });
  });

  it("collects classic, settlement, and trial shipment events for the order", () => {
    const events = getShipmentLikeEvents(
      {
        ShipmentEventList: [
          { AmazonOrderId: "wanted" },
          { AmazonOrderId: "other" },
          { noOrderId: true },
        ],
        ShipmentSettleEventList: [{ AmazonOrderId: "wanted" }],
        TrialShipmentEventList: [{ AmazonOrderId: "wanted" }],
      },
      "wanted",
    );

    expect(events.map(({ listName }) => listName)).toEqual([
      "ShipmentEventList",
      "ShipmentEventList",
      "ShipmentSettleEventList",
      "TrialShipmentEventList",
    ]);
  });

  it("flags old orders with no shipment finance for fallback review", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    expect(
      classifyFinancialEvents({
        financialEvents: { AdjustmentEventList: [{ id: 1 }] },
        orderTimestamp: Date.parse("2026-08-01T00:00:00.000Z"),
        shipmentLikeEventCount: 0,
      }),
    ).toMatchObject({
      hasAnyFinancialEvents: true,
      hasNonShipmentFinancialEvents: true,
      financeStatusClassification: "non_shipment_finance_present",
      suggestFinancesV2024Fallback: true,
      nonEmptyEventLists: [["AdjustmentEventList", 1]],
    });
  });

  it("uses the earliest valid fulfillment evidence", () => {
    expect(
      extractFulfillmentFromShipmentLikeEvents([
        {
          listName: "ShipmentEventList",
          event: { PostedDate: "2026-08-12T00:00:00.000Z" },
        },
        {
          listName: "ShipmentSettleEventList",
          event: { ShipmentDate: "2026-08-10T00:00:00.000Z" },
        },
      ]),
    ).toEqual({
      fulfillmentTimestamp: Date.parse("2026-08-10T00:00:00.000Z"),
      fulfillmentDate: "2026-08-10T00:00:00.000Z",
      fulfillmentSourceList: "ShipmentSettleEventList",
    });
  });

  it("accepts only negative postage adjustments within the order window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    expect(
      extractFulfillmentFromAdjustmentEvents({
        orderTimestamp: Date.parse("2026-08-01T00:00:00.000Z"),
        adjustmentEvents: [
          {
            AdjustmentType: "PostageBilling_Postage",
            AdjustmentAmount: { CurrencyAmount: "-5.25" },
            PostedDate: "2026-08-10T00:00:00.000Z",
          },
          {
            AdjustmentType: "PostageBilling_Postage",
            AdjustmentAmount: { CurrencyAmount: "5.25" },
            PostedDate: "2026-08-09T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      fulfillmentTimestamp: Date.parse("2026-08-10T00:00:00.000Z"),
      fulfillmentDate: "2026-08-10T00:00:00.000Z",
      fulfillmentSourceList: "AdjustmentEventList:PostageBilling_Postage",
    });
  });

  it("separates FBA fulfillment fees from other item and order fees", () => {
    const shipmentEvents = [
      {
        listName: "ShipmentEventList",
        event: {
          ShipmentItemList: [
            {
              SellerSKU: "SKU-1",
              ItemFeeList: [
                {
                  FeeType: "FBAFulfillmentFee",
                  FeeAmount: { CurrencyAmount: "-4.50" },
                },
                {
                  FeeType: "Commission",
                  FeeAmount: { CurrencyAmount: "-3.25" },
                },
              ],
            },
          ],
          OrderFeeList: [
            {
              FeeType: "OrderFee",
              FeeAmount: { CurrencyAmount: "-1.25" },
            },
          ],
        },
      },
    ];

    expect(extractFBAFeesFromShipmentLikeEvents(shipmentEvents)).toEqual({
      totalFBAFees: 4.5,
      fbaFeesBySKU: { "SKU-1": 4.5 },
    });
    expect(
      extractItemFeesFromShipmentLikeEvents({
        shipmentLikeEvents: shipmentEvents,
        sellerSKU: "SKU-1",
        isFBA: true,
      }),
    ).toEqual({
      actualFees: 4.5,
      feesBreakdown: [
        ["Commission", 3.25],
        ["OrderFee", 1.25],
      ],
      feeSourceLists: ["ShipmentEventList"],
    });
  });

  it("keeps pending-reason precedence stable", () => {
    expect(
      getPendingImportReason({
        financeStatusClassification: "empty_v0_response",
        suggestFinancesV2024Fallback: true,
        hasShipmentFinancialEvents: false,
        hasFallbackShipmentFinanceOnly: false,
        usedEstimatedFees: true,
        missingFulfillmentDate: true,
      }).reasonCode,
    ).toBe("deferred_or_unreleased_finance");
    expect(
      getPendingImportReason({
        financeStatusClassification: "shipment_finance_present",
        suggestFinancesV2024Fallback: false,
        hasShipmentFinancialEvents: true,
        hasFallbackShipmentFinanceOnly: true,
        usedEstimatedFees: false,
        missingFulfillmentDate: false,
      }).reasonCode,
    ).toBe("shipment_settlement_only");
  });
});
