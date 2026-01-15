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
  shipping: number;
  shippingPercentage: number | undefined;
  buyerPaidShipping: number | undefined;
  orderDate: number;
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
    return <span className="text-gray-400 ml-1">⇅</span>;
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
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("sku")}
              >
                SKU <SortIcon field="sku" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("name")}
              >
                Name <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("marketplace")}
              >
                Marketplace <SortIcon field="marketplace" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("price")}
              >
                Price <SortIcon field="price" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("cost")}
              >
                Cost <SortIcon field="cost" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("fees")}
              >
                Fees <SortIcon field="fees" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("shipping")}
              >
                Shipping <SortIcon field="shipping" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("profit")}
              >
                Profit <SortIcon field="profit" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("margin")}
              >
                Margin <SortIcon field="margin" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th 
                className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSort("orderDate")}
              >
                Order Date <SortIcon field="orderDate" sortField={sortField} sortDirection={sortDirection} />
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
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