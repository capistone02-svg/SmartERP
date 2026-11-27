import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { KpiCard } from "@/components/shared/KpiCard"
import { StatusPill } from "@/components/shared/StatusPill"
import { formatDate, num, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { KINDS, STATUS_TONE, TYPE_LABEL, TYPE_TONE, statusLabel, type CaseKind } from "./caseConfig"

interface Dash {
  total: number; pending: number; overdue: number; unassigned: number; refunds_waiting: number
  refund_approved_amount: number; avg_days: number; avg_rating: number | null
  by_type: { type: string; pending: number; total: number }[]
  workload: { name: string; open_cases: number; overdue: number }[]
  top_products: { name: string; cases: number }[]
  trend: { period: string; cases: number }[]
  attention: { id: string; case_no: string; type: string; subject: string; status: string; due_date: string | null; reason: string; assignee: string | null }[]
}

const BLUE = "#0e63a6"
const ORANGE = "#e08a1e"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const typePath = (t: string) => (t in KINDS ? `/customer-service/${KINDS[t as CaseKind].path}` : "/customer-service/cases")

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </div>
  )
}

export default function CustomerServiceOverview() {
  const [d, setD] = useState<Dash | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    supabase.rpc("cs_dashboard").then(({ data, error }) => {
      if (!on) return
      if (error || !data) setError("The overview could not be loaded. Please try again.")
      else setD(data as Dash)
    })
    return () => { on = false }
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!d) return <p className="text-sm text-muted-foreground">Loading...</p>

  const trend = d.trend.map((t) => ({ label: MONTHS[Number(t.period.slice(5)) - 1], Cases: t.cases }))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pending cases" value={num(d.pending)} hint="Still need work" />
        <KpiCard label="Overdue" value={num(d.overdue)} hint="Past the due date" />
        <KpiCard label="Unassigned" value={num(d.unassigned)} hint="Nobody is handling these" />
        <KpiCard label="Refunds waiting" value={num(d.refunds_waiting)} hint="Requested or in Head review" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Average resolution time" value={`${d.avg_days} days`} />
        <KpiCard label="Customer satisfaction" value={d.avg_rating ? `${d.avg_rating} / 5` : "—"} hint="Average feedback rating, last 12 months" />
        <KpiCard label="Refunds approved (12 mo)" value={peso(d.refund_approved_amount)} />
        <KpiCard label="Total cases" value={num(d.total)} />
      </div>

      <Box title="Needs attention">
        {d.attention.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing is overdue, unassigned or waiting for a decision.</p>
        ) : (
          <ul className="divide-y divide-border">
            {d.attention.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <Link to={typePath(a.type)} className="font-medium text-brand-text hover:underline">{a.case_no}</Link>
                <StatusPill label={TYPE_LABEL[a.type] ?? a.type} tone={TYPE_TONE[a.type as keyof typeof TYPE_TONE] ?? "gray"} />
                <span className="min-w-0 flex-1 truncate">{a.subject}</span>
                <StatusPill label={a.reason} tone={a.reason === "overdue" ? "red" : a.reason === "unassigned" ? "amber" : "blue"} />
                <span className="w-28 text-xs text-muted-foreground">{a.assignee ?? "Unassigned"}</span>
                <span className="w-24 text-xs text-muted-foreground">{a.due_date ? `Due ${formatDate(a.due_date)}` : ""}</span>
                <StatusPill label={statusLabel(a.type, a.status)} tone={STATUS_TONE[a.status] ?? "gray"} />
              </li>
            ))}
          </ul>
        )}
      </Box>

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Open cases per employee">
          {d.workload.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No assigned open cases.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.workload} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="open_cases" name="Open" fill={BLUE} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="overdue" name="Overdue" fill={ORANGE} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Box>
        <Box title="Cases submitted by month">
          {trend.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No cases recorded yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Cases" fill={BLUE} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Box>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Pending by case type">
          <ul className="divide-y divide-border">
            {d.by_type.map((t) => (
              <li key={t.type} className="flex items-center justify-between py-2 text-sm">
                <Link to={typePath(t.type)} className="hover:underline">{TYPE_LABEL[t.type] ?? t.type}</Link>
                <span><b className="font-medium">{num(t.pending)}</b> <span className="text-muted-foreground">pending of {num(t.total)}</span></span>
              </li>
            ))}
          </ul>
        </Box>
        <Box title="Products with the most complaints (12 months)">
          {d.top_products.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No complaints are linked to a product yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {d.top_products.map((p) => (
                <li key={p.name} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{p.name}</span><b className="font-medium">{num(p.cases)}</b>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </div>
  )
}
