import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { KpiCard } from "@/components/shared/KpiCard"
import { num, peso } from "@/lib/format"
import { fetchAllRows } from "@/lib/fetchAll"
import { supabase } from "@/lib/supabase"

interface Row {
  entry_type: "revenue" | "expense"
  amount: number
  entry_date: string
  category: string
}

function byCategory(rows: Row[], type: Row["entry_type"]) {
  const m = new Map<string, number>()
  rows.filter((r) => r.entry_type === type).forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + r.amount))
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
}

function CategoryList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">No entries recorded yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {items.map(([name, total]) => (
            <li key={name} className="flex justify-between gap-2 py-2 text-sm">
              <span className="truncate">{name}</span>
              <span className="font-medium text-[#0e63a6]">{peso(total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FinanceOverview() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchAllRows<Row>((from, to) =>
      supabase
        .from("financial_entries")
        .select("entry_type, amount, entry_date, category")
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

  const revenue = rows.filter((r) => r.entry_type === "revenue").reduce((s, r) => s + r.amount, 0)
  const expenses = rows.filter((r) => r.entry_type === "expense").reduce((s, r) => s + r.amount, 0)

  const perMonth = new Map<string, { month: string; Revenue: number; Expenses: number }>()
  for (const r of rows) {
    const key = r.entry_date.slice(0, 7)
    const m = perMonth.get(key) ?? { month: key, Revenue: 0, Expenses: 0 }
    if (r.entry_type === "revenue") m.Revenue += r.amount
    else m.Expenses += r.amount
    perMonth.set(key, m)
  }
  const months = [...perMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Recorded revenue" value={peso(revenue)} />
        <KpiCard label="Recorded expenses" value={peso(expenses)} />
        <KpiCard label="Net recorded" value={peso(revenue - expenses)} hint="Revenue minus expenses" />
        <KpiCard label="Financial entries" value={num(rows.length)} />
      </div>

      <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Revenue and expenses by month</h2>
        {months.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">No entries recorded yet.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => peso(Number(v))} />
                <Legend />
                <Bar dataKey="Revenue" fill="#0e63a6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryList title="Revenue by category" items={byCategory(rows, "revenue")} />
        <CategoryList title="Expenses by category" items={byCategory(rows, "expense")} />
      </div>
    </div>
  )
}