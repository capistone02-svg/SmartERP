import { Outlet } from "react-router-dom"
import { ModuleTabs } from "@/components/shared/ModuleTabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/AuthContext"

const TABS = [
  { label: "Overview", to: "/hr", end: true },
  { label: "Employees", to: "/hr/employees" },
  { label: "Onboarding", to: "/hr/onboarding" },
]

export default function HrLayout() {
  const { can } = useAuth()
  // The Accounts tab is for the HR Head (and shown read-only to the Admin)
  const tabs = can("user_accounts", "view") ? [...TABS, { label: "Accounts", to: "/hr/accounts" }] : TABS
  return (
    <>
      <PageHeader title="Human Resource" description="Employee files, documents, onboarding, employment history and accounts." />
      <ModuleTabs tabs={tabs} />
      <Outlet />
    </>
  )
}
