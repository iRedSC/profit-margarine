import { Id } from "../../convex/_generated/dataModel";
import { SortField, SortDirection } from "../lib/productUtils";
import { ProductTableRow } from "./ProductTableRow";

type Product = {
  _id: Id<"marketplaceProducts">;
  sku: string;
  name: string | undefined;
  marketplace: string;
  price: number;
  cost: number | undefined;
  fees: number;
  fees_breakdown?: Array<Array<string | number>>;
  shipping: number;
  shippingPercentage: number | undefined;
  buyerPaidShipping: number | undefined;
  orderDate: number;
  fulfillmentDate: number | undefined;
  OrderId: string | undefined;
};

type ProductTableProps = {
  products: Product[];
  allProducts: Product[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  editingCostId: Id<"marketplaceProducts"> | null;
  editingCostValue: string;
  setEditingCostValue: (value: string) => void;
  onStartEditing: (id: Id<"marketplaceProducts">, cost: number | undefined) => void;
  onSaveCost: (id: Id<"marketplaceProducts">, moveToNext: boolean) => Promise<void>;
  onCancelEditing: () => void;
  getOrderUrl: (marketplace: string, OrderId: string | undefined) => string | null;
  onResyncOrder?: (id: Id<"marketplaceProducts">) => Promise<void>;
};

function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (sortField !== field) {
    return <span className="text-muted-foreground ml-1">⇅</span>;
  }
  return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>;
}

export function ProductTable({
  products,
  allProducts,
  sortField,
  sortDirection,
  onSort,
  editingCostId,
  editingCostValue,
  setEditingCostValue,
  onStartEditing,
  onSaveCost,
  onCancelEditing,
  getOrderUrl,
  onResyncOrder,
}: ProductTableProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th 
                className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("sku")}
              >
                SKU <SortIcon field="sku" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("name")}
              >
                Name <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("marketplace")}
              >
                Marketplace <SortIcon field="marketplace" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("price")}
              >
                Price <SortIcon field="price" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("cost")}
              >
                Cost <SortIcon field="cost" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("fees")}
              >
                Fees <SortIcon field="fees" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("shipping")}
              >
                Shipping <SortIcon field="shipping" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("profit")}
              >
                Profit <SortIcon field="profit" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("margin")}
              >
                Margin <SortIcon field="margin" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">Status</th>
              <th 
                className="h-12 px-4 text-center align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("orderDate")}
              >
                Order Date <SortIcon field="orderDate" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="h-12 px-4 text-center align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("fulfillmentDate")}
              >
                Fulfillment Date <SortIcon field="fulfillmentDate" sortField={sortField} sortDirection={sortDirection} />
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {products.length === 0 ? (
              <tr>
                <td colSpan={12} className="h-24 px-4 text-center text-muted-foreground">
                  {allProducts.length === 0 
                    ? "No products yet. Sync your orders to get started!"
                    : "No products match your filters. Try adjusting your search criteria."}
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <ProductTableRow
                  key={product._id}
                  product={product}
                  isEditing={editingCostId === product._id}
                  editingCostValue={editingCostValue}
                  setEditingCostValue={setEditingCostValue}
                  onStartEditing={onStartEditing}
                  onSaveCost={onSaveCost}
                  onCancelEditing={onCancelEditing}
                  orderUrl={getOrderUrl(product.marketplace, product.OrderId)}
                  onResyncOrder={onResyncOrder}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}