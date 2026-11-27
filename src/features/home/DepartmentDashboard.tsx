import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { PageHeader } from "@/components/shared/PageHeader"
import { usePendingCount } from "@/features/approvals/usePendingCount"
import { useAuth } from "@/features/auth/AuthContext"
import CustomerServiceOverview from "@/features/customer-service/CustomerServiceOverview"
import FinanceOverview from "@/features/finance/FinanceOverview"
import HrOverview from "@/features/hr/HrOverview"
import InventoryOverview from "@/features/inventory/InventoryOverview"
import SalesOverview from "@/features/sales/SalesOverview"
import { num } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { AREA_LABEL } from "@/types"
import { cn } from "@/lib/utils"

function Attention({ items }: { items: { label: string; count: number; hint: string; to: string }[] }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-medium">Needs your attention</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((i) => (
          <Link key={i.label} to={i.to}
            className={cn("rounded-3xl bg-card p-5 shadow-card transition hover:-translate-y-0.5", i.count > 0 && "ring-1 ring-warning/40")}>
            <p className="text-sm text-muted-foreground">{i.label}</p>
            <p className={cn("mt-1 text-3xl font-medium tracking-tight", i.count > 0 ? "text-warning" : "text-foreground")}>{num(i.count)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{i.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

// The landing page of a Department Head: only their own department.
export default function DepartmentDashboard() {
  const { profile } = useAuth()
  const area = profile?.functional_area ?? null
  const finance = usePendingCount("financial_entries", area === "finance_accounting")
  const inventory = usePendingCount("inventory_movements", area === "inventory_warehouse")
  const sales = usePendingCount("sales_transactions", area === "sales_marketing")
  const [noAccount, setNoAccount] = useState(0)

  useEffect(() => {
    if (area !== "human_resources") return
    supabase.rpc("hr_unregistered_employees").then(({ data }) => setNoAccount(((data ?? []) as unknown[]).length))
  }, [area])

  if (!profile || !area) return null

  let attention: ReactNode = null
  let body: ReactNode = null
  if (area === "customer_service") {
    body = <CustomerServiceOverview />
  } else if (area === "finance_accounting") {
    attention = <Attention items={[{ label: "Entries awaiting approval", count: finance, hint: "Submitted by your Staff", to: "/finance/approvals" }]} />
    body = <FinanceOverview />
  } else if (area === "inventory_warehouse") {
    attention = <Attention items={[{ label: "Movements awaiting approval", count: inventory, hint: "Stock changes wait for you", to: "/inventory/approvals" }]} />
    body = <InventoryOverview />
  } else if (area === "sales_marketing") {
    attention = <Attention items={[{ label: "Sales awaiting approval", count: sales, hint: "Submitted by your Staff", to: "/sales/approvals" }]} />
    body = <SalesOverview />
  } else {
    attention = <Attention items={[{ label: "Employees without an account", count: noAccount, hint: "Create their sign-in", to: "/hr/accounts" }]} />
    body = <HrOverview />
  }

  return (
    <>
      <PageHeader title="Dashboard" description={`${AREA_LABEL[area]} - what needs action and how the department is doing.`} />
      {attention}
      {body}
    </>
  )
}
