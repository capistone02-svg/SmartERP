import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { StatusPill } from "@/components/shared/StatusPill"
import { useAuth } from "@/features/auth/AuthContext"
import { formatDate, num } from "@/lib/format"
import { STATUS_TONE } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import type { FunctionalArea } from "@/types"

interface Member {
  id: string; name: string; employee_no: string; position: string; status: string; hire_date: string
  has_account: boolean; open_work: number; flagged: number
}

// The Department Head's team: who is carrying how much. Open a person for their work profile.
export default function TeamPage({ area }: { area: FunctionalArea }) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cases = area === "customer_service"

  useEffect(() => {
    supabase.rpc("team_overview", { p_area: profile?.role === "admin" ? area : null }).then(({ data, error }) => {
      if (error) setError("The team could not be loaded.")
      else setRows((data ?? []) as Member[])
    })
  }, [area, profile?.role])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!rows) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="rounded-3xl bg-card p-3 shadow-card sm:p-5">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-1.5 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-1.5">Name</th><th className="px-4 py-1.5">Position</th><th className="px-4 py-1.5">Status</th>
              <th className="px-4 py-1.5">Hired</th>
              <th className="px-4 py-1.5 text-right">{cases ? "Open cases" : "Waiting for approval"}</th>
              <th className="px-4 py-1.5 text-right">{cases ? "Overdue" : "Sent back"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="rounded-2xl bg-muted py-10 text-center text-muted-foreground">No team members found.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="group">
                {[
                  <Link key="n" to={`/people/${m.id}`} className="font-medium hover:underline">{m.name}</Link>,
                  m.position,
                  <StatusPill key="s" label={m.status} tone={STATUS_TONE[m.status as keyof typeof STATUS_TONE] ?? "gray"} />,
                  formatDate(m.hire_date),
                  <span key="o" className="font-medium">{num(m.open_work)}</span>,
                  <span key="f" className={m.flagged > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{num(m.flagged)}</span>,
                ].map((c, i) => (
                  <td key={i} className={"bg-muted px-4 py-3 group-hover:bg-accent first:rounded-l-2xl last:rounded-r-2xl" + (i >= 4 ? " text-right" : "")}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 px-1 text-xs text-muted-foreground">{num(rows.length)} team members. A work profile shows their workload, not personal details or documents; those belong to HR.</p>
    </div>
  )
}
