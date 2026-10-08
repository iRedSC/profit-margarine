import { describe, expect, it } from "vitest";
import { parseShopDomain } from "../convex/lib/shopifyDomain";

describe("Shopify shop domain", () => {
  it("accepts and normalizes *.myshopify.com hosts", () => {
    expect(parseShopDomain("my-store.myshopify.com")).toBe(
      "my-store.myshopify.com",
    );
    expect(parseShopDomain(" My-Store.MyShopify.com ")).toBe(
      "my-store.myshopify.com",
    );
  });

  it.each([
    "attacker.example",
    "my-store.myshopify.com.attacker.example",
    "attacker.example/my-store.myshopify.com",
    "attacker.example#.myshopify.com",
    "user@my-store.myshopify.com",
    "my-store.myshopify.com:8443",
    "-store.myshopify.com",
    "myshopify.com",
    "",
  ])("rejects %j", (shop) => {
    expect(parseShopDomain(shop)).toBeNull();
  });
});
