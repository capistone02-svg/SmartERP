import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"

interface Customer {
  id: string
  customer_no: string
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  created_by: string | null
}

const columns: Column<Customer>[] = [
  { header: "Customer no.", cell: (r) => r.customer_no },
  { header: "Name", cell: (r) => <span className="font-medium">{r.full_name}</span> },
  { header: "Email", cell: (r) => r.email ?? "—" },
  { header: "Phone", cell: (r) => r.phone ?? "—" },
  { header: "Address", cell: (r) => r.address ?? "—" },
]
const fields: FieldDef[] = [
  { name: "full_name", label: "Full name", type: "text", required: true, fullWidth: true },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "address", label: "Address", type: "textarea" },
]

export default function CustomersPage() {
  return (
    <ResourcePage<Customer>
      resource="customers" table="customers" singular="Customer"
      select="id, customer_no, full_name, email, phone, address, created_by"
      searchColumns={["customer_no", "full_name", "email"]} searchPlaceholder="Search customers..."
      orderBy="full_name" columns={columns} fields={fields} rowKey={(r) => r.id}
    />
  )
}
