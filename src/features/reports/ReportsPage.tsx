import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PageHeader } from "@/components/shared/PageHeader"
import { inputClass } from "@/components/shared/FormParts"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/features/auth/AuthContext"
import { friendlyError } from "@/lib/errors"
import { formatDate, num, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { AREA_LABEL, type FunctionalArea } from "@/types"
import { Download, Printer } from "lucide-react"

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type Flat = Record<string, string | number>
type Fmt = "money" | "date" | "nice"
interface Col { key: string; header: string; fmt?: Fmt; right?: boolean }
interface Stat { label: string; value: string }
interface ChartDef {
  title: string
  money?: boolean
  series: { key: string; name: string; color: string }[]
  data: Record<string, string | number>[]
}
interface Cfg {
  title: string
  table: string
  select: string
  dateCol: string
  dateLabel: string
  columns: Col[]
  flatten: (r: Row) => Flat
  summary: (rows: Flat[]) => Stat[]
  chart: (rows: Flat[]) => ChartDef
}

const BLUE = "#0e63a6"
const ORANGE = "#e08a1e"
const PAGE_ROWS = 50
// Pending and rejected records stay out of reports until a Department Head approves them
const NEEDS_APPROVAL = ["financial_entries", "inventory_movements", "sales_transactions"]

const nice = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
const one = (x: any) => (Array.isArray(x) ? x[0] : x)
const sum = (rows: Flat[], key: string, pred?: (r: Flat) => boolean) =>
  rows.reduce((t, r) => (pred && !pred(r) ? t : t + Number(r[key] ?? 0)), 0)

function byMonth(rows: Flat[], keys: string[], pick: (r: Flat) => Record<string, number>) {
  const m = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const k = String(r.date).slice(0, 7)
    const cur = m.get(k) ?? Object.fromEntries(keys.map((x) => [x, 0]))
    const add = pick(r)
    for (const x of keys) cur[x] += add[x] ?? 0
    m.set(k, cur)
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, v]) => ({ name, ...v }))
}

function countBy(rows: Flat[], key: string) {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = nice(String(r[key]))
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([name, count]) => ({ name, count }))
}

const CONFIGS: Record<FunctionalArea, Cfg> = {
  human_resources: {
    title: "Employee report",
    table: "employees",
    select: "employee_no, first_name, last_name, position, employment_status, hire_date",
    dateCol: "hire_date",
    dateLabel: "Hire date",
    columns: [
      { key: "id", header: "Employee ID" },
      { key: "name", header: "Name" },
      { key: "position", header: "Position" },
      { key: "status", header: "Status", fmt: "nice" },
      { key: "date", header: "Hire date", fmt: "date" },
    ],
    flatten: (r) => ({
      id: r.employee_no, name: `${r.first_name} ${r.last_name}`, position: r.position,
      status: r.employment_status, date: r.hire_date,
    }),
    summary: (rows) => [
      { label: "Employees", value: num(rows.length) },
      { label: "Active", value: num(rows.filter((r) => r.status === "active").length) },
      { label: "On leave", value: num(rows.filter((r) => r.status === "on_leave").length) },
      { label: "Separated", value: num(rows.filter((r) => r.status === "resigned" || r.status === "terminated").length) },
    ],
    chart: (rows) => ({
      title: "Employees by status",
      series: [{ key: "count", name: "Employees", color: BLUE }],
      data: countBy(rows, "status"),
    }),
  },

  finance_accounting: {
    title: "Financial entries report",
    table: "financial_entries",
    select: "entry_no, entry_date, entry_type, category, description, amount",
    dateCol: "entry_date",
    dateLabel: "Entry date",
    columns: [
      { key: "id", header: "Entry no." },
      { key: "date", header: "Date", fmt: "date" },
      { key: "type", header: "Type", fmt: "nice" },
      { key: "category", header: "Category" },
      { key: "amount", header: "Amount", fmt: "money", right: true },
    ],
    flatten: (r) => ({
      id: r.entry_no, date: r.entry_date, type: r.entry_type, category: r.category,
      description: r.description ?? "", amount: Number(r.amount),
    }),
    summary: (rows) => {
      const rev = sum(rows, "amount", (r) => r.type === "revenue")
      const exp = sum(rows, "amount", (r) => r.type === "expense")
      return [
        { label: "Revenue", value: peso(rev) },
        { label: "Expenses", value: peso(exp) },
        { label: "Net", value: peso(rev - exp) },
        { label: "Entries", value: num(rows.length) },
      ]
    },
    chart: (rows) => ({
      title: "Revenue vs expenses by month",
      money: true,
      series: [
        { key: "revenue", name: "Revenue", color: BLUE },
        { key: "expenses", name: "Expenses", color: ORANGE },
      ],
      data: byMonth(rows, ["revenue", "expenses"], (r) => ({
        revenue: r.type === "revenue" ? Number(r.amount) : 0,
        expenses: r.type === "expense" ? Number(r.amount) : 0,
      })),
    }),
  },

  inventory_warehouse: {
    title: "Stock movements report",
    table: "inventory_movements",
    select: "movement_date, movement_type, quantity, reference_no, products(name, sku)",
    dateCol: "movement_date",
    dateLabel: "Movement date",
    columns: [
      { key: "date", header: "Date", fmt: "date" },
      { key: "sku", header: "SKU" },
      { key: "product", header: "Product" },
      { key: "type", header: "Type", fmt: "nice" },
      { key: "quantity", header: "Quantity", right: true },
      { key: "reference", header: "Reference" },
    ],
    flatten: (r) => ({
      date: r.movement_date, sku: one(r.products)?.sku ?? "", product: one(r.products)?.name ?? "",
      type: r.movement_type, quantity: Number(r.quantity), reference: r.reference_no ?? "",
    }),
    summary: (rows) => {
      const inn = sum(rows, "quantity", (r) => r.type === "stock_in")
      const out = sum(rows, "quantity", (r) => r.type === "stock_out")
      return [
        { label: "Movements", value: num(rows.length) },
        { label: "Units in", value: num(inn) },
        { label: "Units out", value: num(out) },
        { label: "Net change", value: num(inn - out) },
      ]
    },
    chart: (rows) => ({
      title: "Units in vs out by month",
      series: [
        { key: "in", name: "Stock in", color: BLUE },
        { key: "out", name: "Stock out", color: ORANGE },
      ],
      data: byMonth(rows, ["in", "out"], (r) => ({
        in: r.type === "stock_in" ? Number(r.quantity) : 0,
        out: r.type === "stock_out" ? Number(r.quantity) : 0,
      })),
    }),
  },

  sales_marketing: {
    title: "Sales transactions report",
    table: "sales_transactions",
    select: "transaction_no, transaction_date, quantity, amount, products(name), customers(full_name)",
    dateCol: "transaction_date",
    dateLabel: "Transaction date",
    columns: [
      { key: "id", header: "Transaction no." },
      { key: "date", header: "Date", fmt: "date" },
      { key: "product", header: "Product" },
      { key: "customer", header: "Customer" },
      { key: "quantity", header: "Qty", right: true },
      { key: "amount", header: "Amount", fmt: "money", right: true },
    ],
    flatten: (r) => ({
      id: r.transaction_no, date: r.transaction_date, product: one(r.products)?.name ?? "",
      customer: one(r.customers)?.full_name ?? "", quantity: Number(r.quantity), amount: Number(r.amount),
    }),
    summary: (rows) => {
      const total = sum(rows, "amount")
      return [
        { label: "Total sales", value: peso(total) },
        { label: "Transactions", value: num(rows.length) },
        { label: "Units sold", value: num(sum(rows, "quantity")) },
        { label: "Average sale", value: peso(rows.length ? total / rows.length : 0) },
      ]
    },
    chart: (rows) => ({
      title: "Sales by month",
      money: true,
      series: [{ key: "amount", name: "Sales", color: BLUE }],
      data: byMonth(rows, ["amount"], (r) => ({ amount: Number(r.amount) })),
    }),
  },

  customer_service: {
    title: "Service cases report",
    table: "service_cases",
    select: "case_no, case_type, subject, date_submitted, status",
    dateCol: "date_submitted",
    dateLabel: "Date submitted",
    columns: [
      { key: "id", header: "Case no." },
      { key: "date", header: "Submitted", fmt: "date" },
      { key: "type", header: "Type", fmt: "nice" },
      { key: "subject", header: "Subject" },
      { key: "status", header: "Status", fmt: "nice" },
    ],
    flatten: (r) => ({
      id: r.case_no, date: r.date_submitted, type: r.case_type, subject: r.subject, status: r.status,
    }),
    summary: (rows) => [
      { label: "Cases", value: num(rows.length) },
      { label: "Pending", value: num(rows.filter((r) => r.status === "open" || r.status === "in_progress").length) },
      { label: "Resolved", value: num(rows.filter((r) => r.status === "resolved" || r.status === "closed").length) },
      { label: "Complaints", value: num(rows.filter((r) => r.type === "complaint").length) },
    ],
    chart: (rows) => ({
      title: "Cases by type",
      series: [{ key: "count", name: "Cases", color: BLUE }],
      data: countBy(rows, "type"),
    }),
  },
}

/* ---------- helpers ---------- */

async function fetchAll(cfg: Cfg, from: string, to: string): Promise<Row[]> {
  const out: Row[] = []
  for (let start = 0; start < 10000; start += 1000) {
    let q: any = supabase.from(cfg.table).select(cfg.select).is("deleted_at", null)
    if (NEEDS_APPROVAL.includes(cfg.table)) q = q.eq("approval_status", "approved")
    if (from) q = q.gte(cfg.dateCol, from)
    if (to) q = q.lte(cfg.dateCol, to)
    const { data, error } = await q.order(cfg.dateCol, { ascending: false }).order("id").range(start, start + 999)
    if (error) throw error
    const chunk = (data ?? []) as Row[]
    out.push(...chunk)
    if (chunk.length < 1000) break
  }
  return out
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    let s = String(v ?? "")
    // Stop spreadsheet programs from running text as a formula
    if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function show(v: string | number | undefined, fmt?: Fmt) {
  if (v === undefined || v === "") return "—"
  if (fmt === "money") return peso(Number(v))
  if (fmt === "date") return formatDate(String(v))
  if (fmt === "nice") return nice(String(v))
  return String(v)
}

const stamp = () => new Date().toISOString().slice(0, 10)
const tick = { fontSize: 11 }
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n)

function Stats({ items }: { items: Stat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
          <p className="text-xs text-neutral-500">{s.label}</p>
          <p className="mt-1 text-2xl font-semibold text-[#0e63a6]">{s.value}</p>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ chart }: { chart: ChartDef }) {
  return (
    <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{chart.title}</h3>
      <div className="h-64">
        {chart.data.length === 0 ? (
          <p className="pt-24 text-center text-sm text-neutral-400">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf5" />
              <XAxis dataKey="name" tick={tick} />
              <YAxis allowDecimals={false} tick={tick} tickFormatter={(v) => compact(Number(v))} />
              <Tooltip formatter={(v) => (chart.money ? peso(Number(v)) : num(Number(v)))} />
              {chart.series.length > 1 && <Legend />}
              {chart.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

/* ---------- department report (Head and Staff) ---------- */
        <Button variant="outline" className="no-print" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Print / Save as PDF
        </Button>

function AreaReport({ area, canExport }: { area: FunctionalArea; canExport: boolean }) {
  
  const cfg = CONFIGS[area]
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [rows, setRows] = useState<Flat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    setLoading(true)
    fetchAll(cfg, from, to)
      .then((r) => {
        if (!on) return
        setRows(r.map(cfg.flatten))
        setError(null)
      })
      .catch((e) => on && setError(friendlyError(e)))
      .finally(() => on && setLoading(false))
    return () => {
      on = false
    }
  }, [cfg, from, to])

  const stats = useMemo(() => cfg.summary(rows), [cfg, rows])
  const chart = useMemo(() => cfg.chart(rows), [cfg, rows])
  const invalidRange = from !== "" && to !== "" && from > to

  function exportCsv() {
    downloadCsv(
      `${area}-report-${stamp()}.csv`,
      cfg.columns.map((c) => c.header),
      rows.map((r) =>
        cfg.columns.map((c) => (c.fmt === "nice" ? nice(String(r[c.key] ?? "")) : (r[c.key] ?? ""))),
      ),
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">{cfg.dateLabel} from</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(inputClass, "w-auto")} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">to</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputClass, "w-auto")} />
        </div>
        {(from || to) && (
          <Button variant="outline" onClick={() => { setFrom(""); setTo("") }}>Clear</Button>
        )}
        {canExport && (
          <Button className="ml-auto bg-[#0e63a6] text-white hover:bg-[#0b5189]" disabled={rows.length === 0 || loading} onClick={exportCsv}>
            <Download className="mr-1 h-4 w-4" /> Download CSV
          </Button>
        )}
      </div>

      {invalidRange && <p className="mb-3 text-sm text-red-600">The start date must not be after the end date.</p>}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <Stats items={stats} />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard chart={chart} />
          <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold">{cfg.title}</h3>
            <p className="text-sm text-neutral-600">
              {loading ? "Loading..." : `${num(rows.length)} record${rows.length === 1 ? "" : "s"} in this period.`}{" "}
              {!canExport && "Downloads are available to department heads."}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              You only see records your role is allowed to view. Deleted records and records still waiting for approval are not included.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[#dbe3f5] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#f6f9fe] hover:bg-[#f6f9fe]">
                  {cfg.columns.map((c) => (
                    <TableHead key={c.key} className={cn("text-xs font-semibold text-neutral-600", c.right && "text-right")}>
                      {c.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, PAGE_ROWS).map((r, i) => (
                  <TableRow key={i}>
                    {cfg.columns.map((c) => (
                      <TableCell key={c.key} className={cn("text-sm", c.right && "text-right")}>
                        {show(r[c.key], c.fmt)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={cfg.columns.length} className="py-8 text-center text-sm text-neutral-400">
                      No records found for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {rows.length > PAGE_ROWS && (
            <p className="border-t border-[#eef1f8] px-4 py-2 text-xs text-neutral-500">
              Showing the first {PAGE_ROWS} of {num(rows.length)} records.{canExport ? " Download the CSV for all of them." : ""}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/* ---------- consolidated report (Admin) ---------- */

function AdminReport() {
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState("")
  const [data, setData] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc("available_years").then(({ data: ys }: { data: unknown }) => {
      if (Array.isArray(ys)) setYears(ys as number[])
    })
  }, [])

  useEffect(() => {
    let on = true
    setLoading(true)
    supabase.rpc("overview_kpis", { p_year: year ? Number(year) : null }).then(({ data: d, error: e }: { data: unknown; error: unknown }) => {
      if (!on) return
      if (e) setError(friendlyError(e))
      else {
        setError(null)
        setData(d as Row)
      }
      setLoading(false)
    })
    return () => {
      on = false
    }
  }, [year])

  const table: [string, string, string | number, boolean][] = data
    ? [
        ["Human Resources", "Total employees", data.hr.total, false],
        ["Human Resources", "Active employees", data.hr.active, false],
        ["Finance and Accounting", "Revenue", data.finance.revenue, true],
        ["Finance and Accounting", "Expenses", data.finance.expenses, true],
        ["Finance and Accounting", "Net", Number(data.finance.revenue) - Number(data.finance.expenses), true],
        ["Finance and Accounting", "Entries", data.finance.entries, false],
        ["Inventory and Warehouse", "Products (current)", data.inventory.products, false],
        ["Inventory and Warehouse", "Suppliers (current)", data.inventory.suppliers, false],
        ["Inventory and Warehouse", "Total stock (current)", data.inventory.total_stock, false],
        ["Inventory and Warehouse", "Low stock items (current)", data.inventory.low_stock, false],
        ["Inventory and Warehouse", "Units in", data.inventory.stock_in, false],
        ["Inventory and Warehouse", "Units out", data.inventory.stock_out, false],
        ["Sales and Marketing", "Total sales", data.sales.total_sales, true],
        ["Sales and Marketing", "Transactions", data.sales.transactions, false],
        ["Customer Service", "Cases", data.customer_service.total, false],
        ["Customer Service", "Pending cases", data.customer_service.pending, false],
        ["Customer Service", "Resolved cases", data.customer_service.resolved, false],
      ]
    : []

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="rp-year" className="text-sm text-neutral-600">Period</label>
        <select id="rp-year" value={year} onChange={(e) => setYear(e.target.value)} className={cn(inputClass, "w-auto")}>
          <option value="">All Time</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button
          className="ml-auto bg-[#0e63a6] text-white hover:bg-[#0b5189]"
          disabled={!data || loading}
          onClick={() =>
            downloadCsv(`consolidated-summary-${year || "all-time"}.csv`, ["Department", "Measure", "Value"],
              table.map(([d, m, v]) => [d, m, Number(v)]))
          }
        >
          <Download className="mr-1 h-4 w-4" /> Download CSV
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className={cn("overflow-hidden rounded-xl border border-[#dbe3f5] bg-white shadow-sm", loading && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f6f9fe] hover:bg-[#f6f9fe]">
              <TableHead className="text-xs font-semibold text-neutral-600">Department</TableHead>
              <TableHead className="text-xs font-semibold text-neutral-600">Measure</TableHead>
              <TableHead className="text-right text-xs font-semibold text-neutral-600">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.map(([d, m, v, money]) => (
              <TableRow key={`${d}-${m}`}>
                <TableCell className="text-sm">{d}</TableCell>
                <TableCell className="text-sm">{m}</TableCell>
                <TableCell className="text-right text-sm font-medium">{money ? peso(Number(v)) : num(Number(v))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Consolidated totals only. Individual records stay inside each department.
      </p>
    </>
  )
}

export default function ReportsPage() {
        <style>{`@media print {
        aside, nav, header, .no-print { display: none !important; }
        body { background: white !important; }
        main { padding: 0 !important; margin: 0 !important; }
      }`}</style>
  const { profile } = useAuth()
  const [adminView, setAdminView] = useState("summary")
  if (!profile) return null

  const isAdmin = profile.role === "admin"
  const area = profile.functional_area
  return (
    <>
      <PageHeader
        title="Reports"
        description={isAdmin ? "Consolidated summary and read-only department reports." : `${area ? AREA_LABEL[area] : ""} reports.`}
      />
      {isAdmin ? (
        <>
          <div className="mb-4">
            <select aria-label="Report" value={adminView} onChange={(e) => setAdminView(e.target.value)} className={cn(inputClass, "w-auto")}>
              <option value="summary">Consolidated summary</option>
              {(Object.keys(AREA_LABEL) as FunctionalArea[]).map((a) => (
                <option key={a} value={a}>{AREA_LABEL[a]}</option>
              ))}
            </select>
          </div>
          {adminView === "summary" ? <AdminReport /> : <AreaReport key={adminView} area={adminView as FunctionalArea} canExport />}
        </>
      ) : area ? (
        <AreaReport key={area} area={area} canExport={profile.role === "department_head"} />
      ) : (
        <p className="text-sm text-neutral-500">No reports are available for your account.</p>
      )}
    </>
  )
}