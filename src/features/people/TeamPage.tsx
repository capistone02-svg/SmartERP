import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusPill } from "@/components/shared/StatusPill"
import { useAuth } from "@/features/auth/AuthContext"
import { formatDate, num } from "@/lib/format"
import { STATUS_TONE } from "@/lib/people"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL, type FunctionalArea } from "@/types"
import { cn } from "@/lib/utils"

interface Member {
  id: string
  name: string
  employee_no: string
  position: string
  status: string
  hire_date: string
  has_account: boolean
  open_work: number
  flagged: number
}

const ALL_AREAS: FunctionalArea[] = [
  "customer_service",
  "finance_accounting",
  "inventory_warehouse",
  "sales_marketing",
  "human_resources",
]

const AREA_CONFIG: Record<
  FunctionalArea,
  {
    purpose: string
    col1: string
    col2: string
    col1Help: string
    col2Help: string
  }
> = {
  customer_service: {
    purpose: "Monitor agent ticket assignments, open service cases, and SLA resolution deadlines.",
    col1: "Open cases",
    col2: "Overdue SLA",
    col1Help: "Active complaints, refunds, inquiries, and feedback currently assigned to this agent.",
    col2Help: "Unresolved cases that exceeded their SLA resolution deadline.",
  },
  finance_accounting: {
    purpose: "Track journal entries and ledger submissions awaiting department head sign-off.",
    col1: "Pending review",
    col2: "Returned for revision",
    col1Help: "Financial entries logged by this member awaiting approval.",
    col2Help: "Entries rejected with review notes that require staff amendment.",
  },
  inventory_warehouse: {
    purpose: "Oversee warehouse personnel and verify physical stock movements before balances adjust.",
    col1: "Pending movements",
    col2: "Returned / Discrepancies",
    col1Help: "Stock in, stock out, transfers, and adjustments awaiting head sign-off.",
    col2Help: "Movements returned due to warehouse count discrepancies or missing references.",
  },
  sales_marketing: {
    purpose: "Track sales representative orders and transaction validations awaiting booking.",
    col1: "Pending orders",
    col2: "Returned orders",
    col1Help: "Sales orders and transactions submitted awaiting approval.",
    col2Help: "Transactions sent back for correction before final booking.",
  },
  human_resources: {
    purpose: "HR department personnel roster, staff positions, and ERP system access.",
    col1: "ERP Account",
    col2: "Personnel File",
    col1Help: "Whether this HR staff member has an active login credential in SmartERP.",
    col2Help: "Direct link to the employee's personnel and employment history file.",
  },
}

// The Department Head's team: who is carrying how much. Open a person for their work profile.
export default function TeamPage({ area: propArea }: { area?: FunctionalArea }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === "admin"
  const defaultArea = propArea || (profile?.functional_area as FunctionalArea) || "customer_service"
  const [activeArea, setActiveArea] = useState<FunctionalArea>(defaultArea)

  // Keep state in sync if propArea changes
  useEffect(() => {
    if (propArea) setActiveArea(propArea)
  }, [propArea])

  const [rows, setRows] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentArea = propArea || (isAdmin ? activeArea : (profile?.functional_area as FunctionalArea) || "customer_service")
  const config = AREA_CONFIG[currentArea] ?? AREA_CONFIG.customer_service
  const isHR = currentArea === "human_resources"

  useEffect(() => {
    setError(null)
    setRows(null)
    supabase
      .rpc("team_overview", { p_area: isAdmin ? currentArea : null })
      .then(({ data, error }) => {
        if (error) setError("The team could not be loaded.")
        else setRows((data ?? []) as Member[])
      })
  }, [currentArea, isAdmin])

  return (
    <>
      <PageHeader
        title="Department Team"
        description={`${AREA_LABEL[currentArea]} · ${config.purpose}`}
      />

      <div className="rounded-3xl bg-card p-3 shadow-card sm:p-5">
        {isAdmin && !propArea && (
          <div className="mb-4 flex flex-wrap gap-1.5 border-b border-border pb-4">
            {ALL_AREAS.map((a) => (
              <button
                key={a}
                onClick={() => setActiveArea(a)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeArea === a
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {AREA_LABEL[a]}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !rows ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-1.5 text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-1.5">Employee</th>
                    <th className="px-4 py-1.5">ID</th>
                    <th className="px-4 py-1.5">Position</th>
                    <th className="px-4 py-1.5">Status</th>
                    <th className="px-4 py-1.5">Hired</th>
                    <th className="px-4 py-1.5 text-right" title={config.col1Help}>
                      {config.col1}
                    </th>
                    <th className="px-4 py-1.5 text-right" title={config.col2Help}>
                      {config.col2}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="rounded-2xl bg-muted py-10 text-center text-muted-foreground">
                        No team members found in {AREA_LABEL[currentArea]}.
                      </td>
                    </tr>
                  )}
                  {rows.map((m) => (
                    <tr key={m.id} className="group">
                      {[
                        <Link key="n" to={`/people/${m.id}`} className="font-medium hover:underline">
                          {m.name}
                        </Link>,
                        <span key="id" className="font-mono text-xs text-muted-foreground">{m.employee_no}</span>,
                        m.position,
                        <StatusPill
                          key="s"
                          label={m.status}
                          tone={STATUS_TONE[m.status as keyof typeof STATUS_TONE] ?? "gray"}
                        />,
                        formatDate(m.hire_date),
                        isHR ? (
                          <StatusPill
                            key="acct"
                            label={m.has_account ? "Active account" : "No account"}
                            tone={m.has_account ? "green" : "gray"}
                          />
                        ) : (
                          <span key="o" className="font-medium">
                            {num(m.open_work)}
                          </span>
                        ),
                        isHR ? (
                          <Link
                            key="prof"
                            to={`/people/${m.id}`}
                            className="text-xs font-medium text-brand hover:underline"
                          >
                            View personnel &rarr;
                          </Link>
                        ) : (
                          <span
                            key="f"
                            className={m.flagged > 0 ? "font-medium text-destructive" : "text-muted-foreground"}
                          >
                            {num(m.flagged)}
                          </span>
                        ),
                      ].map((c, i) => (
                        <td
                          key={i}
                          className={
                            "bg-muted px-4 py-3 group-hover:bg-accent first:rounded-l-2xl last:rounded-r-2xl" +
                            (i >= 5 ? " text-right" : "")
                          }
                        >
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 px-1 text-xs text-muted-foreground">
              {num(rows.length)} team members in {AREA_LABEL[currentArea]}. Click any employee to view their work history and profile.
            </p>
          </>
        )}
      </div>
    </>
  )
}
