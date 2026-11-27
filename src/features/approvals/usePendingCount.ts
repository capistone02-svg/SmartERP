import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export const APPROVALS_CHANGED = "approvals-changed"

// Number of records waiting for a decision, for the badge on the Approvals tab.
// The database only counts what the signed-in user is allowed to see.
export function usePendingCount(table: "financial_entries" | "inventory_movements" | "sales_transactions", enabled = true) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let on = true
    const load = () =>
      supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending")
        .then(({ count: c, error }) => {
          if (on && !error) setCount(c ?? 0)
        })
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener(APPROVALS_CHANGED, load)
    window.addEventListener("focus", load)
    return () => {
      on = false
      window.clearInterval(timer)
      window.removeEventListener(APPROVALS_CHANGED, load)
      window.removeEventListener("focus", load)
    }
  }, [table, enabled])

  return count
}
