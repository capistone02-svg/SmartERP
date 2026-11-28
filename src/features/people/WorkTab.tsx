import { useEffect, useState, type ReactNode } from "react"
import { KpiCard } from "@/components/shared/KpiCard"
import { StatusPill } from "@/components/shared/StatusPill"
import { statusLabel, STATUS_TONE as CASE_TONE, TYPE_LABEL, TYPE_TONE } from "@/features/customer-service/caseConfig"
import { formatDate, num } from "@/lib/format"
import { tenure } from "@/lib/people"
import { supabase } from "@/lib/supabase"

interface Work {
  name: string; position: string; hire_date: string; employment_type: string; probation_end: string | null
  email: string | null; phone: string | null; tenure_months: number; has_account: boolean
  kind: "cases" | "submissions" | "none"
  open?: number; overdue?: number; done_month?: number; avg_days?: number
  recent?: { case_no?: string; type?: string; subject?: string; status: string; due_date?: string | null; label?: string; created_at?: string }[]
  pending?: number; rejected?: number; approved?: number; noun?: string
}

const APPROVAL_TONE = { pending: "amber", approved: "green", rejected: "red" } as const

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </div>
  )
}

// What a Department Head sees about their own staff: the work, not the personal file.
export default function WorkTab({ employeeId }: { employeeId: string }) {
  const [w, setW] = useState<Work | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc("work_profile", { p_employee: employeeId }).then(({ data, error }) => {
      if (error || !data) setError("The work profile could not be loaded.")
      else setW(data as Work)
    })
  }, [employeeId])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!w) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {w.kind === "cases" && (
          <>
            <KpiCard label="Open cases" value={num(w.open ?? 0)} />
            <KpiCard label="Overdue" value={num(w.overdue ?? 0)} />
            <KpiCard label="Finished this month" value={num(w.done_month ?? 0)} />
            <KpiCard label="Average resolution" value={`${w.avg_days ?? 0} days`} />
          </>
        )}
        {w.kind === "submissions" && (
          <>
            <KpiCard label="Waiting for approval" value={num(w.pending ?? 0)} hint={`Their ${w.noun}`} />
            <KpiCard label="Sent back" value={num(w.rejected ?? 0)} />
            <KpiCard label="Approved" value={num(w.approved ?? 0)} />
            <KpiCard label="Time in company" value={tenure(w.tenure_months)} />
          </>
        )}
        {w.kind === "none" && <KpiCard label="Time in company" value={tenure(w.tenure_months)} />}
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <Box title="Work details">
          <dl className="space-y-2 text-sm">
            {[
              ["Position", w.position],
              ["Hired", formatDate(w.hire_date)],
              ["Employment type", w.employment_type],
              ["Probation ends", w.probation_end ? formatDate(w.probation_end) : "—"],
              ["Work email", w.email ?? "—"],
              ["Work phone", w.phone ?? "—"],
              ["System account", w.has_account ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
                <dt className="text-muted-foreground">{k}</dt><dd className="text-right capitalize">{v}</dd>
              </div>
            ))}
          </dl>
        </Box>

        <Box title={w.kind === "cases" ? "Assigned cases" : "Recent submissions"}>
          {!w.recent || w.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing to show yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {w.recent.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  {w.kind === "cases" ? (
                    <>
                      <span className="font-medium">{r.case_no}</span>
                      <StatusPill label={TYPE_LABEL[r.type ?? ""] ?? r.type ?? ""} tone={TYPE_TONE[r.type as keyof typeof TYPE_TONE] ?? "gray"} />
                      <span className="min-w-0 flex-1 truncate">{r.subject}</span>
                      <span className="text-xs text-muted-foreground">{r.due_date ? `Due ${formatDate(r.due_date)}` : ""}</span>
                      <StatusPill label={statusLabel(r.type ?? "", r.status)} tone={CASE_TONE[r.status] ?? "gray"} />
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{r.label}</span>
                      <span className="flex-1 text-xs text-muted-foreground">{r.created_at ? formatDate(r.created_at.slice(0, 10)) : ""}</span>
                      <StatusPill label={r.status} tone={APPROVAL_TONE[r.status as keyof typeof APPROVAL_TONE] ?? "gray"} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </div>
  )
}
