import { useEffect, useState } from "react"
import { KpiCard } from "@/components/shared/KpiCard"
import { StatusPill } from "@/components/shared/StatusPill"
import { supabase } from "@/lib/supabase"

// Department Heads see their own department's sign-in activity - the same
// login_logs the Administration Login Log records, scoped to the caller's
// area by area_login_activity(). HR and Customer Service both use this page.
interface SigninEvent {
  occurred_at: string
  event: string
  employee_no: string
  user_agent: string | null
  full_name: string | null
}
interface Summary {
  signins_today: number
  failed_today: number
  active_7d: number
  events: SigninEvent[]
  never_signed_in: { employee_no: string; full_name: string }[]
}

const EVENT_STYLE: Record<string, { label: string; tone: "green" | "red" | "gray" }> = {
  login: { label: "Signed in", tone: "green" },
  logout: { label: "Signed out", tone: "gray" },
  login_failed: { label: "Failed attempt", tone: "red" },
}

function device(ua: string | null): string {
  if (!ua) return "—"
  const browser = /edg\//i.test(ua) ? "Edge"
    : /firefox\//i.test(ua) ? "Firefox"
    : /chrome\//i.test(ua) ? "Chrome"
    : /safari\//i.test(ua) ? "Safari"
    : /postman/i.test(ua) ? "Postman"
    : null
  const os = /windows/i.test(ua) ? "Windows"
    : /mac os|macintosh/i.test(ua) ? "macOS"
    : /android/i.test(ua) ? "Android"
    : /iphone|ipad|ios/i.test(ua) ? "iOS"
    : /linux/i.test(ua) ? "Linux"
    : null
  if (browser && os) return `${browser} · ${os}`
  return browser ?? os ?? (ua.length > 40 ? `${ua.slice(0, 40)}…` : ua)
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
}

export default function AreaSignInsPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc("area_login_activity", { p_days: 7 }).then(({ data, error: e }) => {
      if (e) setError("Sign-in activity could not be loaded.")
      else setData(data as Summary)
    })
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sign-ins today" value={String(data.signins_today)} />
        <KpiCard label="Failed attempts today" value={String(data.failed_today)} />
        <KpiCard label="Different users, last 7 days" value={String(data.active_7d)} />
        <KpiCard label="Never signed in" value={String(data.never_signed_in.length)} />
      </div>

      {data.failed_today > 0 && (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          {data.failed_today} failed sign-in {data.failed_today === 1 ? "attempt" : "attempts"} today.
          Repeated failures can mean someone is guessing passwords - Administration → Login Log has the details.
        </p>
      )}

      {data.never_signed_in.length > 0 && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Never signed in: </span>
          {data.never_signed_in.map((n) => `${n.full_name} (${n.employee_no})`).join(", ")}
        </p>
      )}

      <div className="overflow-x-auto rounded-3xl bg-card p-3 shadow-card sm:p-5">
        <table className="w-full border-separate border-spacing-y-1.5 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-1.5">When</th>
              <th className="px-4 py-1.5">Employee</th>
              <th className="px-4 py-1.5">Event</th>
              <th className="px-4 py-1.5">Device</th>
            </tr>
          </thead>
          <tbody>
            {data.events.length === 0 && (
              <tr>
                <td colSpan={4} className="rounded-2xl bg-muted py-10 text-center text-muted-foreground">
                  No sign-ins recorded for your department in the last 7 days.
                </td>
              </tr>
            )}
            {data.events.map((e, i) => {
              const style = EVENT_STYLE[e.event] ?? { label: e.event, tone: "gray" as const }
              return (
                <tr key={`${e.occurred_at}-${i}`} className="group">
                  <td className="bg-muted px-4 py-3 group-hover:bg-accent first:rounded-l-2xl">{when(e.occurred_at)}</td>
                  <td className="bg-muted px-4 py-3 group-hover:bg-accent">
                    <span className="font-medium">{e.full_name ?? e.employee_no}</span>
                    {e.full_name && <span className="ml-1.5 text-xs text-muted-foreground">{e.employee_no}</span>}
                  </td>
                  <td className="bg-muted px-4 py-3 group-hover:bg-accent">
                    <StatusPill label={style.label} tone={style.tone} />
                  </td>
                  <td className="bg-muted px-4 py-3 group-hover:bg-accent last:rounded-r-2xl text-muted-foreground">
                    {device(e.user_agent)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {data.events.length} events in the last 7 days, newest first. Failed attempts stay in the
        record - they are never deleted.
      </p>
    </div>
  )
}
