import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { formatDate, todayStr } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"

interface Employee {
  id: string
  employee_no: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  position: string
  functional_area: keyof typeof AREA_LABEL
  employment_status: string
  hire_date: string
  separation_date: string | null
  created_by: string | null
}

const STATUS_TONE = { active: "green", on_leave: "amber", resigned: "gray", terminated: "red" } as const
const AREAS: Option[] = Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label }))
const STATUSES: Option[] = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On leave" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
]
const isSeparated = (v: Record<string, string>) => v.employment_status === "resigned" || v.employment_status === "terminated"

const baseColumns: Column<Employee>[] = [
  { header: "Employee ID", cell: (r) => r.employee_no },
  { header: "Name", cell: (r) => <span className="font-medium">{r.first_name} {r.last_name}</span> },
  { header: "Position", cell: (r) => r.position },
  { header: "Functional area", cell: (r) => AREA_LABEL[r.functional_area] ?? r.functional_area },
  { header: "Status", cell: (r) => <StatusPill label={r.employment_status} tone={STATUS_TONE[r.employment_status as keyof typeof STATUS_TONE] ?? "gray"} /> },
  { header: "Hired", cell: (r) => formatDate(r.hire_date) },
  { header: "Email", cell: (r) => r.email ?? "—" },
  { header: "Phone", cell: (r) => r.phone ?? "—" },
]

const fields: FieldDef[] = [
  { name: "employee_no", label: "Employee ID", type: "text", required: true, readOnlyOnEdit: true, placeholder: "e.g. 26-12345" },
  { name: "position", label: "Position", type: "text", required: true },
  { name: "first_name", label: "First name", type: "text", required: true },
  { name: "last_name", label: "Last name", type: "text", required: true },
  { name: "functional_area", label: "Functional area", type: "select", options: AREAS, required: true },
  { name: "employment_status", label: "Employment status", type: "select", options: STATUSES, required: true, defaultValue: "active" },
  { name: "hire_date", label: "Hire date", type: "date", required: true, defaultValue: todayStr() },
  { name: "separation_date", label: "Separation date", type: "date", required: true, visibleWhen: isSeparated },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "address", label: "Address", type: "textarea" },
]

export default function EmployeesPage() {
  // Who added each record. Records loaded by the setup script have no author.
  const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    supabase.rpc("area_user_names").then(({ data }) => {
      const m: Record<string, string> = {}
      for (const r of (data ?? []) as { user_id: string; full_name: string }[]) m[r.user_id] = r.full_name
      setNames(m)
    })
  }, [])
  const columns: Column<Employee>[] = [
    ...baseColumns,
    { header: "Added by", cell: (r) => (r.created_by ? names[r.created_by] ?? "—" : "System") },
  ]

  return (
    <ResourcePage<Employee>
      resource="employees" table="employees" singular="Employee"
      select="id, employee_no, first_name, last_name, email, phone, address, position, functional_area, employment_status, hire_date, separation_date, created_by"
      searchColumns={["employee_no", "first_name", "last_name", "position", "email"]}
      searchPlaceholder="Search employees..."
      orderBy="last_name" columns={columns} fields={fields} rowKey={(r) => r.id}
      filters={[
        { name: "functional_area", label: "Area", options: AREAS },
        { name: "employment_status", label: "Status", options: STATUSES },
      ]}
    />
  )
}