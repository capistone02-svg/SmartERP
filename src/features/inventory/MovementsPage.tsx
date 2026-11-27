import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { formatDate, num, todayStr } from "@/lib/format"
import { ApprovalBadge, type ApprovalStatus } from "@/features/approvals/ApprovalBadge"
import { supabase } from "@/lib/supabase"

interface Movement {
  id: string
  movement_type: "stock_in" | "stock_out"
  quantity: number
  movement_date: string
  reference_no: string | null
  remarks: string | null
  created_by: string | null
  approval_status: ApprovalStatus
  review_note: string | null
  product: { name: string; sku: string } | null
  supplier: { name: string } | null
  warehouse: { name: string } | null
}

async function loadOptions(table: string, label: (r: Record<string, string>) => string) {
  const { data } = await supabase.from(table).select("*").order("created_at")
  return ((data ?? []) as Record<string, string>[]).map((r) => ({ value: r.id, label: label(r) }))
}

export default function MovementsPage() {
  const [products, setProducts] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [warehouses, setWarehouses] = useState<Option[]>([])
  useEffect(() => {
    loadOptions("products", (r) => `${r.sku} - ${r.name}`).then(setProducts)
    loadOptions("suppliers", (r) => r.name).then(setSuppliers)
    loadOptions("warehouses", (r) => r.name).then(setWarehouses)
  }, [])

  const columns: Column<Movement>[] = [
    { header: "Date", cell: (r) => formatDate(r.movement_date) },
    { header: "Product", cell: (r) => <span className="font-medium">{r.product?.name ?? "—"}</span> },
    {
      header: "Type",
      cell: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          r.movement_type === "stock_in" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
          {r.movement_type === "stock_in" ? "Stock in" : "Stock out"}
        </span>
      ),
    },
    { header: "Quantity", cell: (r) => num(r.quantity), className: "text-right" },
    { header: "Supplier", cell: (r) => r.supplier?.name ?? "—" },
    { header: "Warehouse", cell: (r) => r.warehouse?.name ?? "—" },
    { header: "Reference", cell: (r) => r.reference_no ?? "—" },
    { header: "Remarks", cell: (r) => r.remarks ?? "—" },
    { header: "Status", cell: (r) => <ApprovalBadge status={r.approval_status} note={r.review_note} /> },
  ]
  const fields: FieldDef[] = [
    { name: "product_id", label: "Product", type: "select", options: products, required: true, fullWidth: true },
    {
      name: "movement_type", label: "Movement type", type: "select", required: true, defaultValue: "stock_in",
      options: [{ value: "stock_in", label: "Stock in" }, { value: "stock_out", label: "Stock out" }],
    },
    { name: "quantity", label: "Quantity", type: "integer", min: 1, required: true },
    { name: "movement_date", label: "Movement date", type: "date", required: true, defaultValue: todayStr() },
    { name: "warehouse_id", label: "Warehouse", type: "select", options: warehouses, required: true, defaultValue: warehouses[0]?.value ?? "" },
    { name: "supplier_id", label: "Supplier", type: "select", options: suppliers, placeholder: "No supplier", visibleWhen: (v) => v.movement_type === "stock_in" },
    { name: "reference_no", label: "Reference no.", type: "text" },
    { name: "remarks", label: "Remarks", type: "textarea" },
  ]

  return (
    <ResourcePage<Movement>
      resource="inventory_movements" table="inventory_movements" singular="Movement" approval
      select="id, movement_type, quantity, movement_date, reference_no, remarks, created_by, approval_status, review_note, product:products(name, sku), supplier:suppliers(name), warehouse:warehouses(name)"
      searchColumns={["reference_no", "remarks"]} searchPlaceholder="Search reference or remarks..."
      orderBy="movement_date" ascending={false} columns={columns} fields={fields} rowKey={(r) => r.id}
      // An approved movement has already changed the stock, so it is locked for everyone.
      canEditRow={(r, me, role) => r.approval_status !== "approved" && (role !== "staff" || r.created_by === me)}
      filters={[{
        name: "movement_type", label: "Type",
        options: [{ value: "stock_in", label: "Stock in" }, { value: "stock_out", label: "Stock out" }],
      }, {
        name: "approval_status", label: "Status",
        options: [{ value: "pending", label: "Pending approval" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }],
      }]}
    />
  )
}