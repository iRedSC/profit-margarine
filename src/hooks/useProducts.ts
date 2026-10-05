import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Product } from "../types/product";

/** All product rows, or undefined while loading. listProducts returns chunks. */
export function useProducts(): Product[] | undefined {
  const chunks = useQuery(api.products.listProducts);
  return useMemo(() => chunks?.flat(), [chunks]);
}
