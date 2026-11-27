import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { inputClass } from "@/components/shared/FormParts"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL, ROLE_LABEL, type AppRole, type FunctionalArea } from "@/types"

type Field = "can_view" | "can_create" | "can_update" | "can_delete"
interface PermRow {
  id: string
  role: AppRole
  functional_area: FunctionalArea | null
  resource: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

const FIELDS: { key: Field; label: string }[] = [
  { key: "can_view", label: "View" },
  { key: "can_create", label: "Create" },
  { key: "can_update", label: "Update" },
  { key: "can_delete", label: "Delete" },
]
const ROLE_ORDER: Record<AppRole, number> = { department_head: 0, staff: 1, admin: 2 }

export default function PermissionsPage() {
  const [rows, setRows] = useState<PermRow[] | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState("")
  const [area, setArea] = useState("")
  const [confirm, setConfirm] = useState<PermRow | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from("permissions").select("*"),
      supabase.from("resource_catalog").select("resource, label"),
    ]).then(([p, c]) => {
      if (!active) return
      if (p.error) return setError("Permissions could not be loaded.")
      const sorted = ((p.data ?? []) as PermRow[]).sort((a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        (a.functional_area ?? "").localeCompare(b.functional_area ?? "") ||
        a.resource.localeCompare(b.resource))
      setRows(sorted)
      setLabels(Object.fromEntries(((c.data ?? []) as { resource: string; label: string }[]).map((r) => [r.resource, r.label])))
    })
    return () => {
      active = false
    }
  }, [])

  async function apply(row: PermRow, field: Field, value: boolean) {
    setRows((cur) => cur && cur.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)))
    const { data, error } = await supabase
      .from("permissions")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("id")
    if (error || !data || data.length === 0) {
      setRows((cur) => cur && cur.map((r) => (r.id === row.id ? { ...r, [field]: !value } : r)))
      toast.error("The permission could not be changed.")
    } else {
      toast.success("Permission updated.")
    }
  }

  function toggle(row: PermRow, field: Field, value: boolean) {
    if (field === "can_delete" && value) setConfirm(row)
    else apply(row, field, value)
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!rows) return <p className="text-sm text-neutral-500">Loading...</p>

  const shown = rows.filter((r) => (!role || r.role === role) && (!area || r.functional_area === area))

  return (
    <>
      <p className="mb-3 text-xs text-neutral-500">
        Changes apply immediately and are enforced by the database. Users see them the next time they sign in or refresh.
        Administrator permissions are fixed.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className={cn(inputClass, "w-auto")}>
          <option value="">Role: All</option>
          <option value="department_head">Department Head</option>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)} className={cn(inputClass, "w-auto")}>
          <option value="">Area: All</option>
          {(Object.keys(AREA_LABEL) as FunctionalArea[]).map((a) => (
            <option key={a} value={a}>{AREA_LABEL[a]}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#dbe3f5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f6f9fe] hover:bg-[#f6f9fe]">
                <TableHead className="text-xs font-semibold text-neutral-600">Role</TableHead>
                <TableHead className="text-xs font-semibold text-neutral-600">Functional area</TableHead>
                <TableHead className="text-xs font-semibold text-neutral-600">Resource</TableHead>
                {FIELDS.map((f) => (
                  <TableHead key={f.key} className="text-center text-xs font-semibold text-neutral-600">{f.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{ROLE_LABEL[r.role]}</TableCell>
                  <TableCell className="text-sm">{r.functional_area ? AREA_LABEL[r.functional_area] : "System-wide"}</TableCell>
                  <TableCell className="text-sm font-medium">{labels[r.resource] ?? r.resource}</TableCell>
                  {FIELDS.map((f) => (
                    <TableCell key={f.key} className="text-center">
                      <Checkbox
                        checked={r[f.key]}
                        disabled={r.role === "admin"}
                        aria-label={`${f.label} ${r.resource}`}
                        onCheckedChange={(c) => toggle(r, f.key, c === true)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title="Allow deleting?"
        message={confirm ? `${ROLE_LABEL[confirm.role]} users in ${confirm.functional_area ? AREA_LABEL[confirm.functional_area] : "the system"} will be able to delete "${labels[confirm.resource] ?? confirm.resource}" records. Deleted records are hidden from lists and reports.` : ""}
        confirmLabel="Allow delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) apply(confirm, "can_delete", true)
          setConfirm(null)
        }}
      />
    </>
  )
}