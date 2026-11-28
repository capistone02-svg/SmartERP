import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { KpiCard } from "@/components/shared/KpiCard"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { ApprovalBadge, type ApprovalStatus } from "@/features/approvals/ApprovalBadge"
import { formatDate, num, peso, todayStr } from "@/lib/format"
import { supabase } from "@/lib/supabase"

interface Entry {
  id: string
  entry_no: string
  entry_date: string
  entry_type: "revenue" | "expense"
  category: string
  description: string | null
  amount: number
  reference: string | null
  sales_transaction_id: string | null
  inventory_movement_id: string | null
  created_by: string | null
  approval_status: ApprovalStatus
  review_note: string | null
}

interface SaleRef {
  id: string
  transaction_no: string
  transaction_date: string
  amount: number
}

interface MovementRef {
  id: string
  reference_no: string
  movement_date: string
  movement_type: string
  quantity: number
  product_label: string
  supplier_name?: string
}

const STATUS_FILTER = {
  name: "approval_status",
  label: "Status",
  options: [
    { value: "pending", label: "Pending approval" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ],
}

export default function EntriesPage() {
  const [saleRefs, setSaleRefs] = useState<SaleRef[]>([])
  const [movementRefs, setMovementRefs] = useState<MovementRef[]>([])

  useEffect(() => {
    supabase.rpc("lookup_sales_refs").then(({ data }) => setSaleRefs((data ?? []) as SaleRef[]))
    supabase.rpc("lookup_movement_refs").then(({ data }) => setMovementRefs((data ?? []) as MovementRef[]))
  }, [])

  // Money view first: what this month looks like before you touch the journal.
  const [month, setMonth] = useState<{ revenue: number; expenses: number; pending: number } | null>(null)
  useEffect(() => {
    const now = new Date()
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    supabase
      .from("financial_entries")
      .select("entry_type, amount, approval_status")
      .gte("entry_date", start)
      .then(({ data }) => {
        const rows = (data ?? []) as { entry_type: string; amount: number; approval_status: string | null }[]
        setMonth({
          revenue: rows.filter((r) => r.entry_type === "revenue").reduce((s, r) => s + Number(r.amount), 0),
          expenses: rows.filter((r) => r.entry_type === "expense").reduce((s, r) => s + Number(r.amount), 0),
          pending: rows.filter((r) => r.approval_status === "pending").length,
        })
      })
  }, [])

  const saleOptions: Option[] = saleRefs.map((r) => ({
    value: r.id,
    label: `${r.transaction_no} · ${formatDate(r.transaction_date)} · ${peso(r.amount)}`,
  }))

  const movementOptions: Option[] = movementRefs.map((m) => ({
    value: m.id,
    label: `${m.reference_no ?? "No ref"} · ${m.movement_type === "stock_in" ? "Stock in" : "Stock out"} ${m.quantity} (${m.product_label}) · ${m.supplier_name ? m.supplier_name + " · " : ""}${formatDate(m.movement_date)}`,
  }))

  const columns: Column<Entry>[] = [
    { header: "Entry no.", cell: (r) => <span className="font-medium">{r.entry_no}</span> },
    { header: "Date", cell: (r) => formatDate(r.entry_date) },
    {
      header: "Type",
      cell: (r) => <StatusPill label={r.entry_type} tone={r.entry_type === "revenue" ? "green" : "amber"} />,
    },
    { header: "Category", cell: (r) => r.category },
    { header: "Description", cell: (r) => r.description ?? "—" },
    { header: "Reference", cell: (r) => r.reference ?? "—" },
    {
      header: "Linked record",
      cell: (r) => {
        if (r.sales_transaction_id) {
          const sale = saleRefs.find((s) => s.id === r.sales_transaction_id)
          return sale ? (
            <span className="text-xs font-medium text-emerald-700" title="Linked to approved sale">
              Sale: {sale.transaction_no}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Sale linked</span>
          )
        }
        if (r.inventory_movement_id) {
          const mv = movementRefs.find((m) => m.id === r.inventory_movement_id)
          return mv ? (
            <span
              className="text-xs font-medium text-blue-700"
              title={`${mv.product_label} (${mv.movement_type} ${mv.quantity}) · ${mv.supplier_name ?? ""}`}
            >
              Stock: {mv.reference_no ?? "Movement"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Movement linked</span>
          )
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
    { header: "Amount", cell: (r) => peso(r.amount), className: "text-right font-medium" },
    { header: "Status", cell: (r) => <ApprovalBadge status={r.approval_status} note={r.review_note} /> },
  ]

  const fields: FieldDef[] = [
    {
      name: "entry_type",
      label: "Entry type",
      type: "select",
      required: true,
      defaultValue: "revenue",
      options: [
        { value: "revenue", label: "Revenue" },
        { value: "expense", label: "Expense" },
      ],
    },
    { name: "entry_date", label: "Transaction date", type: "date", required: true, defaultValue: todayStr() },
    { name: "category", label: "Category", type: "text", required: true, placeholder: "e.g. Inventory Receiving, Rental Income, Utilities" },
    { name: "amount", label: "Amount (PHP)", type: "number", min: 0.01, required: true },
    { name: "reference", label: "Reference document / Receipt", type: "text" },
    {
      name: "sales_transaction_id",
      label: "Linked sale (optional)",
      type: "select",
      options: saleOptions,
      placeholder: "No linked sale",
      visibleWhen: (v) => v.entry_type === "revenue",
    },
    {
      name: "inventory_movement_id",
      label: "Linked stock movement (optional)",
      type: "select",
      options: movementOptions,
      placeholder: "No linked stock movement",
      visibleWhen: (v) => v.entry_type === "expense",
    },
    { name: "description", label: "Description / notes", type: "textarea" },
  ]

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Revenue this month" value={peso(month?.revenue ?? 0)} />
        <KpiCard label="Expenses this month" value={peso(month?.expenses ?? 0)} />
        <KpiCard
          label="Net this month"
          value={peso((month?.revenue ?? 0) - (month?.expenses ?? 0))}
          hint="Revenue minus expenses"
        />
        <KpiCard
          label="Waiting for approval"
          value={num(month?.pending ?? 0)}
          hint="Entries a Head still has to review"
        />
      </div>
      <ResourcePage<Entry>
        resource="financial_entries"
        table="financial_entries"
        singular="Entry"
        select="id, entry_no, entry_date, entry_type, category, description, amount, reference, sales_transaction_id, inventory_movement_id, created_by, approval_status, review_note"
        searchColumns={["entry_no", "category", "description", "reference"]}
        searchPlaceholder="Search entries..."
        orderBy="entry_date"
        ascending={false}
        columns={columns}
        fields={fields}
        rowKey={(r) => r.id}
        approval
        canEditRow={(r, me, role) => role !== "staff" || (r.created_by === me && r.approval_status !== "approved")}
        filters={[
          {
            name: "entry_type",
            label: "Type",
            options: [
              { value: "revenue", label: "Revenue" },
              { value: "expense", label: "Expense" },
            ],
          },
          STATUS_FILTER,
        ]}
      />
    </>
  )
}
