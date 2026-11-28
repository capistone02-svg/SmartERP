import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { KpiCard } from "@/components/shared/KpiCard"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusPill } from "@/components/shared/StatusPill"
import { useAuth } from "@/features/auth/AuthContext"
import { KINDS, PENDING, STATUS_TONE, TYPE_LABEL, TYPE_TONE, statusLabel, type CaseKind } from "@/features/customer-service/caseConfig"
import { formatDate, num, todayStr } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL, type FunctionalArea } from "@/types"

interface MyCase {
  id: string; case_no: string; case_type: string; subject: string; status: string
  due_date: string | null; date_submitted: string
}
interface Submission { id: string; approval_status: string; review_note: string | null; created_at: string; label: string | null }

const SUBMISSIONS: Partial<Record<FunctionalArea, { table: string; labelCol: string; path: string; noun: string }>> = {
  finance_accounting: { table: "financial_entries", labelCol: "entry_no", path: "/finance/entries", noun: "entries" },
  inventory_warehouse: { table: "inventory_movements", labelCol: "reference_no", path: "/inventory/movements", noun: "movements" },
  sales_marketing: { table: "sales_transactions", labelCol: "transaction_no", path: "/sales/transactions", noun: "sales" },
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </div>
  )
}

function CaseWork({ employeeId }: { employeeId: string | null }) {
  const [rows, setRows] = useState<MyCase[] | null>(null)
  const [doneMonth, setDoneMonth] = useState(0)

  useEffect(() => {
    if (!employeeId) {
      setRows([])
      return
    }
    supabase.from("service_cases").select("id, case_no, case_type, subject, status, due_date, date_submitted")
      .eq("assigned_to", employeeId).in("status", PENDING).order("due_date", { ascending: true, nullsFirst: false }).limit(50)
      .then(({ data }) => setRows((data ?? []) as MyCase[]))
    const first = todayStr().slice(0, 8) + "01"
    supabase.from("service_cases").select("id", { count: "exact", head: true })
      .eq("assigned_to", employeeId).gte("resolution_date", first)
      .then(({ count }) => setDoneMonth(count ?? 0))
  }, [employeeId])

  if (!employeeId) {
    return <p className="rounded-3xl bg-card p-5 text-sm text-muted-foreground shadow-card">Your account is not linked to an employee record yet, so cases cannot be assigned to you. Please ask HR.</p>
  }
  if (!rows) return <p className="text-sm text-muted-foreground">Loading...</p>
  const overdue = rows.filter((r) => r.due_date && r.due_date < todayStr()).length
  const path = (t: string) => (t in KINDS ? `/customer-service/${KINDS[t as CaseKind].path}` : "/customer-service/cases")

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Assigned to me" value={num(rows.length)} hint="Open cases" />
        <KpiCard label="Overdue" value={num(overdue)} hint="Past the due date" />
        <KpiCard label="Finished this month" value={num(doneMonth)} />
      </div>
      <Box title="My open cases">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing is assigned to you right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const late = !!r.due_date && r.due_date < todayStr()
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <Link to={path(r.case_type)} className="font-medium text-brand-text hover:underline">{r.case_no}</Link>
                  <StatusPill label={TYPE_LABEL[r.case_type] ?? r.case_type} tone={TYPE_TONE[r.case_type as keyof typeof TYPE_TONE] ?? "gray"} />
                  <span className="min-w-0 flex-1 truncate">{r.subject}</span>
                  <span className={late ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                    {r.due_date ? `Due ${formatDate(r.due_date)}${late ? " (overdue)" : ""}` : "No due date"}
                  </span>
                  <StatusPill label={statusLabel(r.case_type, r.status)} tone={STATUS_TONE[r.status] ?? "gray"} />
                </li>
              )
            })}
          </ul>
        )}
      </Box>
    </div>
  )
}

function SubmissionWork({ area, userId }: { area: FunctionalArea; userId: string }) {
  const cfg = SUBMISSIONS[area]
  const [rows, setRows] = useState<Submission[] | null>(null)

  useEffect(() => {
    if (!cfg) return
    supabase.from(cfg.table).select(`id, approval_status, review_note, created_at, label:${cfg.labelCol}`)
      .eq("created_by", userId).order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => setRows((data ?? []) as unknown as Submission[]))
  }, [cfg, userId])

  if (!cfg) return null
  if (!rows) return <p className="text-sm text-muted-foreground">Loading...</p>
  const count = (s: string) => rows.filter((r) => r.approval_status === s).length
  const rejected = rows.filter((r) => r.approval_status === "rejected").slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Waiting for approval" value={num(count("pending"))} hint={`Your ${cfg.noun}`} />
        <KpiCard label="Sent back to fix" value={num(count("rejected"))} hint="Edit and resubmit" />
        <KpiCard label="Approved" value={num(count("approved"))} />
      </div>
      <Box title="Needs your attention">
        {rejected.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing was sent back. Good work.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rejected.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="font-medium">{r.label ?? "Record"}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.review_note ?? "No reason was given."}</span>
                <Link to={cfg.path} className="text-xs font-medium text-brand-text hover:underline">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </div>
  )
}

// The landing page of Staff: their own work only.
export default function MyWork() {
  const { profile } = useAuth()
  if (!profile) return null
  const area = profile.functional_area
  return (
    <>
      <PageHeader
        title="My work"
        description={`${profile.full_name}${area ? " - " + AREA_LABEL[area] : ""}`}
      />
      {profile.employee_id && (
        <p className="mb-5 text-sm">
          <Link to="/profile" className="text-brand-text underline">Open my employee file</Link>
          <span className="text-muted-foreground"> - your details, documents and employment history</span>
        </p>
      )}
      {area === "customer_service" && <CaseWork employeeId={profile.employee_id} />}
      {area && area in SUBMISSIONS && <SubmissionWork area={area} userId={profile.id} />}
      {area === "human_resources" && (
        <p className="rounded-3xl bg-card p-5 text-sm text-muted-foreground shadow-card">
          Your assigned HR tasks will appear here. You can see and update your own details on your <Link to="/profile" className="text-brand-text underline">profile</Link>.
        </p>
      )}
    </>
  )
}
