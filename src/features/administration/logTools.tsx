import { useEffect, useState, type ReactNode } from "react"
import { Download, Search } from "lucide-react"
import { inputClass } from "@/components/shared/FormParts"
import { Button } from "@/components/ui/button"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LogQuery {
  table: string
  select: string
  searchColumns: string[]
  text: string
  eq: Record<string, string>
  like?: Record<string, string> // contains-text filters, e.g. user_agent
  from: string // yyyy-mm-dd or ""
  to: string
}

// Dates are Philippine time (+08:00), the same time the yearly archive uses.
const dayStart = (d: string) => new Date(`${d}T00:00:00+08:00`).toISOString()
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+08:00`).toISOString()

function build(q: LogQuery, withCount: boolean): any {
  let query: any = supabase.from(q.table).select(q.select, withCount ? { count: "exact" } : undefined)
  for (const [k, v] of Object.entries(q.eq)) if (v) query = query.eq(k, v)
  for (const [k, v] of Object.entries(q.like ?? {})) if (v) query = query.ilike(k, `%${v}%`)
  if (q.from) query = query.gte("occurred_at", dayStart(q.from))
  if (q.to) query = query.lte("occurred_at", dayEnd(q.to))
  const text = q.text.replace(/[%,()*\\]/g, " ").trim()
  if (text) query = query.or(q.searchColumns.map((c) => `${c}.ilike.%${text}%`).join(","))
  return query.order("occurred_at", { ascending: false }).order("id", { ascending: false })
}

export function useLogRows<T>(q: LogQuery, page: number, pageSize: number) {
  const [rows, setRows] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(q)

  useEffect(() => {
    let on = true
    setLoading(true)
    const start = (page - 1) * pageSize
    build(q, true)
      .range(start, start + pageSize - 1)
      .then(({ data, error: e, count }: any) => {
        if (!on) return
        if (e) setError(friendlyError(e))
        else {
          setError(null)
          setRows((data ?? []) as T[])
          setTotal(count ?? 0)
        }
        setLoading(false)
      })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, pageSize])

  return { rows, total, loading, error }
}

// Everything that matches the filters, up to 5,000 rows (for CSV export).
export async function fetchAllLogs<T>(q: LogQuery): Promise<T[]> {
  const out: T[] = []
  for (let start = 0; start < 5000; start += 1000) {
    const { data, error } = await build(q, false).range(start, start + 999)
    if (error) throw error
    const chunk = (data ?? []) as T[]
    out.push(...chunk)
    if (chunk.length < 1000) break
  }
  return out
}

export const fmtWhen = (ts: string) =>
  new Date(ts).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })

/* ---------- Date shortcuts ---------- */
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d) // yyyy-mm-dd
export type Preset = "today" | "7d" | "30d" | "year" | "all"
export const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "year", label: "This year" },
  { key: "all", label: "All" },
]
export function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date()
  const day = 86400000
  if (p === "today") return { from: ymd(now), to: ymd(now) }
  if (p === "7d") return { from: ymd(new Date(now.getTime() - 6 * day)), to: ymd(now) }
  if (p === "30d") return { from: ymd(new Date(now.getTime() - 29 * day)), to: ymd(now) }
  if (p === "year") return { from: `${ymd(now).slice(0, 4)}-01-01`, to: ymd(now) }
  return { from: "", to: "" }
}
export function activePreset(from: string, to: string): Preset | null {
  return PRESETS.find((p) => { const r = presetRange(p.key); return r.from === from && r.to === to })?.key ?? null
}

interface SelectDef {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}

export function LogToolbar(props: {
  placeholder: string
  text: string
  onText: (v: string) => void
  selects: SelectDef[]
  from: string
  to: string
  onRange: (from: string, to: string) => void
  onExport: () => void
  exporting: boolean
  extra?: ReactNode
}) {
  const current = activePreset(props.from, props.to)
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PRESETS.map((p) => (
            <button key={p.key} type="button"
              onClick={() => { const r = presetRange(p.key); props.onRange(r.from, r.to) }}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                current === p.key ? "bg-card text-brand-text shadow-card" : "text-muted-foreground hover:text-foreground")}>
              {p.label}
            </button>
          ))}
        </div>
        {props.extra}
        <Button className="ml-auto bg-brand text-white hover:bg-brand/90" disabled={props.exporting} onClick={props.onExport}>
          <Download className="mr-1 h-4 w-4" /> {props.exporting ? "Preparing..." : "Download CSV"}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={props.text} placeholder={props.placeholder} className={cn(inputClass, "pl-9")}
            onChange={(e) => props.onText(e.target.value)} />
        </div>
        {props.selects.map((s) => (
          <select key={s.label} aria-label={s.label} value={s.value} className={cn(inputClass, "w-auto")}
            onChange={(e) => s.onChange(e.target.value)}>
            <option value="">{s.label}: All</option>
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">From</label>
          <input type="date" value={props.from} onChange={(e) => props.onRange(e.target.value, props.to)} className={cn(inputClass, "w-auto")} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">To</label>
          <input type="date" value={props.to} onChange={(e) => props.onRange(props.from, e.target.value)} className={cn(inputClass, "w-auto")} />
        </div>
      </div>
    </div>
  )
}
