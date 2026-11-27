import type { Lookup, Option } from "@/components/shared/SearchSelect"
import { supabase } from "@/lib/supabase"

interface Row {
  id: string
  label: string
  sub: string | null
}
const toOption = (r: Row): Option => ({ value: r.id, label: r.label, sub: r.sub ?? undefined })

// Searchable lists for Customer Service forms (customers, products, sales).
// They search in the database, so they stay fast with thousands of records.
export function csLookup(kind: "customer" | "product" | "sale"): Lookup {
  return {
    search: async (q) => {
      const { data } = await supabase.rpc("cs_lookup", { p_kind: kind, p_q: q })
      return ((data ?? []) as Row[]).map(toOption)
    },
    label: async (id) => {
      const { data } = await supabase.rpc("cs_lookup", { p_kind: kind, p_q: "", p_id: id })
      const row = ((data ?? []) as Row[])[0]
      return row ? toOption(row) : null
    },
  }
}

export const customerLookup = csLookup("customer")
export const productLookup = csLookup("product")
export const saleLookup = csLookup("sale")
