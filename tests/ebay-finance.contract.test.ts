import { describe, expect, it } from "vitest";
import {
  ebayTransactionValidator,
  parseEbayAmount,
  toEbayTransactions,
} from "../convex/ebay/transactions";

function amountFields() {
  const amount = ebayTransactionValidator.fields.amount;
  if ("fields" in amount && amount.fields) {
    return amount.fields;
  }
  throw new Error("eBay amount validator is not an object validator");
}

const shippingLabelTransaction = {
  amount: { currency: "USD", value: "5.48" },
  bookingEntry: "DEBIT",
  buyer: { username: "babys20192020" },
  orderId: "15-15048-44325",
  paymentsEntity: "eBay Commerce Inc.",
  salesRecordReference: "0",
  transactionDate: "2026-08-20T15:18:57.383Z",
  transactionId: "09-15059-28949",
  transactionMemo: "Shipping label purchased",
  transactionStatus: "FUNDS_AVAILABLE_FOR_PAYOUT",
  transactionType: "SHIPPING_LABEL",
};

describe("eBay finance contracts", () => {
  it("accepts Finances Amount objects that include currency", () => {
    expect(amountFields()).toHaveProperty("currency");
    expect(parseEbayAmount({ currency: "USD", value: "5.48" })).toBe(5.48);
  });

  it("keeps known Finances fields and drops extras Convex would reject", () => {
    expect(toEbayTransactions([shippingLabelTransaction])).toEqual([
      {
        amount: { currency: "USD", value: "5.48" },
        orderId: "15-15048-44325",
        transactionDate: "2026-08-20T15:18:57.383Z",
        transactionId: "09-15059-28949",
        transactionMemo: "Shipping label purchased",
        transactionType: "SHIPPING_LABEL",
      },
    ]);
  });

  it("strips extra fields from nested fee and line-item objects", () => {
    expect(
      toEbayTransactions([
        {
          orderId: "26-15006-87891",
          transactionType: "SALE",
          amount: { currency: "USD", value: "20.00", extra: true },
          feeJurisdiction: { region: "US", feeJurisdictionId: "CA" },
          fees: [
            {
              feeType: "FINAL_VALUE_FEE",
              amount: { currency: "USD", value: "2.00" },
              feeMemo: "ignored",
            },
          ],
          orderLineItems: [
            {
              lineItemId: "123",
              sku: "ROCKSPLICER",
              marketplaceFees: [
                {
                  feeType: "INSERTION_FEE",
                  amount: { value: "0.35" },
                  somethingNew: 1,
                },
              ],
            },
          ],
        },
      ]),
    ).toEqual([
      {
        orderId: "26-15006-87891",
        transactionType: "SALE",
        amount: { currency: "USD", value: "20.00" },
        feeJurisdiction: {},
        fees: [
          {
            feeType: "FINAL_VALUE_FEE",
            amount: { currency: "USD", value: "2.00" },
          },
        ],
        orderLineItems: [
          {
            lineItemId: "123",
            marketplaceFees: [
              {
                feeType: "INSERTION_FEE",
                amount: { value: "0.35" },
              },
            ],
          },
        ],
      },
    ]);
  });
});
