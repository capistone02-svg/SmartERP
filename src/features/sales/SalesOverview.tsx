import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { KpiCard } from "@/components/shared/KpiCard"
import { num, peso } from "@/lib/format"
import { fetchAllRows } from "@/lib/fetchAll"
import { supabase } from "@/lib/supabase"

interface Row {
  amount: number
  quantity: number
  transaction_date: string
  product: { name: string } | null
}

export default function SalesOverview() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchAllRows<Row>((from, to) =>
      supabase
        .from("sales_transactions")
        .select("amount, quantity, transaction_date, product:products(name)")
        .eq("approval_status", "approved")
        .order("id")
        .range(from, to),
    )
      .then((data) => active && setRows(data))
      .catch(() => active && setError("The overview could not be loaded. Please try again."))
    return () => {
      active = false
    }
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!rows) return <p className="text-sm text-neutral-500">Loading...</p>

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const units = rows.reduce((s, r) => s + r.quantity, 0)

  const perProduct = new Map<string, { name: string; units: number; amount: number; count: number }>()
  const perMonth = new Map<string, { month: string; Sales: number }>()
  for (const r of rows) {
    const name = r.product?.name ?? "Unknown"
    const p = perProduct.get(name) ?? { name, units: 0, amount: 0, count: 0 }
    p.units += r.quantity
    p.amount += r.amount
    p.count += 1
    perProduct.set(name, p)
    const key = r.transaction_date.slice(0, 7)
    const m = perMonth.get(key) ?? { month: key, Sales: 0 }
    m.Sales += r.amount
    perMonth.set(key, m)
  }
  const products = [...perProduct.values()].sort((a, b) => b.amount - a.amount).slice(0, 8)
  const months = [...perMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total sales" value={peso(total)} />
        <KpiCard label="Transactions" value={num(rows.length)} />
        <KpiCard label="Average sale" value={rows.length ? peso(total / rows.length) : peso(0)} />
        <KpiCard label="Units sold" value={num(units)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Sales by month</h2>
          {months.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">No sales recorded yet.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => peso(Number(v))} />
                  <Bar dataKey="Sales" fill="#0e63a6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Product sales performance</h2>
          {products.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">No sales recorded yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {products.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-xs text-neutral-500">{num(p.units)} units · {num(p.count)} sales</span>
                  </span>
                  <span className="font-medium text-[#0e63a6]">{peso(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}