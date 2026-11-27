import { Outlet } from "react-router-dom"
import { ModuleTabs } from "@/components/shared/ModuleTabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { KIND_LIST } from "./caseConfig"

const TABS = [
  { label: "Overview", to: "/customer-service", end: true },
  ...KIND_LIST.map((k) => ({ label: k.plural, to: `/customer-service/${k.path}` })),
  { label: "All cases", to: "/customer-service/cases" },
]

export default function CustomerServiceLayout() {
  return (
    <>
      <PageHeader title="Customer Service" description="Complaints, refunds and returns, product inquiries and feedback." />
      <ModuleTabs tabs={TABS} />
      <Outlet />
    </>
  )
}
