import { describe, expect, it } from "vitest";
import { parseCostInput } from "../src/hooks/useCostEditing";

describe("cost input", () => {
  it("keeps an explicit zero as a real cost", () => {
    expect(parseCostInput("0")).toEqual({ kind: "set", cost: 0 });
    expect(parseCostInput("0.00")).toEqual({ kind: "set", cost: 0 });
  });

  it("treats blank as clearing the cost", () => {
    expect(parseCostInput("  ")).toEqual({ kind: "clear" });
  });

  it("rejects non-numbers", () => {
    expect(parseCostInput("abc")).toEqual({ kind: "invalid" });
  });
});
