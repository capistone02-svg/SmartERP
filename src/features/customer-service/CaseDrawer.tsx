import { useCallback, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { StatusPill } from "@/components/shared/StatusPill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/features/auth/AuthContext"
import { inputClass } from "@/components/shared/FormParts"
import { cardLabel, hasCard } from "@/lib/cards"
import { formatDate, num, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  CATEGORY_LABEL, CASE_SELECT, SEVERITY_TONE, STATUS_TONE, TYPE_LABEL, TYPE_TONE, stars, statusLabel, type CaseRow,
} from "./caseConfig"

interface EventRow { id: string; kind: string; body: string; actor_name: string | null; created_at: string }
interface CustomerSnap {
  name: string; customer_no: string; phone: string | null; email: string | null
  purchases: number; spent: number; cases: number
  recent_purchases: { transaction_no: string; transaction_date: string; product: string; amount: number }[]
  recent_cases: { case_no: string; case_type: string; subject: string; status: string; date_submitted: string }[]
}
interface ProductSnap {
  name: string; sku: string; category: string; stock: number; low_threshold: number
  complaints_12m: number; open_cases: number
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children || "—"}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

export default function CaseDrawer({ caseId, onClose, onChanged }: { caseId: string; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth()
  const [row, setRow] = useState<CaseRow | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [customer, setCustomer] = useState<CustomerSnap | null>(null)
  const [card, setCard] = useState<{ card_type: string; card_no: string | null } | null>(null)
  const [product, setProduct] = useState<ProductSnap | null>(null)
  const [staff, setStaff] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [denying, setDenying] = useState(false)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => {
    const [c, ev] = await Promise.all([
      supabase.from("service_cases").select(CASE_SELECT).eq("id", caseId).single(),
      supabase.from("case_events").select("id, kind, body, actor_name, created_at").eq("case_id", caseId).order("created_at", { ascending: false }),
    ])
    if (c.error || !c.data) {
      setError("This case could not be loaded.")
      return
    }
    const r = c.data as unknown as CaseRow
    setRow(r)
    setEvents((ev.data ?? []) as EventRow[])
    if (r.customer_id) {
      supabase.rpc("cs_customer_snapshot", { p_customer: r.customer_id }).then(({ data }) => setCustomer((data ?? null) as CustomerSnap | null))
      supabase.from("customers").select("card_type, card_no").eq("id", r.customer_id).maybeSingle()
        .then(({ data }) => setCard((data ?? null) as { card_type: string; card_no: string | null } | null))
    } else {
      setCustomer(null)
      setCard(null)
    }
    if (r.product_id) supabase.rpc("cs_product_snapshot", { p_product: r.product_id }).then(({ data }) => setProduct((data ?? null) as ProductSnap | null))
    else setProduct(null)
  }, [caseId])

  useEffect(() => {
    load()
    supabase.rpc("area_colleagues").then(({ data }) => {
      const m: Record<string, string> = {}
      for (const r of (data ?? []) as { employee_id: string; full_name: string }[]) m[r.employee_id] = r.full_name
      setStaff(m)
    })
  }, [load])

  if (!profile) return null
  const isHead = profile.role === "department_head" && profile.functional_area === "customer_service"
  const mine = !!row && (row.created_by === profile.id || (!!profile.employee_id && row.assigned_to === profile.employee_id))
  const canNote = isHead || (profile.role === "staff" && profile.functional_area === "customer_service" && mine)
  const canTake = profile.role === "staff" && profile.functional_area === "customer_service" &&
    !!row && !row.assigned_to && !!profile.employee_id
  const canDecide = isHead && row?.case_type === "refund" && (row.status === "open" || row.status === "for_review")

  async function update(values: Record<string, unknown>, done: string) {
    setBusy(true)
    const { error: err } = await supabase.from("service_cases").update(values).eq("id", caseId)
    setBusy(false)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success(done)
    setDenying(false)
    setReason("")
    await load()
    onChanged()
  }

  async function addNote() {
    const text = note.trim()
    if (!text) return
    setBusy(true)
    const { error: err } = await supabase.from("case_events").insert({
      case_id: caseId, kind: "note", body: text, actor_id: profile!.id, actor_name: profile!.full_name,
    })
    setBusy(false)
    if (err) {
      toast.error("The note could not be saved. You can only add notes to cases that are yours or assigned to you.")
      return
    }
    setNote("")
    load()
  }

  const overdue = !!row?.due_date && row.due_date < new Date().toISOString().slice(0, 10) &&
    ["open", "in_progress", "for_review", "approved"].includes(row.status)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-xl font-medium tracking-tight">
            {row?.case_no ?? "Case"}
            {row && <StatusPill label={TYPE_LABEL[row.case_type] ?? row.case_type} tone={TYPE_TONE[row.case_type as keyof typeof TYPE_TONE] ?? "gray"} />}
            {row && <StatusPill label={statusLabel(row.case_type, row.status)} tone={STATUS_TONE[row.status] ?? "gray"} />}
          </DialogTitle>
          <DialogDescription className="sr-only">Case details and timeline</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!row && !error && <p className="text-sm text-muted-foreground">Loading...</p>}

        {row && (
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-medium">{row.subject}</h2>
                {row.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{row.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Submitted">{formatDate(row.date_submitted)}</Field>
                <Field label="Customer">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {row.customer?.full_name}
                    {card && hasCard(card.card_type) && (
                      <StatusPill label={`${cardLabel(card.card_type)} · priority`} tone="amber" />
                    )}
                  </span>
                </Field>
                <Field label="Assigned to">{row.assigned_to ? (staff[row.assigned_to] ?? "Employee") : <span className="text-muted-foreground">Unassigned</span>}</Field>
                {row.product_name && <Field label="Product">{row.product_name}</Field>}
                {row.sale_no && <Field label="Sale">{row.sale_no}</Field>}
                {row.category && <Field label="Category">{CATEGORY_LABEL[row.category] ?? row.category}</Field>}
                {row.severity && <Field label="Severity"><StatusPill label={row.severity} tone={SEVERITY_TONE[row.severity as keyof typeof SEVERITY_TONE]} /></Field>}
                {row.due_date && <Field label="Due"><span className={cn(overdue && "font-medium text-destructive")}>{formatDate(row.due_date)}{overdue ? " (overdue)" : ""}</span></Field>}
                {row.refund_amount != null && <Field label="Refund amount">{peso(row.refund_amount)}</Field>}
                {row.rating != null && <Field label="Rating"><span className="text-warning">{stars(row.rating)}</span></Field>}
                {row.resolution_date && <Field label="Finished">{formatDate(row.resolution_date)}</Field>}
              </div>
              {row.resolution_details && <Panel title="Resolution"><p className="whitespace-pre-wrap text-sm">{row.resolution_details}</p></Panel>}

              {(canDecide || canTake) && (
                <div className="flex flex-wrap items-center gap-2">
                  {canTake && (
                    <Button disabled={busy} onClick={() => update({ assigned_to: profile.employee_id }, "The case is now assigned to you.")}
                      className="bg-brand text-white hover:bg-brand-hover">Take this case</Button>
                  )}
                  {canDecide && !denying && (
                    <>
                      <Button disabled={busy} onClick={() => update({ status: "approved" }, "Refund approved.")}
                        className="bg-brand text-white hover:bg-brand-hover">Approve refund</Button>
                      <Button disabled={busy} variant="outline" onClick={() => setDenying(true)}>Deny...</Button>
                    </>
                  )}
                </div>
              )}
              {canDecide && denying && (
                <div className="space-y-2 rounded-2xl bg-muted p-4">
                  <p className="text-xs font-medium">Reason for denying this refund</p>
                  <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputClass, "h-auto py-2")} />
                  <div className="flex gap-2">
                    <Button disabled={busy || !reason.trim()} onClick={() => update({ status: "denied", resolution_details: reason.trim() }, "Refund denied.")}
                      className="bg-destructive text-white hover:bg-destructive/90">Confirm denial</Button>
                    <Button variant="outline" onClick={() => setDenying(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              <Panel title="Timeline">
                {canNote && (
                  <div className="mb-3 flex gap-2">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (what was done, who was contacted)..."
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote() } }} className={inputClass} />
                    <Button disabled={busy || !note.trim()} onClick={addNote} className="bg-brand text-white hover:bg-brand-hover">Add</Button>
                  </div>
                )}
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ol className="space-y-3 border-l border-border pl-4">
                    {events.map((e) => (
                      <li key={e.id} className="relative">
                        <span className={cn("absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full",
                          e.kind === "note" ? "bg-brand" : e.kind === "decision" ? "bg-warning" : "bg-muted-foreground")} />
                        <p className="text-sm">{e.body}</p>
                        <p className="text-xs text-muted-foreground">{e.actor_name ?? "System"} · {new Date(e.created_at).toLocaleString()}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>

            <div className="space-y-4">
              {customer && (
                <Panel title="Customer history">
                  <p className="text-sm font-medium">{customer.name} <span className="font-normal text-muted-foreground">({customer.customer_no})</span></p>
                  <p className="text-xs text-muted-foreground">{[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                  {card && hasCard(card.card_type) && (
                    <p className="mt-1 text-xs font-medium text-brand-text">
                      ★ {cardLabel(card.card_type)}{card.card_no ? ` · ${card.card_no}` : ""} - priority customer
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-medium">{num(customer.purchases)}</p><p className="text-xs text-muted-foreground">Purchases</p></div>
                    <div><p className="text-lg font-medium">{peso(customer.spent)}</p><p className="text-xs text-muted-foreground">Spent</p></div>
                    <div><p className="text-lg font-medium">{num(customer.cases)}</p><p className="text-xs text-muted-foreground">Cases</p></div>
                  </div>
                  {customer.recent_purchases.length > 0 && (
                    <>
                      <p className="mt-3 text-xs font-medium">Recent purchases</p>
                      <ul className="mt-1 space-y-1 text-xs">
                        {customer.recent_purchases.map((p) => (
                          <li key={p.transaction_no} className="flex justify-between gap-2">
                            <span className="truncate">{p.product}</span><span className="shrink-0 text-muted-foreground">{formatDate(p.transaction_date)} · {peso(p.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {customer.recent_cases.length > 0 && (
                    <>
                      <p className="mt-3 text-xs font-medium">Previous cases</p>
                      <ul className="mt-1 space-y-1 text-xs">
                        {customer.recent_cases.map((c) => (
                          <li key={c.case_no} className="flex justify-between gap-2">
                            <span className="truncate">{c.case_no} · {c.subject}</span><span className="shrink-0 text-muted-foreground">{statusLabel(c.case_type, c.status)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Panel>
              )}
              {product && (
                <Panel title="Product status">
                  <p className="text-sm font-medium">{product.name} <span className="font-normal text-muted-foreground">({product.sku})</span></p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><p className={cn("text-lg font-medium", product.stock <= product.low_threshold && "text-destructive")}>{num(product.stock)}</p><p className="text-xs text-muted-foreground">In stock</p></div>
                    <div><p className="text-lg font-medium">{num(product.complaints_12m)}</p><p className="text-xs text-muted-foreground">Complaints (12 mo)</p></div>
                    <div><p className="text-lg font-medium">{num(product.open_cases)}</p><p className="text-xs text-muted-foreground">Open cases</p></div>
                  </div>
                  {product.stock <= product.low_threshold && <p className="mt-2 text-xs text-destructive">Stock is at or below the low-stock level ({num(product.low_threshold)}).</p>}
                </Panel>
              )}
              {!customer && !product && <p className="text-sm text-muted-foreground">Link a customer or product to see their history and status here.</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
