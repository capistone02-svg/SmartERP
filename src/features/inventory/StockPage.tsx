import type { Column } from "@/components/shared/DataTable"
import { ResourcePage } from "@/components/shared/ResourcePage"
import { StockBadge } from "@/features/inventory/StockBadge"
import { num } from "@/lib/format"

interface StockRow {
  product_id: string
  sku: string
  name: string
  category: string
  unit: string
  low_stock_threshold: number
  quantity: number
  stock_status: string
}

const columns: Column<StockRow>[] = [
  { header: "SKU", cell: (r) => r.sku },
  { header: "Product", cell: (r) => <span className="font-medium">{r.name}</span> },
  { header: "Category", cell: (r) => r.category },
  { header: "Quantity", cell: (r) => `${num(r.quantity)} ${r.unit}`, className: "text-right" },
  { header: "Low-stock level", cell: (r) => num(r.low_stock_threshold), className: "text-right" },
  { header: "Status", cell: (r) => <StockBadge status={r.stock_status} /> },
]

export default function StockPage() {
  return (
    <ResourcePage<StockRow>
      resource="inventory_balances" table="v_product_stock" singular="Stock" readOnly
      select="product_id, sku, name, category, unit, low_stock_threshold, quantity, stock_status"
      searchColumns={["sku", "name", "category"]} searchPlaceholder="Search stock..."
      orderBy="name" columns={columns} rowKey={(r) => r.product_id}
      filters={[{
        name: "stock_status", label: "Status",
        options: [
          { value: "in_stock", label: "In stock" },
          { value: "low_stock", label: "Low stock" },
          { value: "out_of_stock", label: "Out of stock" },
        ],
      }]}
    />
  )
}