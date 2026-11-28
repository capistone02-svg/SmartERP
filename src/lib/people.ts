import { useEffect, useState } from "react"
import type { Option } from "@/components/shared/SearchSelect"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"

export interface DocType {
  code: string
  label: string
  required: boolean
  has_expiry: boolean
  sort: number
}

// The list of document kinds HR collects (a required set plus optional ones)
export function useDocTypes() {
  const [types, setTypes] = useState<DocType[]>([])
  useEffect(() => {
    supabase.from("document_types").select("code, label, required, has_expiry, sort").order("sort")
      .then(({ data }) => setTypes((data ?? []) as DocType[]))
  }, [])
  return types
}

export const AREA_OPTIONS: Option[] = Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label }))
export const EMPLOYMENT_TYPES: Option[] = [
  { value: "regular", label: "Regular" },
  { value: "probationary", label: "Probationary (6 months)" },
  { value: "contractual", label: "Contractual" },
  { value: "seasonal", label: "Seasonal" },
]

// The standard positions - the only values the forms offer, everywhere.
// Whether someone is a Department Head or Staff depends on their department;
// Admin is the system administrator.
export const POSITIONS: Option[] = [
  { value: "Admin", label: "Admin" },
  { value: "Department Head", label: "Department Head" },
  { value: "Staff", label: "Staff" },
]
export const CIVIL_STATUSES: Option[] = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "widowed", label: "Widowed" },
  { value: "separated", label: "Separated" },
]
export const STATUS_TONE = { active: "green", on_leave: "amber", resigned: "gray", terminated: "red" } as const

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")

// Government numbers are hidden until the viewer chooses to show them
export const maskNo = (v: string | null) => (v ? "••••" + v.slice(-4) : "—")

export const daysUntil = (d: string) => Math.round((Date.parse(d) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000)

export function tenure(months: number) {
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo` : ""].filter(Boolean).join(" ") || "Less than a month"
}
