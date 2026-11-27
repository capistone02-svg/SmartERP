import { useEffect, useState } from "react"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"

interface Options {
  table: string
  select: string
  searchColumns?: string[]
  search?: string
  eq?: Record<string, string>
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
  const colsKey = (o.searchColumns ?? []).join(",")

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      let q = supabase.from(o.table).select(o.select, { count: "exact" })
      for (const [k, v] of Object.entries(JSON.parse(eqKey) as Record<string, string>)) {
        if (v) q = q.eq(k, v)
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
  }, [o.table, o.select, o.search, eqKey, colsKey, o.orderBy, o.ascending, o.page, o.pageSize, o.refreshKey])

  return { rows, total, loading, error }
}