import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { formatDate, todayStr } from "@/lib/format"

interface Promotion {
  id: string
  name: string
  description: string | null
  start_date: string
  end_date: string
  status: string
  created_by: string | null
}

const TONE = { planned: "blue", active: "green", ended: "gray", cancelled: "red" } as const
const STATUSES = ["planned", "active", "ended", "cancelled"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))

const columns: Column<Promotion>[] = [
  { header: "Promotion", cell: (r) => <span className="font-medium">{r.name}</span> },
  { header: "Start", cell: (r) => formatDate(r.start_date) },
  { header: "End", cell: (r) => formatDate(r.end_date) },
  { header: "Status", cell: (r) => <StatusPill label={r.status} tone={TONE[r.status as keyof typeof TONE] ?? "gray"} /> },
  { header: "Description", cell: (r) => r.description ?? "—" },
]
const fields: FieldDef[] = [
  { name: "name", label: "Promotion name", type: "text", required: true, fullWidth: true },
  { name: "start_date", label: "Start date", type: "date", required: true, defaultValue: todayStr() },
  { name: "end_date", label: "End date", type: "date", required: true, defaultValue: todayStr() },
  { name: "status", label: "Status", type: "select", options: STATUSES, required: true, defaultValue: "planned" },
  { name: "description", label: "Description", type: "textarea" },
]

export default function PromotionsPage() {
  return (
    <ResourcePage<Promotion>
      resource="promotions" table="promotions" singular="Promotion"
      select="id, name, description, start_date, end_date, status, created_by"
      searchColumns={["name", "description"]} searchPlaceholder="Search promotions..."
      orderBy="start_date" ascending={false} columns={columns} fields={fields} rowKey={(r) => r.id}
      filters={[{ name: "status", label: "Status", options: STATUSES }]}
    />
  )
}