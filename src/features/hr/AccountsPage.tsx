import { useEffect, useMemo, useState } from "react"
import { KeyRound, Plus, Search, UserCheck, UserX } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { FormDialog } from "@/components/shared/FormDialog"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { StatusPill } from "@/components/shared/StatusPill"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { callAccountFunction, randomPassword } from "@/lib/adminApi"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { AREA_LABEL, ROLE_LABEL, type AppRole, type FunctionalArea } from "@/types"

interface Account {
  id: string
  employee_no: string
  full_name: string
  role: AppRole
  functional_area: FunctionalArea
  is_active: boolean
  must_change_password: boolean
  last_sign_in_at: string | null
}
interface Candidate {
  id: string
  employee_no: string
  full_name: string
  job_position: string
  functional_area: FunctionalArea
}

const PAGE_SIZE = 10

export default function AccountsPage() {
  const { can } = useAuth()
  const canCreate = can("user_accounts", "create")
  const canUpdate = can("user_accounts", "update")

  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [page, setPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Add account
  const [addOpen, setAddOpen] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidateId, setCandidateId] = useState("")
  const [password, setPassword] = useState("")
  const [created, setCreated] = useState<{ employee_no: string; name: string; password: string } | null>(null)
  // Reset password
  const [resetRow, setResetRow] = useState<Account | null>(null)
  const [resetPw, setResetPw] = useState("")
  const [resetDone, setResetDone] = useState<string | null>(null)
  // Activate / deactivate
  const [statusRow, setStatusRow] = useState<Account | null>(null)

  useEffect(() => {
    let on = true
    setLoading(true)
    supabase.rpc("hr_list_accounts").then(({ data, error: e }) => {
      if (!on) return
      if (e) setError(friendlyError(e))
      else {
        setError(null)
        setAccounts((data ?? []) as Account[])
      }
      setLoading(false)
    })
    return () => {
      on = false
    }
  }, [refreshKey])

  const refresh = () => setRefreshKey((k) => k + 1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter(
      (a) =>
        (!q || a.full_name.toLowerCase().includes(q) || a.employee_no.toLowerCase().includes(q)) &&
        (!roleFilter || a.role === roleFilter) &&
        (!statusFilter || String(a.is_active) === statusFilter),
    )
  }, [accounts, search, roleFilter, statusFilter])
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function openAdd() {
    setCandidateId("")
    setPassword(randomPassword())
    setCreated(null)
    setFormError(null)
    setAddOpen(true)
    const { data, error: e } = await supabase.rpc("hr_unregistered_employees")
    if (e) setFormError(friendlyError(e))
    else setCandidates((data ?? []) as Candidate[])
  }

  async function submitAdd() {
    const emp = candidates.find((c) => c.id === candidateId)
    if (!emp) return setFormError("Choose an employee.")
    if (password.length < 8) return setFormError("The password must be at least 8 characters.")
    setSaving(true)
    const err = await callAccountFunction({
      action: "create", employee_no: emp.employee_no, password, role: "staff", functional_area: emp.functional_area,
    })
    setSaving(false)
    if (err) return setFormError(err)
    setCreated({ employee_no: emp.employee_no, name: emp.full_name, password })
    refresh()
  }

  async function submitReset() {
    if (!resetRow) return
    if (resetPw.length < 8) return setFormError("The password must be at least 8 characters.")
    setSaving(true)
    const err = await callAccountFunction({ action: "reset_password", user_id: resetRow.id, password: resetPw })
    setSaving(false)
    if (err) return setFormError(err)
    setResetDone(resetPw)
  }

  async function confirmStatus() {
    if (!statusRow) return
    const { error: e } = await supabase.rpc("hr_set_account_status", {
      p_user: statusRow.id, p_active: !statusRow.is_active,
    })
    if (e) toast.error(friendlyError(e))
    else {
      toast.success(statusRow.is_active ? "Account deactivated." : "Account reactivated.")
      refresh()
    }
    setStatusRow(null)
  }

  const columns: Column<Account>[] = [
    { header: "Employee ID", cell: (r) => r.employee_no },
    { header: "Name", cell: (r) => <span className="font-medium">{r.full_name}</span> },
    { header: "Role", cell: (r) => ROLE_LABEL[r.role] },
    { header: "Functional area", cell: (r) => AREA_LABEL[r.functional_area] },
    { header: "Status", cell: (r) => <StatusPill label={r.is_active ? "active" : "inactive"} tone={r.is_active ? "green" : "gray"} /> },
    {
      header: "Last sign-in",
      cell: (r) => (
        <div className="text-sm">
          {r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "Never"}
          {r.must_change_password && <div className="text-xs text-amber-600">Temporary password</div>}
        </div>
      ),
    },
    {
      header: "",
      className: "w-24 text-right",
      cell: (r) =>
        canUpdate && r.role === "staff" ? (
          <div className="flex justify-end gap-1">
            <button aria-label="Reset password" title="Reset password" onClick={() => {
              setResetPw(randomPassword()); setResetDone(null); setFormError(null); setResetRow(r)
            }} className="rounded-md p-1.5 text-neutral-500 hover:bg-[#eef6fd] hover:text-[#0e63a6]">
              <KeyRound className="h-4 w-4" />
            </button>
            <button aria-label={r.is_active ? "Deactivate" : "Reactivate"} title={r.is_active ? "Deactivate account" : "Reactivate account"}
              onClick={() => setStatusRow(r)}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-[#eef6fd] hover:text-[#0e63a6]">
              {r.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            </button>
          </div>
        ) : null,
    },
  ]

  const picked = candidates.find((c) => c.id === candidateId)

  return (
    <>
      <p className="mb-3 text-xs text-neutral-500">
        Create accounts for employees, reset Staff passwords and deactivate Staff accounts. Department Head accounts are
        shown for reference; an administrator manages them.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input value={search} placeholder="Search accounts..." className={cn(inputClass, "pl-9")}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select aria-label="Role" value={roleFilter} className={cn(inputClass, "w-auto")}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}>
          <option value="">Role: All</option>
          <option value="staff">Staff</option>
          <option value="department_head">Department Head</option>
        </select>
        <select aria-label="Status" value={statusFilter} className={cn(inputClass, "w-auto")}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">Status: All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        {canCreate && (
          <Button className="ml-auto bg-[#0e63a6] text-white hover:bg-[#0b5189]" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add Account
          </Button>
        )}
      </div>

      <DataTable columns={columns} rows={pageRows} rowKey={(r) => r.id} loading={loading} error={error}
        page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />

      <FormDialog open={addOpen} title={created ? "Account created" : "Add Account"} onClose={() => setAddOpen(false)}
        onSubmit={created ? () => setAddOpen(false) : submitAdd} submitting={saving} error={formError}
        submitLabel={created ? "Done" : "Create account"}>
        {created ? (
          <div className="space-y-2 text-sm">
            <p>
              Account created for <span className="font-medium">{created.name}</span> (Employee ID {created.employee_no}).
              Share this temporary password securely. They must choose their own at first sign-in.
            </p>
            <p className="rounded-md bg-[#f6f9fe] p-3 font-mono text-base">{created.password}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <FormField label="Employee" required>
              <select className={inputClass} value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                <option value="">{candidates.length ? "Select an employee..." : "No employees without an account"}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.employee_no} · {c.full_name}</option>
                ))}
              </select>
            </FormField>
            {picked && (
              <p className="text-sm text-neutral-600">
                {picked.job_position}, {AREA_LABEL[picked.functional_area]}. The account will have the <b>Staff</b> role.
              </p>
            )}
            <FormField label="Temporary password" required>
              <div className="flex gap-2">
                <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="button" variant="outline" onClick={() => setPassword(randomPassword())}>Generate</Button>
              </div>
            </FormField>
            <p className="text-xs text-neutral-500">
              Employees must exist in Human Resource &gt; Employees first. An administrator promotes someone to Department Head.
            </p>
          </div>
        )}
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
              <input className={inputClass} value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => setResetPw(randomPassword())}>Generate</Button>
            </div>
          </FormField>
        )}
      </FormDialog>

      <ConfirmDialog
        open={statusRow !== null}
        title={statusRow?.is_active ? "Deactivate this account?" : "Reactivate this account?"}
        message={statusRow
          ? statusRow.is_active
            ? `${statusRow.full_name} will no longer be able to sign in. Their records stay in the system.`
            : `${statusRow.full_name} will be able to sign in again.`
          : ""}
        confirmLabel={statusRow?.is_active ? "Deactivate" : "Reactivate"}
        onCancel={() => setStatusRow(null)}
        onConfirm={confirmStatus}
      />
    </>
  )
}
