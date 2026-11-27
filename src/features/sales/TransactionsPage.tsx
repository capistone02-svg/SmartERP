import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { ApprovalBadge, type ApprovalStatus } from "@/features/approvals/ApprovalBadge"
import { SalesImport } from "@/features/sales/SalesImport"
import { formatDate, num, peso, todayStr } from "@/lib/format"
import { supabase } from "@/lib/supabase"

interface Sale {
  id: string
  transaction_no: string
  transaction_date: string
  product_id: string
  customer_id: string | null
  quantity: number
  amount: number
  notes: string | null
  created_by: string | null
  approval_status: ApprovalStatus
  review_note: string | null
  product: { name: string; sku: string } | null
  customer: { full_name: string } | null
}

export default function TransactionsPage() {
  const [products, setProducts] = useState<Option[]>([])
  const [customers, setCustomers] = useState<Option[]>([])
  useEffect(() => {
    supabase.from("products").select("id, sku, name").order("name").then(({ data }) =>
      setProducts(((data ?? []) as { id: string; sku: string; name: string }[]).map((r) => ({ value: r.id, label: `${r.sku} - ${r.name}` }))))
    supabase.from("customers").select("id, customer_no, full_name").order("full_name").then(({ data }) =>
      setCustomers(((data ?? []) as { id: string; customer_no: string; full_name: string }[]).map((r) => ({ value: r.id, label: `${r.full_name} (${r.customer_no})` }))))
  }, [])

  const columns: Column<Sale>[] = [
    { header: "Transaction", cell: (r) => <span className="font-medium">{r.transaction_no}</span> },
    { header: "Date", cell: (r) => formatDate(r.transaction_date) },
    { header: "Product", cell: (r) => r.product?.name ?? "—" },
    { header: "Customer", cell: (r) => r.customer?.full_name ?? "—" },
    { header: "Qty", cell: (r) => num(r.quantity), className: "text-right" },
    { header: "Amount", cell: (r) => peso(r.amount), className: "text-right" },
    { header: "Status", cell: (r) => <ApprovalBadge status={r.approval_status} note={r.review_note} /> },
  ]
  const fields: FieldDef[] = [
    { name: "product_id", label: "Product", type: "select", options: products, required: true, fullWidth: true },
    { name: "customer_id", label: "Customer", type: "select", options: customers, placeholder: "No customer", fullWidth: true },
    { name: "transaction_date", label: "Transaction date", type: "date", required: true, defaultValue: todayStr() },
    { name: "quantity", label: "Quantity", type: "integer", min: 1, required: true, defaultValue: "1" },
    { name: "amount", label: "Recorded amount (PHP)", type: "number", min: 0, required: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ]

  return (
    <ResourcePage<Sale>
      resource="sales_transactions" table="sales_transactions" singular="Sale"
      select="id, transaction_no, transaction_date, product_id, customer_id, quantity, amount, notes, created_by, approval_status, review_note, product:products(name, sku), customer:customers(full_name)"
      searchColumns={["transaction_no", "notes"]} searchPlaceholder="Search transaction no. or notes..."
      orderBy="transaction_date" ascending={false} columns={columns} fields={fields} rowKey={(r) => r.id} approval
      canEditRow={(r, me, role) => role !== "staff" || (r.created_by === me && r.approval_status !== "approved")}
      filters={[{
        name: "approval_status", label: "Status",
        options: [{ value: "pending", label: "Pending approval" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }],
      }]}
      toolbarExtra={(refresh) => <SalesImport onDone={refresh} />}
    />
  )
}