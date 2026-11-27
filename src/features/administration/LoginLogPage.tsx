import { useState } from "react"
import { toast } from "sonner"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { downloadCsv } from "@/lib/csv"
import { fetchAllLogs, fmtWhen, LogToolbar, useLogRows, type LogQuery } from "./logTools"

interface Row {
  id: number
  occurred_at: string
  event: "login" | "logout" | "login_failed"
  employee_no: string | null
  user_agent: string | null
}

const EVENTS: Record<string, string> = { login: "Signed in", logout: "Signed out", login_failed: "Failed attempt" }
const EVENT_STYLE: Record<string, string> = {
  login: "bg-green-100 text-green-700",
  logout: "bg-neutral-100 text-neutral-700",
  login_failed: "bg-red-100 text-red-700",
}

function device(ua: string | null): string {
  if (!ua) return "—"
  const browser = ua.includes("Edg/") ? "Edge" : ua.includes("OPR/") ? "Opera" : ua.includes("Firefox/") ? "Firefox"
    : ua.includes("Chrome/") ? "Chrome" : ua.includes("Safari/") ? "Safari" : "Browser"
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Android") ? "Android"
    : ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : ua.includes("Mac OS") ? "macOS"
    : ua.includes("Linux") ? "Linux" : ""
  return os ? `${browser} on ${os}` : browser
}

export default function LoginLogPage() {
  const [text, setText] = useState("")
  const [event, setEvent] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const query: LogQuery = {
    table: "login_logs",
    select: "id, occurred_at, event, employee_no, user_agent",
    searchColumns: ["employee_no"],
    text,
    eq: { event },
    from,
    to,
  }
  const { rows, total, loading, error } = useLogRows<Row>(query, page, 15)
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  async function exportCsv() {
    setExporting(true)
    try {
      const all = await fetchAllLogs<Row>(query)
      downloadCsv(
        `login-log-${new Date().toISOString().slice(0, 10)}.csv`,
        ["When", "Employee ID", "Event", "Device"],
        all.map((r) => [fmtWhen(r.occurred_at), r.employee_no ?? "", EVENTS[r.event] ?? r.event, device(r.user_agent)]),
      )
    } catch {
      toast.error("The log could not be exported.")
    }
    setExporting(false)
  }

  const columns: Column<Row>[] = [
    { header: "When", cell: (r) => <span className="whitespace-nowrap">{fmtWhen(r.occurred_at)}</span> },
    { header: "Employee ID", cell: (r) => r.employee_no ?? "—" },
    {
      header: "Event",
      cell: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_STYLE[r.event]}`}>{EVENTS[r.event]}</span>
      ),
    },
    { header: "Device", cell: (r) => device(r.user_agent) },
  ]

  return (
    <>
      <LogToolbar
        placeholder="Search Employee ID..."
        text={text} onText={reset(setText)}
        selects={[
          { label: "Event", value: event, onChange: reset(setEvent), options: Object.entries(EVENTS).map(([value, label]) => ({ value, label })) },
        ]}
        from={from} to={to} onFrom={reset(setFrom)} onTo={reset(setTo)}
        onExport={exportCsv} exporting={exporting}
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} loading={loading} error={error}
        page={page} pageSize={15} total={total} onPageChange={setPage} />
      <p className="mt-3 text-xs text-neutral-500">
        Failed attempts show the Employee ID that was typed. Sign-ins made on the sign-in page record no device.
      </p>
    </>
  )
}
