import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { KpiCard } from "@/components/shared/KpiCard"
import { formatDate, num } from "@/lib/format"
import { EMPLOYMENT_TYPES } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"

interface Dash {
  headcount: number; on_leave: number; new_hires: number; incomplete_onboarding: number
  missing_docs: number; expiring_docs: number; no_account: number
  by_area: { area: keyof typeof AREA_LABEL; employees: number }[]
  by_type: { type: string; employees: number }[]
  years: { year: number; hires: number; separations: number }[]
  probation_ending: { id: string; name: string; position: string; probation_end: string }[]
  expiring_list: { id: string; name: string; document: string; expiry_date: string }[]
  recent: { id: string; name: string; kind: string; summary: string; effective_date: string }[]
}

const BLUE = "#0e63a6"
const ORANGE = "#e08a1e"

function Box({ title, children, to }: { title: string; children: ReactNode; to?: string }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        {to && <Link to={to} className="text-xs text-brand-text hover:underline">View all</Link>}
      </div>
      {children}
    </div>
  )
}

export default function HrOverview() {
  const [d, setD] = useState<Dash | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    supabase.rpc("hr_dashboard").then(({ data, error }) => {
      if (!on) return
      if (error || !data) setError("The overview could not be loaded. Please try again.")
      else setD(data as Dash)
    })
    return () => { on = false }
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!d) return <p className="text-sm text-muted-foreground">Loading...</p>

  const byArea = d.by_area.map((a) => ({ area: AREA_LABEL[a.area] ?? a.area, Employees: a.employees }))
  const typeLabel = (t: string) => EMPLOYMENT_TYPES.find((o) => o.value === t)?.label.replace(/ \(.*\)/, "") ?? t

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Headcount" value={num(d.headcount)} hint={`${num(d.on_leave)} on leave`} />
        <KpiCard label="New hires (90 days)" value={num(d.new_hires)} hint={`${num(d.incomplete_onboarding)} still onboarding`} />
        <KpiCard label="Employees with missing documents" value={num(d.missing_docs)} hint="Required documents not on file" />
        <KpiCard label="Documents expired or expiring" value={num(d.expiring_docs)} hint="Expired, or ending within 30 days" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Box title="Documents expiring soon" to="/hr/onboarding">
          {d.expiring_list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No documents are expiring.</p>
          ) : (
            <ul className="divide-y divide-border">
              {d.expiring_list.map((x, i) => (
                <li key={i} className="py-2 text-sm">
                  <Link to={`/people/${x.id}?tab=documents`} className="font-medium hover:underline">{x.name}</Link>
                  <p className="text-xs text-muted-foreground">
                    {x.document} · <span className={x.expiry_date < new Date().toISOString().slice(0, 10) ? "text-destructive" : ""}>{formatDate(x.expiry_date)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <Box title="Probation ending (30 days)" to="/hr/employees">
          {d.probation_ending.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No probation periods are ending.</p>
          ) : (
            <ul className="divide-y divide-border">
              {d.probation_ending.map((x) => (
                <li key={x.id} className="py-2 text-sm">
                  <Link to={`/people/${x.id}`} className="font-medium hover:underline">{x.name}</Link>
                  <p className="text-xs text-muted-foreground">{x.position} · ends {formatDate(x.probation_end)}</p>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <Box title="Recent changes">
          {d.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No changes recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {d.recent.map((x, i) => (
                <li key={i} className="py-2 text-sm">
                  <Link to={`/people/${x.id}?tab=history`} className="font-medium hover:underline">{x.name}</Link>
                  <p className="text-xs text-muted-foreground">{x.summary} · {formatDate(x.effective_date)}</p>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Box title="Hires and separations per year">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.years.map((y) => ({ year: String(y.year), Hires: y.hires, Separations: y.separations }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Hires" fill={BLUE} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Separations" fill={ORANGE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Box>
        <Box title="Headcount by department">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byArea} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="area" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Employees" fill={BLUE} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Box>
      </div>

      <Box title="Employment type">
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {d.by_type.map((t) => (
            <li key={t.type}><b className="font-medium">{num(t.employees)}</b> <span className="text-muted-foreground">{typeLabel(t.type)}</span></li>
          ))}
          <li className="text-muted-foreground">{num(d.no_account)} employees have no system account (not every employee signs in)</li>
        </ul>
      </Box>
    </div>
  )
}
