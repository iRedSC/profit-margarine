import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Id } from "../../convex/_generated/dataModel";
import { SortField, SortDirection } from "../lib/productUtils";
import { Product } from "../types/product";
import { ProductTableRow } from "./ProductTableRow";

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
  getOrderUrl: (marketplace: string, orderId: string | undefined) => string | null;
  onResyncOrder?: (id: Id<"marketplaceProducts">) => Promise<void>;
  onRowClick?: (product: Product) => void;
  emptyFilteredMessage?: string;
  emptyAllMessage?: string;
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
  onRowClick,
  emptyFilteredMessage = "No products match your filters. Try adjusting your search criteria.",
  emptyAllMessage = "No products yet. Sync your orders to get started!",
}: ProductTableProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;
  return (
    <div className="rounded-lg border bg-card">
      <div
        ref={scrollContainerRef}
        className="max-h-[70vh] overflow-auto"
      >
        <table className="w-full">
          <thead>
            <tr>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-left align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("sku")}
              >
                SKU <SortIcon field="sku" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-left align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("name")}
              >
                Name <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-left align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("marketplace")}
              >
                Marketplace <SortIcon field="marketplace" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-right align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("price")}
              >
                Price <SortIcon field="price" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-right align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("cost")}
              >
                Cost <SortIcon field="cost" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-right align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("fees")}
              >
                Fees <SortIcon field="fees" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-right align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("shipping")}
              >
                Shipping <SortIcon field="shipping" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-right align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("profit")}
              >
                Profit <SortIcon field="profit" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-right align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("margin")}
              >
                Margin <SortIcon field="margin" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th className="sticky top-0 z-10 h-9 bg-card px-3 text-center align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">Status</th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-center align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("orderDate")}
              >
                Order Date <SortIcon field="orderDate" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="sticky top-0 z-10 h-9 bg-card px-3 text-center align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onSort("fulfillmentDate")}
              >
                Fulfillment Date <SortIcon field="fulfillmentDate" sortField={sortField} sortDirection={sortDirection} />
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {products.length === 0 ? (
              <tr>
                <td colSpan={12} className="h-20 px-3 py-3 text-center text-sm text-muted-foreground">
                  {allProducts.length === 0
                    ? emptyAllMessage
                    : emptyFilteredMessage}
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={12} style={{ height: paddingTop }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const product = products[virtualRow.index];
                  return (
                    <ProductTableRow
                      key={product._id}
                      product={product}
                      isEditing={editingCostId === product._id}
                      editingCostValue={editingCostValue}
                      setEditingCostValue={setEditingCostValue}
                      onStartEditing={onStartEditing}
                      onSaveCost={onSaveCost}
                      onCancelEditing={onCancelEditing}
                      orderUrl={getOrderUrl(product.marketplace, product.orderId)}
                      onResyncOrder={onResyncOrder}
                      onRowClick={onRowClick}
                    />
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td colSpan={12} style={{ height: paddingBottom }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}