import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Eye, EyeOff, Pencil } from "lucide-react"
import { FormDialog } from "@/components/shared/FormDialog"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { formatDate } from "@/lib/format"
import { CIVIL_STATUSES, EMPLOYMENT_TYPES, maskNo, tenure } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"

interface Emp {
  employee_no: string; position: string; functional_area: keyof typeof AREA_LABEL; employment_status: string
  employment_type: string; hire_date: string; probation_end: string | null; separation_date: string | null
  email: string | null; phone: string | null; address: string | null
}
interface Personal {
  birth_date: string | null; civil_status: string | null; emergency_name: string | null; emergency_relation: string | null
  emergency_phone: string | null; sss_no: string | null; philhealth_no: string | null; pagibig_no: string | null; tin_no: string | null
}
type V = Record<string, string>

const PERSONAL_KEYS = ["birth_date", "civil_status", "emergency_name", "emergency_relation", "emergency_phone", "sss_no", "philhealth_no", "pagibig_no", "tin_no"] as const
const CONTACT_KEYS = ["email", "phone", "address"] as const

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">{title}</h2>{action}</div>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  )
}
const Line = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
    <dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v || "—"}</dd>
  </div>
)

export default function DetailsTab({ employeeId }: { employeeId: string }) {
  const { can } = useAuth()
  const [emp, setEmp] = useState<Emp | null>(null)
  const [personal, setPersonal] = useState<Personal | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState<V>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canPersonal = can("employee_personal", "update") && (!!personal || can("employee_personal", "create"))
  const canContact = can("employees", "update")
  const canEdit = canPersonal || canContact

  const load = useCallback(async () => {
    const [e, p] = await Promise.all([
      supabase.from("employees").select("employee_no, position, functional_area, employment_status, employment_type, hire_date, probation_end, separation_date, email, phone, address").eq("id", employeeId).maybeSingle(),
      supabase.from("employee_personal").select("birth_date, civil_status, emergency_name, emergency_relation, emergency_phone, sss_no, philhealth_no, pagibig_no, tin_no").eq("employee_id", employeeId).maybeSingle(),
    ])
    setEmp((e.data ?? null) as Emp | null)
    setPersonal((p.data ?? null) as Personal | null)
    setLoaded(true)
  }, [employeeId])
  useEffect(() => { load() }, [load])

  function openEdit() {
    const init: V = {}
    for (const k of PERSONAL_KEYS) init[k] = (personal?.[k] as string | null) ?? ""
    for (const k of CONTACT_KEYS) init[k] = (emp?.[k] as string | null) ?? ""
    setV(init); setError(null); setEditing(true)
  }

  async function save() {
    setSaving(true); setError(null)
    const nullable = (k: string) => (v[k] ?? "").trim() || null
    if (canPersonal) {
      const row: Record<string, unknown> = {}
      for (const k of PERSONAL_KEYS) row[k] = nullable(k)
      const res = personal
        ? await supabase.from("employee_personal").update(row).eq("employee_id", employeeId)
        : await supabase.from("employee_personal").insert({ ...row, employee_id: employeeId })
      if (res.error) { setSaving(false); setError("The personal details could not be saved."); return }
    }
    if (canContact) {
      const res = await supabase.from("employees").update({ email: nullable("email"), phone: nullable("phone"), address: nullable("address") }).eq("id", employeeId)
      if (res.error) { setSaving(false); setError("The contact details could not be saved."); return }
    }
    setSaving(false); setEditing(false); load()
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading...</p>
  if (!emp) return <p className="text-sm text-muted-foreground">Details are not available.</p>

  const age = personal?.birth_date ? Math.floor((Date.now() - Date.parse(personal.birth_date)) / 31557600000) : null
  const months = Math.max(0, Math.floor((Date.now() - Date.parse(emp.hire_date)) / 2629800000))
  const reveal = (n: string | null) => (show ? n || "—" : maskNo(n))
  const input = (k: string, type = "text") => (
    <input type={type} value={v[k] ?? ""} onChange={(e) => setV((c) => ({ ...c, [k]: e.target.value }))} className={inputClass} />
  )

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canEdit && <Button variant="outline" onClick={openEdit}><Pencil className="mr-1 h-4 w-4" /> Edit details</Button>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Employment">
          <Line k="Employee ID" v={emp.employee_no} />
          <Line k="Position" v={emp.position} />
          <Line k="Department" v={AREA_LABEL[emp.functional_area]} />
          <Line k="Employment type" v={EMPLOYMENT_TYPES.find((t) => t.value === emp.employment_type)?.label} />
          <Line k="Hire date" v={`${formatDate(emp.hire_date)} (${tenure(months)})`} />
          {emp.probation_end && <Line k="Probation ends" v={formatDate(emp.probation_end)} />}
          {emp.separation_date && <Line k="Separated on" v={formatDate(emp.separation_date)} />}
        </Card>
        <Card title="Contact">
          <Line k="Email" v={emp.email} />
          <Line k="Phone" v={emp.phone} />
          <Line k="Address" v={emp.address} />
        </Card>
        <Card title="Personal">
          {personal ? (
            <>
              <Line k="Birth date" v={personal.birth_date ? `${formatDate(personal.birth_date)}${age !== null ? ` (${age} yrs)` : ""}` : ""} />
              <Line k="Civil status" v={CIVIL_STATUSES.find((c) => c.value === personal.civil_status)?.label} />
              <Line k="Emergency contact" v={[personal.emergency_name, personal.emergency_relation].filter(Boolean).join(" · ")} />
              <Line k="Emergency phone" v={personal.emergency_phone} />
            </>
          ) : <p className="text-muted-foreground">No personal details on file yet.</p>}
        </Card>
        <Card title="Government numbers"
          action={personal && (
            <button onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1 text-xs text-brand-text hover:underline">
              {show ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Show</>}
            </button>
          )}>
          {personal ? (
            <>
              <Line k="SSS" v={reveal(personal.sss_no)} />
              <Line k="PhilHealth" v={reveal(personal.philhealth_no)} />
              <Line k="Pag-IBIG" v={reveal(personal.pagibig_no)} />
              <Line k="TIN" v={reveal(personal.tin_no)} />
            </>
          ) : <p className="text-muted-foreground">None on file.</p>}
        </Card>
      </div>

      <FormDialog open={editing} title="Edit details" onClose={() => setEditing(false)} onSubmit={save} submitting={saving} error={error}>
        <div className="grid gap-4 sm:grid-cols-2">
          {canContact && (
            <>
              <FormField label="Email">{input("email", "email")}</FormField>
              <FormField label="Phone">{input("phone")}</FormField>
              <FormField label="Address" className="sm:col-span-2">{input("address")}</FormField>
            </>
          )}
          {canPersonal && (
            <>
              <FormField label="Birth date">{input("birth_date", "date")}</FormField>
              <FormField label="Civil status">
                <select value={v.civil_status ?? ""} onChange={(e) => setV((c) => ({ ...c, civil_status: e.target.value }))} className={inputClass}>
                  <option value="">Select...</option>
                  {CIVIL_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FormField>
              <FormField label="Emergency contact">{input("emergency_name")}</FormField>
              <FormField label="Relationship">{input("emergency_relation")}</FormField>
              <FormField label="Emergency phone">{input("emergency_phone")}</FormField>
              <div className="hidden sm:block" />
              <FormField label="SSS number">{input("sss_no")}</FormField>
              <FormField label="PhilHealth number">{input("philhealth_no")}</FormField>
              <FormField label="Pag-IBIG number">{input("pagibig_no")}</FormField>
              <FormField label="TIN">{input("tin_no")}</FormField>
            </>
          )}
        </div>
      </FormDialog>
    </>
  )
}
