import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { DataTable, type Column } from "@/components/shared/DataTable"
import { FormDialog } from "@/components/shared/FormDialog"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { SearchSelect, type Lookup, type Option } from "@/components/shared/SearchSelect"
import { Button } from "@/components/ui/button"
import { APPROVALS_CHANGED } from "@/features/approvals/usePendingCount"
import { useAuth } from "@/features/auth/AuthContext"
import { useDebounced } from "@/hooks/useDebounced"
import { usePagedQuery } from "@/hooks/usePagedQuery"
import { deleteRecord, saveRecord } from "@/lib/records"
import { rowsPerPage } from "@/lib/prefs"
import { cn } from "@/lib/utils"

export type { Option, Lookup }
export type FieldType = "text" | "email" | "textarea" | "number" | "integer" | "date" | "select" | "search"
export interface FieldDef {
  name: string
  label: string
  type: FieldType
  required?: boolean
  options?: Option[]
  lookup?: Lookup // for type "search": a long list searched in the database
  min?: number
  step?: string
  placeholder?: string
  defaultValue?: string
  hideOnEdit?: boolean
  readOnlyOnEdit?: boolean
  fullWidth?: boolean
  visibleWhen?: (values: Record<string, string>) => boolean
  action?: { label: string; onClick: () => void } // small link under the input (e.g. "+ New customer")
}
export interface FilterDef {
  name: string
  label: string
  options: Option[]
}

export interface ResourcePageProps<T> {
  resource: string // permission resource name (e.g. "products")
  table: string // table or view to read from
  select: string
  singular: string // e.g. "Product"
  searchColumns: string[]
  searchPlaceholder?: string
  orderBy: string
  ascending?: boolean
  columns: Column<T>[]
  rowKey: (row: T) => string
  fields?: FieldDef[]
  filters?: FilterDef[]
  readOnly?: boolean
  allowEdit?: boolean
  toForm?: (row: T) => Record<string, string>
  approval?: boolean // records need a Department Head's approval (Staff submissions)
  canEditRow?: (row: T, profileId: string, role: string) => boolean
    emptyText?: string
  toolbarExtra?: (refresh: () => void) => ReactNode
  fixedEq?: Record<string, string> // always filter the list by these values (keep it a constant or useMemo)
  fixedValues?: Record<string, unknown> // always saved with new records (e.g. the case type)
  refreshSignal?: number // change this number to reload the list from outside
  // Fill one field from another once its source is chosen (e.g. the customer of the sale being refunded).
  autoFill?: Array<{ target: string; when: string; resolve: (value: string) => Promise<string | null> }>
  // Called while the form dialog is open with a setField function, and with
  // null when it closes - lets the caller fill a field (e.g. after a quick-create).
  onFormReady?: (api: ResourceFormApi | null) => void
}

export interface ResourceFormApi {
  setField: (name: string, value: string) => void
}

function validate(fields: FieldDef[], values: Record<string, string>, editing: boolean): string | null {
  for (const f of fields) {
    if (editing && f.hideOnEdit) continue
    if (f.visibleWhen && !f.visibleWhen(values)) continue
    const raw = (values[f.name] ?? "").trim()
    if (f.required && raw === "") return `${f.label} is required.`
    if (raw !== "" && (f.type === "number" || f.type === "integer")) {
      const n = Number(raw)
      if (!Number.isFinite(n)) return `${f.label} must be a number.`
      if (f.type === "integer" && !Number.isInteger(n)) return `${f.label} must be a whole number.`
      if (f.min !== undefined && n < f.min) return `${f.label} must be at least ${f.min}.`
    }
  }
  return null
}

function buildPayload(fields: FieldDef[], values: Record<string, string>, editing: boolean) {
  const payload: Record<string, unknown> = {}
  for (const f of fields) {
    if (editing && (f.hideOnEdit || f.readOnlyOnEdit)) continue
    if (f.visibleWhen && !f.visibleWhen(values)) {
      if (editing) payload[f.name] = null
      continue
    }
    const raw = (values[f.name] ?? "").trim()
    if (raw === "") payload[f.name] = null
    else if (f.type === "number") payload[f.name] = Number(raw)
    else if (f.type === "integer") payload[f.name] = parseInt(raw, 10)
    else payload[f.name] = raw
  }
  return payload
}

function FieldInput({
  f, value, onChange, disabled,
}: {
  f: FieldDef
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  if (f.type === "textarea") {
    return (
      <textarea rows={3} value={value} disabled={disabled} placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "h-auto py-2")} />
    )
  }
  if (f.type === "search") {
    return (
      <SearchSelect value={value} onChange={onChange} lookup={f.lookup} placeholder={f.placeholder} disabled={disabled}
        clearable={!f.required} />
    )
  }
  // Long pick lists become searchable automatically
  if (f.type === "select" && (f.options?.length ?? 0) > 8) {
    return (
      <SearchSelect value={value} onChange={onChange} options={f.options} placeholder={f.placeholder}
        disabled={disabled} clearable={!f.required} />
    )
  }
  if (f.type === "select") {
    return (
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">{f.placeholder ?? "Select..."}</option>
        {(f.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }
  const isNum = f.type === "number" || f.type === "integer"
  return (
    <input
      type={isNum ? "number" : f.type}
      step={f.type === "number" ? (f.step ?? "0.01") : f.type === "integer" ? "1" : undefined}
      min={f.min}
      value={value}
      disabled={disabled}
      placeholder={f.placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  )
}

export function ResourcePage<T>(p: ResourcePageProps<T>) {
  const { profile, can } = useAuth()
  const [searchInput, setSearchInput] = useState("")
  const search = useDebounced(searchInput, 300)
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; row: T } | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<T | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pageSize = rowsPerPage()
  const fields = p.fields ?? []

  // Fill a field from another one (e.g. customer from the sale being refunded)
  const autoFill = p.autoFill
  useEffect(() => {
    if (!dialog || !autoFill || autoFill.length === 0) return
    let stopped = false
    void (async () => {
      for (const rule of autoFill) {
        const source = (values[rule.when] ?? "").trim()
        if (!source || (values[rule.target] ?? "").trim()) continue
        let filled: string | null = null
        try {
          filled = await rule.resolve(source)
        } catch {
          filled = null
        }
        if (stopped || !filled) continue
        setValues((current) =>
          (current[rule.target] ?? "").trim() ? current : { ...current, [rule.target]: filled as string },
        )
      }
    })()
    return () => {
      stopped = true
    }
  }, [values, dialog, autoFill])

  // Expose setField to the caller while the dialog is open (e.g. quick-create customer)
  const onFormReady = p.onFormReady
  useEffect(() => {
    if (!onFormReady) return
    if (!dialog) {
      onFormReady(null)
      return
    }
    onFormReady({ setField: (name, value) => setValues((current) => ({ ...current, [name]: value })) })
    return () => {
      onFormReady(null)
    }
  }, [dialog, onFormReady])

  const eq = useMemo(() => ({ ...filterValues, ...(p.fixedEq ?? {}) }), [filterValues, p.fixedEq])
  const { rows, total, loading, error } = usePagedQuery<T>({
    table: p.table, select: p.select, searchColumns: p.searchColumns, search,
    eq, orderBy: p.orderBy, ascending: p.ascending, page, pageSize, refreshKey: refreshKey + (p.refreshSignal ?? 0),
  })

  if (!profile) return null
  const canCreate = !p.readOnly && fields.length > 0 && can(p.resource, "create")
  const canUpdate = !p.readOnly && p.allowEdit !== false && fields.length > 0 && can(p.resource, "update")
  const canDelete = !p.readOnly && can(p.resource, "delete")
  const ownerOf = (row: T) => (row as { created_by?: string | null }).created_by
  const editable = (row: T) => {
    if (!canUpdate) return false
    if (p.canEditRow) return p.canEditRow(row, profile.id, profile.role)
    return profile.role !== "staff" || ownerOf(row) === profile.id
  }
  const deletable = (row: T) => canDelete && (profile.role !== "staff" || ownerOf(row) === profile.id)

  function openCreate() {
    const init: Record<string, string> = {}
    fields.forEach((f) => (init[f.name] = f.defaultValue ?? ""))
    setValues(init)
    setFormError(null)
    setDialog({ mode: "create" })
  }
  function openEdit(row: T) {
    const init: Record<string, string> = {}
    if (p.toForm) Object.assign(init, p.toForm(row))
    else fields.forEach((f) => (init[f.name] = String((row as Record<string, unknown>)[f.name] ?? "")))
    setValues(init)
    setFormError(null)
    setDialog({ mode: "edit", row })
  }

  async function submit() {
    if (!dialog) return
    const editing = dialog.mode === "edit"
    const problem = validate(fields, values, editing)
    if (problem) {
      setFormError(problem)
      return
    }
    setSaving(true)
    const id = dialog.mode === "edit" ? p.rowKey(dialog.row) : undefined
    const payload = { ...buildPayload(fields, values, editing), ...(editing ? {} : (p.fixedValues ?? {})) }
    const err = await saveRecord(p.table, payload, id)
    setSaving(false)
    if (err) {
      setFormError(err)
      return
    }
    const wasRejected =
      dialog.mode === "edit" && (dialog.row as { approval_status?: string }).approval_status === "rejected"
    if (p.approval && profile?.role === "staff") {
      toast.success(wasRejected ? `${p.singular} resubmitted for approval.` : editing ? `${p.singular} updated.` : `${p.singular} submitted for approval.`)
      window.dispatchEvent(new Event(APPROVALS_CHANGED))
    } else {
      toast.success(editing ? `${p.singular} updated.` : `${p.singular} added.`)
    }
    setDialog(null)
    setRefreshKey((k) => k + 1)
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    const err = await deleteRecord(p.table, p.rowKey(toDelete))
    setDeleting(false)
    if (err) {
      toast.error(err)
    } else {
      toast.success(`${p.singular} deleted.`)
      setRefreshKey((k) => k + 1)
    }
    setToDelete(null)
  }

  const columns: Column<T>[] = [...p.columns]
  if (canUpdate || canDelete) {
    columns.push({
      header: "",
      className: "w-24 text-right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {editable(row) && (
            <button aria-label="Edit" title="Edit" onClick={() => openEdit(row)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-brand-text">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {deletable(row) && (
            <button aria-label="Delete" title="Delete" onClick={() => setToDelete(row)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    })
  }

  const editing = dialog?.mode === "edit"
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
            placeholder={p.searchPlaceholder ?? "Search..."}
            className={cn(inputClass, "pl-9")}
          />
        </div>
        {(p.filters ?? []).map((f) => (
          <select
            key={f.name}
            aria-label={f.label}
            value={filterValues[f.name] ?? ""}
            onChange={(e) => { setFilterValues((v) => ({ ...v, [f.name]: e.target.value })); setPage(1) }}
            className={cn(inputClass, "w-auto")}
          >
            <option value="">{f.label}: All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
         <div className="ml-auto flex items-center gap-2">
          {p.toolbarExtra?.(() => setRefreshKey((k) => k + 1))}
          {canCreate && (
            <Button onClick={openCreate} className="bg-brand text-white hover:bg-brand-hover">
              <Plus className="mr-1 h-4 w-4" /> Add {p.singular}
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={p.rowKey} loading={loading} error={error}
        emptyText={p.emptyText} page={page} pageSize={pageSize} total={total} onPageChange={setPage}
      />

      <FormDialog
        open={dialog !== null}
        title={`${editing ? "Edit" : "Add"} ${p.singular}`}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitting={saving}
        error={formError}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {fields
            .filter((f) => !(editing && f.hideOnEdit))
            .filter((f) => !f.visibleWhen || f.visibleWhen(values))
            .map((f) => (
              <FormField key={f.name} label={f.label} required={f.required}
                className={f.fullWidth || f.type === "textarea" ? "sm:col-span-2" : undefined}>
                <FieldInput
                  f={f}
                  value={values[f.name] ?? ""}
                  disabled={editing && !!f.readOnlyOnEdit}
                  onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
                />
                {f.action && (
                  <button
                    type="button"
                    onClick={f.action.onClick}
                    className="mt-1 text-xs font-medium text-brand-text hover:underline"
                  >
                    + {f.action.label}
                  </button>
                )}
              </FormField>
            ))}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete ${p.singular.toLowerCase()}?`}
        message="This removes the record from lists and reports."
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  )
}