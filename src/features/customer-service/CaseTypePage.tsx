import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eye } from "lucide-react"
import { toast } from "sonner"
import type { Column } from "@/components/shared/DataTable"
import { FormDialog } from "@/components/shared/FormDialog"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { ResourcePage, type FieldDef, type Option, type ResourceFormApi } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { useAuth } from "@/features/auth/AuthContext"
import { cardLabel, CARD_OPTIONS, hasCard } from "@/lib/cards"
import { formatDate, peso, todayStr } from "@/lib/format"
import { customerLookup, productLookup, saleLookup } from "@/lib/lookups"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  CASE_SELECT, KINDS, PENDING, RATINGS, SEVERITIES, SEVERITY_TONE, STATUS_TONE, TYPE_LABEL, TYPE_TONE,
  caseFilters, caseSorts, stars, statusLabel, type CaseKind, type CaseRow,
} from "./caseConfig"
import CaseDrawer from "./CaseDrawer"

// One page for every case type: "all" is the read-only list of everything,
// the other four are working pages with their own form fields and steps.
export default function CaseTypePage({ kind }: { kind: CaseKind | "all" }) {
  const { profile } = useAuth()
  const cfg = kind === "all" ? null : KINDS[kind]
  const [staff, setStaff] = useState<Option[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const formApi = useRef<ResourceFormApi | null>(null)
  const handleFormReady = useCallback((api: ResourceFormApi | null) => {
    formApi.current = api
  }, [])

  // Quick-create customer: only customers who reach out to Customer Service get tracked.
  const [quick, setQuick] = useState(false)
  const [qName, setQName] = useState("")
  const [qPhone, setQPhone] = useState("")
  const [qEmail, setQEmail] = useState("")
  const [qCard, setQCard] = useState("none")
  const [qCardNo, setQCardNo] = useState("")
  const [qError, setQError] = useState<string | null>(null)
  const [qSaving, setQSaving] = useState(false)

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
  // A refund is tied to a sale, so the customer of that sale fills the customer field.
  const autoFill = useMemo(
    () =>
      kind === "refund"
        ? [
            {
              target: "customer_id",
              when: "sales_transaction_id",
              resolve: async (saleId: string) => {
                const { data } = await supabase
                  .from("sales_transactions")
                  .select("customer_id")
                  .eq("id", saleId)
                  .maybeSingle()
                return ((data as { customer_id: string | null } | null)?.customer_id) ?? null
              },
            },
          ]
        : undefined,
    [kind],
  )
  const isOverdue = (r: CaseRow) => !!r.due_date && r.due_date < todayStr() && PENDING.includes(r.status)

  // ----- list columns -----
  const columns: Column<CaseRow>[] = [
    { header: "Case no.", cell: (r) => <span className="font-medium">{r.case_no}</span> },
    { header: "Submitted", cell: (r) => formatDate(r.date_submitted) },
  ]
  if (!cfg) columns.push({ header: "Type", cell: (r) => <StatusPill label={TYPE_LABEL[r.case_type] ?? r.case_type} tone={TYPE_TONE[r.case_type as keyof typeof TYPE_TONE] ?? "gray"} /> })
  columns.push({ header: "Subject", cell: (r) => <span className="line-clamp-1 max-w-[16rem]">{r.subject}</span> })
  columns.push({
    header: "Customer",
    cell: (r) =>
      r.customer ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="truncate">{r.customer.full_name}</span>
          {hasCard(r.customer.card_type) && (
            <StatusPill label={`${cardLabel(r.customer.card_type)} · priority`} tone="amber" />
          )}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  })
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
    // Every customer-service case must have a customer - even a complaint that is not about a product.
    fields.push({
      name: "customer_id",
      label: kind === "refund" ? "Customer (auto-filled from the sale)" : "Customer",
      type: "search", lookup: customerLookup, placeholder: "Search customer name or number",
      required: true,
      action: { label: "New customer", onClick: () => openQuickCustomer() },
    })
    if (kind !== "refund") fields.push({
      name: "product_id",
      label: kind === "complaint" ? "Product (only if the complaint is about a product)" : "Product",
      type: "search", lookup: productLookup, placeholder: "Search product name or SKU",
    })
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

  // ----- quick-create customer (only CS-contacted customers are tracked) -----
  function openQuickCustomer() {
    setQName("")
    setQPhone("")
    setQEmail("")
    setQCard("none")
    setQCardNo("")
    setQError(null)
    setQuick(true)
  }

  async function saveQuickCustomer() {
    const name = qName.trim()
    if (!name) {
      setQError("Full name is required.")
      return
    }
    setQSaving(true)
    setQError(null)
    const { data, error } = await supabase
      .from("customers")
      .insert({
        full_name: name,
        phone: qPhone.trim() || null,
        email: qEmail.trim() || null,
        card_type: qCard,
        card_no: qCard === "none" ? null : qCardNo.trim() || null,
      })
      .select("id")
      .single()
    setQSaving(false)
    if (error || !data) {
      setQError("The customer could not be created. You can also add customers from Sales > Customers.")
      return
    }
    setQuick(false)
    formApi.current?.setField("customer_id", String(data.id))
    toast.success(`${name} added as a customer.`)
  }

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
        filters={caseFilters(kind, staff)}
        sorts={caseSorts(kind)}
        emptyText="No cases yet."
        autoFill={autoFill}
        onFormReady={handleFormReady}
      />
      {openId && <CaseDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={() => setTick((t) => t + 1)} />}

      <FormDialog
        open={quick}
        title="New customer"
        onClose={() => setQuick(false)}
        onSubmit={saveQuickCustomer}
        submitting={qSaving}
        error={qError}
        submitLabel="Add customer"
      >
        <p className="text-xs text-muted-foreground">
          Only customers who reach out to Customer Service need to be tracked. Add their card if they have one - cardholders get priority handling.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" required className="sm:col-span-2">
            <input className={inputClass} value={qName} placeholder="Customer name"
              onChange={(e) => setQName(e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <input className={inputClass} value={qPhone} placeholder="Mobile number"
              onChange={(e) => setQPhone(e.target.value)} />
          </FormField>
          <FormField label="Email">
            <input type="email" className={inputClass} value={qEmail} placeholder="name@example.com"
              onChange={(e) => setQEmail(e.target.value)} />
          </FormField>
          <FormField label="Card">
            <select className={cn(inputClass, "w-auto")} value={qCard} onChange={(e) => setQCard(e.target.value)}>
              {CARD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          {qCard !== "none" && (
            <FormField label="Card number">
              <input className={inputClass} value={qCardNo} placeholder="Card number"
                onChange={(e) => setQCardNo(e.target.value)} />
            </FormField>
          )}
        </div>
      </FormDialog>
    </>
  )
}
