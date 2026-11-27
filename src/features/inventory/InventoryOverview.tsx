import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { KpiCard } from "@/components/shared/KpiCard"
import { StockBadge } from "@/features/inventory/StockBadge"
import { num } from "@/lib/format"
import { fetchAllRows } from "@/lib/fetchAll"
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [s, m, sup] = await Promise.all([
          supabase.from("v_product_stock").select("product_id, sku, name, quantity, low_stock_threshold, stock_status").limit(1000),
          fetchAllRows<Mv>((from, to) =>
            supabase
              .from("inventory_movements")
              .select("movement_type, quantity, movement_date")
              .eq("approval_status", "approved")
              .order("id")
              .range(from, to),
          ),
          supabase.from("suppliers").select("id", { count: "exact", head: true }),
        ])
        if (!active) return
        if (s.error) throw s.error
        setStock((s.data ?? []) as StockRow[])
        setMoves(m)
        setSuppliers(sup.count ?? 0)
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total products" value={num(stock.length)} />
        <KpiCard label="Total stock quantity" value={num(totalStock)} />
        <KpiCard label="Low-stock items" value={num(low.length)} />
        <KpiCard label="Suppliers" value={num(suppliers)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Stock movements by month</h2>
          {chart.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">No movements recorded yet.</p>
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

        <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Items needing restock</h2>
          {low.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">All items are sufficiently stocked.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {low.slice(0, 6).map((r) => (
                <li key={r.product_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="text-xs text-neutral-500">
                      {num(r.quantity)} left (level {num(r.low_stock_threshold)})
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