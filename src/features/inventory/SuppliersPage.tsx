import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_by: string | null
}

const columns: Column<Supplier>[] = [
  { header: "Supplier", cell: (r) => <span className="font-medium">{r.name}</span> },
  { header: "Contact person", cell: (r) => r.contact_person ?? "—" },
  { header: "Email", cell: (r) => r.email ?? "—" },
  { header: "Phone", cell: (r) => r.phone ?? "—" },
  { header: "Address", cell: (r) => r.address ?? "—" },
]
const fields: FieldDef[] = [
  { name: "name", label: "Supplier name", type: "text", required: true, fullWidth: true },
  { name: "contact_person", label: "Contact person", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "email", fullWidth: true },
  { name: "address", label: "Address", type: "textarea" },
]

export default function SuppliersPage() {
  return (
    <ResourcePage<Supplier>
      resource="suppliers" table="suppliers" singular="Supplier"
      select="id, name, contact_person, email, phone, address, created_by"
      searchColumns={["name", "contact_person", "email"]} searchPlaceholder="Search suppliers..."
      orderBy="name" columns={columns} fields={fields} rowKey={(r) => r.id}
    />
  )
}