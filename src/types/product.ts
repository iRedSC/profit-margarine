import { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

export type Product = FunctionReturnType<
  typeof api.products.listProducts
>[number];
