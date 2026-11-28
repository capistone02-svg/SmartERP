import { Outlet } from "react-router-dom"
import { ModuleTabs } from "@/components/shared/ModuleTabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/AuthContext"
import { KIND_LIST } from "./caseConfig"

const TABS = [
  { label: "Overview", to: "/customer-service", end: true },
  ...KIND_LIST.map((k) => ({ label: k.plural, to: `/customer-service/${k.path}` })),
  { label: "All cases", to: "/customer-service/cases" },
]

export default function CustomerServiceLayout() {
  const { profile } = useAuth()
  // The Team tab is for the Department Head (and the Admin, view only)
  const showTeam = profile?.role === "department_head" || profile?.role === "admin"
  return (
    <>
      <PageHeader title="Customer Service" description="Complaints, refunds and returns, product inquiries and feedback." />
      <ModuleTabs tabs={showTeam
        ? [...TABS,
 { label: "Team", to: "/customer-service/team" },
           { label: "Sign-ins", to: "/customer-service/sign-ins" }]
        : TABS} />
      <Outlet />
    </>
  )
}
