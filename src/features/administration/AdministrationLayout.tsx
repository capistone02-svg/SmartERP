import { Outlet } from "react-router-dom"
import { ModuleTabs } from "@/components/shared/ModuleTabs"
import { PageHeader } from "@/components/shared/PageHeader"

const TABS = [
  { label: "Users", to: "/administration", end: true },
  { label: "Permissions", to: "/administration/permissions" },
  { label: "Activity Log", to: "/administration/activity" },
  { label: "Login Log", to: "/administration/logins" },
  { label: "Archive", to: "/administration/archive" },
]

export default function AdministrationLayout() {
  return (
    <>
      <PageHeader title="Administration" description="User accounts, roles, functional areas and access permissions." />
      <ModuleTabs tabs={TABS} />
      <Outlet />
    </>
  )
}