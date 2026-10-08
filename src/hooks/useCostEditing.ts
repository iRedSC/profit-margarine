import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

/** Blank clears the cost; any number, including 0, is a real cost. */
export function parseCostInput(
  value: string
): { kind: "clear" } | { kind: "set"; cost: number } | { kind: "invalid" } {
  if (value.trim() === "") return { kind: "clear" };
  const cost = parseFloat(value);
  return isNaN(cost) ? { kind: "invalid" } : { kind: "set", cost };
}

export function useCostEditing(
  updateMarketplaceCost: (args: { marketplaceProductId: Id<"marketplaceProducts">; cost: number | undefined }) => Promise<null>
) {
  const [editingCostId, setEditingCostId] = useState<Id<"marketplaceProducts"> | null>(null);
  const [editingCostValue, setEditingCostValue] = useState("");

  const startEditing = (marketplaceProductId: Id<"marketplaceProducts">, currentCost: number | undefined) => {
    setEditingCostId(marketplaceProductId);
    // Blank means "no cost yet", which is different from a known cost of 0.
    setEditingCostValue(currentCost === undefined ? "" : currentCost.toString());
  };

  const saveCost = async (marketplaceProductId: Id<"marketplaceProducts">): Promise<void> => {
    const parsed = parseCostInput(editingCostValue);
    if (parsed.kind === "clear") {
      setEditingCostId(null);
      try {
        await updateMarketplaceCost({ marketplaceProductId, cost: undefined });
        toast.success("Cost cleared");
      } catch {
        toast.error("Failed to clear cost");
      }
      return;
    }

    if (parsed.kind === "invalid") {
      toast.error("Please enter a valid number");
      return;
    }

    setEditingCostId(null);

    try {
      await updateMarketplaceCost({ marketplaceProductId, cost: parsed.cost });
      toast.success("Cost updated");
    } catch {
      toast.error("Failed to update cost");
    }
  };

  const cancelEditing = () => {
    setEditingCostId(null);
    setEditingCostValue("");
  };

  return {
    editingCostId,
    editingCostValue,
    setEditingCostValue,
    startEditing,
    saveCost,
    cancelEditing,
  };
}
