import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Product } from "../types/product";

export function useCostEditing(
  updateMarketplaceCost: (args: { marketplaceProductId: Id<"marketplaceProducts">; cost: number | undefined }) => Promise<null>,
  sortedProducts: Product[]
) {
  const [editingCostId, setEditingCostId] = useState<Id<"marketplaceProducts"> | null>(null);
  const [editingCostValue, setEditingCostValue] = useState("");

  const startEditing = (marketplaceProductId: Id<"marketplaceProducts">, currentCost: number | undefined) => {
    setEditingCostId(marketplaceProductId);
    setEditingCostValue((currentCost || 0).toString());
  };

  const saveCost = async (marketplaceProductId: Id<"marketplaceProducts">, moveToNext: boolean = false): Promise<void> => {
    if (editingCostValue.trim() === "") {
      setEditingCostId(null);
      try {
        await updateMarketplaceCost({ marketplaceProductId, cost: undefined });
        toast.success("Cost cleared");
        if (moveToNext) {
          const currentIndex = sortedProducts.findIndex(p => p._id === marketplaceProductId);
          const nextUnsetProduct = sortedProducts.slice(currentIndex + 1).find(p => p.cost === undefined);
          if (nextUnsetProduct) {
            startEditing(nextUnsetProduct._id, nextUnsetProduct.cost);
          }
        }
      } catch (error) {
        toast.error("Failed to clear cost");
      }
      return;
    }

    const newCost = parseFloat(editingCostValue);
    if (isNaN(newCost)) {
      toast.error("Please enter a valid number");
      return;
    }

    setEditingCostId(null);

    // If cost is 0, unset it instead of setting it to 0
    const costToSave = newCost === 0 ? undefined : newCost;

    try {
      await updateMarketplaceCost({ marketplaceProductId, cost: costToSave });
      toast.success(costToSave === undefined ? "Cost cleared" : "Cost updated");
      
      if (moveToNext) {
        const currentIndex = sortedProducts.findIndex(p => p._id === marketplaceProductId);
        const nextUnsetProduct = sortedProducts.slice(currentIndex + 1).find(p => p.cost === undefined);
        if (nextUnsetProduct) {
          startEditing(nextUnsetProduct._id, nextUnsetProduct.cost);
        }
      }
    } catch (error) {
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