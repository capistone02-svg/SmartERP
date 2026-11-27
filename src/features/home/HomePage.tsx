import { useAuth } from "@/features/auth/AuthContext"
import OverviewPage from "@/features/overview/OverviewPage"
import DepartmentDashboard from "./DepartmentDashboard"
import MyWork from "./MyWork"

// What opens first depends on the role:
//   Admin           -> company-wide overview
//   Department Head -> their own department's dashboard and what needs action
//   Staff           -> their own assigned work
export default function HomePage() {
  const { profile } = useAuth()
  if (!profile) return null
  if (profile.role === "admin") return <OverviewPage />
  if (profile.role === "department_head") return <DepartmentDashboard />
  return <MyWork />
}
