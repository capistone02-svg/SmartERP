import { useCallback, useEffect, useState } from "react"
import { Download, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/csv"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import CsvViewer from "./CsvViewer"
import { fmtWhen } from "./logTools"

/* eslint-disable @typescript-eslint/no-explicit-any */
type LogType = "activity" | "login"
interface YearRow {
  type: LogType; year: number; rows: number; first_at: string; last_at: string
  exported: boolean; exported_at: string | null; exported_by_name: string | null; file_name: string | null; can_delete: boolean
}
interface HistoryRow {
  type: LogType; year: number; row_count: number; file_name: string | null; exported_at: string; exported_by_name: string | null
  deleted_at: string | null; deleted_by_name: string | null; deleted_count: number | null
}
interface Listing { current_year: number; years: YearRow[]; history: HistoryRow[] }

const TITLE: Record<LogType, string> = { activity: "Activity log", login: "Login log" }
const TABLE: Record<LogType, string> = { activity: "audit_logs", login: "login_logs" }
const SELECT: Record<LogType, string> = {
  activity: "id, occurred_at, actor_name, actor_employee_no, actor_role, action, module, record_label, changes, details",
  login: "id, occurred_at, event, employee_no, user_agent",
}
const HEAD: Record<LogType, string[]> = {
  activity: ["id", "occurred_at", "actor_name", "actor_employee_no", "actor_role", "action", "module", "record_label", "changes", "details"],
  login: ["id", "occurred_at", "event", "employee_no", "user_agent"],
}

// Every entry of one Philippine-time calendar year, oldest first. Not limited to 5,000 rows.
async function fetchYear(type: LogType, year: number): Promise<any[]> {
  const from = new Date(`${year}-01-01T00:00:00+08:00`).toISOString()
  const to = new Date(`${year + 1}-01-01T00:00:00+08:00`).toISOString()
  const out: any[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(TABLE[type]).select(SELECT[type])
      .gte("occurred_at", from).lt("occurred_at", to)
      .order("occurred_at", { ascending: true }).order("id", { ascending: true })
      .range(start, start + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export default function ArchivePage() {
  const [data, setData] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<YearRow | null>(null)

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc("log_archive_list")
    if (e) setError(friendlyError(e))
    else { setError(null); setData(d as Listing) }
  }, [])
  useEffect(() => { load() }, [load])

  async function exportYear(y: YearRow) {
    const key = `${y.type}-${y.year}`
    setBusy(key)
    try {
      const rows = await fetchYear(y.type, y.year)
      const file = `${y.type === "activity" ? "activity-log" : "login-log"}-${y.year}.csv`
      downloadCsv(file, HEAD[y.type], rows.map((r) => HEAD[y.type].map((h) => {
        const v = r[h]
        return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : (v as string | number)
      })))
      // The database checks that the file has every entry of the year before it counts as an export.
      const { error: e } = await supabase.rpc("log_export_record", { p_type: y.type, p_year: y.year, p_rows: rows.length, p_file: file })
      if (e) throw e
      toast.success(`${TITLE[y.type]} ${y.year} exported (${rows.length.toLocaleString()} entries). Keep the file safe.`)
      await load()
    } catch (e) {
      toast.error(friendlyError(e as any) || "The export could not be completed.")
    }
    setBusy(null)
  }

  async function removeYear(y: YearRow) {
    setConfirm(null)
    setBusy(`${y.type}-${y.year}`)
    const { data: n, error: e } = await supabase.rpc("log_archive_delete", { p_type: y.type, p_year: y.year })
    if (e) toast.error(friendlyError(e))
    else toast.success(`${(n as number).toLocaleString()} entries removed from the database.`)
    setBusy(null)
    await load()
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="space-y-6">
      <section>
        <p className="mb-3 text-xs text-muted-foreground">
          Export a year to a CSV file first. Only after the file has every entry of that year can the year be removed from the database.
          The current year can never be removed, and every export and removal is written to the Activity log.
          Years are counted in Philippine time.
        </p>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-left text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-2">Log</th><th className="px-4 py-2">Year</th><th className="px-4 py-2">Entries</th>
                <th className="px-4 py-2">Export</th><th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.years.map((y) => {
                const key = `${y.type}-${y.year}`
                const open = y.year >= data.current_year
                return (
                  <tr key={key} className="border-t">
                    <td className="px-4 py-2.5 font-medium">{TITLE[y.type]}</td>
                    <td className="px-4 py-2.5">{y.year}{open && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Current year</span>}</td>
                    <td className="px-4 py-2.5">{y.rows.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {y.exported
                        ? <span className="text-success">Exported {y.exported_at && fmtWhen(y.exported_at)} by {y.exported_by_name ?? "—"}</span>
                        : <span className="text-muted-foreground">Not exported yet</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => exportYear(y)}>
                          <Download className="mr-1 h-3.5 w-3.5" /> {busy === key ? "Working..." : y.exported ? "Export again" : "Export CSV"}
                        </Button>
                        {!open && (
                          <Button variant="outline" size="sm" disabled={busy !== null || !y.can_delete} onClick={() => setConfirm(y)}
                            className={cn(y.can_delete && "border-destructive/40 text-destructive hover:bg-destructive/10")}
                            title={y.can_delete ? "" : "Export this year first"}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {data.years.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">There are no log entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          If new entries were added to a year after you exported it, export that year again before removing it.
        </p>
      </section>

      <CsvViewer />

      {data.history.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Archive history</h3>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted text-left font-semibold text-muted-foreground">
                  <th className="px-4 py-2">Log</th><th className="px-4 py-2">Year</th><th className="px-4 py-2">File</th>
                  <th className="px-4 py-2">Exported</th><th className="px-4 py-2">Removed</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2">{TITLE[h.type]}</td>
                    <td className="px-4 py-2">{h.year}</td>
                    <td className="px-4 py-2">{h.file_name ?? "—"} · {h.row_count.toLocaleString()} entries</td>
                    <td className="px-4 py-2">{fmtWhen(h.exported_at)} · {h.exported_by_name ?? "—"}</td>
                    <td className="px-4 py-2">{h.deleted_at ? `${fmtWhen(h.deleted_at)} · ${h.deleted_by_name ?? "—"} (${(h.deleted_count ?? 0).toLocaleString()})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? `Remove ${TITLE[confirm.type]} ${confirm.year}?` : ""}
        message={confirm ? `${confirm.rows.toLocaleString()} entries will be permanently deleted from the database. Make sure the exported file ${confirm.file_name ?? ""} is saved somewhere safe. It cannot be undone.` : ""}
        confirmLabel="Remove year"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { if (confirm) removeYear(confirm) }}
      />
    </div>
  )
}
