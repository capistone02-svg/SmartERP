import { useEffect, useState } from "react"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"

// Extra conditions beyond "equals", e.g. a date range or a list of allowed values.
export type Condition =
  | { op: "gte" | "lte"; column: string; value: string }
  | { op: "in"; column: string; value: string[] }

interface Options {
  table: string
  select: string
  searchColumns?: string[]
  search?: string
  eq?: Record<string, string>
  where?: Condition[]
  orderBy: string
  ascending?: boolean
  page: number
  pageSize: number
  refreshKey?: number
}

export function usePagedQuery<T>(o: Options) {
  const [rows, setRows] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const eqKey = JSON.stringify(o.eq ?? {})
  const whereKey = JSON.stringify(o.where ?? [])
  const colsKey = (o.searchColumns ?? []).join(",")

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      let q = supabase.from(o.table).select(o.select, { count: "exact" })
      for (const [k, v] of Object.entries(JSON.parse(eqKey) as Record<string, string>)) {
        if (v) q = q.eq(k, v)
      }
      for (const c of JSON.parse(whereKey) as Condition[]) {
        if (c.op === "in") q = q.in(c.column, c.value)
        else if (c.op === "gte") q = q.gte(c.column, c.value)
        else q = q.lte(c.column, c.value)
      }
      const s = (o.search ?? "").replace(/[,()%*]/g, " ").trim()
      if (s && colsKey) {
        q = q.or(colsKey.split(",").map((c) => `${c}.ilike.%${s}%`).join(","))
      }
      const from = (o.page - 1) * o.pageSize
      const { data, count, error } = await q
        .order(o.orderBy, { ascending: o.ascending ?? true })
        .range(from, from + o.pageSize - 1)
      if (!active) return
      if (error) {
        setError(friendlyError(error))
        setRows([])
        setTotal(0)
      } else {
        setError(null)
        setRows((data ?? []) as unknown as T[])
        setTotal(count ?? 0)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [o.table, o.select, o.search, eqKey, whereKey, colsKey, o.orderBy, o.ascending, o.page, o.pageSize, o.refreshKey])

  return { rows, total, loading, error }
}