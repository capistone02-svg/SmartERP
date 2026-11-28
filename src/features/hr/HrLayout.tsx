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
  const { can, profile } = useAuth()
  // The Accounts tab is for the HR Head (and shown read-only to the Admin)
  let tabs = can("user_accounts", "view") ? [...TABS, { label: "Accounts", to: "/hr/accounts" }] : TABS
  // Team: the Head (and Admin) see the department's team members.
  if (profile?.role === "department_head" || profile?.role === "admin") {
    tabs = [...tabs, { label: "Team", to: "/hr/team" }]
  }
  return (
    <>
      <PageHeader title="Human Resource" description="Employee files, documents, onboarding, employment history and accounts." />
      <ModuleTabs tabs={tabs} />
      <Outlet />
    </>
  )
}
