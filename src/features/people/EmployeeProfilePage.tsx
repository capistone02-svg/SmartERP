import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { StatusPill } from "@/components/shared/StatusPill"
import { AREA_LABEL } from "@/types"
import { initials, STATUS_TONE } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import DetailsTab from "./DetailsTab"
import DocumentsTab from "./DocumentsTab"
import HistoryTab from "./HistoryTab"
import WorkTab from "./WorkTab"

interface Access {
  found: boolean; personnel: boolean; work: boolean; self: boolean
  id?: string // resolved employees.id (uuid) - tabs filter on it; the route id may be an employee_no
  name?: string; position?: string; area?: keyof typeof AREA_LABEL; status?: string; employee_no?: string
}

type TabKey = "work" | "details" | "documents" | "history"

// One page per employee. What is shown depends on who is looking:
//   HR and the Admin     -> personnel file (details, documents, history)
//   Department Head      -> work profile of their own staff (no personal details or documents)
//   The employee         -> everything about themself
export default function EmployeeProfilePage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [access, setAccess] = useState<Access | null>(null)

  useEffect(() => {
    setAccess(null)
    supabase.rpc("employee_access", { p_employee: id }).then(({ data }) => setAccess((data ?? { found: false }) as Access))
  }, [id])

  if (!access) return <p className="text-sm text-muted-foreground">Loading...</p>
  if (!access.found || (!access.personnel && !access.work)) {
    return (
      <div className="rounded-3xl bg-card p-8 text-center shadow-card">
        <p className="font-medium">This profile is not available to you.</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-sm text-brand-text underline">Go back</button>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string }[] = [
    ...(access.work ? [{ key: "work" as const, label: "Work" }] : []),
    ...(access.personnel ? [
      { key: "details" as const, label: "Details" },
      { key: "documents" as const, label: "Documents" },
      { key: "history" as const, label: "History" },
    ] : []),
  ]
  const wanted = params.get("tab") as TabKey | null
  const tab = tabs.find((t) => t.key === wanted)?.key ?? tabs[0].key

  return (
    <>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-3xl bg-card p-5 shadow-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-lg font-medium text-brand-text">
          {initials(access.name ?? "")}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-medium tracking-tight">{access.name} {access.self && <span className="ml-1 text-sm font-normal text-muted-foreground">(you)</span>}</h1>
          <p className="text-sm text-muted-foreground">
            {access.position} · {access.area ? AREA_LABEL[access.area] : ""} · {access.employee_no}
          </p>
        </div>
        <StatusPill label={access.status ?? ""} tone={STATUS_TONE[access.status as keyof typeof STATUS_TONE] ?? "gray"} />
      </div>

      {tabs.length > 1 && (
        <div className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1.5 sm:inline-flex">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors",
                tab === t.key ? "bg-card font-medium text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "work" && <WorkTab employeeId={access.id ?? id} />}
      {tab === "details" && <DetailsTab employeeId={access.id ?? id} />}
      {tab === "documents" && <DocumentsTab employeeId={access.id ?? id} />}
      {tab === "history" && <HistoryTab employeeId={access.id ?? id} />}

      {access.personnel && !access.work && (
        <p className="mt-5 text-xs text-muted-foreground">
          HR sees the personnel file only. Task lists and work records belong to the employee's own department.
          {" "}<Link to="/hr/onboarding" className="text-brand-text underline">Back to the checklist</Link>
        </p>
      )}
    </>
  )
}
