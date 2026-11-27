import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/AuthContext"
import { AREA_LABEL, ROLE_LABEL } from "@/types"

export default function ProfilePage() {
  const { profile } = useAuth()
  if (!profile) return null
  const rows: [string, string][] = [
    ["Name", profile.full_name],
    ["Employee ID", profile.employee_no],
    ["Email", profile.email],
    ["Role", ROLE_LABEL[profile.role]],
    ["Functional area", profile.functional_area ? AREA_LABEL[profile.functional_area] : "System-wide"],
  ]
  return (
    <>
      <PageHeader title="My Profile" description="Your personal account information." />
      <dl className="max-w-xl divide-y divide-neutral-100 rounded-xl border border-[#dbe3f5] bg-white shadow-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="text-right font-medium text-black">{v}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}