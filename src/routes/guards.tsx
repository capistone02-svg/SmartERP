import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/features/auth/AuthContext"
import type { FunctionalArea } from "@/types"

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
      Loading...
    </div>
  )
}

// Must be signed in
export function RequireAuth() {
  const { loading, profile } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!profile) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

// Login page is only for people who are NOT signed in
export function GuestOnly() {
  const { loading, profile } = useAuth()
  if (loading) return <FullScreenLoader />
  if (profile) return <Navigate to="/" replace />
  return <Outlet />
}

// Must have the right role / functional area for this section.
// The Admin may open every department (view only: the database blocks any change).
export function RequireAccess({ area, adminOnly }: { area?: FunctionalArea; adminOnly?: boolean }) {
  const { profile } = useAuth()
  if (!profile) return null
  const allowed = adminOnly
    ? profile.role === "admin"
    : area
      ? profile.role === "admin" || profile.functional_area === area
      : true
  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Access restricted</h1>
        <p className="text-sm text-neutral-500">You do not have permission to view this page.</p>
        <a href="/" className="mt-2 text-sm font-medium text-[#0e63a6] underline">
          Back to Overview
        </a>
      </div>
    )
  }
  return <Outlet />
}
