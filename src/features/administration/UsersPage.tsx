import { useState, type ReactNode } from "react"
import { KeyRound, Pencil, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { FormDialog } from "@/components/shared/FormDialog"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { StatusPill } from "@/components/shared/StatusPill"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { useDebounced } from "@/hooks/useDebounced"
import { usePagedQuery } from "@/hooks/usePagedQuery"
import { callAccountFunction, randomPassword } from "@/lib/adminApi"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { AREA_LABEL, ROLE_LABEL, type AppRole, type FunctionalArea } from "@/types"

interface UserRow {
  id: string
  employee_no: string
  email: string
  full_name: string
  role: AppRole
  functional_area: FunctionalArea | null
  is_active: boolean
}

const ALL_ROLES = (Object.keys(ROLE_LABEL) as AppRole[]).map((v) => ({ value: v, label: ROLE_LABEL[v] }))
// Admin moves people between these two (promotion / demotion); Admin accounts are created separately.
const EMPLOYEE_ROLES = [
  { value: "staff", label: ROLE_LABEL.staff },
  { value: "department_head", label: ROLE_LABEL.department_head },
]
const AREAS = (Object.keys(AREA_LABEL) as FunctionalArea[]).map((v) => ({ value: v, label: AREA_LABEL[v] }))

function Sel({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}): ReactNode {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export default function UsersPage() {
  const { profile } = useAuth()
  const [searchInput, setSearchInput] = useState("")
  const search = useDebounced(searchInput, 300)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Add Admin
  const [addOpen, setAddOpen] = useState(false)
  const [add, setAdd] = useState({ employee_no: "", full_name: "", password: "" })
  const [addedPw, setAddedPw] = useState<string | null>(null)
  // Edit
  const [editRow, setEditRow] = useState<UserRow | null>(null)
  const [edit, setEdit] = useState({ full_name: "", role: "staff", functional_area: "", is_active: "true" })
  // Reset password
  const [resetRow, setResetRow] = useState<UserRow | null>(null)
  const [newPw, setNewPw] = useState("")
  const [resetDone, setResetDone] = useState<string | null>(null)

  const { rows, total, loading, error } = usePagedQuery<UserRow>({
    table: "profiles",
    select: "id, employee_no, email, full_name, role, functional_area, is_active",
    searchColumns: ["employee_no", "full_name"], search, eq: filters,
    orderBy: "full_name", page, pageSize: 10, refreshKey,
  })

  const refresh = () => setRefreshKey((k) => k + 1)

  async function submitAdd() {
    if (!add.employee_no.trim()) return setFormError("Employee ID is required.")
    if (!add.full_name.trim()) return setFormError("Enter the administrator's name.")
    if (add.password.length < 8) return setFormError("The password must be at least 8 characters.")
    setSaving(true)
    const err = await callAccountFunction({ action: "create", role: "admin", ...add })
    setSaving(false)
    if (err) return setFormError(err)
    setAddedPw(add.password)
    refresh()
  }

  async function submitEdit() {
    if (!editRow) return
    const isAdminRow = editRow.role === "admin"
    if (isAdminRow && !edit.full_name.trim()) return setFormError("Name is required.")
    if (!isAdminRow && !edit.functional_area) return setFormError("Choose a functional area.")
    setSaving(true)
    const changes = isAdminRow
      ? { full_name: edit.full_name.trim(), is_active: edit.is_active === "true" }
      : { role: edit.role, functional_area: edit.functional_area, is_active: edit.is_active === "true" }
    const { data, error: e } = await supabase.from("profiles").update(changes).eq("id", editRow.id).select("id")
    setSaving(false)
    if (e) return setFormError(friendlyError(e))
    if (!data || data.length === 0) return setFormError("The account could not be updated.")
    toast.success("Account updated.")
    setEditRow(null)
    refresh()
  }

  async function submitReset() {
    if (!resetRow) return
    if (newPw.length < 8) return setFormError("The password must be at least 8 characters.")
    setSaving(true)
    const err = await callAccountFunction({ action: "reset_password", user_id: resetRow.id, password: newPw })
    setSaving(false)
    if (err) return setFormError(err)
    setResetDone(newPw)
  }

  const columns: Column<UserRow>[] = [
    { header: "Employee ID", cell: (r) => r.employee_no },
    { header: "Name", cell: (r) => <span className="font-medium">{r.full_name}</span> },
    { header: "Role", cell: (r) => ROLE_LABEL[r.role] },
    { header: "Functional area", cell: (r) => (r.functional_area ? AREA_LABEL[r.functional_area] : "System-wide") },
    { header: "Status", cell: (r) => <StatusPill label={r.is_active ? "active" : "inactive"} tone={r.is_active ? "green" : "gray"} /> },
    {
      header: "",
      className: "w-24 text-right",
      cell: (r) =>
        r.id === profile?.id ? null : (
          <div className="flex justify-end gap-1">
            <button aria-label="Edit" title="Edit account" onClick={() => {
              setEdit({ full_name: r.full_name, role: r.role === "admin" ? "staff" : r.role, functional_area: r.functional_area ?? "", is_active: String(r.is_active) })
              setFormError(null)
              setEditRow(r)
            }} className="rounded-md p-1.5 text-neutral-500 hover:bg-[#eef6fd] hover:text-[#0e63a6]">
              <Pencil className="h-4 w-4" />
            </button>
            {r.role !== "staff" && (
              <button aria-label="Reset password" title="Reset password" onClick={() => {
                setNewPw(randomPassword())
                setResetDone(null)
                setFormError(null)
                setResetRow(r)
              }} className="rounded-md p-1.5 text-neutral-500 hover:bg-[#eef6fd] hover:text-[#0e63a6]">
                <KeyRound className="h-4 w-4" />
              </button>
            )}
          </div>
        ),
    },
  ]

  return (
    <>
      <p className="mb-3 text-xs text-neutral-500">
        Employee accounts are created and managed by the HR Head (Human Resource &gt; Accounts). Here you promote or
        demote between Staff and Department Head, deactivate accounts, reset Department Head passwords, and manage
        Administrator accounts.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input value={searchInput} placeholder="Search users..." className={cn(inputClass, "pl-9")}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1) }} />
        </div>
        <select aria-label="Role" value={filters.role ?? ""} className={cn(inputClass, "w-auto")}
          onChange={(e) => { setFilters((f) => ({ ...f, role: e.target.value })); setPage(1) }}>
          <option value="">Role: All</option>
          {ALL_ROLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="Status" value={filters.is_active ?? ""} className={cn(inputClass, "w-auto")}
          onChange={(e) => { setFilters((f) => ({ ...f, is_active: e.target.value })); setPage(1) }}>
          <option value="">Status: All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <Button className="ml-auto bg-[#0e63a6] text-white hover:bg-[#0b5189]" onClick={() => {
          setAdd({ employee_no: "", full_name: "", password: randomPassword() })
          setAddedPw(null)
          setFormError(null)
          setAddOpen(true)
        }}>
          <Plus className="mr-1 h-4 w-4" /> Add Admin
        </Button>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} error={error}
        page={page} pageSize={10} total={total} onPageChange={setPage} />

      <FormDialog open={addOpen} title={addedPw ? "Administrator account created" : "Add Administrator"}
        onClose={() => setAddOpen(false)} onSubmit={addedPw ? () => setAddOpen(false) : submitAdd}
        submitting={saving} error={formError} submitLabel={addedPw ? "Done" : "Create account"}>
        {addedPw ? (
          <div className="space-y-2 text-sm">
            <p>Share this temporary password with the administrator securely. They must change it when they first sign in.</p>
            <p className="rounded-md bg-[#f6f9fe] p-3 font-mono text-base">{addedPw}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Employee ID" required>
              <input className={inputClass} value={add.employee_no} placeholder="e.g. 26-10001"
                onChange={(e) => setAdd({ ...add, employee_no: e.target.value })} />
            </FormField>
            <FormField label="Full name" required>
              <input className={inputClass} value={add.full_name}
                onChange={(e) => setAdd({ ...add, full_name: e.target.value })} />
            </FormField>
            <FormField label="Temporary password" required className="sm:col-span-2">
              <div className="flex gap-2">
                <input className={inputClass} value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} />
                <Button type="button" variant="outline" onClick={() => setAdd({ ...add, password: randomPassword() })}>Generate</Button>
              </div>
            </FormField>
          </div>
        )}
      </FormDialog>

      <FormDialog open={editRow !== null} title={editRow?.role === "admin" ? "Edit Administrator" : "Edit User"}
        onClose={() => setEditRow(null)} onSubmit={submitEdit} submitting={saving} error={formError}>
        <div className="grid gap-4 sm:grid-cols-2">
          {editRow?.role === "admin" ? (
            <FormField label="Full name" required className="sm:col-span-2">
              <input className={inputClass} value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} />
            </FormField>
          ) : (
            <>
              <p className="text-sm sm:col-span-2"><span className="text-neutral-500">Employee:</span> <span className="font-medium">{editRow?.full_name}</span> ({editRow?.employee_no})</p>
              <FormField label="Role" required>
                <Sel value={edit.role} options={EMPLOYEE_ROLES} onChange={(v) => setEdit({ ...edit, role: v })} />
              </FormField>
              <FormField label="Functional area" required>
                <Sel value={edit.functional_area} options={AREAS} placeholder="Select..."
                  onChange={(v) => setEdit({ ...edit, functional_area: v })} />
              </FormField>
            </>
          )}
          <FormField label="Status" required>
            <Sel value={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })}
              options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive (deactivated)" }]} />
          </FormField>
        </div>
      </FormDialog>

      <FormDialog open={resetRow !== null} title={`Reset password${resetRow ? ` for ${resetRow.full_name}` : ""}`}
        onClose={() => setResetRow(null)} onSubmit={resetDone ? () => setResetRow(null) : submitReset}
        submitting={saving} error={formError} submitLabel={resetDone ? "Done" : "Reset password"}>
        {resetDone ? (
          <div className="space-y-2 text-sm">
            <p>Password reset. Share this temporary password securely. The user must change it at the next sign-in.</p>
            <p className="rounded-md bg-[#f6f9fe] p-3 font-mono text-base">{resetDone}</p>
          </div>
        ) : (
          <FormField label="New temporary password" required>
            <div className="flex gap-2">
              <input className={inputClass} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => setNewPw(randomPassword())}>Generate</Button>
            </div>
          </FormField>
        )}
      </FormDialog>
    </>
  )
}
