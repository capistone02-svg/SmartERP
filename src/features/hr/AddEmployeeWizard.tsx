import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check } from "lucide-react"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { todayStr } from "@/lib/format"
import { AREA_OPTIONS, CIVIL_STATUSES, EMPLOYMENT_TYPES, POSITIONS } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type V = Record<string, string>
const STEPS = ["Personal", "Job", "Emergency and IDs", "Review"]

const REQUIRED: Record<number, [string, string][]> = {
  0: [["first_name", "First name"], ["last_name", "Last name"], ["birth_date", "Birth date"]],
  1: [["employee_no", "Employee ID"], ["position", "Position"], ["functional_area", "Department"], ["hire_date", "Hire date"], ["employment_type", "Employment type"]],
  2: [["emergency_name", "Emergency contact name"], ["emergency_phone", "Emergency contact phone"]],
}

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">{placeholder ?? "Select..."}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// Adding an employee the way HR really does it: personal details, job, emergency contact
// and government numbers, then a review. Documents are collected right after.
export default function AddEmployeeWizard({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const navigate = useNavigate()
  const empty: V = { hire_date: todayStr(), employment_type: "regular", position: "Staff" }
  const [step, setStep] = useState(0)
  const [v, setV] = useState<V>(empty)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null)

  const set = (k: string) => (val: string) => setV((cur) => ({ ...cur, [k]: val }))
  const text = (k: string, props: { type?: string; placeholder?: string } = {}) => (
    <input value={v[k] ?? ""} type={props.type ?? "text"} placeholder={props.placeholder} onChange={(e) => set(k)(e.target.value)} className={inputClass} />
  )

  function reset() {
    setStep(0); setV({ hire_date: todayStr(), employment_type: "regular", position: "Staff" }); setError(null); setCreated(null)
  }
  function close() {
    if (created) onAdded()
    reset()
    onClose()
  }

  function next() {
    const missing = (REQUIRED[step] ?? []).find(([k]) => !(v[k] ?? "").trim())
    if (missing) { setError(`${missing[1]} is required.`); return }
    if (step === 0 && v.birth_date && v.birth_date > todayStr()) { setError("Birth date cannot be in the future."); return }
    if (step === 1 && !/^[A-Za-z0-9-]{3,20}$/.test(v.employee_no.trim())) { setError("Employee ID should be letters, numbers or dashes, e.g. 26-12345."); return }
    setError(null)
    setStep((s) => s + 1)
  }

  async function save() {
    setSaving(true)
    setError(null)
    const { data, error: err } = await supabase.rpc("hr_add_employee", { p: v })
    setSaving(false)
    if (err) { setError(err.message); return }
    setCreated({ id: data as string, name: `${v.first_name} ${v.last_name}` })
  }

  const label = (value: string, list: { value: string; label: string }[]) => list.find((o) => o.value === value)?.label ?? value
  const row = (k: string, val: string | undefined) => (
    <div key={k} className="flex justify-between gap-4 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span><span className="text-right">{val || "—"}</span>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-medium tracking-tight">{created ? "Employee added" : "Add employee"}</DialogTitle>
          <DialogDescription className="sr-only">Add a new employee in four steps</DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-success-soft p-4 text-success">
              <Check className="h-5 w-5" /> <p className="text-sm font-medium">{created.name} is now on file.</p>
            </div>
            <p className="text-sm text-muted-foreground">Next steps: collect the required documents, and create a sign-in account if this person will use the system.</p>
            <div className="flex flex-wrap gap-2">
              <Button className="bg-brand text-white hover:bg-brand-hover" onClick={() => { const id = created.id; reset(); onAdded(); onClose(); navigate(`/people/${id}?tab=documents`) }}>Upload documents</Button>
              <Button variant="outline" onClick={() => { reset(); onAdded(); onClose(); navigate("/hr/accounts") }}>Create account</Button>
              <Button variant="outline" onClick={() => { onAdded(); reset() }}>Add another</Button>
              <Button variant="ghost" onClick={close}>Close</Button>
            </div>
          </div>
        ) : (
          <>
            <ol className="flex items-center gap-2 text-xs">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
                    i < step ? "bg-success text-white" : i === step ? "bg-brand text-white" : "bg-muted text-muted-foreground")}>
                    {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={i === step ? "font-medium" : "text-muted-foreground"}>{s}</span>
                  {i < STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
                </li>
              ))}
            </ol>

            <div className="space-y-4">
              {step === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="First name" required>{text("first_name")}</FormField>
                  <FormField label="Last name" required>{text("last_name")}</FormField>
                  <FormField label="Birth date" required>{text("birth_date", { type: "date" })}</FormField>
                  <FormField label="Civil status"><Select value={v.civil_status ?? ""} onChange={set("civil_status")} options={CIVIL_STATUSES} /></FormField>
                  <FormField label="Email">{text("email", { type: "email" })}</FormField>
                  <FormField label="Phone">{text("phone")}</FormField>
                  <FormField label="Address" className="sm:col-span-2">{text("address")}</FormField>
                </div>
              )}
              {step === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Employee ID" required>{text("employee_no", { placeholder: "e.g. 26-12345" })}</FormField>
                  <FormField label="Position" required>
                    <Select value={v.position ?? ""} onChange={set("position")} options={POSITIONS} placeholder="Select position" />
                  </FormField>
                  <FormField label="Department" required><Select value={v.functional_area ?? ""} onChange={set("functional_area")} options={AREA_OPTIONS} /></FormField>
                  <FormField label="Employment type" required><Select value={v.employment_type ?? ""} onChange={set("employment_type")} options={EMPLOYMENT_TYPES} /></FormField>
                  <FormField label="Hire date" required>{text("hire_date", { type: "date" })}</FormField>
                  {v.employment_type === "probationary" && (
                    <FormField label="Probation ends (default: 6 months)">{text("probation_end", { type: "date" })}</FormField>
                  )}
                </div>
              )}
              {step === 2 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Emergency contact name" required>{text("emergency_name")}</FormField>
                  <FormField label="Relationship">{text("emergency_relation", { placeholder: "e.g. Spouse, Parent" })}</FormField>
                  <FormField label="Emergency contact phone" required>{text("emergency_phone")}</FormField>
                  <div className="hidden sm:block" />
                  <FormField label="SSS number">{text("sss_no")}</FormField>
                  <FormField label="PhilHealth number">{text("philhealth_no")}</FormField>
                  <FormField label="Pag-IBIG number">{text("pagibig_no")}</FormField>
                  <FormField label="TIN">{text("tin_no")}</FormField>
                  <p className="text-xs text-muted-foreground sm:col-span-2">Government numbers can be added later if the employee does not have them yet.</p>
                </div>
              )}
              {step === 3 && (
                <div className="rounded-2xl bg-muted p-4">
                  {row("Name", `${v.first_name} ${v.last_name}`)}
                  {row("Birth date", v.birth_date)}
                  {row("Employee ID", v.employee_no)}
                  {row("Position", v.position)}
                  {row("Department", label(v.functional_area ?? "", AREA_OPTIONS))}
                  {row("Employment type", label(v.employment_type ?? "", EMPLOYMENT_TYPES))}
                  {row("Hire date", v.hire_date)}
                  {row("Emergency contact", [v.emergency_name, v.emergency_relation, v.emergency_phone].filter(Boolean).join(", "))}
                  {row("Government numbers", [v.sss_no && "SSS", v.philhealth_no && "PhilHealth", v.pagibig_no && "Pag-IBIG", v.tin_no && "TIN"].filter(Boolean).join(", "))}
                </div>
              )}

              {error && <p className="rounded-2xl bg-destructive/10 px-4 py-2.5 text-xs text-destructive">{error}</p>}
              <div className="flex justify-between gap-2 pt-1">
                <Button type="button" variant="outline" onClick={step === 0 ? close : () => { setError(null); setStep(step - 1) }} className="h-11 px-5">
                  {step === 0 ? "Cancel" : "Back"}
                </Button>
                {step < 3 ? (
                  <Button type="button" onClick={next} className="h-11 bg-brand px-5 text-white hover:bg-brand-hover">Next</Button>
                ) : (
                  <Button type="button" disabled={saving} onClick={save} className="h-11 bg-brand px-5 text-white hover:bg-brand-hover">
                    {saving ? "Saving..." : "Add employee"}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
