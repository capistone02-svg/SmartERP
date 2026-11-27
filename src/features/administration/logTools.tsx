import { useEffect, useState } from "react"
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
  from: string // yyyy-mm-dd or ""
  to: string
}

function build(q: LogQuery, withCount: boolean): any {
  let query: any = supabase.from(q.table).select(q.select, withCount ? { count: "exact" } : undefined)
  for (const [k, v] of Object.entries(q.eq)) if (v) query = query.eq(k, v)
  if (q.from) query = query.gte("occurred_at", new Date(`${q.from}T00:00:00`).toISOString())
  if (q.to) query = query.lte("occurred_at", new Date(`${q.to}T23:59:59.999`).toISOString())
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
    return () => {
      on = false
    }
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
  new Date(ts).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })

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
  onFrom: (v: string) => void
  onTo: (v: string) => void
  onExport: () => void
  exporting: boolean
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
        <input
          value={props.text}
          placeholder={props.placeholder}
          className={cn(inputClass, "pl-9")}
          onChange={(e) => props.onText(e.target.value)}
        />
      </div>
      {props.selects.map((s) => (
        <select key={s.label} aria-label={s.label} value={s.value} className={cn(inputClass, "w-auto")}
          onChange={(e) => s.onChange(e.target.value)}>
          <option value="">{s.label}: All</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
      <div>
        <label className="mb-1 block text-xs text-neutral-500">From</label>
        <input type="date" value={props.from} onChange={(e) => props.onFrom(e.target.value)} className={cn(inputClass, "w-auto")} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-500">To</label>
        <input type="date" value={props.to} onChange={(e) => props.onTo(e.target.value)} className={cn(inputClass, "w-auto")} />
      </div>
      <Button className="ml-auto bg-[#0e63a6] text-white hover:bg-[#0b5189]" disabled={props.exporting} onClick={props.onExport}>
        <Download className="mr-1 h-4 w-4" /> {props.exporting ? "Preparing..." : "Download CSV"}
      </Button>
    </div>
  )
}
