import { useEffect, useState } from "react"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { FormDialog } from "@/components/shared/FormDialog"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { useAuth } from "@/features/auth/AuthContext"
import { friendlyError } from "@/lib/errors"
import { formatDate, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { ApprovalBadge, type ApprovalStatus } from "./ApprovalBadge"
import { APPROVALS_CHANGED } from "./usePendingCount"

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type Flat = Record<string, string | number> & { _id: string; _by: string; _status: ApprovalStatus; _note: string | null }
export type ApprovalModule = "finance" | "inventory" | "sales"

interface Col { key: string; header: string; money?: boolean; right?: boolean }
interface Cfg {
  title: string
  table: "financial_entries" | "inventory_movements" | "sales_transactions"
  select: string
  columns: Col[]
  flatten: (r: Row) => Record<string, string | number>
}

const one = (x: any) => (Array.isArray(x) ? x[0] : x)
const nice = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

const CONFIGS: Record<ApprovalModule, Cfg> = {
  finance: {
    title: "Financial entries",
    table: "financial_entries",
    select: "entry_no, entry_date, entry_type, category, description, amount",
    columns: [
      { key: "no", header: "Entry no." },
      { key: "date", header: "Date" },
      { key: "type", header: "Type" },
      { key: "category", header: "Category" },
      { key: "amount", header: "Amount", money: true, right: true },
    ],
    flatten: (r) => ({
      no: r.entry_no, date: formatDate(r.entry_date), type: nice(r.entry_type), category: r.category, amount: Number(r.amount),
    }),
  },
  inventory: {
    title: "Stock movements",
    table: "inventory_movements",
    select: "movement_date, movement_type, quantity, reference_no, remarks, products(name, sku), warehouses(name)",
    columns: [
      { key: "date", header: "Date" },
      { key: "product", header: "Product" },
      { key: "warehouse", header: "Warehouse" },
      { key: "type", header: "Type" },
      { key: "quantity", header: "Quantity", right: true },
      { key: "reference", header: "Reference" },
    ],
    flatten: (r) => ({
      date: formatDate(r.movement_date), product: one(r.products)?.name ?? "", warehouse: one(r.warehouses)?.name ?? "",
      type: nice(r.movement_type), quantity: Number(r.quantity), reference: r.reference_no ?? "",
    }),
  },
  sales: {
    title: "Sales transactions",
    table: "sales_transactions",
    select: "transaction_no, transaction_date, quantity, amount, products(name), customers(full_name)",
    columns: [
      { key: "no", header: "Transaction no." },
      { key: "date", header: "Date" },
      { key: "product", header: "Product" },
      { key: "customer", header: "Customer" },
      { key: "quantity", header: "Qty", right: true },
      { key: "amount", header: "Amount", money: true, right: true },
    ],
    flatten: (r) => ({
      no: r.transaction_no, date: formatDate(r.transaction_date), product: one(r.products)?.name ?? "",
      customer: one(r.customers)?.full_name ?? "", quantity: Number(r.quantity), amount: Number(r.amount),
    }),
  },
}

const PAGE_SIZE = 10

export default function ApprovalsPage({ module }: { module: ApprovalModule }) {
  const cfg = CONFIGS[module]
  const { profile, can } = useAuth()
  const canReview = profile?.role === "department_head" && can(cfg.table, "update")

  const [status, setStatus] = useState<"pending" | "rejected">("pending")
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Flat[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [names, setNames] = useState<Record<string, string>>({})

  const [approveRow, setApproveRow] = useState<Flat | null>(null)
  const [rejectRow, setRejectRow] = useState<Flat | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc("area_user_names").then(({ data }) => {
      const map: Record<string, string> = {}
      for (const r of (data ?? []) as { user_id: string; full_name: string }[]) map[r.user_id] = r.full_name
      setNames(map)
    })
  }, [])

  useEffect(() => {
    let on = true
    setLoading(true)
    const start = (page - 1) * PAGE_SIZE
    const query: any = supabase
      .from(cfg.table)
      .select(`${cfg.select}, id, created_by, created_at, approval_status, review_note`, { count: "exact" })
      .eq("approval_status", status)
      .order("created_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1)
    query.then(({ data, error: e, count }: any) => {
      if (!on) return
      if (e) setError(friendlyError(e))
      else {
        setError(null)
        setTotal(count ?? 0)
        setRows(
          ((data ?? []) as Row[]).map((r) => ({
            ...cfg.flatten(r),
            _id: r.id, _by: r.created_by ?? "", _status: r.approval_status, _note: r.review_note,
            _at: new Date(r.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }),
          })) as Flat[],
        )
      }
      setLoading(false)
    })
    return () => {
      on = false
    }
  }, [cfg, status, page, refreshKey])

  async function decide(row: Flat, decision: "approve" | "reject", reason: string | null) {
    setSaving(true)
    const { error: e } = await supabase.rpc("review_record", {
      p_table: cfg.table, p_id: row._id, p_decision: decision, p_note: reason,
    })
    setSaving(false)
    if (e) {
      // Messages raised by the database for the user (for example "Insufficient stock") are shown as they are.
      return e.code === "P0001" ? setFormError(e.message) : setFormError(friendlyError(e))
    }
    toast.success(decision === "approve" ? "Approved." : "Rejected.")
    window.dispatchEvent(new Event(APPROVALS_CHANGED))
    setApproveRow(null)
    setRejectRow(null)
    setRefreshKey((k) => k + 1)
  }

  const columns: Column<Flat>[] = [
    ...cfg.columns.map<Column<Flat>>((c) => ({
      header: c.header,
      className: c.right ? "text-right" : undefined,
      cell: (r) => (c.money ? peso(Number(r[c.key])) : String(r[c.key] ?? "—")),
    })),
    {
      header: "Submitted by",
      cell: (r) => (
        <div className="text-sm">
          <div>{names[r._by] ?? "Unknown"}</div>
          <div className="text-xs text-neutral-500">{String((r as any)._at ?? "")}</div>
        </div>
      ),
    },
    { header: "Status", cell: (r) => <ApprovalBadge status={r._status} note={r._note} /> },
    {
      header: "",
      className: "w-28 text-right",
      cell: (r) =>
        canReview && r._status === "pending" ? (
          <div className="flex justify-end gap-1">
            <button aria-label="Approve" title="Approve" onClick={() => { setFormError(null); setApproveRow(r) }}
              className="rounded-md p-1.5 text-green-700 hover:bg-green-50">
              <Check className="h-4 w-4" />
            </button>
            <button aria-label="Reject" title="Reject" onClick={() => { setNote(""); setFormError(null); setRejectRow(r) }}
              className="rounded-md p-1.5 text-red-600 hover:bg-red-50">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null,
    },
  ]

  return (
    <>
      <p className="mb-3 text-xs text-neutral-500">
        {cfg.title} submitted by Staff wait here for a decision. Approved records count in the Overview and reports
        {module === "inventory" ? " and move stock" : ""}. A rejected record goes back to the author with your reason.
        {!canReview && " You can view the queue; only a Department Head can decide."}
      </p>
      <div className="mb-4">
        <select aria-label="Status" value={status} className={cn(inputClass, "w-auto")}
          onChange={(e) => { setStatus(e.target.value as "pending" | "rejected"); setPage(1) }}>
          <option value="pending">Status: Pending approval</option>
          <option value="rejected">Status: Rejected</option>
        </select>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r._id} loading={loading} error={error}
        page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <ConfirmDialog
        open={approveRow !== null}
        title="Approve this record?"
        message={`It will be counted in the Overview and reports${module === "inventory" ? ", and the stock balance will change" : ""}.${formError ? ` ${formError}` : ""}`}
        confirmLabel={saving ? "Approving..." : "Approve"}
        onCancel={() => setApproveRow(null)}
        onConfirm={() => approveRow && decide(approveRow, "approve", null)}
      />

      <FormDialog open={rejectRow !== null} title="Reject this record" onClose={() => setRejectRow(null)}
        onSubmit={() => rejectRow && decide(rejectRow, "reject", note)} submitting={saving} error={formError}
        submitLabel="Reject">
        <FormField label="Reason (shown to the author)" required>
          <textarea className={cn(inputClass, "min-h-24")} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What needs to be corrected?" />
        </FormField>
      </FormDialog>
    </>
  )
}
