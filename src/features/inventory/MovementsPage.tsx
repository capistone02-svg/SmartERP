import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type FilterDef, type Option } from "@/components/shared/ResourcePage"
import { ApprovalBadge, type ApprovalStatus } from "@/features/approvals/ApprovalBadge"
import { formatDate, num, todayStr } from "@/lib/format"
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
  warehouse: { name: string; code: string } | null
}

async function loadOptions(table: string, label: (r: Record<string, string>) => string) {
  const { data } = await supabase.from(table).select("*").is("deleted_at", null).order("name")
  return ((data ?? []) as Record<string, string>[]).map((r) => ({ value: r.id, label: label(r) }))
}

export default function MovementsPage() {
  const [products, setProducts] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [warehouses, setWarehouses] = useState<Option[]>([])

  useEffect(() => {
    loadOptions("products", (r) => `${r.sku} — ${r.name}`).then(setProducts)
    loadOptions("suppliers", (r) => r.name).then(setSuppliers)
    loadOptions("warehouses", (r) => (r.code ? `${r.code} (${r.name})` : r.name)).then(setWarehouses)
  }, [])

  const columns: Column<Movement>[] = [
    { header: "Date", cell: (r) => formatDate(r.movement_date) },
    {
      header: "Product",
      cell: (r) => (
        <div>
          <span className="font-medium text-foreground">{r.product?.name ?? "—"}</span>
          {r.product?.sku && <span className="ml-1.5 font-mono text-xs text-muted-foreground">({r.product.sku})</span>}
        </div>
      ),
    },
    {
      header: "Type",
      cell: (r) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            r.movement_type === "stock_in" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
          }`}
        >
          {r.movement_type === "stock_in" ? "Stock in" : "Stock out"}
        </span>
      ),
    },
    { header: "Quantity", cell: (r) => num(r.quantity), className: "text-right font-medium" },
    {
      header: "Stock impact",
      cell: (r) => (
        <span className={`font-medium ${r.movement_type === "stock_in" ? "text-success" : "text-destructive"}`}>
          {r.movement_type === "stock_in" ? "+" : "−"}
          {num(r.quantity)}
        </span>
      ),
      className: "text-right",
    },
    { header: "Warehouse", cell: (r) => r.warehouse?.name ?? "—" },
    { header: "Supplier", cell: (r) => r.supplier?.name ?? <span className="text-muted-foreground">—</span> },
    { header: "Reference", cell: (r) => r.reference_no ?? <span className="text-muted-foreground">—</span> },
    { header: "Remarks", cell: (r) => r.remarks ?? <span className="text-muted-foreground">—</span> },
    { header: "Status", cell: (r) => <ApprovalBadge status={r.approval_status} note={r.review_note} /> },
  ]

  const fields: FieldDef[] = [
    { name: "product_id", label: "Product", type: "select", options: products, required: true, fullWidth: true },
    {
      name: "movement_type",
      label: "Movement type",
      type: "select",
      required: true,
      defaultValue: "stock_in",
      options: [
        { value: "stock_in", label: "Stock in (receiving goods)" },
        { value: "stock_out", label: "Stock out (dispatch / delivery)" },
      ],
    },
    { name: "quantity", label: "Quantity", type: "integer", min: 1, required: true },
    { name: "movement_date", label: "Movement date", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "warehouse_id",
      label: "Warehouse location",
      type: "select",
      options: warehouses,
      required: true,
      defaultValue: warehouses[0]?.value ?? "",
    },
    {
      name: "supplier_id",
      label: "Supplier (receiving source)",
      type: "select",
      options: suppliers,
      placeholder: "No supplier (internal / opening)",
      visibleWhen: (v) => v.movement_type === "stock_in",
    },
    { name: "reference_no", label: "Reference no. (PO / DR / Receipt)", type: "text", placeholder: "e.g. RCPT-1001 or DR-0045" },
    { name: "remarks", label: "Remarks / reason", type: "textarea", placeholder: "e.g. Opening stock, supplier delivery, transfer" },
  ]

  const filters: FilterDef[] = [
    {
      name: "movement_type",
      label: "Type",
      options: [
        { value: "stock_in", label: "Stock in" },
        { value: "stock_out", label: "Stock out" },
      ],
    },
    {
      name: "approval_status",
      label: "Status",
      options: [
        { value: "pending", label: "Pending approval" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    {
      name: "warehouse_id",
      label: "Warehouse",
      options: warehouses,
    },
    {
      name: "product_id",
      label: "Product",
      options: products,
    },
    {
      name: "supplier_id",
      label: "Supplier",
      options: suppliers,
    },
    {
      name: "from_date",
      column: "movement_date",
      label: "From date",
      type: "date",
      op: "gte",
    },
    {
      name: "to_date",
      column: "movement_date",
      label: "To date",
      type: "date",
      op: "lte",
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 rounded-lg border border-border/80 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Stock movements</span> record every quantity change
          at a specific warehouse location.
          <span className="ml-1 text-foreground/80">
            Stock-outs cannot exceed the available balance at the chosen warehouse. Sales automatically record approved dispatches here.
          </span>
        </div>
      </div>

      <ResourcePage<Movement>
        resource="inventory_movements"
        table="inventory_movements"
        singular="Movement"
        approval
        select="id, movement_type, quantity, movement_date, reference_no, remarks, created_by, approval_status, review_note, product:products(name, sku), supplier:suppliers(name), warehouse:warehouses(name, code)"
        searchColumns={["reference_no", "remarks"]}
        searchPlaceholder="Search by reference no. or remarks..."
        orderBy="movement_date"
        ascending={false}
        columns={columns}
        fields={fields}
        filters={filters}
        rowKey={(r) => r.id}
        emptyText="No inventory movements found matching the selected filters."
        // An approved movement has already changed the stock, so it is locked for everyone.
        canEditRow={(r, me, role) => r.approval_status !== "approved" && (role !== "staff" || r.created_by === me)}
      />
    </div>
  )
}
