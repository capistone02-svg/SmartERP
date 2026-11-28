import { useState } from "react"
import { toast } from "sonner"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { ROLE_LABEL, type AppRole } from "@/types"
import { downloadCsv } from "@/lib/csv"
import { fetchAllLogs, fmtWhen, LogToolbar, presetRange, useLogRows, type LogQuery } from "./logTools"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Row {
  id: number
  occurred_at: string
  actor_name: string
  actor_employee_no: string | null
  actor_role: AppRole | null
  action: string
  module: string
  record_label: string | null
  changes: Record<string, any> | null
  details: string | null
}

const MODULES: Record<string, string> = {
  employees: "Employees",
  profiles: "User accounts",
  permissions: "Permissions",
  suppliers: "Suppliers",
  warehouses: "Warehouses",
  products: "Products",
  inventory_movements: "Inventory movements",
  customers: "Customers",
  sales_transactions: "Sales transactions",
  promotions: "Promotions",
  marketing_activities: "Marketing activities",
  financial_entries: "Financial entries",
  service_cases: "Service cases",
  employee_personal: "Employee personal details",
  employee_documents: "Employee documents",
  case_events: "Case timeline",
  audit_logs: "Activity log",
  login_logs: "Login log",
}
const ACTIONS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  approve: "Approved",
  reject: "Rejected",
  resubmit: "Resubmitted",
  account_created: "Account created",
  password_reset: "Password reset",
  log_exported: "Log exported",
  log_removed: "Log year removed",
}
const ACTION_STYLE: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  approve: "bg-green-100 text-green-700",
  reject: "bg-red-100 text-red-700",
  resubmit: "bg-amber-100 text-amber-700",
  account_created: "bg-green-100 text-green-700",
  password_reset: "bg-amber-100 text-amber-700",
  log_exported: "bg-blue-100 text-blue-700",
  log_removed: "bg-red-100 text-red-700",
}

const pretty = (k: string) => k.replace(/_/g, " ")
const val = (v: any) => (v === null || v === undefined || v === "" ? "empty" : typeof v === "object" ? JSON.stringify(v) : String(v))
const isDiff = (v: any) => v && typeof v === "object" && "from" in v && "to" in v

function summary(r: Row): string {
  const parts = Object.entries(r.changes ?? {}).map(([k, v]) =>
    isDiff(v) ? `${pretty(k)}: ${val(v.from)} -> ${val(v.to)}` : `${pretty(k)}: ${val(v)}`)
  if (r.details) parts.push(r.details)
  return parts.join("; ")
}

function Details({ row }: { row: Row }) {
  const entries = Object.entries(row.changes ?? {})
  if (entries.length === 0 && !row.details) return <span className="text-muted-foreground">—</span>
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-brand-text">View</summary>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="font-medium capitalize">{pretty(k)}:</span>{" "}
            {isDiff(v) ? <>{val(v.from)} <span className="text-muted-foreground">to</span> {val(v.to)}</> : val(v)}
          </li>
        ))}
        {row.details && <li>{row.details}</li>}
      </ul>
    </details>
  )
}

export default function ActivityLogPage() {
  const [text, setText] = useState("")
  const [module, setModule] = useState("")
  const [action, setAction] = useState("")
  const [range, setRange] = useState(() => presetRange("30d"))
  const { from, to } = range
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const query: LogQuery = {
    table: "audit_logs",
    select: "id, occurred_at, actor_name, actor_employee_no, actor_role, action, module, record_label, changes, details",
    searchColumns: ["actor_name", "actor_employee_no", "record_label"],
    text,
    eq: { module, action },
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
        `activity-log-${new Date().toISOString().slice(0, 10)}.csv`,
        ["When", "User", "Employee ID", "Role", "Action", "Module", "Record", "Details"],
        all.map((r) => [
          fmtWhen(r.occurred_at), r.actor_name, r.actor_employee_no ?? "",
          r.actor_role ? ROLE_LABEL[r.actor_role] : "", ACTIONS[r.action] ?? r.action,
          MODULES[r.module] ?? r.module, r.record_label ?? "", summary(r),
        ]),
      )
    } catch {
      toast.error("The log could not be exported.")
    }
    setExporting(false)
  }

  const columns: Column<Row>[] = [
    { header: "When", cell: (r) => <span className="whitespace-nowrap">{fmtWhen(r.occurred_at)}</span> },
    {
      header: "User",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.actor_name}</div>
          <div className="text-xs text-muted-foreground">
            {[r.actor_employee_no, r.actor_role ? ROLE_LABEL[r.actor_role] : null].filter(Boolean).join(" · ")}
          </div>
        </div>
      ),
    },
    {
      header: "Action",
      cell: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLE[r.action] ?? "bg-neutral-100 text-neutral-700"}`}>
          {ACTIONS[r.action] ?? r.action}
        </span>
      ),
    },
    { header: "Module", cell: (r) => MODULES[r.module] ?? r.module },
    { header: "Record", cell: (r) => r.record_label ?? "—" },
    { header: "Details", cell: (r) => <Details row={r} /> },
  ]

  return (
    <>
      <LogToolbar
        placeholder="Search user or record..."
        text={text} onText={reset(setText)}
        selects={[
          { label: "Module", value: module, onChange: reset(setModule), options: Object.entries(MODULES).map(([value, label]) => ({ value, label })) },
          { label: "Action", value: action, onChange: reset(setAction), options: Object.entries(ACTIONS).map(([value, label]) => ({ value, label })) },
        ]}
        from={from} to={to} onRange={(f, t) => { setRange({ from: f, to: t }); setPage(1) }}
        onExport={exportCsv} exporting={exporting}
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} loading={loading} error={error}
        page={page} pageSize={15} total={total} onPageChange={setPage} />
      <p className="mt-3 text-xs text-muted-foreground">
        The log is written by the database and cannot be edited. A finished year can only be removed from the Archive tab,
        after it was exported. Passwords are never recorded.
      </p>
    </>
  )
}
