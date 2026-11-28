import { Outlet } from "react-router-dom"
import { ModuleTabs } from "@/components/shared/ModuleTabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { usePendingCount } from "@/features/approvals/usePendingCount"
import { useAuth } from "@/features/auth/AuthContext"

const BASE_TABS = [
  { label: "Overview", to: "/sales", end: true },
  { label: "Transactions", to: "/sales/transactions" },
  { label: "Refunds", to: "/sales/refunds" },
  { label: "Customers", to: "/sales/customers" },
  { label: "Promotions", to: "/sales/promotions" },
  { label: "Marketing", to: "/sales/marketing" },
]

export default function SalesLayout() {
  const { profile } = useAuth()
  // Department Heads decide on submissions; Admin can look at the queue.
  const sees = profile?.role === "department_head" || profile?.role === "admin"
  const pending = usePendingCount("sales_transactions", sees)
  const TABS = sees
    ? [
        ...BASE_TABS,
        { label: pending > 0 ? `Approvals (${pending})` : "Approvals", to: "/sales/approvals" },
        { label: "Team", to: "/sales/team" },
      ]
    : BASE_TABS
  return (
    <>
      <PageHeader title="Sales and Marketing" description="Sales records, customers, promotions and marketing activities." />
      <ModuleTabs tabs={TABS} />
      <Outlet />
    </>
  )
}