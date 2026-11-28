import { useEffect, useState } from "react"
import { Eye, UserPlus } from "lucide-react"
import { useNavigate } from "react-router-dom"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { formatDate, todayStr } from "@/lib/format"
import { AREA_OPTIONS, EMPLOYMENT_TYPES, POSITIONS, STATUS_TONE } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"
import AddEmployeeWizard from "./AddEmployeeWizard"

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
  employment_type: string
  probation_end: string | null
  hire_date: string
  separation_date: string | null
  created_by: string | null
}

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On leave" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
]
const isSeparated = (v: Record<string, string>) => v.employment_status === "resigned" || v.employment_status === "terminated"

// Fields used when HR changes an existing employee (adding uses the step-by-step form)
const fields: FieldDef[] = [
  { name: "employee_no", label: "Employee ID", type: "text", required: true, readOnlyOnEdit: true },
  { name: "position", label: "Position", type: "select", required: true, options: POSITIONS },
  { name: "first_name", label: "First name", type: "text", required: true },
  { name: "last_name", label: "Last name", type: "text", required: true },
  { name: "functional_area", label: "Department", type: "select", options: AREA_OPTIONS, required: true },
  { name: "employment_type", label: "Employment type", type: "select", options: EMPLOYMENT_TYPES, required: true },
  { name: "employment_status", label: "Employment status", type: "select", options: STATUSES, required: true, defaultValue: "active" },
  { name: "hire_date", label: "Hire date", type: "date", required: true, defaultValue: todayStr() },
  { name: "probation_end", label: "Probation ends", type: "date" },
  { name: "separation_date", label: "Separation date", type: "date", required: true, visibleWhen: isSeparated },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "address", label: "Address", type: "textarea" },
]

export default function EmployeesPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [wizard, setWizard] = useState(false)
  const [tick, setTick] = useState(0)
  const [names, setNames] = useState<Record<string, string>>({})

  // Who added each record. Records loaded by the setup script have no author.
  useEffect(() => {
    supabase.rpc("area_user_names").then(({ data }) => {
      const m: Record<string, string> = {}
      for (const r of (data ?? []) as { user_id: string; full_name: string }[]) m[r.user_id] = r.full_name
      setNames(m)
    })
  }, [])

  const columns: Column<Employee>[] = [
    { header: "Employee ID", cell: (r) => r.employee_no },
    { header: "Name", cell: (r) => <button onClick={() => navigate(`/people/${r.id}`)} className="font-medium hover:underline">{r.first_name} {r.last_name}</button> },
    { header: "Position", cell: (r) => r.position },
    { header: "Department", cell: (r) => AREA_LABEL[r.functional_area] ?? r.functional_area },
    { header: "Type", cell: (r) => EMPLOYMENT_TYPES.find((t) => t.value === r.employment_type)?.label.replace(/ \(.*\)/, "") ?? r.employment_type },
    { header: "Status", cell: (r) => <StatusPill label={r.employment_status} tone={STATUS_TONE[r.employment_status as keyof typeof STATUS_TONE] ?? "gray"} /> },
    { header: "Hired", cell: (r) => formatDate(r.hire_date) },
    { header: "Added by", cell: (r) => (r.created_by ? names[r.created_by] ?? "—" : "System") },
    {
      header: "", className: "w-12 text-right",
      cell: (r) => (
        <button aria-label="Open employee file" title="Open employee file" onClick={() => navigate(`/people/${r.id}`)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-brand-text">
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ]

  return (
    <>
      <ResourcePage<Employee>
        resource="employees" table="employees" singular="Employee"
        select="id, employee_no, first_name, last_name, email, phone, address, position, functional_area, employment_status, employment_type, probation_end, hire_date, separation_date, created_by"
        searchColumns={["employee_no", "first_name", "last_name", "position", "email"]}
        searchPlaceholder="Search employees..."
        orderBy="last_name" columns={columns} fields={fields} rowKey={(r) => r.id}
        hideCreate refreshSignal={tick}
        filters={[
          { name: "functional_area", label: "Department", options: AREA_OPTIONS },
          { name: "employment_status", label: "Status", options: STATUSES },
          { name: "employment_type", label: "Type", options: EMPLOYMENT_TYPES },
        ]}
        toolbarExtra={() =>
          can("employees", "create") ? (
            <Button onClick={() => setWizard(true)} className="bg-brand text-white hover:bg-brand-hover">
              <UserPlus className="mr-1 h-4 w-4" /> Add employee
            </Button>
          ) : null
        }
      />
      <AddEmployeeWizard open={wizard} onClose={() => setWizard(false)} onAdded={() => setTick((t) => t + 1)} />
    </>
  )
}
