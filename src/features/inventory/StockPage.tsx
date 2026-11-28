import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FilterDef, type Option } from "@/components/shared/ResourcePage"
import { Badge } from "@/components/ui/badge"
import { StockBadge } from "@/features/inventory/StockBadge"
import { num, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"

interface StockRow {
  product_id: string
  sku: string
  name: string
  category: string
  unit: string
  unit_price: number
  supplier_id: string | null
  supplier_name: string | null
  low_stock_threshold: number
  quantity: number
  stock_status: string
}

interface WarehouseStockRow {
  product_id: string
  warehouse_code: string
  warehouse_name: string
  quantity: number
  unit: string
}

export default function StockPage() {
  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [warehouseStock, setWarehouseStock] = useState<Record<string, WarehouseStockRow[]>>({})

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("id, name")
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) =>
        setSuppliers(((data ?? []) as { id: string; name: string }[]).map((s) => ({ value: s.id, label: s.name }))),
      )

    supabase
      .from("products")
      .select("category")
      .is("deleted_at", null)
      .then(({ data }) => {
        const set = new Set<string>()
        for (const r of (data ?? []) as { category: string }[]) {
          if (r.category?.trim()) set.add(r.category.trim())
        }
        setCategories(Array.from(set).sort().map((c) => ({ value: c, label: c })))
      })

    supabase
      .from("v_warehouse_stock")
      .select("product_id, warehouse_code, warehouse_name, quantity, unit")
      .then(({ data }) => {
        const byProd: Record<string, WarehouseStockRow[]> = {}
        for (const row of (data ?? []) as WarehouseStockRow[]) {
          if (!byProd[row.product_id]) byProd[row.product_id] = []
          byProd[row.product_id].push(row)
        }
        setWarehouseStock(byProd)
      })
  }, [])

  const columns: Column<StockRow>[] = [
    { header: "SKU", cell: (r) => <span className="font-mono text-xs font-semibold">{r.sku}</span> },
    { header: "Product", cell: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    {
      header: "Category",
      cell: (r) => <Badge variant="secondary" className="font-normal">{r.category}</Badge>,
    },
    {
      header: "Total quantity",
      cell: (r) => (
        <span className="font-semibold text-foreground">
          {num(r.quantity)} {r.unit}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Stored in",
      cell: (r) => {
        const list = warehouseStock[r.product_id]
        if (!list || list.length === 0) return <span className="text-xs text-muted-foreground">None</span>
        return (
          <div className="flex flex-wrap items-center gap-1">
            {list.map((w) => (
              <span
                key={w.warehouse_code}
                title={`${w.warehouse_name}: ${num(w.quantity)} ${w.unit}`}
                className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground"
              >
                <span className="text-muted-foreground">{w.warehouse_code}:</span>
                <span>{num(w.quantity)}</span>
              </span>
            ))}
          </div>
        )
      },
    },
    {
      header: "Est. stock value",
      cell: (r) => peso(Number(r.unit_price || 0) * Math.max(0, Number(r.quantity || 0))),
      className: "text-right font-medium",
    },
    { header: "Supplier", cell: (r) => r.supplier_name ?? <span className="text-muted-foreground">—</span> },
    {
      header: "Low-stock alert",
      cell: (r) => <span className="text-xs text-muted-foreground">≤ {num(r.low_stock_threshold)} {r.unit}</span>,
      className: "text-right",
    },
    { header: "Status", cell: (r) => <StockBadge status={r.stock_status} /> },
  ]

  const filters: FilterDef[] = [
    {
      name: "stock_status",
      label: "Stock status",
      options: [
        { value: "in_stock", label: "In stock" },
        { value: "low_stock", label: "Low stock" },
        { value: "out_of_stock", label: "Out of stock" },
      ],
    },
    {
      name: "category",
      label: "Category",
      options: categories,
    },
    {
      name: "supplier_id",
      label: "Supplier",
      options: suppliers,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 rounded-lg border border-border/80 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Current inventory levels</span> — read-only view of
          on-hand stock calculated live from all approved stock-in and stock-out movements.
          To adjust counts, record a new <span className="font-medium text-foreground">Stock Movement</span>.
        </div>
      </div>

      <ResourcePage<StockRow>
        resource="inventory_balances"
        table="v_product_stock"
        singular="Stock"
        readOnly
        select="product_id, sku, name, category, unit, unit_price, supplier_id, supplier_name, low_stock_threshold, quantity, stock_status"
        searchColumns={["sku", "name", "category", "supplier_name"]}
        searchPlaceholder="Search by SKU, product name, category, or supplier..."
        orderBy="name"
        columns={columns}
        filters={filters}
        rowKey={(r) => r.product_id}
        emptyText="No inventory balances found. Record stock-in movements to bring items into inventory."
      />
    </div>
  )
}
