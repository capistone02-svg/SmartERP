import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { cardLabel, CARD_OPTIONS, hasCard } from "@/lib/cards"

interface Customer {
  id: string
  customer_no: string
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  card_type: string | null
  card_no: string | null
  created_by: string | null
}

const columns: Column<Customer>[] = [
  { header: "Customer no.", cell: (r) => r.customer_no },
  { header: "Name", cell: (r) => <span className="font-medium">{r.full_name}</span> },
  { header: "Card", cell: (r) =>
      hasCard(r.card_type) ? (
        <span className="inline-flex items-center gap-1.5">
          <span>{cardLabel(r.card_type)}</span>
          {r.card_no && <span className="text-muted-foreground">· {r.card_no}</span>}
          <StatusPill label="Priority" tone="amber" />
        </span>
      ) : (
        "—"
      ),
  },
  { header: "Email", cell: (r) => r.email ?? "—" },
  { header: "Phone", cell: (r) => r.phone ?? "—" },
  { header: "Address", cell: (r) => r.address ?? "—" },
]
const fields: FieldDef[] = [
  { name: "full_name", label: "Full name", type: "text", required: true, fullWidth: true },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "address", label: "Address", type: "textarea" },
  {
    name: "card_type", label: "Card", type: "select", options: CARD_OPTIONS, defaultValue: "none",
  },
  {
    name: "card_no", label: "Card number", type: "text",
    visibleWhen: (v) => (v.card_type ?? "none") !== "none",
  },
]

export default function CustomersPage() {
  return (
    <ResourcePage<Customer>
      resource="customers" table="customers" singular="Customer"
      select="id, customer_no, full_name, email, phone, address, card_type, card_no, created_by"
      searchColumns={["customer_no", "full_name", "email"]} searchPlaceholder="Search customers..."
      orderBy="full_name" columns={columns} fields={fields} rowKey={(r) => r.id}
    />
  )
}
