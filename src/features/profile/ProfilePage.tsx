import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/AuthContext"
import EmployeeProfilePage from "@/features/people/EmployeeProfilePage"

// My Profile = the signed-in person's own employee file, fetched fresh from
// the database on every visit (details, documents, history, work). The old
// account-info card was removed - its values came from the login-time copy
// of the profile and went stale when HR changed something.
export default function ProfilePage() {
  const { profile } = useAuth()
  if (!profile) return null
  return (
    <>
      <PageHeader title="My Profile" description="Your employee file: details, documents, employment history and work." />
      {profile.employee_id ? (
        <EmployeeProfilePage employeeId={profile.employee_id} embedded />
      ) : (
        <p className="text-sm text-muted-foreground">No employee file is linked to your account yet.</p>
      )}
    </>
  )
}
