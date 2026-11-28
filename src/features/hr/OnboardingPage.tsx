import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Search } from "lucide-react"
import { inputClass } from "@/components/shared/FormParts"
import { StatusPill } from "@/components/shared/StatusPill"
import { formatDate, num } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"
import { cn } from "@/lib/utils"

interface Row {
  id: string; employee_no: string; name: string; job_position: string; area: keyof typeof AREA_LABEL
  hire_date: string; employment_type: string; required_total: number; on_file: number; missing: string[]
  expiring: number; expired: number; has_account: boolean; has_personal: boolean; complete: boolean
}

const FILTERS = [
  { key: "incomplete", label: "Incomplete" },
  { key: "new", label: "New hires (90 days)" },
  { key: "expiry", label: "Expired or expiring" },
  { key: "complete", label: "Complete" },
  { key: "all", label: "Everyone" },
] as const
type FilterKey = (typeof FILTERS)[number]["key"]

// The HR checklist: every current employee against the required documents and details.
export default function OnboardingPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>("incomplete")
  const [q, setQ] = useState("")

  useEffect(() => {
    supabase.rpc("hr_compliance").then(({ data, error }) => {
      if (error) setError("The checklist could not be loaded. Please try again.")
      else setRows((data ?? []) as Row[])
    })
  }, [])

  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const shown = useMemo(() => {
    const text = q.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (filter === "incomplete" && r.complete) return false
      if (filter === "complete" && !r.complete) return false
      if (filter === "new" && r.hire_date < cutoff) return false
      if (filter === "expiry" && r.expiring + r.expired === 0) return false
      return !text || (r.name + " " + r.employee_no + " " + r.job_position).toLowerCase().includes(text)
    })
  }, [rows, filter, q, cutoff])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!rows) return <p className="text-sm text-muted-foreground">Loading...</p>

  const count = (f: FilterKey) =>
    rows.filter((r) =>
      f === "incomplete" ? !r.complete : f === "complete" ? r.complete : f === "new" ? r.hire_date >= cutoff
        : f === "expiry" ? r.expiring + r.expired > 0 : true).length

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Each employee is checked against the {rows[0]?.required_total ?? 8} required documents and their personal details.
        Open a file to upload or verify documents.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("rounded-full px-3.5 py-1.5 text-sm transition-colors",
                filter === f.key ? "bg-card font-medium text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}>
              {f.label} <span className="text-xs text-muted-foreground">{num(count(f.key))}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ID..." className={cn(inputClass, "pl-9")} />
        </div>
      </div>

      <div className="space-y-2">
        {shown.length === 0 && <p className="rounded-3xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">Nobody matches this filter.</p>}
        {shown.slice(0, 100).map((r) => {
          const pct = r.required_total ? Math.round((r.on_file / r.required_total) * 100) : 100
          return (
            <div key={r.id} className="rounded-3xl bg-card p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <Link to={`/people/${r.id}?tab=documents`} className="font-medium hover:underline">{r.name}</Link>
                  <p className="text-xs text-muted-foreground">
                    {r.employee_no} · {r.job_position} · {AREA_LABEL[r.area] ?? r.area} · hired {formatDate(r.hire_date)}
                  </p>
                </div>
                <div className="w-40">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", pct === 100 ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.on_file} of {r.required_total} documents</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusPill label={r.has_personal ? "Details complete" : "Details missing"} tone={r.has_personal ? "green" : "amber"} />
                  <StatusPill label={r.has_account ? "Has account" : "No account"} tone={r.has_account ? "blue" : "gray"} />
                  {r.expired > 0 && <StatusPill label={`${r.expired} expired`} tone="red" />}
                  {r.expiring > 0 && <StatusPill label={`${r.expiring} expiring`} tone="amber" />}
                </div>
              </div>
              {r.missing.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Needed:</span> {r.missing.join(", ")}</p>
              )}
            </div>
          )
        })}
        {shown.length > 100 && <p className="text-center text-xs text-muted-foreground">Showing the first 100. Use search to narrow down.</p>}
      </div>
    </>
  )
}
