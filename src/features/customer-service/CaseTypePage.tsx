import { useEffect, useMemo, useState } from "react"
import { Eye } from "lucide-react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { useAuth } from "@/features/auth/AuthContext"
import { formatDate, peso, todayStr } from "@/lib/format"
import { customerLookup, productLookup, saleLookup } from "@/lib/lookups"
import { supabase } from "@/lib/supabase"
import {
  CASE_SELECT, KINDS, PENDING, RATINGS, SEVERITIES, SEVERITY_TONE, STATUS_TONE, TYPE_LABEL, TYPE_TONE,
  stars, statusLabel, type CaseKind, type CaseRow,
} from "./caseConfig"
import CaseDrawer from "./CaseDrawer"

const ALL_STATUSES: Option[] = [
  { value: "open", label: "Open / Received / Requested" },
  { value: "in_progress", label: "In progress / Investigating" },
  { value: "for_review", label: "Head review" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "resolved", label: "Resolved / Answered / Completed" },
  { value: "closed", label: "Closed" },
]
const ALL_TYPES: Option[] = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))

// One page for every case type: "all" is the read-only list of everything,
// the other four are working pages with their own form fields and steps.
export default function CaseTypePage({ kind }: { kind: CaseKind | "all" }) {
  const { profile } = useAuth()
  const cfg = kind === "all" ? null : KINDS[kind]
  const [staff, setStaff] = useState<Option[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    supabase.rpc("area_colleagues").then(({ data }) =>
      setStaff(((data ?? []) as { employee_id: string; full_name: string }[]).map((r) => ({
        value: r.employee_id, label: r.full_name,
      }))))
  }, [])

  const isHead = profile?.role === "department_head"
  const myEmployee = profile?.employee_id ?? null
  const fixedEq = useMemo(() => (cfg ? { case_type: cfg.kind } : undefined), [cfg])
  const fixedValues = useMemo(() => (cfg ? { case_type: cfg.kind } : undefined), [cfg])
  const isOverdue = (r: CaseRow) => !!r.due_date && r.due_date < todayStr() && PENDING.includes(r.status)

  // ----- list columns -----
  const columns: Column<CaseRow>[] = [
    { header: "Case no.", cell: (r) => <span className="font-medium">{r.case_no}</span> },
    { header: "Submitted", cell: (r) => formatDate(r.date_submitted) },
  ]
  if (!cfg) columns.push({ header: "Type", cell: (r) => <StatusPill label={TYPE_LABEL[r.case_type] ?? r.case_type} tone={TYPE_TONE[r.case_type as keyof typeof TYPE_TONE] ?? "gray"} /> })
  columns.push({ header: "Subject", cell: (r) => <span className="line-clamp-1 max-w-[16rem]">{r.subject}</span> })
  columns.push({ header: "Customer", cell: (r) => r.customer?.full_name ?? "—" })
  if (kind === "complaint" || kind === "inquiry" || kind === "feedback") {
    columns.push({ header: "Product", cell: (r) => r.product_name ?? "—" })
  }
  if (kind === "complaint") {
    columns.push({ header: "Severity", cell: (r) => (r.severity ? <StatusPill label={r.severity} tone={SEVERITY_TONE[r.severity as keyof typeof SEVERITY_TONE]} /> : "—") })
    columns.push({ header: "Due", cell: (r) => <span className={isOverdue(r) ? "font-medium text-destructive" : ""}>{formatDate(r.due_date)}{isOverdue(r) ? " (overdue)" : ""}</span> })
  }
  if (kind === "refund") {
    columns.push({ header: "Sale", cell: (r) => r.sale_no ?? "—" })
    columns.push({ header: "Amount", cell: (r) => (r.refund_amount ? peso(r.refund_amount) : "—") })
  }
  if (kind === "feedback") columns.push({ header: "Rating", cell: (r) => <span className="text-warning">{stars(r.rating)}</span> })
  columns.push({ header: "Status", cell: (r) => <StatusPill label={statusLabel(r.case_type, r.status)} tone={STATUS_TONE[r.status] ?? "gray"} /> })
  columns.push({ header: "Assigned to", cell: (r) => staff.find((s) => s.value === r.assigned_to)?.label ?? (r.assigned_to ? "…" : <span className="text-muted-foreground">Unassigned</span>) })
  columns.push({
    header: "",
    className: "w-12 text-right",
    cell: (r) => (
      <button aria-label="Open case" title="Open case" onClick={() => setOpenId(r.id)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-brand-text">
        <Eye className="h-4 w-4" />
      </button>
    ),
  })

  // ----- form fields (different for every case type) -----
  const fields: FieldDef[] = []
  if (cfg) {
    const staffStatuses = cfg.statuses.filter((s) => s.value !== "approved" && s.value !== "denied")
    const statusOptions = isHead ? cfg.statuses : staffStatuses
    const isDone = (v: Record<string, string>) => cfg.done.includes(v.status)

    fields.push({ name: "date_submitted", label: "Date submitted", type: "date", required: true, defaultValue: todayStr() })
    fields.push({ name: "subject", label: kind === "refund" ? "Item and reason (short)" : "Subject", type: "text", required: true, fullWidth: true })
    if (kind === "refund") {
      fields.push({ name: "sales_transaction_id", label: "Sale being refunded", type: "search", lookup: saleLookup, required: true, placeholder: "Search by transaction no., product or customer", fullWidth: true })
      fields.push({ name: "refund_amount", label: "Refund amount (PHP)", type: "number", required: true, min: 0.01 })
    }
    fields.push({ name: "customer_id", label: kind === "refund" ? "Customer (filled from the sale if left empty)" : "Customer", type: "search", lookup: customerLookup, placeholder: "Search customer name or number" })
    if (kind !== "refund") fields.push({ name: "product_id", label: "Product", type: "search", lookup: productLookup, placeholder: "Search product name or SKU" })
    if (kind === "complaint") {
      fields.push({ name: "sales_transaction_id", label: "Related sale (optional)", type: "search", lookup: saleLookup, placeholder: "Search by transaction no., product or customer", fullWidth: true })
      fields.push({ name: "severity", label: "Severity", type: "select", options: SEVERITIES, required: true, defaultValue: "medium" })
      fields.push({ name: "due_date", label: "Due date (set automatically if empty)", type: "date" })
    }
    if (kind === "feedback") fields.push({ name: "rating", label: "Rating", type: "select", options: RATINGS, required: true })
    fields.push({ name: "assigned_to", label: "Assigned to", type: "select", options: staff, placeholder: "Unassigned" })
    fields.push({
      name: "description",
      label: kind === "inquiry" ? "Question" : kind === "feedback" ? "Comment or suggestion" : kind === "refund" ? "Details of the request" : "What happened",
      type: "textarea",
    })
    fields.push({ name: "status", label: "Status", type: "select", options: statusOptions, required: true, defaultValue: "open" })
    fields.push({ name: "resolution_details", label: cfg.doneLabel, type: "textarea", required: cfg.doneRequired, visibleWhen: isDone })
    fields.push({ name: "resolution_date", label: "Date finished", type: "date", visibleWhen: isDone })
  }

  // Heads edit any case; Staff edit cases they created or that are assigned to them.
  // A refund is locked for Staff once the Head has decided on it.
  const canEditRow = (row: CaseRow, profileId: string, role: string) => {
    if (role !== "staff") return true
    const mine = row.created_by === profileId || (!!myEmployee && row.assigned_to === myEmployee)
    if (row.case_type === "refund" && !["open", "for_review"].includes(row.status)) return false
    return mine
  }

  const filters = [
    cfg ? { name: "status", label: "Status", options: cfg.statuses } : { name: "status", label: "Status", options: ALL_STATUSES },
    ...(cfg ? [] : [{ name: "case_type", label: "Type", options: ALL_TYPES }]),
    ...(staff.length > 0 ? [{ name: "assigned_to", label: "Assigned to", options: staff }] : []),
    ...(kind === "complaint" ? [{ name: "severity", label: "Severity", options: SEVERITIES.map((s) => ({ value: s.value, label: s.value[0].toUpperCase() + s.value.slice(1) })) }] : []),
  ]

  return (
    <>
      {cfg && <p className="mb-4 text-sm text-muted-foreground">{cfg.blurb}</p>}
      <ResourcePage<CaseRow>
        resource="service_cases" table="service_cases"
        singular={cfg ? cfg.label : "Case"}
        select={CASE_SELECT}
        searchColumns={["case_no", "subject", "description", "product_name", "sale_no"]}
        searchPlaceholder="Search case no., subject, product or sale..."
        orderBy="date_submitted" ascending={false}
        columns={columns} fields={fields} rowKey={(r) => r.id}
        readOnly={!cfg}
        fixedEq={fixedEq} fixedValues={fixedValues} refreshSignal={tick}
        canEditRow={canEditRow}
        filters={filters}
        emptyText="No cases yet."
      />
      {openId && <CaseDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={() => setTick((t) => t + 1)} />}
    </>
  )
}
