import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { formatDate, todayStr } from "@/lib/format"
import { supabase } from "@/lib/supabase"

interface Activity {
  id: string
  name: string
  description: string | null
  activity_date: string
  status: string
  channel: string | null
  promotion_id: string | null
  created_by: string | null
  promotion: { name: string } | null
}

const TONE = { planned: "blue", ongoing: "green", completed: "gray", cancelled: "red" } as const
const STATUSES = ["planned", "ongoing", "completed", "cancelled"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))

export default function MarketingPage() {
  const [promos, setPromos] = useState<Option[]>([])
  useEffect(() => {
    supabase.from("promotions").select("id, name").order("name").then(({ data }) =>
      setPromos(((data ?? []) as { id: string; name: string }[]).map((r) => ({ value: r.id, label: r.name }))))
  }, [])

  const columns: Column<Activity>[] = [
    { header: "Activity", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Date", cell: (r) => formatDate(r.activity_date) },
    { header: "Channel", cell: (r) => r.channel ?? "—" },
    { header: "Promotion", cell: (r) => r.promotion?.name ?? "—" },
    { header: "Status", cell: (r) => <StatusPill label={r.status} tone={TONE[r.status as keyof typeof TONE] ?? "gray"} /> },
  ]
  const fields: FieldDef[] = [
    { name: "name", label: "Activity name", type: "text", required: true, fullWidth: true },
    { name: "activity_date", label: "Activity date", type: "date", required: true, defaultValue: todayStr() },
    { name: "status", label: "Status", type: "select", options: STATUSES, required: true, defaultValue: "planned" },
    { name: "channel", label: "Channel", type: "text", placeholder: "e.g. Social media" },
    { name: "promotion_id", label: "Related promotion", type: "select", options: promos, placeholder: "None" },
    { name: "description", label: "Description", type: "textarea" },
  ]

  return (
    <ResourcePage<Activity>
      resource="marketing_activities" table="marketing_activities" singular="Activity"
      select="id, name, description, activity_date, status, channel, promotion_id, created_by, promotion:promotions(name)"
      searchColumns={["name", "channel", "description"]} searchPlaceholder="Search activities..."
      orderBy="activity_date" ascending={false} columns={columns} fields={fields} rowKey={(r) => r.id}
      filters={[{ name: "status", label: "Status", options: STATUSES }]}
    />
  )
}