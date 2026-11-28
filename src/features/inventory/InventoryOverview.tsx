import { useEffect, useState } from "react"
import { ArrowRight, Boxes, Package, Truck, Warehouse } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Link } from "react-router-dom"
import { KpiCard } from "@/components/shared/KpiCard"
import { StockBadge } from "@/features/inventory/StockBadge"
import { fetchAllRows } from "@/lib/fetchAll"
import { num } from "@/lib/format"
import { supabase } from "@/lib/supabase"

interface StockRow {
  product_id: string
  sku: string
  name: string
  quantity: number
  low_stock_threshold: number
  stock_status: string
}
interface Mv {
  movement_type: "stock_in" | "stock_out"
  quantity: number
  movement_date: string
}

export default function InventoryOverview() {
  const [stock, setStock] = useState<StockRow[] | null>(null)
  const [moves, setMoves] = useState<Mv[]>([])
  const [suppliers, setSuppliers] = useState(0)
  const [warehouses, setWarehouses] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [s, m, sup, wh] = await Promise.all([
          supabase
            .from("v_product_stock")
            .select("product_id, sku, name, quantity, low_stock_threshold, stock_status")
            .limit(1000),
          fetchAllRows<Mv>((from, to) =>
            supabase
              .from("inventory_movements")
              .select("movement_type, quantity, movement_date")
              .eq("approval_status", "approved")
              .order("id")
              .range(from, to),
          ),
          supabase.from("suppliers").select("id", { count: "exact", head: true }).is("deleted_at", null),
          supabase.from("warehouses").select("id", { count: "exact", head: true }).is("deleted_at", null),
        ])
        if (!active) return
        if (s.error) throw s.error
        setStock((s.data ?? []) as StockRow[])
        setMoves(m)
        setSuppliers(sup.count ?? 0)
        setWarehouses(wh.count ?? 0)
      } catch {
        if (active) setError("The overview could not be loaded. Please try again.")
      }
    })()
    return () => {
      active = false
    }
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!stock) return <p className="text-sm text-neutral-500">Loading...</p>

  const totalStock = stock.reduce((sum, r) => sum + r.quantity, 0)
  const low = stock.filter((r) => r.stock_status !== "in_stock").sort((a, b) => a.quantity - b.quantity)

  const byMonth = new Map<string, { month: string; "Stock in": number; "Stock out": number }>()
  for (const mv of moves) {
    const key = mv.movement_date.slice(0, 7)
    const row = byMonth.get(key) ?? { month: key, "Stock in": 0, "Stock out": 0 }
    row[mv.movement_type === "stock_in" ? "Stock in" : "Stock out"] += mv.quantity
    byMonth.set(key, row)
  }
  const chart = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)

  return (
    <div className="space-y-6">
      {/* Visual workflow strip: standardizing the lifecycle */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Standard Inventory Workflow
          </h2>
          <span className="text-[11px] text-muted-foreground">
            Catalog → Physical Site → Movements → Live Balances
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/inventory/products"
            className="group flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:border-[#0e63a6]/50 hover:bg-muted/40"
          >
            <div className="rounded-md bg-blue-500/10 p-2 text-blue-600">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                <span>1. Register Product</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Set SKU, name, unit price, threshold & primary supplier.
              </p>
            </div>
          </Link>

          <Link
            to="/inventory/warehouses"
            className="group flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:border-[#0e63a6]/50 hover:bg-muted/40"
          >
            <div className="rounded-md bg-amber-500/10 p-2 text-amber-600">
              <Warehouse className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                <span>2. Warehouse Site</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Configure physical storage locations holding the stock.
              </p>
            </div>
          </Link>

          <Link
            to="/inventory/movements"
            className="group flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:border-[#0e63a6]/50 hover:bg-muted/40"
          >
            <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-600">
              <Truck className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                <span>3. Stock Movement</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Record Stock In / Stock Out per warehouse (cannot go negative).
              </p>
            </div>
          </Link>

          <Link
            to="/inventory/stock"
            className="group flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:border-[#0e63a6]/50 hover:bg-muted/40"
          >
            <div className="rounded-md bg-purple-500/10 p-2 text-purple-600">
              <Boxes className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                <span>4. Live Balances</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Read-only on-hand levels, valuation, and restock alerts.
              </p>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Catalog products" value={num(stock.length)} hint="Active items" />
        <KpiCard label="Total stock quantity" value={num(totalStock)} hint="Units on hand" />
        <KpiCard label="Low-stock items" value={num(low.length)} hint="At or below threshold" />
        <KpiCard label="Warehouses" value={num(warehouses)} hint="Active storage sites" />
        <KpiCard label="Suppliers" value={num(suppliers)} hint="Vendor partners" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <h2 className="mb-3 text-sm font-semibold">Stock movements by month</h2>
          {chart.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Stock in" fill="#0e63a6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Stock out" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Items needing restock</h2>
            <Link to="/inventory/stock" className="text-xs text-[#0e63a6] hover:underline">
              View all
            </Link>
          </div>
          {low.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">All items are sufficiently stocked.</p>
          ) : (
            <ul className="divide-y divide-border">
              {low.slice(0, 6).map((r) => (
                <li key={r.product_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {num(r.quantity)} left (threshold {num(r.low_stock_threshold)})
                    </span>
                  </span>
                  <StockBadge status={r.stock_status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
