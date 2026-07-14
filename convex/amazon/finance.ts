"use node";

const AMAZON_FINANCE_V2024_REVIEW_AGE_DAYS = 7;
const AMAZON_SHIPMENT_EVENT_LISTS = [
    "ShipmentEventList",
    "ShipmentSettleEventList",
    "TrialShipmentEventList",
] as const;

export function mergeFinancialEvents(
    target: Record<string, any>,
    source: Record<string, any> | null | undefined
) {
    if (!source) {
        return;
    }

    for (const [key, value] of Object.entries(source)) {
        if (Array.isArray(value)) {
            target[key] = [...(target[key] || []), ...value];
        } else if (target[key] === undefined) {
            target[key] = value;
        }
    }
}

export async function fetchFinancialEventsForOrder(spApi: any, orderId: string) {
    const mergedFinancialEvents: Record<string, any> = {};
    let nextToken: string | undefined;
    let pagesFetched = 0;

    do {
        const financialResponse = await spApi.callAPI({
            operation: "listFinancialEventsByOrderId",
            endpoint: "finances",
            path: {
                orderId,
            },
            query: {
                MaxResultsPerPage: 100,
                ...(nextToken ? { NextToken: nextToken } : {}),
            },
        });

        pagesFetched++;
        mergeFinancialEvents(
            mergedFinancialEvents,
            financialResponse.FinancialEvents
        );
        nextToken = financialResponse.NextToken || financialResponse.nextToken;
    } while (nextToken);

    return {
        financialEvents:
            Object.keys(mergedFinancialEvents).length > 0
                ? mergedFinancialEvents
                : null,
        pagesFetched,
    };
}

export function getEventListCounts(
    financialEvents: any
): Array<{ listName: string; count: number }> {
    if (!financialEvents) {
        return [];
    }

    return Object.entries(financialEvents)
        .filter(
            ([key, value]) =>
                key.endsWith("EventList") && Array.isArray(value)
        )
        .map(([listName, value]) => ({
            listName,
            count: (value as any[]).length,
        }));
}

export function getShipmentLikeEvents(financialEvents: any, orderId: string) {
    const matchedEvents: Array<{ listName: string; event: any }> = [];

    for (const listName of AMAZON_SHIPMENT_EVENT_LISTS) {
        const eventList = financialEvents?.[listName];
        if (!Array.isArray(eventList)) {
            continue;
        }

        for (const event of eventList) {
            if (!event?.AmazonOrderId || event.AmazonOrderId === orderId) {
                matchedEvents.push({
                    listName,
                    event,
                });
            }
        }
    }

    return matchedEvents;
}

export function hasShipmentFinancialEvents(financialEvents: any, orderId: string) {
    return getShipmentLikeEvents(financialEvents, orderId).length > 0;
}

export function classifyFinancialEvents(args: {
    financialEvents: any;
    orderTimestamp: number;
    shipmentLikeEventCount: number;
}) {
    const eventListCounts = getEventListCounts(args.financialEvents);
    const nonEmptyEventLists = eventListCounts.filter(
        (eventList) => eventList.count > 0
    );
    const hasAnyFinancialEvents = nonEmptyEventLists.length > 0;
    const shipmentLikeListNames = new Set(AMAZON_SHIPMENT_EVENT_LISTS);
    const hasNonShipmentFinancialEvents = nonEmptyEventLists.some(
        (eventList) => !shipmentLikeListNames.has(eventList.listName as any)
    );
    const orderAgeDays =
        (Date.now() - args.orderTimestamp) / (24 * 60 * 60 * 1000);
    const suggestFinancesV2024Fallback =
        orderAgeDays >= AMAZON_FINANCE_V2024_REVIEW_AGE_DAYS &&
        (!hasAnyFinancialEvents || args.shipmentLikeEventCount === 0);

    let financeStatusClassification = "other_finance_present";
    if (!hasAnyFinancialEvents) {
        financeStatusClassification = "empty_v0_response";
    } else if (args.shipmentLikeEventCount > 0) {
        financeStatusClassification = "shipment_finance_present";
    } else if (hasNonShipmentFinancialEvents) {
        financeStatusClassification = "non_shipment_finance_present";
    }

    return {
        hasAnyFinancialEvents,
        hasNonShipmentFinancialEvents,
        financeStatusClassification,
        suggestFinancesV2024Fallback,
        nonEmptyEventLists: nonEmptyEventLists.map(({ listName, count }) => [
            listName,
            count,
        ]) as Array<[string, number]>,
    };
}

export function extractFulfillmentFromShipmentLikeEvents(
    shipmentLikeEvents: Array<{ listName: string; event: any }>
) {
    let fulfillmentTimestamp: number | undefined;
    let fulfillmentDate: string | undefined;
    let fulfillmentSourceList: string | undefined;

    for (const shipmentLikeEvent of shipmentLikeEvents) {
        const postedDate = shipmentLikeEvent.event.PostedDate;
        const shipmentDate = shipmentLikeEvent.event.ShipmentDate;
        const dateToUse = postedDate || shipmentDate;

        if (!dateToUse) {
            continue;
        }

        const parsedDate = new Date(dateToUse).getTime();
        if (!fulfillmentTimestamp || parsedDate < fulfillmentTimestamp) {
            fulfillmentTimestamp = parsedDate;
            fulfillmentDate = dateToUse;
            fulfillmentSourceList = shipmentLikeEvent.listName;
        }
    }

    return {
        fulfillmentTimestamp,
        fulfillmentDate,
        fulfillmentSourceList,
    };
}

export function extractFulfillmentFromAdjustmentEvents(args: {
    adjustmentEvents: any[] | undefined;
    orderTimestamp: number;
}) {
    let fulfillmentTimestamp: number | undefined;
    let fulfillmentDate: string | undefined;
    let fulfillmentSourceList: string | undefined;
    const now = Date.now();

    for (const adjustment of args.adjustmentEvents || []) {
        const adjustmentType = adjustment?.AdjustmentType || "";
        if (adjustmentType !== "PostageBilling_Postage") {
            continue;
        }

        const adjustmentAmount = parseFloat(
            adjustment.AdjustmentAmount?.CurrencyAmount || "0"
        );
        if (!Number.isFinite(adjustmentAmount) || adjustmentAmount >= 0) {
            continue;
        }

        const postedDate = adjustment.PostedDate;
        if (!postedDate) {
            continue;
        }

        const parsedDate = new Date(postedDate).getTime();
        if (!Number.isFinite(parsedDate)) {
            continue;
        }

        if (parsedDate < args.orderTimestamp || parsedDate > now) {
            continue;
        }

        if (!fulfillmentTimestamp || parsedDate < fulfillmentTimestamp) {
            fulfillmentTimestamp = parsedDate;
            fulfillmentDate = postedDate;
            fulfillmentSourceList = `AdjustmentEventList:${adjustmentType}`;
        }
    }

    return {
        fulfillmentTimestamp,
        fulfillmentDate,
        fulfillmentSourceList,
    };
}

export async function fetchFulfillmentFromOrderPackages(args: {
    spApi: any;
    orderId: string;
    orderTimestamp: number;
}) {
    const createdAfter = new Date(
        args.orderTimestamp - 24 * 60 * 60 * 1000
    ).toISOString();
    const createdBefore = new Date(
        Math.max(args.orderTimestamp + 30 * 24 * 60 * 60 * 1000, Date.now())
    ).toISOString();

    const ordersResponse = await args.spApi.callAPI({
        operation: "getOrders",
        endpoint: "orders",
        query: {
            MarketplaceIds: ["ATVPDKIKX0DER"],
            CreatedAfter: createdAfter,
            CreatedBefore: createdBefore,
            OrderStatuses: ["Shipped", "PartiallyShipped"],
            AmazonOrderIds: [args.orderId],
            includedData: ["PACKAGES"],
        },
    });

    const matchingOrder = (ordersResponse.Orders || []).find(
        (order: any) => order?.AmazonOrderId === args.orderId
    );
    const packages = matchingOrder?.packages || matchingOrder?.Packages || [];
    let fulfillmentTimestamp: number | undefined;
    let fulfillmentDate: string | undefined;

    for (const orderPackage of packages) {
        const shipTime = orderPackage?.shipTime || orderPackage?.ShipTime;
        if (!shipTime) {
            continue;
        }

        const parsedShipTime = new Date(shipTime).getTime();
        if (!Number.isFinite(parsedShipTime)) {
            continue;
        }

        if (!fulfillmentTimestamp || parsedShipTime < fulfillmentTimestamp) {
            fulfillmentTimestamp = parsedShipTime;
            fulfillmentDate = shipTime;
        }
    }

    return {
        fulfillmentTimestamp,
        fulfillmentDate,
        fulfillmentSourceList: fulfillmentTimestamp
            ? "getOrders.packages[].shipTime"
            : undefined,
    };
}

export function extractFBAFeesFromShipmentLikeEvents(
    shipmentLikeEvents: Array<{ listName: string; event: any }>
) {
    let totalFBAFees = 0;
    const fbaFeesBySKU: Record<string, number> = {};

    for (const shipmentLikeEvent of shipmentLikeEvents) {
        const shipmentEvent = shipmentLikeEvent.event;
        if (shipmentEvent.ShipmentItemList) {
            for (const shipmentItem of shipmentEvent.ShipmentItemList) {
                const sku = shipmentItem.SellerSKU || "";
                let itemFBAFees = 0;

                if (shipmentItem.ItemFeeList) {
                    for (const fee of shipmentItem.ItemFeeList) {
                        const feeType = (
                            fee.FeeType ||
                            fee.FeeName ||
                            ""
                        ).toUpperCase();
                        if (
                            feeType.includes("FBA") ||
                            feeType.includes("FULFILLMENT") ||
                            feeType.includes("WEIGHT") ||
                            feeType.includes("PICK") ||
                            feeType.includes("PACK")
                        ) {
                            const feeAmount = Math.abs(
                                parseFloat(
                                    fee.FeeAmount?.CurrencyAmount || "0"
                                )
                            );
                            itemFBAFees += feeAmount;
                        }
                    }
                }

                if (itemFBAFees > 0) {
                    fbaFeesBySKU[sku] = (fbaFeesBySKU[sku] || 0) + itemFBAFees;
                    totalFBAFees += itemFBAFees;
                }
            }
        }

        if (shipmentEvent.OrderFeeList) {
            for (const fee of shipmentEvent.OrderFeeList) {
                const feeType = (fee.FeeType || fee.FeeName || "").toUpperCase();
                if (
                    feeType.includes("FBA") ||
                    feeType.includes("FULFILLMENT")
                ) {
                    const feeAmount = Math.abs(
                        parseFloat(fee.FeeAmount?.CurrencyAmount || "0")
                    );
                    totalFBAFees += feeAmount;
                }
            }
        }
    }

    return {
        totalFBAFees,
        fbaFeesBySKU,
    };
}

export function extractItemFeesFromShipmentLikeEvents(args: {
    shipmentLikeEvents: Array<{ listName: string; event: any }>;
    sellerSKU: string;
    isFBA: boolean;
}) {
    let actualFees = 0;
    const feesBreakdown: Array<[string, number]> = [];
    const feeSourceLists = new Set<string>();

    for (const shipmentLikeEvent of args.shipmentLikeEvents) {
        const shipmentEvent = shipmentLikeEvent.event;

        if (shipmentEvent.ShipmentItemList) {
            for (const shipmentItem of shipmentEvent.ShipmentItemList) {
                if (shipmentItem.SellerSKU !== args.sellerSKU) {
                    continue;
                }

                if (shipmentItem.ItemFeeList) {
                    for (const fee of shipmentItem.ItemFeeList) {
                        const feeType =
                            fee.FeeType || fee.FeeName || "Item Fee";
                        const feeTypeUpper = feeType.toUpperCase();

                        if (
                            args.isFBA &&
                            (feeTypeUpper.includes("FBA") ||
                                feeTypeUpper.includes("FULFILLMENT") ||
                                feeTypeUpper.includes("WEIGHT") ||
                                feeTypeUpper.includes("PICK") ||
                                feeTypeUpper.includes("PACK"))
                        ) {
                            continue;
                        }

                        const feeAmount = Math.abs(
                            parseFloat(
                                fee.FeeAmount?.CurrencyAmount || "0"
                            )
                        );
                        actualFees += feeAmount;
                        feesBreakdown.push([feeType, feeAmount]);
                        feeSourceLists.add(shipmentLikeEvent.listName);
                    }
                }
            }
        }

        if (shipmentEvent.OrderFeeList) {
            for (const fee of shipmentEvent.OrderFeeList) {
                const feeType = fee.FeeType || fee.FeeName || "Order Fee";
                const feeTypeUpper = feeType.toUpperCase();

                if (
                    args.isFBA &&
                    (feeTypeUpper.includes("FBA") ||
                        feeTypeUpper.includes("FULFILLMENT"))
                ) {
                    continue;
                }

                const feeAmount = Math.abs(
                    parseFloat(fee.FeeAmount?.CurrencyAmount || "0")
                );
                actualFees += feeAmount;
                feesBreakdown.push([feeType, feeAmount]);
                feeSourceLists.add(shipmentLikeEvent.listName);
            }
        }
    }

    return {
        actualFees,
        feesBreakdown,
        feeSourceLists: Array.from(feeSourceLists),
    };
}

export function summarizeRawFinancialEvents(
    financialEvents: any,
    pagesFetched: number,
    orderTimestamp: number,
    orderId: string
): {
    hasAnyFinancialEvents: boolean;
    hasNonShipmentFinancialEvents: boolean;
    financeStatusClassification: string;
    suggestFinancesV2024Fallback: boolean;
    nonEmptyEventLists: Array<[string, number]>;
    hasShipmentFinancialEvents: boolean;
    shipmentLikeEventCount: number;
    hasAdjustmentEventList: boolean;
    adjustmentEventListLength: number;
    hasShipmentEventList: boolean;
    shipmentEventListLength: number;
    hasShipmentSettleEventList: boolean;
    shipmentSettleEventListLength: number;
    hasTrialShipmentEventList: boolean;
    trialShipmentEventListLength: number;
    pagesFetched?: number;
} {
    const shipmentLikeEvents = getShipmentLikeEvents(financialEvents, orderId);
    const classification = classifyFinancialEvents({
        financialEvents,
        orderTimestamp,
        shipmentLikeEventCount: shipmentLikeEvents.length,
    });

    return {
        hasAnyFinancialEvents: classification.hasAnyFinancialEvents,
        hasNonShipmentFinancialEvents: classification.hasNonShipmentFinancialEvents,
        financeStatusClassification: classification.financeStatusClassification,
        suggestFinancesV2024Fallback:
            classification.suggestFinancesV2024Fallback,
        nonEmptyEventLists: classification.nonEmptyEventLists,
        hasShipmentFinancialEvents: shipmentLikeEvents.length > 0,
        shipmentLikeEventCount: shipmentLikeEvents.length,
        hasAdjustmentEventList: !!financialEvents?.AdjustmentEventList,
        adjustmentEventListLength:
            financialEvents?.AdjustmentEventList?.length || 0,
        hasShipmentEventList: !!financialEvents?.ShipmentEventList,
        shipmentEventListLength:
            financialEvents?.ShipmentEventList?.length || 0,
        hasShipmentSettleEventList: !!financialEvents?.ShipmentSettleEventList,
        shipmentSettleEventListLength:
            financialEvents?.ShipmentSettleEventList?.length || 0,
        hasTrialShipmentEventList: !!financialEvents?.TrialShipmentEventList,
        trialShipmentEventListLength:
            financialEvents?.TrialShipmentEventList?.length || 0,
        pagesFetched,
    };
}

export function getPendingImportReason(args: {
    financeStatusClassification: string;
    suggestFinancesV2024Fallback: boolean;
    hasShipmentFinancialEvents: boolean;
    hasFallbackShipmentFinanceOnly: boolean;
    usedEstimatedFees: boolean;
    missingFulfillmentDate: boolean;
}) {
    if (args.financeStatusClassification === "empty_v0_response") {
        if (args.suggestFinancesV2024Fallback) {
            return {
                reasonCode: "deferred_or_unreleased_finance",
                reasonMessage:
                    "Amazon Finances v0 returned no released order finance data for this older shipped order. It may be deferred or missing from the by-order response.",
            };
        }
        return {
            reasonCode: "missing_all_finance_data",
            reasonMessage:
                "Amazon Finances v0 returned no order-level finance data for this order yet, so it is excluded from the official list.",
        };
    }

    if (args.hasFallbackShipmentFinanceOnly) {
        return {
            reasonCode: "shipment_settlement_only",
            reasonMessage:
                "Amazon returned shipment settlement or trial finance data instead of classic shipment events, so this order remains pending until the fallback data is confirmed.",
        };
    }

    if (args.missingFulfillmentDate) {
        return {
            reasonCode: "fees_present_but_no_fulfillment_date",
            reasonMessage:
                "Amazon returned fee-bearing finance data, but there is still no fulfillment date for this order.",
        };
    }

    if (!args.hasShipmentFinancialEvents || args.usedEstimatedFees) {
        return {
            reasonCode: "fees_present_but_no_fulfillment_date",
            reasonMessage:
                "Amazon finance activity exists for this order, but it is still missing enough shipment detail to be promoted into the official list.",
        };
    }

    return {
        reasonCode: "awaiting_financial_settlement",
        reasonMessage:
            "This Amazon order is still awaiting settlement details and is excluded from the official list for now.",
    };
}
