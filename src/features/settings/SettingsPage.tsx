import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/shared/PageHeader"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { AREA_LABEL, ROLE_LABEL } from "@/types"

type Tab = "account" | "security" | "tutorial"
const TABS: { id: Tab; label: string }[] = [
  { id: "account", label: "Account Settings" },
  { id: "security", label: "Access and Security" },
  { id: "tutorial", label: "Tutorial" },
]

function Account() {
  const { profile } = useAuth()
  if (!profile) return null
  const items: [string, string][] = [
    ["Full name", profile.full_name],
    ["Employee ID", profile.employee_no],
    ["Role", ROLE_LABEL[profile.role]],
    ["Functional area", profile.functional_area ? AREA_LABEL[profile.functional_area] : "System-wide"],
    ["Status", profile.is_active ? "Active" : "Inactive"],
  ]
  return (
    <div className="max-w-xl rounded-xl border border-[#dbe3f5] bg-white p-5 shadow-sm">
      <dl className="divide-y divide-[#eef1f8]">
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-3 text-sm">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-neutral-500">
        Your name, role and area are managed by your administrator and Human Resource.
      </p>
    </div>
  )
}

function Security() {
  const { profile } = useAuth()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile) return
    if (next.length < 8) return setError("The new password must be at least 8 characters.")
    if (next !== confirm) return setError("The new passwords do not match.")
    if (next === current) return setError("Choose a password different from the current one.")
    setSaving(true)
    // Verify the current password first
    const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: profile.email, password: current })
    if (verifyErr) {
      setSaving(false)
      return setError("The current password is incorrect.")
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: next })
    setSaving(false)
    if (updErr) return setError(friendlyError(updErr))
    setCurrent(""); setNext(""); setConfirm("")
    toast.success("Password changed.")
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4 rounded-xl border border-[#dbe3f5] bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">Change password</h2>
      <FormField label="Current password" required>
        <input type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </FormField>
      <FormField label="New password" required>
        <input type="password" className={inputClass} value={next} placeholder="At least 8 characters" onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </FormField>
      <FormField label="Confirm new password" required>
        <input type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </FormField>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={saving} className="bg-[#0e63a6] text-white hover:bg-[#0b5189]">
        {saving ? "Saving..." : "Change password"}
      </Button>
    </form>
  )
}

const AREA_GUIDE: Record<string, [string, string][]> = {
  human_resources: [
    ["Manage employees", "Open Human Resource > Employees. Add, edit or filter employee records by position and status."],
    ["Accounts (HR Head)", "Human Resource > Accounts lists accounts. The HR Head creates Staff accounts for existing employees, resets Staff passwords and deactivates accounts. New users must change their temporary password at first sign-in."],
  ],
  finance_accounting: [
    ["Record entries", "Open Finance > Entries. Add revenue or expense entries with date, category and amount."],
    ["Read the overview", "Revenue, expenses and net totals are summarized with charts."],
  ],
  inventory_warehouse: [
    ["Products and stock", "Products holds the catalog. Stock shows current balances and low-stock items."],
    ["Record movements", "Use Movements for stock in and stock out. Balances update automatically; movements cannot be changed afterwards except remarks."],
  ],
  sales_marketing: [
    ["Record sales", "Transactions holds one row per product sold. Use Import to upload a CSV of sales."],
    ["Customers and campaigns", "Maintain customers, promotions and marketing activities in their own tabs."],
  ],
  customer_service: [
    ["Handle cases", "Open Customer Service > Cases. Log a case, update its status and resolution."],
    ["Read the overview", "Track pending and resolved cases and average resolution time."],
  ],
}

function Tutorial() {
  const { profile } = useAuth()
  if (!profile) return null
  const topics: [string, string][] = [
    ["Signing in and out", "Sign in with your Employee ID and password. You are signed out automatically after 15 minutes of inactivity. Use the profile menu at the bottom of the sidebar to sign out."],
    ["Searching and filtering", "Each list has a search box and filters. Results are paged; use Previous and Next at the bottom."],
  ]
  if (profile.role === "admin") {
    topics.push(
      ["Overseeing departments", "You can open every department and report in read-only mode. Changes to records are made by each department."],
      ["Managing access", "Administration > Permissions switches View, Create, Update and Delete per role and area. Delete is off by default. Administration > Users promotes Staff to Department Head and manages Administrator accounts."],
      ["Activity and Login logs", "Administration > Activity Log shows who created, changed or deleted what. Login Log shows sign-ins, sign-outs and failed attempts. Both can be filtered and downloaded as CSV."],
    )
  } else if (profile.functional_area) {
    topics.push(...(AREA_GUIDE[profile.functional_area] ?? []))
    topics.push([
      "What you can edit",
      profile.role === "department_head"
        ? "As Department Head you can edit all records in your area."
        : "As Staff you can edit only the records you created. Some records are hidden or limited to your own.",
    ])
  }
  return (
    <div className="max-w-2xl space-y-2">
      {topics.map(([title, body]) => (
        <details key={title} className="group rounded-xl border border-[#dbe3f5] bg-white px-4 py-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium">{title}</summary>
          <p className="mt-2 text-sm text-neutral-600">{body}</p>
        </details>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("account")
  return (
    <>
      <PageHeader title="Settings" description="Your account, password and help topics." />
      <div className="mb-5 flex gap-1 border-b border-[#dbe3f5]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm",
              tab === t.id ? "border-[#0e63a6] font-medium text-[#0e63a6]" : "border-transparent text-neutral-500 hover:text-neutral-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "account" && <Account />}
      {tab === "security" && <Security />}
      {tab === "tutorial" && <Tutorial />}
    </>
  )
}
