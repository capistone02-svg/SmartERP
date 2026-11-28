import { useCallback, useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type FilterDef, type Option } from "@/components/shared/ResourcePage"
import { Badge } from "@/components/ui/badge"
import { num, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { ProductsImport } from "./ProductsImport"
import { StockBadge } from "./StockBadge"

interface Product {
  id: string
  sku: string
  name: string
  category: string
  description: string | null
  unit: string
  unit_price: number
  supplier_id: string | null
  low_stock_threshold: number
  created_by: string | null
  supplier: { name: string } | null
}

interface WarehouseStockRow {
  product_id: string
  warehouse_code: string
  warehouse_name: string
  quantity: number
  unit: string
}

export default function ProductsPage() {
  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [refreshSig, setRefreshSig] = useState(0)

  // Live stock from the movements view
  const [stock, setStock] = useState<Record<string, { quantity: number; stock_status: string }>>({})
  // Per-warehouse stock distribution
  const [warehouseStock, setWarehouseStock] = useState<Record<string, WarehouseStockRow[]>>({})

  const loadStockData = useCallback(() => {
    supabase
      .from("v_product_stock")
      .select("product_id, quantity, stock_status")
      .then(({ data }) => {
        const m: Record<string, { quantity: number; stock_status: string }> = {}
        for (const r of (data ?? []) as { product_id: string; quantity: number; stock_status: string }[]) {
          m[r.product_id] = { quantity: r.quantity, stock_status: r.stock_status }
        }
        setStock(m)
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

  useEffect(() => {
    loadStockData()
  }, [loadStockData, refreshSig])

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
  }, [refreshSig])

  const columns: Column<Product>[] = [
    { header: "SKU", cell: (r) => <span className="font-mono text-xs font-semibold">{r.sku}</span> },
    {
      header: "Product",
      cell: (r) => (
        <div>
          <span className="font-medium text-foreground">{r.name}</span>
          {r.description && <p className="line-clamp-1 text-xs text-muted-foreground">{r.description}</p>}
        </div>
      ),
    },
    {
      header: "Category",
      cell: (r) => <Badge variant="secondary" className="font-normal">{r.category}</Badge>,
    },
    {
      header: "Total stock",
      cell: (r) => {
        const s = stock[r.id]
        return s ? (
          <span className="flex items-center justify-end gap-1.5">
            <StockBadge status={s.stock_status} />
            <span className="font-medium">{num(s.quantity)} {r.unit}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
      className: "text-right",
    },
    {
      header: "Stored in",
      cell: (r) => {
        const list = warehouseStock[r.id]
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
    { header: "Unit price", cell: (r) => peso(r.unit_price), className: "text-right font-medium" },
    { header: "Primary supplier", cell: (r) => r.supplier?.name ?? <span className="text-muted-foreground">—</span> },
    {
      header: "Low-stock alert",
      cell: (r) => <span className="text-xs text-muted-foreground">≤ {num(r.low_stock_threshold)} {r.unit}</span>,
      className: "text-right",
    },
  ]

  const fields: FieldDef[] = [
    { name: "sku", label: "SKU", type: "text", required: true, placeholder: "e.g. LAP-001" },
    { name: "name", label: "Product name", type: "text", required: true, placeholder: "e.g. Business Laptop 14-inch" },
    { name: "category", label: "Category", type: "text", required: true, placeholder: "e.g. Electronics" },
    { name: "unit", label: "Unit of measure", type: "text", required: true, defaultValue: "pc", placeholder: "pc, box, kg, pack" },
    { name: "unit_price", label: "Unit price (PHP)", type: "number", min: 0, required: true, defaultValue: "0" },
    { name: "low_stock_threshold", label: "Low-stock alert threshold", type: "integer", min: 0, required: true, defaultValue: "20" },
    { name: "supplier_id", label: "Primary supplier", type: "select", options: suppliers, placeholder: "No supplier linked" },
    { name: "description", label: "Description / specifications", type: "textarea" },
  ]

  const filters: FilterDef[] = [
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
      {/* Workflow clarity banner */}
      <div className="flex flex-col gap-1 rounded-lg border border-border/80 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-semibold text-foreground">Product catalog</span> — register every product here first with its SKU, unit price, and primary supplier.
          Quantities are managed through <span className="font-medium text-foreground">Stock Movements</span> (stock in / stock out per warehouse).
        </div>
      </div>

      <ResourcePage<Product>
        resource="products"
        table="products"
        singular="Product"
        select="id, sku, name, category, description, unit, unit_price, supplier_id, low_stock_threshold, created_by, supplier:suppliers(name)"
        searchColumns={["sku", "name", "category"]}
        searchPlaceholder="Search by name, SKU, or category..."
        orderBy="name"
        columns={columns}
        fields={fields}
        filters={filters}
        rowKey={(r) => r.id}
        refreshSignal={refreshSig}
        emptyText="No products found. Register your first product above or use Bulk Import to upload a CSV catalog."
        toolbarExtra={(refresh) => (
          <ProductsImport
            onDone={() => {
              refresh()
              setRefreshSig((s) => s + 1)
            }}
          />
        )}
      />
    </div>
  )
}
