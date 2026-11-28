import { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, FileUp, ShieldCheck, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { FormDialog } from "@/components/shared/FormDialog"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { StatusPill } from "@/components/shared/StatusPill"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { formatDate } from "@/lib/format"
import { daysUntil, useDocTypes } from "@/lib/people"
import { supabase } from "@/lib/supabase"

interface Doc {
  id: string; doc_type: string; file_path: string | null; file_name: string | null; issue_date: string | null
  expiry_date: string | null; status: "on_file" | "verified" | "rejected"; note: string | null; uploaded_at: string
}

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"]

export default function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { can } = useAuth()
  const types = useDocTypes()
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [dialog, setDialog] = useState(false)
  const [v, setV] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canAdd = can("employee_documents", "create")
  const canChange = can("employee_documents", "update")

  const load = useCallback(async () => {
    const { data } = await supabase.from("employee_documents")
      .select("id, doc_type, file_path, file_name, issue_date, expiry_date, status, note, uploaded_at")
      .eq("employee_id", employeeId).order("uploaded_at", { ascending: false })
    setDocs((data ?? []) as Doc[])
  }, [employeeId])
  useEffect(() => { load() }, [load])

  const label = (code: string) => types.find((t) => t.code === code)?.label ?? code
  const expired = (d: Doc) => !!d.expiry_date && daysUntil(d.expiry_date) < 0
  const soon = (d: Doc) => !!d.expiry_date && daysUntil(d.expiry_date) >= 0 && daysUntil(d.expiry_date) <= 30
  const valid = (d: Doc) => d.status !== "rejected" && !expired(d)

  const missing = useMemo(
    () => types.filter((t) => t.required && !(docs ?? []).some((d) => d.doc_type === t.code && valid(d))),
    [types, docs], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const requiredCount = types.filter((t) => t.required).length

  function openAdd(code = "") {
    setV({ doc_type: code, issue_date: "", expiry_date: "", note: "" })
    setFile(null); setError(null); setDialog(true)
  }

  async function save() {
    if (!v.doc_type) { setError("Choose the document type."); return }
    const type = types.find((t) => t.code === v.doc_type)
    if (type?.has_expiry && !v.expiry_date) { setError("Enter the expiry date of this document."); return }
    if (file && !ALLOWED.includes(file.type)) { setError("Only PDF, JPG or PNG files can be uploaded."); return }
    if (file && file.size > MAX_BYTES) { setError("The file is larger than 5 MB."); return }
    setSaving(true); setError(null)

    let path: string | null = null
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf"
      path = `${employeeId}/${v.doc_type}-${Date.now()}.${ext}`
      const up = await supabase.storage.from("employee-documents").upload(path, file, { contentType: file.type })
      if (up.error) { setSaving(false); setError("The file could not be uploaded. Please try again."); return }
    }
    const { error: err } = await supabase.from("employee_documents").insert({
      employee_id: employeeId, doc_type: v.doc_type, file_path: path, file_name: file?.name ?? null, file_size: file?.size ?? null,
      mime: file?.type ?? null, issue_date: v.issue_date || null, expiry_date: v.expiry_date || null, note: v.note?.trim() || null,
    })
    setSaving(false)
    if (err) {
      if (path) await supabase.storage.from("employee-documents").remove([path])
      setError("The document could not be saved.")
      return
    }
    toast.success(file ? "Document uploaded." : "Document recorded as a paper copy.")
    setDialog(false); load()
  }

  async function setStatus(d: Doc, status: Doc["status"]) {
    const { error: err } = await supabase.from("employee_documents").update({ status }).eq("id", d.id)
    if (err) toast.error("The change could not be saved.")
    else { toast.success(status === "verified" ? "Marked as verified." : "Marked as rejected."); load() }
  }
  async function remove(d: Doc) {
    if (!window.confirm(`Remove this ${label(d.doc_type)} record?`)) return
    const { error: err } = await supabase.from("employee_documents").update({ deleted_at: new Date().toISOString() }).eq("id", d.id)
    if (err) toast.error("The record could not be removed.")
    else { toast.success("Record removed."); load() }
  }
  async function open(d: Doc) {
    if (!d.file_path) return
    const { data, error: err } = await supabase.storage.from("employee-documents").createSignedUrl(d.file_path, 60)
    if (err || !data) toast.error("The file could not be opened.")
    else window.open(data.signedUrl, "_blank", "noopener")
  }

  if (!docs) return <p className="text-sm text-muted-foreground">Loading...</p>

  const type = types.find((t) => t.code === v.doc_type)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-3xl bg-card p-5 shadow-card">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{requiredCount - missing.length} of {requiredCount} required documents on file</p>
          {missing.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Still needed:</span> {missing.map((m) => m.label).join(", ")}</p>
          ) : <p className="mt-1 text-xs text-success">All required documents are on file.</p>}
        </div>
        {canAdd && <Button onClick={() => openAdd(missing[0]?.code)} className="bg-brand text-white hover:bg-brand-hover"><FileUp className="mr-1 h-4 w-4" /> Add document</Button>}
      </div>

      <div className="rounded-3xl bg-card p-3 shadow-card sm:p-5">
        {docs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No documents recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{label(d.doc_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.file_name ?? "Paper copy"}{d.issue_date ? ` · issued ${formatDate(d.issue_date)}` : ""}{d.note ? ` · ${d.note}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {d.expiry_date && (
                    <span className={expired(d) ? "text-xs font-medium text-destructive" : soon(d) ? "text-xs font-medium text-warning" : "text-xs text-muted-foreground"}>
                      {expired(d) ? "Expired " : "Expires "}{formatDate(d.expiry_date)}
                    </span>
                  )}
                  <StatusPill label={d.status === "on_file" ? "on file" : d.status} tone={d.status === "verified" ? "green" : d.status === "rejected" ? "red" : "blue"} />
                </div>
                <div className="flex items-center gap-1">
                  {d.file_path && <button title="Open file" aria-label="Open file" onClick={() => open(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-brand-text"><ExternalLink className="h-4 w-4" /></button>}
                  {canChange && d.status !== "verified" && <button title="Mark verified" aria-label="Mark verified" onClick={() => setStatus(d, "verified")} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-success"><ShieldCheck className="h-4 w-4" /></button>}
                  {canChange && d.status !== "rejected" && <button title="Reject" aria-label="Reject" onClick={() => setStatus(d, "rejected")} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><XCircle className="h-4 w-4" /></button>}
                  {canChange && <button title="Remove record" aria-label="Remove record" onClick={() => remove(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FormDialog open={dialog} title="Add document" onClose={() => setDialog(false)} onSubmit={save} submitting={saving} error={error}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Document type" required className="sm:col-span-2">
            <select value={v.doc_type ?? ""} onChange={(e) => setV((c) => ({ ...c, doc_type: e.target.value }))} className={inputClass}>
              <option value="">Select...</option>
              {types.map((t) => <option key={t.code} value={t.code}>{t.label}{t.required ? " (required)" : ""}</option>)}
            </select>
          </FormField>
          <FormField label="Issue date"><input type="date" value={v.issue_date ?? ""} onChange={(e) => setV((c) => ({ ...c, issue_date: e.target.value }))} className={inputClass} /></FormField>
          {type?.has_expiry && (
            <FormField label="Expiry date" required><input type="date" value={v.expiry_date ?? ""} onChange={(e) => setV((c) => ({ ...c, expiry_date: e.target.value }))} className={inputClass} /></FormField>
          )}
          <FormField label="File (PDF, JPG or PNG, up to 5 MB)" className="sm:col-span-2">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-text" />
          </FormField>
          <p className="text-xs text-muted-foreground sm:col-span-2">No scan yet? Leave the file empty to record that HR received a paper copy.</p>
          <FormField label="Note" className="sm:col-span-2"><input value={v.note ?? ""} onChange={(e) => setV((c) => ({ ...c, note: e.target.value }))} className={inputClass} /></FormField>
        </div>
      </FormDialog>
    </>
  )
}
