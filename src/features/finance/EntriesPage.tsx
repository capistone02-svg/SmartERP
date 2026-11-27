import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { formatDate, peso, todayStr } from "@/lib/format"
import { ApprovalBadge, type ApprovalStatus } from "@/features/approvals/ApprovalBadge"
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

const STATUS_FILTER = {
  name: "approval_status", label: "Status",
  options: [{ value: "pending", label: "Pending approval" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }],
}

export default function EntriesPage() {
  const [refs, setRefs] = useState<SaleRef[]>([])
  useEffect(() => {
    supabase.rpc("lookup_sales_refs").then(({ data }) => setRefs((data ?? []) as SaleRef[]))
  }, [])
  const saleOptions: Option[] = refs.map((r) => ({
    value: r.id,
    label: `${r.transaction_no} · ${formatDate(r.transaction_date)} · ${peso(r.amount)}`,
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
      header: "Linked sale",
      cell: (r) => refs.find((s) => s.id === r.sales_transaction_id)?.transaction_no ?? "—",
    },
    { header: "Amount", cell: (r) => peso(r.amount), className: "text-right" },
    { header: "Status", cell: (r) => <ApprovalBadge status={r.approval_status} note={r.review_note} /> },
  ]

  const fields: FieldDef[] = [
    {
      name: "entry_type", label: "Entry type", type: "select", required: true, defaultValue: "revenue",
      options: [{ value: "revenue", label: "Revenue" }, { value: "expense", label: "Expense" }],
    },
    { name: "entry_date", label: "Transaction date", type: "date", required: true, defaultValue: todayStr() },
    { name: "category", label: "Category", type: "text", required: true, placeholder: "e.g. Rental Income, Utilities" },
    { name: "amount", label: "Amount (PHP)", type: "number", min: 0.01, required: true },
    { name: "reference", label: "Reference", type: "text" },
    {
      name: "sales_transaction_id", label: "Linked sale (optional)", type: "select", options: saleOptions,
      placeholder: "No linked sale", visibleWhen: (v) => v.entry_type === "revenue",
    },
    { name: "description", label: "Description", type: "textarea" },
  ]

  return (
    <ResourcePage<Entry>
      resource="financial_entries" table="financial_entries" singular="Entry"
      select="id, entry_no, entry_date, entry_type, category, description, amount, reference, sales_transaction_id, created_by, approval_status, review_note"
      searchColumns={["entry_no", "category", "description", "reference"]} searchPlaceholder="Search entries..."
      orderBy="entry_date" ascending={false} columns={columns} fields={fields} rowKey={(r) => r.id} approval
      canEditRow={(r, me, role) => role !== "staff" || (r.created_by === me && r.approval_status !== "approved")}
      filters={[{
        name: "entry_type", label: "Type",
        options: [{ value: "revenue", label: "Revenue" }, { value: "expense", label: "Expense" }],
      }, STATUS_FILTER]}
    />
  )
}