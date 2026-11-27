import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { KpiCard } from "@/components/shared/KpiCard"
import { StatusPill } from "@/components/shared/StatusPill"
import { num } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"

interface Row {
  functional_area: keyof typeof AREA_LABEL
  employment_status: string
  separation_date: string | null
}

const STATUS_TONE = { active: "green", on_leave: "amber", resigned: "gray", terminated: "red" } as const
const STATUS_ORDER = ["active", "on_leave", "resigned", "terminated"]

export default function HrOverview() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    supabase
      .from("employees")
      .select("functional_area, employment_status, separation_date")
      .limit(1000)
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError("The overview could not be loaded. Please try again.")
        else setRows((data ?? []) as Row[])
      })
    return () => {
      active = false
    }
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!rows) return <p className="text-sm text-neutral-500">Loading...</p>

  // "Active" = currently employed (not separated), so staff on leave still count.
  const current = rows.filter((r) => r.separation_date === null)
  const distribution = Object.entries(AREA_LABEL).map(([key, label]) => ({
    area: label,
    Employees: current.filter((r) => r.functional_area === key).length,
  }))
  const statusCount = (s: string) => rows.filter((r) => r.employment_status === s).length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total employees" value={num(rows.length)} />
        <KpiCard label="Active employees" value={num(current.length)} hint="Currently employed" />
        <KpiCard label="On leave" value={num(statusCount("on_leave"))} />
        <KpiCard label="Separated" value={num(statusCount("resigned") + statusCount("terminated"))} hint="Resigned and terminated" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Workforce distribution by functional area</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="area" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Employees" fill="#0e63a6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Employment status summary</h2>
          <ul className="divide-y divide-neutral-100">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-center justify-between py-2 text-sm">
                <StatusPill label={s} tone={STATUS_TONE[s as keyof typeof STATUS_TONE]} />
                <span className="font-medium">{num(statusCount(s))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}