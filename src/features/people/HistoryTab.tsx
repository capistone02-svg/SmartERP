import { useEffect, useState } from "react"
import { formatDate } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

interface Event { id: string; kind: string; summary: string; effective_date: string; recorded_by_name: string | null }

export default function HistoryTab({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Event[] | null>(null)
  useEffect(() => {
    supabase.from("employee_history").select("id, kind, summary, effective_date, recorded_by_name")
      .eq("employee_id", employeeId).order("effective_date", { ascending: false }).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Event[]))
  }, [employeeId])

  if (!rows) return <p className="text-sm text-muted-foreground">Loading...</p>
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <h2 className="mb-4 text-sm font-medium">Employment history</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history recorded.</p>
      ) : (
        <ol className="space-y-4 border-l border-border pl-5">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              <span className={cn("absolute -left-[1.65rem] top-1.5 h-2.5 w-2.5 rounded-full",
                r.kind === "hired" ? "bg-success" : r.kind === "separation" ? "bg-destructive" : "bg-brand")} />
              <p className="text-sm">{r.summary}</p>
              <p className="text-xs text-muted-foreground">{formatDate(r.effective_date)} · recorded by {r.recorded_by_name ?? "System"}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-5 text-xs text-muted-foreground">Position, department, status and employment-type changes are recorded automatically.</p>
    </div>
  )
}
