import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { num } from "@/lib/format"
import { supabase } from "@/lib/supabase"

interface Warehouse {
  id: string
  code: string
  name: string
  location: string | null
  created_by: string | null
}

interface WarehouseStockSummary {
  product_count: number
  total_units: number
  top_products: { sku: string; name: string; quantity: number; unit: string }[]
}

export default function WarehousePage() {
  const [stockSummary, setStockSummary] = useState<Record<string, WarehouseStockSummary>>({})

  useEffect(() => {
    supabase
      .from("v_warehouse_stock")
      .select("warehouse_id, sku, name, quantity, unit")
      .then(({ data }) => {
        const map: Record<string, WarehouseStockSummary> = {}
        for (const row of (data ?? []) as {
          warehouse_id: string
          sku: string
          name: string
          quantity: number
          unit: string
        }[]) {
          if (!map[row.warehouse_id]) {
            map[row.warehouse_id] = { product_count: 0, total_units: 0, top_products: [] }
          }
          const s = map[row.warehouse_id]
          s.product_count += 1
          s.total_units += row.quantity
          if (s.top_products.length < 3) {
            s.top_products.push({ sku: row.sku, name: row.name, quantity: row.quantity, unit: row.unit })
          }
        }
        setStockSummary(map)
      })
  }, [])

  const columns: Column<Warehouse>[] = [
    { header: "Code", cell: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> },
    {
      header: "Warehouse",
      cell: (r) => (
        <div>
          <span className="font-medium text-foreground">{r.name}</span>
          {r.location && <p className="line-clamp-1 text-xs text-muted-foreground">{r.location}</p>}
        </div>
      ),
    },
    {
      header: "Inventory held",
      cell: (r) => {
        const s = stockSummary[r.id]
        if (!s || s.product_count === 0) {
          return <span className="text-xs text-muted-foreground">0 products</span>
        }
        return (
          <div className="flex items-center gap-2" title="Products stored here via approved Stock In movements">
            <Badge variant="secondary" className="font-normal">
              {s.product_count} product{s.product_count === 1 ? "" : "s"}
            </Badge>
            <span className="text-xs font-medium text-foreground">
              ({num(s.total_units)} total units)
            </span>
          </div>
        )
      },
    },
    {
      header: "Stock preview",
      cell: (r) => {
        const s = stockSummary[r.id]
        if (!s || s.top_products.length === 0) {
          return <span className="text-xs text-muted-foreground">Empty</span>
        }
        return (
          <div className="flex flex-wrap items-center gap-1">
            {s.top_products.map((p) => (
              <span
                key={p.sku}
                title={`${p.name}: ${num(p.quantity)} ${p.unit} (stored here via Stock Movements)`}
                className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-foreground"
              >
                <span className="font-mono text-muted-foreground">{p.sku}:</span>
                <span className="font-medium">{num(p.quantity)}</span>
              </span>
            ))}
            {s.product_count > 3 && (
              <span className="text-[11px] text-muted-foreground">+{s.product_count - 3} more</span>
            )}
          </div>
        )
      },
    },
    { header: "Location", cell: (r) => r.location ?? <span className="text-muted-foreground">—</span> },
  ]

  const fields: FieldDef[] = [
    { name: "code", label: "Warehouse code", type: "text", required: true, placeholder: "e.g. MAIN, RET1, WH-SOUTH" },
    { name: "name", label: "Warehouse name", type: "text", required: true, placeholder: "e.g. Main Distribution Center" },
    { name: "location", label: "Physical location / Address", type: "textarea", placeholder: "City, Province or complete address" },
  ]

  return (
    <div className="space-y-3">
      {/* Informative banner explaining how products attach to warehouses */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p>
            <span className="font-semibold text-foreground">How products connect to warehouses:</span> Products are
            never statically configured inside a warehouse. Instead, any product in your catalog is placed into a
            warehouse by recording a <span className="font-medium text-foreground">Stock In movement</span> (or transferred between sites).
          </p>
          <p className="text-[11px] text-muted-foreground">
            The &ldquo;Inventory held&rdquo; and &ldquo;Stock preview&rdquo; columns below automatically display live balances of all items currently stored at each site.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 text-xs">
          <Link to="/inventory/movements">
            Record Stock In <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      <ResourcePage<Warehouse>
        resource="warehouses"
        table="warehouses"
        singular="Warehouse"
        select="id, code, name, location, created_by"
        searchColumns={["code", "name", "location"]}
        searchPlaceholder="Search warehouses by code, name, or location..."
        orderBy="name"
        columns={columns}
        fields={fields}
        rowKey={(r) => r.id}
        emptyText="No storage locations configured. Create your first warehouse to begin tracking physical stock."
      />
    </div>
  )
}
