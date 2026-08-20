import { describe, expect, it } from "vitest";
import {
  ebayTransactionValidator,
  parseEbayAmount,
} from "../convex/ebay/transactions";

function amountFields() {
  const amount = ebayTransactionValidator.fields.amount;
  if ("fields" in amount && amount.fields) {
    return amount.fields;
  }
  throw new Error("eBay amount validator is not an object validator");
}

describe("eBay finance contracts", () => {
  it("accepts Finances Amount objects that include currency", () => {
    expect(amountFields()).toHaveProperty("currency");
    expect(parseEbayAmount({ currency: "USD", value: "5.48" })).toBe(5.48);
  });
});
