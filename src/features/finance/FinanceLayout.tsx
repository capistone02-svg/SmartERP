import { Outlet } from "react-router-dom"
import { ModuleTabs } from "@/components/shared/ModuleTabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { usePendingCount } from "@/features/approvals/usePendingCount"
import { useAuth } from "@/features/auth/AuthContext"

const BASE_TABS = [
  { label: "Overview", to: "/finance", end: true },
  { label: "Entries", to: "/finance/entries" },
]

export default function FinanceLayout() {
  const { profile } = useAuth()
  // Department Heads decide on submissions; Admin can look at the queue.
  const sees = profile?.role === "department_head" || profile?.role === "admin"
  const pending = usePendingCount("financial_entries", sees)
  const TABS = sees
    ? [...BASE_TABS, { label: pending > 0 ? `Approvals (${pending})` : "Approvals", to: "/finance/approvals" }]
    : BASE_TABS
  return (
    <>
      <PageHeader title="Finance and Accounting" description="Revenue and expense entries and financial summaries." />
      <ModuleTabs tabs={TABS} />
      <Outlet />
    </>
  )
}