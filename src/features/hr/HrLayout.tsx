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
  // Sign-ins: the Head (and Admin) see the department's login activity.
  if (profile?.role === "department_head" || profile?.role === "admin") {
    tabs = [...tabs, { label: "Sign-ins", to: "/hr/sign-ins" }]
  }
  return (
    <>
      <PageHeader title="Human Resource" description="Employee files, documents, onboarding, employment history and accounts." />
      <ModuleTabs tabs={tabs} />
      <Outlet />
    </>
  )
}
