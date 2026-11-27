import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { DeltaLine, type Compare } from "@/components/shared/KpiCard"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/AuthContext"
import { inputClass } from "@/components/shared/FormParts"
import { friendlyError } from "@/lib/errors"
import { num, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL, type FunctionalArea } from "@/types"
import { cn } from "@/lib/utils"

interface Kpis {
  year: number | null
  hr: { total: number; active: number; by_area: Record<string, number> }
  finance: { revenue: number; expenses: number; entries: number }
  inventory: { products: number; suppliers: number; total_stock: number; low_stock: number; stock_in: number; stock_out: number }
  sales: { total_sales: number; transactions: number; top_products: { name: string; amount: number }[] }
  customer_service: { total: number; pending: number; resolved: number; by_type: Record<string, number> }
  trend: {
    sales: { period: string; amount: number; transactions: number }[]
    finance: { period: string; revenue: number | null; expenses: number | null }[]
    cases: { period: string; cases: number }[]
  }
}

const BLUE = "#0e63a6"
const ORANGE = "#e08a1e"
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "2026-03" -> "Mar"; "2026" stays "2026"
const periodLabel = (p: string) => (p.length === 7 ? MONTHS[Number(p.slice(5)) - 1] ?? p : p)

const MODULE_PATH: Record<FunctionalArea, string> = {
  human_resources: "/hr",
  finance_accounting: "/finance",
  inventory_warehouse: "/inventory",
  sales_marketing: "/sales",
  customer_service: "/customer-service",
}

function Card({ label, value, hint, compare }: { label: string; value: string; hint?: string; compare?: Compare }) {
  return (
    <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#0e63a6]">{value}</p>
      {compare ? <DeltaLine compare={compare} /> : hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  )
}

function ChartBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  )
}

const Empty = () => <p className="pt-24 text-center text-sm text-neutral-400">No data for this period.</p>

// Staff: how their own submissions are doing (only where records need approval).
const APPROVAL_TABLE: Partial<Record<FunctionalArea, string>> = {
  finance_accounting: "financial_entries",
  inventory_warehouse: "inventory_movements",
  sales_marketing: "sales_transactions",
}
type Mine = { pending: number; approved: number; rejected: number }

export default function OverviewPage() {
  const { profile } = useAuth()
  const isStaff = profile?.role === "staff"
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<string>("") // "" = All Time
  const [data, setData] = useState<Kpis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [prev, setPrev] = useState<Kpis | null>(null)
  const [mine, setMine] = useState<Mine | null>(null)

  // Staff summary: counts of their own records by approval status
  useEffect(() => {
    if (!isStaff || !profile?.functional_area) return
    const table = APPROVAL_TABLE[profile.functional_area]
    if (!table) return
    let on = true
    const count = (status: string) =>
      supabase.from(table).select("id", { count: "exact", head: true })
        .eq("created_by", profile.id).eq("approval_status", status).then((r) => r.count ?? 0)
    Promise.all([count("pending"), count("approved"), count("rejected")]).then(([pending, approved, rejected]) => {
      if (on) setMine({ pending, approved, rejected })
    })
    return () => {
      on = false
    }
  }, [isStaff, profile])

  // Years that have data
  useEffect(() => {
    if (isStaff) return
    supabase.rpc("available_years").then(({ data: ys }: { data: unknown }) => {
      if (Array.isArray(ys)) setYears(ys as number[])
    })
  }, [isStaff])

  // KPIs for the selected period
  useEffect(() => {
    if (isStaff) return
    let active = true
    setLoading(true)
    supabase.rpc("overview_kpis", { p_year: year ? Number(year) : null }).then(({ data: d, error: e }: { data: unknown; error: unknown }) => {
      if (!active) return
      if (e) setError(friendlyError(e))
      else {
        setError(null)
        setData(d as Kpis)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [year, isStaff])

  // The year before the selected one, for the comparison on the cards
  useEffect(() => {
    if (isStaff || !year) {
      setPrev(null)
      return
    }
    let active = true
    supabase.rpc("overview_kpis", { p_year: Number(year) - 1 }).then(({ data: d, error: e }: { data: unknown; error: unknown }) => {
      if (active) setPrev(e ? null : (d as Kpis))
    })
    return () => {
      active = false
    }
  }, [year, isStaff])

  if (isStaff) {
    const path = profile?.functional_area ? MODULE_PATH[profile.functional_area] : "/"
    return (
      <>
        <PageHeader title="Overview" description={`Good day, ${profile?.full_name ?? ""}!`} />
        <div className="rounded-xl border border-[#dbe3f5] bg-white p-6 text-sm shadow-sm">
          Your work is in your department module.{" "}
          <Link to={path} className="font-medium text-[#0e63a6] underline">
            Go to {profile?.functional_area ? AREA_LABEL[profile.functional_area] : "your module"}
          </Link>
        </div>
        {mine && (
          <>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Your submissions</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card label="Pending approval" value={num(mine.pending)} hint="Waiting for your Department Head" />
              <Card label="Rejected" value={num(mine.rejected)} hint={mine.rejected > 0 ? "Open them and fix the issue" : "Nothing to fix"} />
              <Card label="Approved" value={num(mine.approved)} hint="Counted in reports" />
            </div>
          </>
        )}
      </>
    )
  }

  const cmpLabel = year ? String(Number(year) - 1) : ""
  const cmp = (cur: number, before: number | undefined, upIsGood = true): Compare | undefined =>
    prev && before !== undefined ? { current: cur, previous: before, label: cmpLabel, upIsGood } : undefined
  const partial = year !== "" && Number(year) === new Date().getFullYear()

  const periodText = year ? `Year ${year}` : "All Time"
  const trendTick = { fontSize: 11 }

  return (
    <>
      <PageHeader title="Overview" description={`Consolidated view of all departments. Showing: ${periodText}.`} />

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="ov-year" className="text-sm text-neutral-600">Period</label>
        <select id="ov-year" value={year} onChange={(e) => setYear(e.target.value)} className={cn(inputClass, "w-auto")}>
          <option value="">All Time</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && !data && <p className="text-sm text-neutral-500">Loading...</p>}

      {data && (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card label="Total employees" value={num(data.hr.total)} hint="Employed in the period" />
            <Card label="Active employees" value={num(data.hr.active)} hint="At the end of the period" />
            <Card label="Total revenue" value={peso(data.finance.revenue)} compare={cmp(data.finance.revenue, prev?.finance.revenue)} />
            <Card label="Total expenses" value={peso(data.finance.expenses)} compare={cmp(data.finance.expenses, prev?.finance.expenses, false)} />
            <Card label="Total products" value={num(data.inventory.products)} hint="Current catalog" />
            <Card label="Low stock items" value={num(data.inventory.low_stock)} hint="Current" />
            <Card label="Total sales" value={peso(data.sales.total_sales)} compare={cmp(data.sales.total_sales, prev?.sales.total_sales)} />
            <Card label="Transactions" value={num(data.sales.transactions)} compare={cmp(data.sales.transactions, prev?.sales.transactions)} />
            <Card label="Service cases" value={num(data.customer_service.total)} compare={cmp(data.customer_service.total, prev?.customer_service.total, false)} />
            <Card label="Pending cases" value={num(data.customer_service.pending)} hint="Open and in progress" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartBox title="Sales over time">
              {data.trend.sales.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend.sales.map((s) => ({ ...s, label: periodLabel(s.period) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf5" />
                    <XAxis dataKey="label" tick={trendTick} />
                    <YAxis tick={trendTick} tickFormatter={(v) => compact(Number(v))} />
                    <Tooltip formatter={(v) => peso(Number(v))} />
                    <Line type="monotone" dataKey="amount" name="Sales" stroke={BLUE} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartBox>

            <ChartBox title="Revenue vs expenses">
              {data.trend.finance.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend.finance.map((f) => ({
                    label: periodLabel(f.period), revenue: f.revenue ?? 0, expenses: f.expenses ?? 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf5" />
                    <XAxis dataKey="label" tick={trendTick} />
                    <YAxis tick={trendTick} tickFormatter={(v) => compact(Number(v))} />
                    <Tooltip formatter={(v) => peso(Number(v))} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill={BLUE} />
                    <Bar dataKey="expenses" name="Expenses" fill={ORANGE} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartBox>

            <ChartBox title="Service cases over time">
              {data.trend.cases.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend.cases.map((c) => ({ ...c, label: periodLabel(c.period) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf5" />
                    <XAxis dataKey="label" tick={trendTick} />
                    <YAxis allowDecimals={false} tick={trendTick} />
                    <Tooltip />
                    <Bar dataKey="cases" name="Cases" fill={BLUE} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartBox>

            <ChartBox title="Top products by sales">
              {data.sales.top_products.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={data.sales.top_products}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf5" />
                    <XAxis type="number" tick={trendTick} />
                    <YAxis type="category" dataKey="name" width={130} tick={trendTick} />
                    <Tooltip formatter={(v) => peso(Number(v))} />
                    <Bar dataKey="amount" name="Sales" fill={BLUE} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartBox>

            <ChartBox title="Active employees by area">
              {Object.keys(data.hr.by_area).length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Object.entries(data.hr.by_area).map(([k, v]) => ({
                    name: AREA_LABEL[k as FunctionalArea] ?? k, count: v,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis allowDecimals={false} tick={trendTick} />
                    <Tooltip />
                    <Bar dataKey="count" name="Employees" fill={BLUE} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartBox>

            <ChartBox title="Stock movements">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "Stock in", qty: data.inventory.stock_in },
                  { name: "Stock out", qty: data.inventory.stock_out },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf5" />
                  <XAxis dataKey="name" tick={trendTick} />
                  <YAxis tick={trendTick} tickFormatter={(v) => compact(Number(v))} />
                  <Tooltip />
                  <Bar dataKey="qty" name="Units" fill={BLUE} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Figures are totals only. Product and stock counts show the current position. Everything else follows the selected period.
            {year && " Arrows compare with the previous year."}
            {partial && " This year is not finished yet, so the comparison with a full year will look lower."}
          </p>
        </div>
      )}
    </>
  )
}