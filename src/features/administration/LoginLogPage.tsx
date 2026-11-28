import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { downloadCsv } from "@/lib/csv"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { fetchAllLogs, fmtWhen, LogToolbar, presetRange, useLogRows, type LogQuery } from "./logTools"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Row {
  id: number
  occurred_at: string
  event: "login" | "logout" | "login_failed"
  employee_no: string | null
  user_agent: string | null
}
interface Summary {
  signins_today: number
  failed_today: number
  users_7d: number
  flagged: { employee_no: string; attempts: number; last_attempt: string; is_account: boolean }[]
}

const EVENTS: Record<string, string> = { login: "Signed in", logout: "Signed out", login_failed: "Failed attempt" }
const EVENT_STYLE: Record<string, string> = {
  login: "bg-success-soft text-success",
  logout: "bg-muted text-muted-foreground",
  login_failed: "bg-destructive/10 text-destructive",
}
const DEVICES = ["Windows", "Android", "iPhone", "Mac OS", "Linux"]
const DEVICE_LABEL: Record<string, string> = { Windows: "Windows", Android: "Android", iPhone: "iPhone / iPad", "Mac OS": "Mac", Linux: "Linux" }

function device(ua: string | null): string {
  if (!ua) return "—"
  const browser = ua.includes("Edg/") ? "Edge" : ua.includes("OPR/") ? "Opera" : ua.includes("Firefox/") ? "Firefox"
    : ua.includes("Chrome/") ? "Chrome" : ua.includes("Safari/") ? "Safari" : "Browser"
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Android") ? "Android"
    : ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : ua.includes("Mac OS") ? "macOS"
    : ua.includes("Linux") ? "Linux" : ""
  return os ? `${browser} on ${os}` : browser
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "bad" }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", tone === "bad" && Number(value) > 0 && "text-destructive")}>{value}</div>
    </div>
  )
}

export default function LoginLogPage() {
  const [text, setText] = useState("")
  const [event, setEvent] = useState("")
  const [dev, setDev] = useState("")
  const [range, setRange] = useState(() => presetRange("7d"))
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.rpc("login_summary").then(({ data }: any) => { if (data) setSummary(data as Summary) })
    supabase.from("profiles").select("employee_no, full_name").then(({ data }: any) => {
      setNames(Object.fromEntries((data ?? []).map((p: any) => [p.employee_no, p.full_name])))
    })
  }, [])

  const query: LogQuery = {
    table: "login_logs",
    select: "id, occurred_at, event, employee_no, user_agent",
    searchColumns: ["employee_no"],
    text,
    eq: { event },
    like: { user_agent: dev },
    from: range.from,
    to: range.to,
  }
  const { rows, total, loading, error } = useLogRows<Row>(query, page, 15)
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }
  const nameOf = (no: string | null) => (no ? names[no] ?? "" : "")

  async function exportCsv() {
    setExporting(true)
    try {
      const all = await fetchAllLogs<Row>(query)
      downloadCsv(
        `login-log-${new Date().toISOString().slice(0, 10)}.csv`,
        ["When", "Employee ID", "Name", "Event", "Device"],
        all.map((r) => [fmtWhen(r.occurred_at), r.employee_no ?? "", nameOf(r.employee_no), EVENTS[r.event] ?? r.event, device(r.user_agent)]),
      )
    } catch {
      toast.error("The log could not be exported.")
    }
    setExporting(false)
  }

  const columns: Column<Row>[] = [
    { header: "When", cell: (r) => <span className="whitespace-nowrap">{fmtWhen(r.occurred_at)}</span> },
    {
      header: "Employee",
      cell: (r) => (
        <div>
          <div className="font-medium">{nameOf(r.employee_no) || (r.employee_no ? "Unknown ID" : "—")}</div>
          <div className="text-xs text-muted-foreground">{r.employee_no ?? ""}</div>
        </div>
      ),
    },
    {
      header: "Event",
      cell: (r) => <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", EVENT_STYLE[r.event])}>{EVENTS[r.event]}</span>,
    },
    { header: "Device", cell: (r) => device(r.user_agent) },
  ]

  return (
    <>
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Sign-ins today" value={summary.signins_today} />
          <Stat label="Failed attempts today" value={summary.failed_today} tone="bad" />
          <Stat label="Different users, last 7 days" value={summary.users_7d} />
          <Stat label="IDs with 3+ failed attempts (24h)" value={summary.flagged.length} tone="bad" />
        </div>
      )}
      {summary && summary.flagged.length > 0 && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="h-4 w-4" /> Repeated failed sign-ins in the last 24 hours
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.flagged.map((f) => (
              <button key={f.employee_no} type="button"
                onClick={() => { setText(f.employee_no); setEvent("login_failed"); setRange(presetRange("today")); setPage(1) }}
                className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-muted">
                {f.employee_no}{names[f.employee_no] ? ` (${names[f.employee_no]})` : f.is_account ? "" : " (no account)"} · {f.attempts} attempts
              </button>
            ))}
          </div>
        </div>
      )}

      <LogToolbar
        placeholder="Search Employee ID..."
        text={text} onText={reset(setText)}
        selects={[
          { label: "Event", value: event, onChange: reset(setEvent), options: Object.entries(EVENTS).map(([value, label]) => ({ value, label })) },
          { label: "Device", value: dev, onChange: reset(setDev), options: DEVICES.map((value) => ({ value, label: DEVICE_LABEL[value] })) },
        ]}
        from={range.from} to={range.to} onRange={(f, t) => { setRange({ from: f, to: t }); setPage(1) }}
        extra={
          <button type="button" onClick={() => reset(setEvent)(event === "login_failed" ? "" : "login_failed")}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-medium",
              event === "login_failed" ? "border-destructive bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted")}>
            Failed attempts only
          </button>
        }
        onExport={exportCsv} exporting={exporting}
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} loading={loading} error={error}
        page={page} pageSize={15} total={total} onPageChange={setPage} />
      <p className="mt-3 text-xs text-muted-foreground">
        Failed attempts show the Employee ID that was typed; an ID without a name is not an account. Sign-ins made on the sign-in page record no device.
        Times are Philippine time.
      </p>
    </>
  )
}
