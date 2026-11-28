import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { inputClass } from "@/components/shared/FormParts"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { AREA_LABEL, type AppRole, type FunctionalArea } from "@/types"

type Field = "can_view" | "can_create" | "can_update" | "can_delete" | "can_import" | "can_export"
interface PermRow {
  id: string
  role: AppRole
  functional_area: FunctionalArea | null
  resource: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_import: boolean
  can_export: boolean
}
interface Line { resource: string; head?: PermRow; staff?: PermRow; admin?: PermRow }
interface Catalog { label: string; sensitivity: string | null }

const FIELDS: { key: Field; label: string }[] = [
  { key: "can_view", label: "View" },
  { key: "can_create", label: "Add" },
  { key: "can_update", label: "Edit" },
  { key: "can_delete", label: "Delete" },
  { key: "can_import", label: "Import" },
  { key: "can_export", label: "Export" },
]
// Only these records have a CSV import or a report download in the system.
const CAN_IMPORT = new Set(["products", "sales_transactions"])
const CAN_EXPORT = new Set(["employees", "financial_entries", "inventory_movements", "sales_transactions", "service_cases"])
const SYSTEM = "system"
const SENS_STYLE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning-soft text-warning",
}

const applies = (resource: string, f: Field) =>
  f === "can_import" ? CAN_IMPORT.has(resource) : f === "can_export" ? CAN_EXPORT.has(resource) : true

function Cell({ row, field, onToggle }: { row: PermRow | undefined; field: Field; onToggle: (r: PermRow, f: Field, v: boolean) => void }) {
  if (!row || !applies(row.resource, field)) return <span className="text-muted-foreground/50">–</span>
  // The Administrator never changes records. Only the download of reports can be switched.
  const locked = row.role === "admin" && field !== "can_export"
  return (
    // mx-auto: the Checkbox is a block-level flex box, which text-center in the
    // cell does not move - auto margins are what actually centers it.
    <Checkbox className="mx-auto" checked={row[field]} disabled={locked} aria-label={`${field} ${row.resource} ${row.role}`}
      onCheckedChange={(c) => onToggle(row, field, c === true)} />
  )
}

export default function PermissionsPage() {
  const [rows, setRows] = useState<PermRow[] | null>(null)
  const [catalog, setCatalog] = useState<Record<string, Catalog>>({})
  const [error, setError] = useState<string | null>(null)
  const [area, setArea] = useState<string>("human_resources")
  const [search, setSearch] = useState("")
  const [confirm, setConfirm] = useState<{ row: PermRow; field: Field } | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from("permissions").select("*"),
      supabase.from("resource_catalog").select("resource, label, sensitivity"),
    ]).then(([p, c]) => {
      if (!active) return
      if (p.error) return setError("Permissions could not be loaded.")
      setRows((p.data ?? []) as PermRow[])
      setCatalog(Object.fromEntries(((c.data ?? []) as (Catalog & { resource: string })[]).map((r) => [r.resource, r])))
    })
    return () => { active = false }
  }, [])

  async function apply(row: PermRow, field: Field, value: boolean) {
    setRows((cur) => cur && cur.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)))
    const { data, error: e } = await supabase
      .from("permissions")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("id")
    if (e || !data || data.length === 0) {
      setRows((cur) => cur && cur.map((r) => (r.id === row.id ? { ...r, [field]: !value } : r)))
      toast.error("The permission could not be changed.")
    } else {
      toast.success("Permission updated.")
    }
  }

  function toggle(row: PermRow, field: Field, value: boolean) {
    if (field === "can_delete" && value) setConfirm({ row, field })
    else apply(row, field, value)
  }

  // One line per record type: Head and Staff side by side
  const lines = useMemo(() => {
    if (!rows) return []
    const wanted = rows.filter((r) => (area === SYSTEM ? r.functional_area === null : r.functional_area === area))
    const by = new Map<string, Line>()
    for (const r of wanted) {
      const l: Line = by.get(r.resource) ?? { resource: r.resource }
      if (r.role === "department_head") l.head = r
      else if (r.role === "staff") l.staff = r
      else l.admin = r
      by.set(r.resource, l)
    }
    const q = search.trim().toLowerCase()
    return [...by.values()]
      .filter((l) => !q || (catalog[l.resource]?.label ?? l.resource).toLowerCase().includes(q))
      .sort((a, b) => (catalog[a.resource]?.label ?? a.resource).localeCompare(catalog[b.resource]?.label ?? b.resource))
  }, [rows, area, search, catalog])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!rows) return <p className="text-sm text-muted-foreground">Loading...</p>

  const areas: { value: string; label: string }[] = [
    ...(Object.keys(AREA_LABEL) as FunctionalArea[]).map((a) => ({ value: a, label: AREA_LABEL[a] })),
    { value: SYSTEM, label: "Administrator" },
  ]
  const groups = area === SYSTEM ? [["admin", "Administrator"]] as const : ([["head", "Department Head"], ["staff", "Staff"]] as const)

  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        Pick a department, then switch what each role can do. Changes apply immediately and are enforced by the database;
        users see them the next time they sign in or refresh. <b>Import</b> and <b>Export</b> are separate from Add and View.
        The Administrator never adds, edits, deletes or imports; only report downloads can be switched for the Administrator.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {areas.map((a) => (
            <button key={a.value} type="button" onClick={() => setArea(a.value)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                area === a.value ? "bg-card text-brand-text shadow-card" : "text-muted-foreground hover:text-foreground")}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records..." className={cn(inputClass, "pl-9")} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-xs font-semibold text-muted-foreground">
              <th rowSpan={2} className="px-4 py-2 text-left align-bottom">Record</th>
              {groups.map(([k, label]) => (
                <th key={k} colSpan={FIELDS.length} className="border-l px-2 py-2 text-center">{label}</th>
              ))}
            </tr>
            <tr className="bg-muted text-[11px] font-medium text-muted-foreground">
              {groups.map(([k]) => FIELDS.map((f) => (
                <th key={`${k}-${f.key}`} className={cn("px-2 py-1.5 text-center", f.key === "can_view" && "border-l")}>{f.label}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const sens = catalog[l.resource]?.sensitivity
              return (
                <tr key={l.resource} className="border-t">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{catalog[l.resource]?.label ?? l.resource}</div>
                    {sens && SENS_STYLE[sens] && (
                      <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", SENS_STYLE[sens])}>
                        {sens === "high" ? "Sensitive" : "Restricted"}
                      </span>
                    )}
                  </td>
                  {groups.map(([k]) => {
                    const row = k === "head" ? l.head : k === "staff" ? l.staff : l.admin
                    return FIELDS.map((f) => (
                      <td key={`${k}-${f.key}`} className={cn("px-2 py-2.5 text-center", f.key === "can_view" && "border-l")}>
                        <Cell row={row} field={f.key} onToggle={toggle} />
                      </td>
                    ))
                  })}
                </tr>
              )
            })}
            {lines.length === 0 && (
              <tr><td colSpan={1 + groups.length * FIELDS.length} className="px-4 py-8 text-center text-muted-foreground">No records match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title="Allow deleting?"
        message={confirm ? `${confirm.row.role === "department_head" ? "Department Heads" : "Staff"} will be able to delete "${catalog[confirm.row.resource]?.label ?? confirm.row.resource}" records. Deleted records are hidden from lists and reports.` : ""}
        confirmLabel="Allow delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) apply(confirm.row, confirm.field, true)
          setConfirm(null)
        }}
      />
    </>
  )
}
