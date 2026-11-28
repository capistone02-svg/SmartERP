import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import type { ApprovalStatus } from "@/features/approvals/ApprovalBadge"
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
  refund_state: "none" | "approved" | "completed"
  refunded_amount: number
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
    {
      header: "Customer",
      cell: (r) =>
        r.customer?.full_name ? (
          <span className="font-medium">{r.customer.full_name}</span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Walk-in</span>
        ),
    },
    { header: "Qty", cell: (r) => num(r.quantity), className: "text-right" },
    { header: "Amount", cell: (r) => peso(r.amount), className: "text-right" },
    {
      header: "Status",
      cell: (r) => (
        <StatusPill
          label={
            r.approval_status === "approved"
              ? "Completed"
              : r.approval_status === "rejected"
              ? "Cancelled"
              : "Pending"
          }
          tone={
            r.approval_status === "approved"
              ? "green"
              : r.approval_status === "rejected"
              ? "red"
              : "amber"
          }
        />
      ),
    },
    {
      header: "Refund",
      cell: (r) => (r.refund_state === "none" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <StatusPill
          label={`${r.refund_state === "approved" ? "Approved" : "Completed"} · ${peso(r.refunded_amount)}`}
          tone={r.refund_state === "approved" ? "blue" : "green"}
        />
      )),
    },
  ]
  const fields: FieldDef[] = [
    { name: "product_id", label: "Product", type: "select", options: products, required: true, fullWidth: true },
    {
      name: "customer_id",
      label: "Customer (Optional - Loyalty / SMAC Member)",
      type: "select",
      options: customers,
      placeholder: "Walk-in Customer (No membership card)",
      fullWidth: true,
    },
    { name: "transaction_date", label: "Transaction date", type: "date", required: true, defaultValue: todayStr() },
    { name: "quantity", label: "Quantity", type: "integer", min: 1, required: true, defaultValue: "1" },
    { name: "amount", label: "Recorded amount (PHP)", type: "number", min: 0, required: true },
    { name: "notes", label: "Notes / Cashier receipt details", type: "textarea" },
  ]

  return (
    <ResourcePage<Sale>
      resource="sales_transactions" table="sales_transactions" singular="Sale"
      select="id, transaction_no, transaction_date, product_id, customer_id, quantity, amount, notes, created_by, approval_status, review_note, refund_state, refunded_amount, product:products(name, sku), customer:customers(full_name)"
      searchColumns={["transaction_no", "notes"]} searchPlaceholder="Search transaction no. or notes..."
      orderBy="transaction_date" ascending={false} columns={columns} fields={fields} rowKey={(r) => r.id}
      canEditRow={(r, me, role) => role !== "staff" || r.created_by === me}
      filters={[{
        name: "approval_status", label: "Status",
        options: [{ value: "approved", label: "Completed" }, { value: "pending", label: "Pending" }, { value: "rejected", label: "Cancelled" }],
      }]}
      toolbarExtra={(refresh) => <SalesImport onDone={refresh} />}
    />
  )
}