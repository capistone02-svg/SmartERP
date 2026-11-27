import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"

interface Warehouse {
  id: string
  code: string
  name: string
  location: string | null
  created_by: string | null
}

const columns: Column<Warehouse>[] = [
  { header: "Code", cell: (r) => r.code },
  { header: "Warehouse", cell: (r) => <span className="font-medium">{r.name}</span> },
  { header: "Location", cell: (r) => r.location ?? "—" },
]
const fields: FieldDef[] = [
  { name: "code", label: "Code", type: "text", required: true },
  { name: "name", label: "Warehouse name", type: "text", required: true },
  { name: "location", label: "Location", type: "textarea" },
]

export default function WarehousePage() {
  return (
    <ResourcePage<Warehouse>
      resource="warehouses" table="warehouses" singular="Warehouse"
      select="id, code, name, location, created_by"
      searchColumns={["code", "name", "location"]} searchPlaceholder="Search warehouses..."
      orderBy="name" columns={columns} fields={fields} rowKey={(r) => r.id}
    />
  )
}